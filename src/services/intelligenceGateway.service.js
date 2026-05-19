'use strict';

/**
 * Intelligence Gateway Service — Phase 4
 *
 * Single backend entry point for all LLM-backed operations. Orchestrates:
 *   1. Budget enforcement (per-tenant daily spend cap)
 *   2. Model selection (via modelRouter — task_type + risk_level aware)
 *   3. Prompt resolution (via promptRegistry — versioned, rendered)
 *   4. Usage logging (after saby-copilot returns telemetry)
 *
 * This service does NOT call OpenAI directly. saby-copilot holds the LLM
 * client. The gateway produces a "call plan" that saby-copilot executes, then
 * saby-copilot posts telemetry back via the /intelligence/log-usage endpoint.
 *
 * Fail-closed rule (from guardrails.md §6.1):
 *   HIGH and CRITICAL risk tasks must fail hard when no suitable model is
 *   available — never silently downgrade to a weaker model.
 */

const modelRouter    = require('./modelRouter.service');
const promptRegistry = require('./promptRegistry.service');
const logger         = require('../config/logger');

/**
 * Resolve a complete "call plan" for a given intelligence task.
 * saby-copilot calls this before each LLM invocation.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.actorId
 * @param {string} opts.taskType      — e.g. 'intent_classification'
 * @param {string} [opts.promptKey]   — explicit prompt key; defaults to taskType-derived key
 * @param {object} [opts.variables]   — template variables for prompt rendering
 * @param {string} [opts.riskLevel]   — LOW | MEDIUM | HIGH | CRITICAL (default LOW)
 * @param {boolean} [opts.fallbackAllowed]
 * @returns {Promise<{
 *   model: object,
 *   systemPrompt: string,
 *   userPrompt: string|null,
 *   promptVersion: number,
 *   promptId: string,
 *   modelHint: string|null,
 *   budgetStatus: object,
 * }>}
 */
async function resolveCallPlan({
  tenantId, actorId,
  taskType, promptKey,
  variables = {},
  riskLevel = 'LOW',
  fallbackAllowed = true,
}) {
  // 1. Budget guard — non-blocking for LOW risk, hard stop for HIGH/CRITICAL
  const budgetStatus = await modelRouter.checkBudget({ tenantId });
  if (!budgetStatus.allowed) {
    const isCritical = riskLevel === 'HIGH' || riskLevel === 'CRITICAL';
    if (isCritical || riskLevel !== 'LOW') {
      throw Object.assign(
        new Error(`Model budget exceeded for tenant ${tenantId}: ${budgetStatus.reason}`),
        { code: 'BUDGET_EXCEEDED', tenantId, budgetStatus }
      );
    }
    logger.warn('[IntelligenceGateway] Budget exceeded but allowing LOW-risk call', { tenantId });
  }

  // 2. Model selection
  const model = await modelRouter.resolveModel({ taskType, riskLevel, fallbackAllowed });

  // 3. Prompt resolution — derive prompt key from task type if not provided
  const resolvedPromptKey = promptKey || _taskTypeToPromptKey(taskType);
  let renderedPrompt;
  try {
    renderedPrompt = await promptRegistry.renderPrompt(resolvedPromptKey, variables);
  } catch (err) {
    if (err.code === 'PROMPT_NOT_FOUND') {
      // Non-fatal for LOW risk — caller can use its own prompt
      logger.warn('[IntelligenceGateway] No active prompt for key, returning model only', {
        promptKey: resolvedPromptKey, taskType,
      });
      renderedPrompt = { systemPrompt: null, userPrompt: null, version: null, promptId: null, modelHint: null };
    } else {
      throw err;
    }
  }

  return {
    model,
    systemPrompt:   renderedPrompt.systemPrompt,
    userPrompt:     renderedPrompt.userPrompt,
    promptVersion:  renderedPrompt.version,
    promptId:       renderedPrompt.promptId,
    modelHint:      renderedPrompt.modelHint,
    budgetStatus,
  };
}

/**
 * Record the outcome of an LLM call. Called by saby-copilot after each
 * model invocation with telemetry from the SDK response.
 *
 * @param {object} opts — see modelRouter.logModelUsage parameter list
 * @returns {Promise<{id:number}>}
 */
async function recordUsage(opts) {
  return modelRouter.logModelUsage(opts);
}

/**
 * Summarise model spend for a tenant across a rolling window.
 * Used by the admin dashboard and alerting.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.from]   — ISO date string, default: start of current month
 * @param {string} [opts.to]     — ISO date string, default: now
 * @returns {Promise<{totalCostUsd:number, totalCalls:number, byModel:Array, byStage:Array}>}
 */
async function getUsageSummary({ tenantId, from, to }) {
  const { postgresPool } = require('../config/postgres');

  const fromTs = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const toTs   = to   || new Date().toISOString();

  const sql = `
    SELECT
      model_name,
      stage,
      COUNT(*)                          AS call_count,
      SUM(input_tokens)                 AS total_input_tokens,
      SUM(output_tokens)                AS total_output_tokens,
      SUM(estimated_cost_usd)           AS total_cost_usd,
      AVG(latency_ms)                   AS avg_latency_ms
    FROM copilot.model_usage_logs
    WHERE tenant_id = $1
      AND created_at BETWEEN $2 AND $3
    GROUP BY model_name, stage
    ORDER BY total_cost_usd DESC NULLS LAST
  `;
  const { rows } = await postgresPool.query(sql, [tenantId, fromTs, toTs]);

  const totalCostUsd = rows.reduce((s, r) => s + parseFloat(r.total_cost_usd || 0), 0);
  const totalCalls   = rows.reduce((s, r) => s + parseInt(r.call_count, 10), 0);

  // Group by model
  const byModelMap = {};
  for (const r of rows) {
    const key = r.model_name || 'unknown';
    if (!byModelMap[key]) byModelMap[key] = { modelName: key, callCount: 0, costUsd: 0 };
    byModelMap[key].callCount += parseInt(r.call_count, 10);
    byModelMap[key].costUsd   += parseFloat(r.total_cost_usd || 0);
  }

  return {
    totalCostUsd,
    totalCalls,
    from: fromTs,
    to:   toTs,
    byModel: Object.values(byModelMap),
    byStage: rows.map(r => ({
      stage:      r.stage,
      modelName:  r.model_name,
      callCount:  parseInt(r.call_count, 10),
      costUsd:    parseFloat(r.total_cost_usd || 0),
      avgLatency: r.avg_latency_ms ? Math.round(r.avg_latency_ms) : null,
    })),
  };
}

/**
 * Derive a prompt registry key from a task type.
 * Follows the convention: task_type (snake_case) → prompt_key (snake_case).
 */
function _taskTypeToPromptKey(taskType) {
  const overrides = {
    intent_classification: 'intent_classifier',
    tool_selection:        'tool_selector',
    executive_report:      'executive_brief',
  };
  return overrides[taskType] || taskType;
}

module.exports = {
  resolveCallPlan,
  recordUsage,
  getUsageSummary,
};
