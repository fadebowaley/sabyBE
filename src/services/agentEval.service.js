'use strict';

/**
 * Agent Eval Service — Phase 7 Enterprise Autonomy
 *
 * Continuous eval loop: golden test datasets define expected behaviour for
 * each workflow/intent. Eval results track pass/fail over time so regressions
 * in model behaviour surface automatically without waiting for user feedback.
 *
 * Eval assertions are deterministic (schema validation, value matching) —
 * not LLM calls. An eval "run" compares actual_output_json against
 * expected_output_json using strict key-presence and value checks.
 */

const { postgresPool } = require('../config/postgres');
const logger           = require('../config/logger');

// ─── Dataset CRUD ─────────────────────────────────────────────────────────────

async function createEvalDataset({
  name,
  workflowName = null,
  intent = null,
  inputJson,
  expectedOutputJson,
  description = null,
  enabled = true,
}) {
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.agent_eval_datasets
       (name, workflow_name, intent, input_json, expected_output_json, description, enabled)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (name) DO UPDATE
       SET workflow_name       = EXCLUDED.workflow_name,
           intent              = EXCLUDED.intent,
           input_json          = EXCLUDED.input_json,
           expected_output_json = EXCLUDED.expected_output_json,
           description         = EXCLUDED.description,
           enabled             = EXCLUDED.enabled,
           updated_at          = NOW()
     RETURNING *`,
    [name, workflowName, intent, JSON.stringify(inputJson),
     JSON.stringify(expectedOutputJson), description, enabled]
  );
  logger.info('[AgentEval] Dataset created/updated', { name, workflowName });
  return rows[0];
}

async function listEvalDatasets({ workflowName, enabled } = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (workflowName !== undefined) {
    conditions.push(`workflow_name = $${idx++}`);
    values.push(workflowName);
  }
  if (enabled !== undefined) {
    conditions.push(`enabled = $${idx++}`);
    values.push(enabled);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await postgresPool.query(
    `SELECT * FROM copilot.agent_eval_datasets ${where} ORDER BY name ASC`,
    values
  );
  return rows;
}

// ─── Eval Results ─────────────────────────────────────────────────────────────

async function recordEvalResult({
  datasetId,
  taskId = null,
  tenantId = null,
  passed,
  actualOutputJson = {},
  score = null,
  failureReason = null,
  modelUsed = null,
  latencyMs = null,
  // Attribution — set when the eval runs against a live model call
  promptKey = null,
  promptVersion = null,
}) {
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.agent_eval_results
       (dataset_id, task_id, tenant_id, passed, actual_output_json,
        score, failure_reason, model_used, latency_ms,
        prompt_key, prompt_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [datasetId, taskId, tenantId, passed, JSON.stringify(actualOutputJson),
     score, failureReason, modelUsed, latencyMs,
     promptKey || null, promptVersion || null]
  );
  logger.info('[AgentEval] Result recorded', {
    datasetId, passed, score, modelUsed, promptKey, promptVersion,
  });
  return rows[0];
}

/**
 * Compute pass rate, average score, and recent failure distribution for a
 * workflow over the last N days.
 */
async function getEvalStats({ workflowName, days = 30 }) {
  const { rows } = await postgresPool.query(
    `SELECT
       COUNT(er.id)                                     AS total_evals,
       COUNT(er.id) FILTER (WHERE er.passed = TRUE)     AS passed_evals,
       COUNT(er.id) FILTER (WHERE er.passed = FALSE)    AS failed_evals,
       ROUND(AVG(er.score), 4)                          AS avg_score,
       ROUND(
         COUNT(er.id) FILTER (WHERE er.passed = TRUE)::numeric
         / NULLIF(COUNT(er.id), 0) * 100, 2
       )                                                AS pass_rate_pct
     FROM copilot.agent_eval_results er
     JOIN copilot.agent_eval_datasets ed ON ed.id = er.dataset_id
     WHERE ($1::varchar IS NULL OR ed.workflow_name = $1)
       AND er.evaluated_at >= NOW() - ($2 || ' days')::interval`,
    [workflowName || null, days]
  );

  return {
    workflowName: workflowName || 'all',
    periodDays: days,
    totalEvals:   Number(rows[0].total_evals),
    passedEvals:  Number(rows[0].passed_evals),
    failedEvals:  Number(rows[0].failed_evals),
    avgScore:     rows[0].avg_score ? Number(rows[0].avg_score) : null,
    passRatePct:  rows[0].pass_rate_pct ? Number(rows[0].pass_rate_pct) : null,
  };
}

/**
 * Run a deterministic eval assertion: compare actualOutput against
 * expectedOutput using key-presence and strict value checks.
 * Returns { passed, failureReason, score }.
 *
 * Score = (matched keys) / (expected keys) in [0.0, 1.0].
 */
function runDeterministicEval(expectedOutput, actualOutput) {
  const expectedKeys = Object.keys(expectedOutput);
  if (!expectedKeys.length) {
    return { passed: true, failureReason: null, score: 1.0 };
  }

  let matched = 0;
  const failures = [];

  for (const key of expectedKeys) {
    const expVal = expectedOutput[key];
    const actVal = actualOutput[key];

    if (expVal === null || expVal === undefined) {
      // Presence-only check
      if (actVal !== undefined) matched++;
      else failures.push(`missing key: ${key}`);
    } else if (typeof expVal === 'object' && !Array.isArray(expVal)) {
      // Nested object — recursive partial check
      const nested = runDeterministicEval(expVal, actVal || {});
      matched += nested.score;
      if (!nested.passed) failures.push(`key ${key}: ${nested.failureReason}`);
    } else {
      // Strict equality
      if (actVal === expVal) {
        matched++;
      } else {
        failures.push(`key ${key}: expected ${JSON.stringify(expVal)}, got ${JSON.stringify(actVal)}`);
      }
    }
  }

  const score = matched / expectedKeys.length;
  const passed = score >= 1.0;
  return {
    passed,
    failureReason: failures.length ? failures.join('; ') : null,
    score: Math.min(1.0, score),
  };
}

module.exports = {
  createEvalDataset,
  listEvalDatasets,
  recordEvalResult,
  getEvalStats,
  runDeterministicEval,
};
