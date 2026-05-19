'use strict';

/**
 * Workflow Definitions Service — Phase 7 Enterprise Autonomy
 *
 * Manages named workflow definitions (reusable governance templates) and their
 * run instances. Complements the existing workflowEngine.service.js which
 * handles tool-execution workflows; this service handles the higher-level
 * workflow registry, scheduling metadata, and run history.
 */

const { postgresPool } = require('../config/postgres');
const logger           = require('../config/logger');

// ─── Workflow Definitions ─────────────────────────────────────────────────────

async function registerWorkflowDefinition({
  tenantId = null,
  name,
  description = null,
  triggerType,
  triggerConfig = {},
  stepsJson = [],
  approvalPoints = [],
  failurePolicy = {},
  retryPolicy = {},
  escalationPolicy = {},
  autonomyLevel = 3,
  enabled = true,
  createdBy = null,
}) {
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.workflow_definitions
       (tenant_id, name, description, trigger_type, trigger_config,
        steps_json, approval_points, failure_policy, retry_policy,
        escalation_policy, autonomy_level, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (tenant_id, name) DO UPDATE
       SET description       = EXCLUDED.description,
           trigger_type      = EXCLUDED.trigger_type,
           trigger_config    = EXCLUDED.trigger_config,
           steps_json        = EXCLUDED.steps_json,
           approval_points   = EXCLUDED.approval_points,
           failure_policy    = EXCLUDED.failure_policy,
           retry_policy      = EXCLUDED.retry_policy,
           escalation_policy = EXCLUDED.escalation_policy,
           autonomy_level    = EXCLUDED.autonomy_level,
           enabled           = EXCLUDED.enabled,
           version           = copilot.workflow_definitions.version + 1,
           updated_at        = NOW()
     RETURNING *`,
    [
      tenantId, name, description, triggerType,
      JSON.stringify(triggerConfig),
      JSON.stringify(stepsJson),
      JSON.stringify(approvalPoints),
      JSON.stringify(failurePolicy),
      JSON.stringify(retryPolicy),
      JSON.stringify(escalationPolicy),
      autonomyLevel, enabled, createdBy,
    ]
  );
  logger.info('[WorkflowDefs] Definition registered', { name, tenantId, version: rows[0].version });
  return rows[0];
}

async function getWorkflowDefinition({ name, tenantId = null }) {
  const { rows } = await postgresPool.query(
    `SELECT * FROM copilot.workflow_definitions
     WHERE name = $1 AND (tenant_id = $2 OR tenant_id IS NULL)
     ORDER BY tenant_id NULLS LAST
     LIMIT 1`,
    [name, tenantId]
  );
  return rows[0] || null;
}

async function listWorkflowDefinitions({ tenantId = null, enabled } = {}) {
  const conditions = ['(tenant_id = $1 OR tenant_id IS NULL)'];
  const values = [tenantId];
  let idx = 2;

  if (enabled !== undefined) {
    conditions.push(`enabled = $${idx++}`);
    values.push(enabled);
  }

  const { rows } = await postgresPool.query(
    `SELECT * FROM copilot.workflow_definitions
     WHERE ${conditions.join(' AND ')}
     ORDER BY name ASC`,
    values
  );
  return rows;
}

// ─── Workflow Runs ────────────────────────────────────────────────────────────

async function startWorkflowRun({ workflowName, tenantId, triggerType, triggerMetadata = {}, taskId = null }) {
  const def = await getWorkflowDefinition({ name: workflowName, tenantId });
  if (!def) {
    throw Object.assign(
      new Error(`Workflow definition not found: ${workflowName}`),
      { code: 'WORKFLOW_NOT_FOUND' }
    );
  }

  const steps = Array.isArray(def.steps_json) ? def.steps_json : [];
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.workflow_runs
       (workflow_definition_id, task_id, tenant_id, trigger_type,
        trigger_metadata, status, steps_total)
     VALUES ($1,$2,$3,$4,$5,'running',$6)
     RETURNING *`,
    [def.id, taskId, tenantId, triggerType, JSON.stringify(triggerMetadata), steps.length]
  );
  logger.info('[WorkflowDefs] Run started', { runId: rows[0].id, workflowName, tenantId });
  return rows[0];
}

async function completeWorkflowRun({ runId, resultSummary = null, stepsCompleted = null }) {
  const { rows } = await postgresPool.query(
    `UPDATE copilot.workflow_runs
     SET status = 'completed', result_summary = $1,
         completed_at = NOW(),
         steps_completed = COALESCE($2, steps_total),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [resultSummary, stepsCompleted, runId]
  );
  if (!rows.length) throw Object.assign(new Error('Workflow run not found'), { code: 'RUN_NOT_FOUND' });
  logger.info('[WorkflowDefs] Run completed', { runId, durationMs: rows[0].duration_ms });
  return rows[0];
}

async function failWorkflowRun({ runId, errorMessage, stepsCompleted = null }) {
  const { rows } = await postgresPool.query(
    `UPDATE copilot.workflow_runs
     SET status = 'failed', error_message = $1,
         completed_at = NOW(),
         steps_completed = COALESCE($2, steps_completed),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [errorMessage, stepsCompleted, runId]
  );
  if (!rows.length) throw Object.assign(new Error('Workflow run not found'), { code: 'RUN_NOT_FOUND' });
  logger.warn('[WorkflowDefs] Run failed', { runId, errorMessage });
  return rows[0];
}

async function listWorkflowRuns({ tenantId, workflowName, status, limit = 50 } = {}) {
  const conditions = ['wr.tenant_id = $1'];
  const values = [tenantId];
  let idx = 2;

  if (workflowName) {
    conditions.push(`wd.name = $${idx++}`);
    values.push(workflowName);
  }
  if (status) {
    conditions.push(`wr.status = $${idx++}`);
    values.push(status);
  }
  values.push(limit);

  const { rows } = await postgresPool.query(
    `SELECT wr.*, wd.name AS workflow_name, wd.autonomy_level
     FROM copilot.workflow_runs wr
     JOIN copilot.workflow_definitions wd ON wd.id = wr.workflow_definition_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY wr.started_at DESC
     LIMIT $${idx}`,
    values
  );
  return rows;
}

async function getWorkflowStats({ tenantId, workflowName, days = 30 }) {
  const { rows } = await postgresPool.query(
    `SELECT
       COUNT(*)                                          AS total_runs,
       COUNT(*) FILTER (WHERE wr.status = 'completed')  AS completed_runs,
       COUNT(*) FILTER (WHERE wr.status = 'failed')     AS failed_runs,
       ROUND(AVG(wr.duration_ms))                       AS avg_duration_ms,
       ROUND(
         COUNT(*) FILTER (WHERE wr.status = 'completed')::numeric
         / NULLIF(COUNT(*), 0) * 100, 2
       )                                                AS completion_rate_pct
     FROM copilot.workflow_runs wr
     JOIN copilot.workflow_definitions wd ON wd.id = wr.workflow_definition_id
     WHERE wr.tenant_id = $1
       AND wd.name = $2
       AND wr.started_at >= NOW() - ($3 || ' days')::interval`,
    [tenantId, workflowName, days]
  );
  return {
    workflowName,
    tenantId,
    periodDays: days,
    totalRuns:         Number(rows[0].total_runs),
    completedRuns:     Number(rows[0].completed_runs),
    failedRuns:        Number(rows[0].failed_runs),
    avgDurationMs:     rows[0].avg_duration_ms ? Number(rows[0].avg_duration_ms) : null,
    completionRatePct: rows[0].completion_rate_pct ? Number(rows[0].completion_rate_pct) : null,
  };
}

module.exports = {
  registerWorkflowDefinition,
  getWorkflowDefinition,
  listWorkflowDefinitions,
  startWorkflowRun,
  completeWorkflowRun,
  failWorkflowRun,
  listWorkflowRuns,
  getWorkflowStats,
};
