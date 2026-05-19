'use strict';

/**
 * Executive Insight Service — Phase 5
 *
 * The convergence point for Phase 3 (compliance agent) + Phase 4 (intelligence
 * gateway). Assembles scored operational context and queues it as a pending
 * insight record in copilot.operational_insights. saby-copilot picks up pending
 * records, executes the LLM call using the resolved model + rendered prompt,
 * then posts the completed brief back via completeInsight().
 *
 * Pipeline per tenant/project/period:
 *   1. Gather context (metrics + anomalies + compliance snapshots)
 *   2. Resolve model and render prompt via intelligence gateway
 *   3. Write pending insight record (idempotent — one per period)
 *   4. Return the call plan so the caller can drive LLM execution
 *
 * After LLM execution:
 *   5. completeInsight() stores the brief JSON and marks it completed
 */

const { postgresPool }          = require('../config/postgres');
const { getLatestSnapshots }    = require('./operationalMetrics.service');
const { listAnomalies }         = require('./anomalyDetection.service');
const { resolveCallPlan }       = require('./intelligenceGateway.service');
const logger                    = require('../config/logger');

// ─── Context assembly ─────────────────────────────────────────────────────────

/**
 * Load the latest compliance run snapshots for context.
 */
async function loadComplianceRunContext({ tenantId, projectId, limit = 3 }) {
  const sql = `
    SELECT
      project_id, month, total_nodes, compliant_nodes, compliance_percentage,
      missing_submission_count, action_items_created, escalations_created, created_at
    FROM copilot.compliance_run_snapshots
    WHERE tenant_id = $1
      ${projectId ? 'AND project_id = $2' : ''}
    ORDER BY created_at DESC
    LIMIT ${projectId ? '$3' : '$2'}
  `;
  const values = projectId ? [tenantId, projectId, limit] : [tenantId, limit];
  const { rows } = await postgresPool.query(sql, values);
  return rows;
}

/**
 * Assemble the full context object that will be embedded into the executive
 * brief prompt. Structured so the LLM receives numbers, not raw SQL rows.
 */
async function assembleContext({ tenantId, projectId, monthLabel }) {
  const [snapshots, anomalies, complianceRuns] = await Promise.all([
    getLatestSnapshots({ tenantId, projectId, monthLabel }),
    listAnomalies({ tenantId, projectId, limit: 20 }),
    loadComplianceRunContext({ tenantId, projectId }),
  ]);

  // Build a clean metric summary map
  const metricSummary = {};
  for (const s of snapshots) {
    metricSummary[s.metric_name] = {
      value: Number(s.metric_value),
      unit:  s.metric_unit,
    };
  }

  return {
    tenantId,
    projectId,
    monthLabel,
    metrics: metricSummary,
    anomalies: anomalies.map(a => ({
      metric:       a.metric_name,
      severity:     a.severity,
      currentValue: Number(a.current_value),
      baselineValue: Number(a.baseline_value),
      deviationPct: Number(a.deviation_pct),
    })),
    complianceRuns: complianceRuns.map(r => ({
      month:                r.month,
      compliancePercentage: Number(r.compliance_percentage),
      missingSubmissions:   r.missing_submission_count,
      actionItemsCreated:   r.action_items_created,
      escalations:          r.escalations_created,
    })),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Insight lifecycle ────────────────────────────────────────────────────────

/**
 * Queue a new executive insight generation for a tenant/project/period.
 * Idempotent — returns the existing record if already pending or processing.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.actorId
 * @param {string} [opts.projectId]
 * @param {string} [opts.monthLabel]  — YYYY-MM, defaults to current month
 * @returns {Promise<{insightId:string, status:string, callPlan:object, context:object}>}
 */
async function queueInsightGeneration({ tenantId, actorId, projectId = null, monthLabel }) {
  const label = monthLabel || `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;

  // Check for an in-flight record to keep idempotent
  const existingSql = `
    SELECT id, status FROM copilot.operational_insights
    WHERE tenant_id = $1
      AND COALESCE(project_id, '') = $2
      AND period_label = $3
      AND status IN ('pending', 'processing')
    LIMIT 1
  `;
  const { rows: existing } = await postgresPool.query(existingSql, [
    tenantId, projectId || '', label,
  ]);
  if (existing.length) {
    return { insightId: existing[0].id, status: existing[0].status, callPlan: null, context: null };
  }

  // 1. Assemble context
  const context = await assembleContext({ tenantId, projectId, monthLabel: label });

  // 2. Resolve model + prompt via intelligence gateway
  const callPlan = await resolveCallPlan({
    tenantId,
    actorId,
    taskType:  'executive_report',
    variables: {
      context: JSON.stringify(context.metrics),
      period:  label,
    },
    riskLevel: 'LOW',
  });

  // 3. Write pending insight record
  const insertSql = `
    INSERT INTO copilot.operational_insights
      (tenant_id, project_id, period_label, status,
       context_json, call_plan_json,
       model_key, prompt_version, prompt_id)
    VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
    RETURNING id, status
  `;
  const { rows } = await postgresPool.query(insertSql, [
    tenantId, projectId, label,
    JSON.stringify(context),
    JSON.stringify(callPlan),
    callPlan.model?.modelKey || null,
    callPlan.promptVersion   || null,
    callPlan.promptId        || null,
  ]);

  logger.info('[ExecutiveInsight] Queued insight generation', {
    tenantId, projectId, monthLabel: label, insightId: rows[0].id,
  });

  return {
    insightId: rows[0].id,
    status:    rows[0].status,
    callPlan,
    context,
  };
}

/**
 * Mark an insight as processing (called by saby-copilot when it picks it up).
 */
async function markInsightProcessing(insightId) {
  const sql = `
    UPDATE copilot.operational_insights
    SET status = 'processing', updated_at = now()
    WHERE id = $1 AND status = 'pending'
    RETURNING id, status
  `;
  const { rows } = await postgresPool.query(sql, [insightId]);
  return rows[0] || null;
}

/**
 * Store the completed brief and mark the insight as completed.
 * Called by saby-copilot via the API endpoint after LLM execution.
 *
 * @param {object} opts
 * @param {string} opts.insightId
 * @param {object} opts.briefJson   — { headline, keyInsights, risks, recommendedActions }
 * @returns {Promise<object>}
 */
async function completeInsight({ insightId, briefJson }) {
  const sql = `
    UPDATE copilot.operational_insights
    SET
      status       = 'completed',
      brief_json   = $2,
      generated_at = now(),
      updated_at   = now()
    WHERE id = $1
      AND status IN ('pending', 'processing')
    RETURNING *
  `;
  const { rows } = await postgresPool.query(sql, [insightId, JSON.stringify(briefJson)]);
  if (!rows.length) {
    throw Object.assign(
      new Error(`Insight ${insightId} not found or already in terminal state`),
      { code: 'INSIGHT_NOT_FOUND' }
    );
  }
  logger.info('[ExecutiveInsight] Insight completed', { insightId });
  return rows[0];
}

/**
 * Mark an insight failed (e.g. LLM call errored or timed out).
 */
async function failInsight({ insightId, errorMessage }) {
  const sql = `
    UPDATE copilot.operational_insights
    SET
      status        = 'failed',
      error_message = $2,
      updated_at    = now()
    WHERE id = $1 AND status IN ('pending', 'processing')
    RETURNING id, status
  `;
  const { rows } = await postgresPool.query(sql, [insightId, errorMessage]);
  return rows[0] || null;
}

/**
 * List stored insights for a tenant, most recent first.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.projectId]
 * @param {string} [opts.status]
 * @param {number} [opts.limit]
 * @returns {Promise<Array>}
 */
async function listInsights({ tenantId, projectId, status, limit = 20 } = {}) {
  const conditions = ['tenant_id = $1'];
  const values = [tenantId];
  let idx = 2;

  if (projectId) { conditions.push(`project_id = $${idx++}`);   values.push(projectId); }
  if (status)    { conditions.push(`status = $${idx++}`);        values.push(status); }
  values.push(limit);

  const sql = `
    SELECT
      id, tenant_id, project_id, period_label,
      status, model_key, prompt_version,
      brief_json, error_message,
      generated_at, created_at
    FROM copilot.operational_insights
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${idx}
  `;
  const { rows } = await postgresPool.query(sql, values);
  return rows;
}

/**
 * Get a single insight by ID with full context (for audit/debug).
 */
async function getInsightById({ tenantId, insightId }) {
  const sql = `
    SELECT *
    FROM copilot.operational_insights
    WHERE id = $1 AND tenant_id = $2
    LIMIT 1
  `;
  const { rows } = await postgresPool.query(sql, [insightId, tenantId]);
  return rows[0] || null;
}

module.exports = {
  queueInsightGeneration,
  markInsightProcessing,
  completeInsight,
  failInsight,
  listInsights,
  getInsightById,
  assembleContext,
};
