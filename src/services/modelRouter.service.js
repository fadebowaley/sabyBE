'use strict';

/**
 * Model Router Service — Phase 4
 *
 * Selects the best available model from copilot.model_registry for a given
 * task_type and risk_level, logs every invocation result to
 * copilot.model_usage_logs, and enforces fail-closed behaviour for HIGH/CRITICAL
 * risk tasks (no fallback to weaker models allowed).
 *
 * The router never calls OpenAI itself — saby-copilot owns LLM invocation.
 * This service returns a resolved model config that saby-copilot uses, and
 * accepts usage telemetry back from saby-copilot via logModelUsage().
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

// Map task types to the required model latency class
const TASK_LATENCY_CLASS = {
  intent_classification: 'fast',
  entity_resolution:     'fast',
  tool_selection:        'fast',
  data_extraction:       'fast',
  workflow_planning:     'medium',
  operational_reasoning: 'medium',
  executive_report:      'strong',
  complex_analysis:      'strong',
  code_debugging:        'strong',
  sensitive_action:      'strong',
};

// Risk levels that must NOT fall back to a weaker model class
const FAIL_CLOSED_RISK_LEVELS = new Set(['HIGH', 'CRITICAL']);

/**
 * Resolve the best available model for a given task.
 *
 * @param {object} opts
 * @param {string} opts.taskType       — one of TASK_LATENCY_CLASS keys
 * @param {string} [opts.riskLevel]    — LOW | MEDIUM | HIGH | CRITICAL
 * @param {boolean} [opts.fallbackAllowed] — allow downgrade when primary unavailable
 * @returns {Promise<{modelKey:string, modelName:string, provider:string, latencyClass:string, costInputPer1k:number, costOutputPer1k:number, supportsJsonMode:boolean, supportsTools:boolean}>}
 */
async function resolveModel({ taskType, riskLevel = 'LOW', fallbackAllowed = true }) {
  const requiredClass = TASK_LATENCY_CLASS[taskType] || 'medium';
  const failClosed = FAIL_CLOSED_RISK_LEVELS.has(riskLevel);

  // First, try the required latency class
  const primary = await _queryBestModel(requiredClass);
  if (primary) return primary;

  // No model in the required class — attempt fallback unless forbidden
  if (failClosed || !fallbackAllowed) {
    throw Object.assign(
      new Error(`No enabled model available for task_type=${taskType} risk=${riskLevel} — failing closed`),
      { code: 'MODEL_UNAVAILABLE', taskType, riskLevel }
    );
  }

  // Fallback order: strong > medium > fast (never downgrade for sensitive tasks)
  const fallbackOrder = requiredClass === 'fast'
    ? ['medium', 'strong']
    : requiredClass === 'medium'
      ? ['fast', 'strong']
      : ['medium', 'fast'];

  for (const cls of fallbackOrder) {
    const fallback = await _queryBestModel(cls);
    if (fallback) {
      logger.warn('[ModelRouter] Primary class unavailable, using fallback', {
        requiredClass, fallbackClass: cls, taskType,
      });
      return fallback;
    }
  }

  throw Object.assign(
    new Error(`No enabled model available anywhere for task_type=${taskType}`),
    { code: 'MODEL_UNAVAILABLE', taskType }
  );
}

/**
 * Fetch the highest-priority enabled model for a given latency class.
 */
async function _queryBestModel(latencyClass) {
  const sql = `
    SELECT
      model_key,
      model_name,
      provider,
      latency_class,
      cost_input_per_1k,
      cost_output_per_1k,
      supports_json_mode,
      supports_tools,
      max_context_tokens
    FROM copilot.model_registry
    WHERE enabled = true
      AND latency_class = $1
    ORDER BY priority ASC
    LIMIT 1
  `;
  const { rows } = await postgresPool.query(sql, [latencyClass]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    modelKey:          r.model_key,
    modelName:         r.model_name,
    provider:          r.provider,
    latencyClass:      r.latency_class,
    costInputPer1k:    parseFloat(r.cost_input_per_1k),
    costOutputPer1k:   parseFloat(r.cost_output_per_1k),
    supportsJsonMode:  r.supports_json_mode,
    supportsTools:     r.supports_tools,
    maxContextTokens:  r.max_context_tokens,
  };
}

/**
 * List all models in the registry.
 *
 * @param {object} opts
 * @param {boolean} [opts.enabledOnly]
 * @returns {Promise<Array>}
 */
async function listModelRegistry({ enabledOnly = true } = {}) {
  const sql = `
    SELECT
      model_key, provider, model_name, latency_class,
      task_types, max_context_tokens,
      cost_input_per_1k, cost_output_per_1k,
      supports_json_mode, supports_tools,
      priority, enabled, created_at
    FROM copilot.model_registry
    ${enabledOnly ? 'WHERE enabled = true' : ''}
    ORDER BY latency_class, priority
  `;
  const { rows } = await postgresPool.query(sql);
  return rows;
}

/**
 * Log the result of a model invocation (called by saby-copilot via the
 * intelligence gateway endpoint after each LLM call).
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.actorId
 * @param {string} opts.traceId         — turn_trace_id from saby-copilot
 * @param {string} [opts.chatTurnLogId]
 * @param {string} opts.modelKey        — model_key from model_registry
 * @param {string} opts.stage           — e.g. 'intent_classification', 'tool_selection'
 * @param {string} [opts.intent]
 * @param {number} [opts.inputTokens]
 * @param {number} [opts.outputTokens]
 * @param {number} [opts.latencyMs]
 * @param {string} [opts.status]        — 'success' | 'failed' | 'timeout'
 * @param {string} [opts.requestExcerpt]
 * @param {string} [opts.responseExcerpt]
 * @param {string} [opts.errorMessage]
 * @param {object} [opts.metadata]
 * @returns {Promise<{id:number}>}
 */
async function logModelUsage({
  tenantId, actorId, traceId, chatTurnLogId = null,
  modelKey, stage, intent = null,
  inputTokens = null, outputTokens = null, latencyMs = null,
  status = 'success', requestExcerpt = null, responseExcerpt = null,
  errorMessage = null, metadata = {},
}) {
  // Look up provider and pricing from registry for cost calculation
  const regSql = `
    SELECT provider, model_name, cost_input_per_1k, cost_output_per_1k
    FROM copilot.model_registry
    WHERE model_key = $1
    LIMIT 1
  `;
  const regRows = (await postgresPool.query(regSql, [modelKey])).rows;
  const reg = regRows[0];

  const provider   = reg?.provider   || 'openai';
  const modelName  = reg?.model_name || modelKey;
  const totalTokens = (inputTokens || 0) + (outputTokens || 0);
  let estimatedCost = null;
  if (reg && inputTokens != null && outputTokens != null) {
    estimatedCost =
      (inputTokens  / 1000) * parseFloat(reg.cost_input_per_1k) +
      (outputTokens / 1000) * parseFloat(reg.cost_output_per_1k);
  }

  const sql = `
    INSERT INTO copilot.model_usage_logs (
      actor_id, tenant_id, turn_trace_id, chat_turn_log_id,
      route_intent, stage, provider, model_name,
      invocation_status, input_tokens, output_tokens, total_tokens,
      estimated_cost_usd, latency_ms,
      request_excerpt, response_excerpt, error_message, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    RETURNING id
  `;
  const values = [
    actorId, tenantId, traceId, chatTurnLogId,
    intent, stage, provider, modelName,
    status, inputTokens, outputTokens, totalTokens || null,
    estimatedCost, latencyMs,
    requestExcerpt, responseExcerpt, errorMessage,
    JSON.stringify(metadata),
  ];
  const { rows } = await postgresPool.query(sql, values);
  return { id: rows[0].id };
}

/**
 * Check whether a tenant has remaining budget for a model call.
 * Phase 4 implementation: enforces a simple daily per-tenant cap read from
 * copilot.tenants_config (field model_daily_budget_usd).
 * Returns { allowed: boolean, reason?: string, spentToday: number, budget: number }
 */
async function checkBudget({ tenantId }) {
  const cfgSql = `
    SELECT model_prefs_json->>'model_daily_budget_usd' AS budget
    FROM copilot.tenants_config
    WHERE tenant_id = $1
    LIMIT 1
  `;
  const cfgRows = (await postgresPool.query(cfgSql, [tenantId])).rows;
  const budgetUsd = cfgRows[0]?.budget ? parseFloat(cfgRows[0].budget) : null;

  if (budgetUsd == null) {
    return { allowed: true, spentToday: 0, budget: null };
  }

  const spentSql = `
    SELECT COALESCE(SUM(estimated_cost_usd), 0) AS spent
    FROM copilot.model_usage_logs
    WHERE tenant_id = $1
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
      AND invocation_status = 'success'
  `;
  const { rows } = await postgresPool.query(spentSql, [tenantId]);
  const spentToday = parseFloat(rows[0].spent);

  if (spentToday >= budgetUsd) {
    return {
      allowed: false,
      reason: `Daily model budget of $${budgetUsd} exceeded (spent $${spentToday.toFixed(4)})`,
      spentToday,
      budget: budgetUsd,
    };
  }

  return { allowed: true, spentToday, budget: budgetUsd };
}

module.exports = {
  resolveModel,
  listModelRegistry,
  logModelUsage,
  checkBudget,
};
