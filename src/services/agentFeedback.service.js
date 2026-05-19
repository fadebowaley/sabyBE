'use strict';

/**
 * Agent Feedback Service — Phase 7 Enterprise Autonomy
 *
 * Captures human and system ratings on agent/tool decisions.
 * Drives the continuous improvement loop — low ratings and 'unsafe' feedback
 * surface quality issues before they reach production scale.
 */

const { postgresPool } = require('../config/postgres');
const logger           = require('../config/logger');

const VALID_FEEDBACK_TYPES = new Set(['correct','incorrect','partial','unsafe','helpful','not_helpful']);

async function submitFeedback({
  taskId = null,
  toolCallId = null,
  tenantId,
  submittedBy,
  feedbackType,
  rating = null,
  comment = null,
  workflowName = null,
  metadata = {},
  // Attribution — populated from intelligenceGateway.resolveCallPlan() response
  promptKey = null,
  promptVersion = null,
}) {
  if (!VALID_FEEDBACK_TYPES.has(feedbackType)) {
    throw Object.assign(
      new Error(`Invalid feedback type: ${feedbackType}. Valid: ${[...VALID_FEEDBACK_TYPES].join(', ')}`),
      { code: 'INVALID_FEEDBACK_TYPE' }
    );
  }

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.agent_feedback
       (task_id, tool_call_id, tenant_id, submitted_by, feedback_type,
        rating, comment, workflow_name, metadata_json,
        prompt_key, prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [taskId, toolCallId, tenantId, submittedBy, feedbackType,
     rating, comment, workflowName, JSON.stringify(metadata),
     promptKey || null, promptVersion || null]
  );

  logger.info('[AgentFeedback] Feedback recorded', {
    id: rows[0].id, tenantId, feedbackType, taskId, workflowName,
    promptKey, promptVersion,
  });
  return rows[0];
}

async function listFeedback({ tenantId, taskId, workflowName, limit = 50 } = {}) {
  const conditions = ['tenant_id = $1'];
  const values = [tenantId];
  let idx = 2;

  if (taskId) {
    conditions.push(`task_id = $${idx++}`);
    values.push(taskId);
  }
  if (workflowName) {
    conditions.push(`workflow_name = $${idx++}`);
    values.push(workflowName);
  }
  values.push(limit);

  const { rows } = await postgresPool.query(
    `SELECT * FROM copilot.agent_feedback
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    values
  );
  return rows;
}

/**
 * Compute accuracy rate, average rating, and unsafe-action count for a tenant
 * over the last N days. Optionally scoped to a workflow.
 */
async function getFeedbackSummary({ tenantId, workflowName = null, days = 30 }) {
  const conditions = ['tenant_id = $1', `created_at >= NOW() - ($2 || ' days')::interval`];
  const values = [tenantId, days];
  let idx = 3;

  if (workflowName) {
    conditions.push(`workflow_name = $${idx++}`);
    values.push(workflowName);
  }

  const { rows } = await postgresPool.query(
    `SELECT
       COUNT(*)                                              AS total_feedback,
       COUNT(*) FILTER (WHERE feedback_type = 'correct')    AS correct_count,
       COUNT(*) FILTER (WHERE feedback_type = 'incorrect')  AS incorrect_count,
       COUNT(*) FILTER (WHERE feedback_type = 'unsafe')     AS unsafe_count,
       ROUND(AVG(rating), 2)                                AS avg_rating,
       ROUND(
         COUNT(*) FILTER (WHERE feedback_type IN ('correct','helpful'))::numeric
         / NULLIF(COUNT(*), 0) * 100, 2
       )                                                    AS accuracy_rate_pct
     FROM copilot.agent_feedback
     WHERE ${conditions.join(' AND ')}`,
    values
  );

  return {
    tenantId,
    workflowName: workflowName || 'all',
    periodDays: days,
    totalFeedback:   Number(rows[0].total_feedback),
    correctCount:    Number(rows[0].correct_count),
    incorrectCount:  Number(rows[0].incorrect_count),
    unsafeCount:     Number(rows[0].unsafe_count),
    avgRating:       rows[0].avg_rating ? Number(rows[0].avg_rating) : null,
    accuracyRatePct: rows[0].accuracy_rate_pct ? Number(rows[0].accuracy_rate_pct) : null,
  };
}

/**
 * Upsert per-turn feedback.
 *
 * Uses turn_id stored inside metadata_json as the natural key.
 * If an existing record is found for (submitted_by, tenant_id, turn_id)
 * it is deleted first, then a fresh record is inserted — this avoids the
 * need for a schema migration while still preventing duplicate votes.
 *
 * The caller must supply metadata.turn_id.
 */
async function upsertFeedback({
  turnId,
  taskId = null,
  toolCallId = null,
  tenantId,
  submittedBy,
  feedbackType,
  rating = null,
  comment = null,
  workflowName = null,
  metadata = {},
  promptKey = null,
  promptVersion = null,
}) {
  if (!VALID_FEEDBACK_TYPES.has(feedbackType)) {
    throw Object.assign(
      new Error(`Invalid feedback type: ${feedbackType}. Valid: ${[...VALID_FEEDBACK_TYPES].join(', ')}`),
      { code: 'INVALID_FEEDBACK_TYPE' }
    );
  }

  const metaWithTurnId = { ...metadata, turn_id: turnId || null };

  // Delete any pre-existing record for this turn+user+tenant before inserting
  if (turnId) {
    await postgresPool.query(
      `DELETE FROM copilot.agent_feedback
       WHERE submitted_by = $1
         AND tenant_id   = $2
         AND metadata_json->>'turn_id' = $3`,
      [submittedBy, tenantId, String(turnId)]
    );
  }

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.agent_feedback
       (task_id, tool_call_id, tenant_id, submitted_by, feedback_type,
        rating, comment, workflow_name, metadata_json,
        prompt_key, prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [taskId, toolCallId, tenantId, submittedBy, feedbackType,
     rating, comment, workflowName, JSON.stringify(metaWithTurnId),
     promptKey || null, promptVersion || null]
  );

  logger.info('[AgentFeedback] Feedback upserted', {
    id: rows[0].id, tenantId, feedbackType, turnId, workflowName,
  });
  return rows[0];
}

module.exports = {
  submitFeedback,
  upsertFeedback,
  listFeedback,
  getFeedbackSummary,
};
