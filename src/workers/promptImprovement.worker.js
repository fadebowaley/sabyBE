'use strict';

/**
 * Prompt Improvement Worker — Phase 7 (Feedback Loop)
 *
 * Closes the feedback → prompt improvement loop that was previously missing:
 *
 *   agent_eval_results + agent_feedback
 *         ↓  (read by this worker weekly)
 *   threshold check (pass rate < 80% OR accuracy < 70%)
 *         ↓  (when breached)
 *   auto-promote highest-version 'draft' prompt for the workflow
 *         ↓
 *   copilot picks up new active prompt on next resolveCallPlan() call
 *
 * Schedule: polls copilot.agent_schedules where workflow_name = 'prompt_improvement'
 * (seeded per tenant via migration 029, runs weekly at Sunday 05:00 UTC).
 *
 * Decision gates:
 *   EVAL_PASS_THRESHOLD   — promote when eval pass rate drops below this
 *   FEEDBACK_ACC_THRESHOLD — promote when feedback accuracy drops below this
 *   MIN_FEEDBACK_SAMPLES  — skip promotion if fewer samples than this (not enough signal)
 *   MIN_EVAL_SAMPLES      — skip promotion if fewer eval results than this
 *
 * All promotions are logged to copilot.workflow_runs for full auditability.
 */

const { postgresPool }     = require('../config/postgres');
const config               = require('../config/config');
const logger               = require('../config/logger');
const agentEvalService     = require('../services/agentEval.service');
const agentFeedbackService = require('../services/agentFeedback.service');
const promptRegistry       = require('../services/promptRegistry.service');

const POLL_MS   = Number(config.promptImprovement?.workerIntervalMs || 3_600_000); // 1-hour poll
const WORKER_ID = `prompt-improvement-worker-${process.pid}`;
const DEFAULT_INTERVAL_HOURS = 168; // weekly

// Quality thresholds — tunable via config or env
const EVAL_PASS_THRESHOLD    = Number(config.promptImprovement?.evalPassThreshold    || 80);  // %
const FEEDBACK_ACC_THRESHOLD = Number(config.promptImprovement?.feedbackAccThreshold || 70);  // %
const MIN_EVAL_SAMPLES       = Number(config.promptImprovement?.minEvalSamples       || 5);
const MIN_FEEDBACK_SAMPLES   = Number(config.promptImprovement?.minFeedbackSamples   || 3);
const EVAL_WINDOW_DAYS       = Number(config.promptImprovement?.evalWindowDays       || 7);

// ─── Schedule helpers ─────────────────────────────────────────────────────────

function computeNextRunAt(scopeJson) {
  const hours = Number(scopeJson?.interval_hours || DEFAULT_INTERVAL_HOURS);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function claimDueSchedules() {
  const { rows } = await postgresPool.query(
    `SELECT *
     FROM copilot.agent_schedules
     WHERE workflow_name = 'prompt_improvement'
       AND enabled = true
       AND (next_run_at IS NULL OR next_run_at <= NOW())
     ORDER BY next_run_at ASC NULLS FIRST
     LIMIT 5
     FOR UPDATE SKIP LOCKED`
  );
  return rows;
}

async function markScheduleRunning(scheduleId, nextRunAt) {
  await postgresPool.query(
    `UPDATE copilot.agent_schedules
     SET next_run_at = $1, updated_at = NOW()
     WHERE id = $2`,
    [nextRunAt, scheduleId]
  );
}

async function markScheduleCompleted(scheduleId, nextRunAt) {
  await postgresPool.query(
    `UPDATE copilot.agent_schedules
     SET last_run_at = NOW(), next_run_at = $1, updated_at = NOW()
     WHERE id = $2`,
    [nextRunAt, scheduleId]
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function logPromotion({ tenantId, promptKey, fromVersion, toVersion, reason }) {
  try {
    await postgresPool.query(
      `INSERT INTO copilot.workflow_runs
         (tenant_id, workflow_name, status, started_at, completed_at, result_json)
       VALUES ($1, 'prompt_improvement', 'completed', NOW(), NOW(), $2)`,
      [tenantId, JSON.stringify({ promptKey, fromVersion, toVersion, reason })]
    );
  } catch (err) {
    // Non-fatal — promotion already happened; just log the audit failure
    logger.warn('[PromptImprovement] Audit log write failed', { err: err.message });
  }
}

// ─── Workflow → prompt_key discovery ─────────────────────────────────────────
// Discover which prompt keys are in use by checking agent_eval_results and
// agent_feedback for distinct prompt_key values recorded for this tenant.
// Falls back to a standard set derived from known workflow names.

async function discoverPromptKeys(tenantId) {
  const { rows } = await postgresPool.query(
    `SELECT DISTINCT prompt_key FROM (
       SELECT prompt_key FROM copilot.agent_feedback
         WHERE tenant_id = $1 AND prompt_key IS NOT NULL
       UNION
       SELECT prompt_key FROM copilot.agent_eval_results
         WHERE tenant_id = $1 AND prompt_key IS NOT NULL
     ) sub`,
    [tenantId]
  );
  return rows.map((r) => r.prompt_key);
}

// ─── Promotion decision ───────────────────────────────────────────────────────

async function evaluateAndPromoteForKey({ tenantId, promptKey }) {
  // 1. Fetch eval stats for this prompt key + window
  const evalStats = await agentEvalService.getEvalStats({
    workflowName: null,   // we scope by prompt_key below directly
    days: EVAL_WINDOW_DAYS,
  });

  // Re-query scoped to this prompt_key (getEvalStats scopes by workflowName;
  // we need prompt_key scoping, so we run a targeted query here).
  const { rows: evalRows } = await postgresPool.query(
    `SELECT
       COUNT(er.id)                                       AS total_evals,
       COUNT(er.id) FILTER (WHERE er.passed = TRUE)       AS passed_evals,
       ROUND(
         COUNT(er.id) FILTER (WHERE er.passed = TRUE)::numeric
         / NULLIF(COUNT(er.id), 0) * 100, 2
       )                                                  AS pass_rate_pct
     FROM copilot.agent_eval_results er
     WHERE er.prompt_key = $1
       AND ($2::varchar IS NULL OR er.tenant_id = $2)
       AND er.evaluated_at >= NOW() - ($3 || ' days')::interval`,
    [promptKey, tenantId, EVAL_WINDOW_DAYS]
  );
  const totalEvals   = Number(evalRows[0].total_evals   || 0);
  const passRatePct  = evalRows[0].pass_rate_pct != null
    ? Number(evalRows[0].pass_rate_pct)
    : null;

  // 2. Fetch feedback summary scoped to this prompt_key
  const { rows: fbRows } = await postgresPool.query(
    `SELECT
       COUNT(*) AS total_feedback,
       ROUND(
         COUNT(*) FILTER (WHERE feedback_type IN ('correct','helpful'))::numeric
         / NULLIF(COUNT(*), 0) * 100, 2
       ) AS accuracy_rate_pct
     FROM copilot.agent_feedback
     WHERE prompt_key = $1
       AND ($2::varchar IS NULL OR tenant_id = $2)
       AND created_at >= NOW() - ($3 || ' days')::interval`,
    [promptKey, tenantId, EVAL_WINDOW_DAYS]
  );
  const totalFeedback    = Number(fbRows[0].total_feedback    || 0);
  const accuracyRatePct  = fbRows[0].accuracy_rate_pct != null
    ? Number(fbRows[0].accuracy_rate_pct)
    : null;

  logger.info('[PromptImprovement] Quality check', {
    tenantId, promptKey,
    totalEvals, passRatePct,
    totalFeedback, accuracyRatePct,
  });

  // 3. Decide whether to promote
  const evalBelowThreshold =
    totalEvals >= MIN_EVAL_SAMPLES &&
    passRatePct != null &&
    passRatePct < EVAL_PASS_THRESHOLD;

  const feedbackBelowThreshold =
    totalFeedback >= MIN_FEEDBACK_SAMPLES &&
    accuracyRatePct != null &&
    accuracyRatePct < FEEDBACK_ACC_THRESHOLD;

  if (!evalBelowThreshold && !feedbackBelowThreshold) {
    logger.info('[PromptImprovement] Quality OK — no promotion needed', {
      tenantId, promptKey, passRatePct, accuracyRatePct,
    });
    return { promoted: false, reason: 'quality_ok' };
  }

  const reason = [
    evalBelowThreshold
      ? `eval pass rate ${passRatePct}% < threshold ${EVAL_PASS_THRESHOLD}%`
      : null,
    feedbackBelowThreshold
      ? `feedback accuracy ${accuracyRatePct}% < threshold ${FEEDBACK_ACC_THRESHOLD}%`
      : null,
  ].filter(Boolean).join('; ');

  // 4. Find the highest-version 'draft' prompt for this key
  const { rows: draftRows } = await postgresPool.query(
    `SELECT version
     FROM copilot.prompt_versions
     WHERE prompt_key = $1 AND status = 'draft'
     ORDER BY version DESC
     LIMIT 1`,
    [promptKey]
  );

  if (!draftRows.length) {
    logger.info('[PromptImprovement] Threshold breached but no draft prompt available', {
      tenantId, promptKey, reason,
    });
    return { promoted: false, reason: 'no_draft_available' };
  }

  const draftVersion = draftRows[0].version;

  // 5. Identify the currently active version for the audit log
  const currentActive = await promptRegistry.getActivePrompt(promptKey).catch(() => null);
  const fromVersion   = currentActive?.version || null;

  // 6. Promote
  await promptRegistry.activatePromptVersion(promptKey, draftVersion);

  logger.warn('[PromptImprovement] Promoted prompt version', {
    tenantId, promptKey,
    fromVersion, toVersion: draftVersion, reason,
  });

  await logPromotion({ tenantId, promptKey, fromVersion, toVersion: draftVersion, reason });

  return { promoted: true, promptKey, fromVersion, toVersion: draftVersion, reason };
}

// ─── Per-tenant sweep ─────────────────────────────────────────────────────────

async function runSweepForTenant(tenantId) {
  const promptKeys = await discoverPromptKeys(tenantId);

  if (!promptKeys.length) {
    logger.info('[PromptImprovement] No attributed prompt keys found — skipping', { tenantId });
    return [];
  }

  const results = [];
  for (const promptKey of promptKeys) {
    try {
      const result = await evaluateAndPromoteForKey({ tenantId, promptKey });
      results.push({ promptKey, ...result });
    } catch (err) {
      logger.error('[PromptImprovement] Key evaluation failed', {
        tenantId, promptKey, err: err.message,
      });
      results.push({ promptKey, promoted: false, error: err.message });
    }
  }
  return results;
}

// ─── Main poll loop ───────────────────────────────────────────────────────────

async function poll() {
  let schedules;
  try {
    schedules = await claimDueSchedules();
  } catch (err) {
    logger.error('[PromptImprovement] Schedule claim failed', { err: err.message });
    return;
  }

  for (const schedule of schedules) {
    const { id: scheduleId, tenant_id: tenantId, scope_json: scopeJson } = schedule;
    const nextRunAt = computeNextRunAt(scopeJson);

    await markScheduleRunning(scheduleId, nextRunAt);
    logger.info('[PromptImprovement] Running sweep', { tenantId, scheduleId });

    try {
      const results = await runSweepForTenant(tenantId);
      const promoted = results.filter((r) => r.promoted).length;

      await markScheduleCompleted(scheduleId, computeNextRunAt(scopeJson));
      logger.info('[PromptImprovement] Sweep complete', {
        tenantId, total: results.length, promoted,
      });
    } catch (err) {
      logger.error('[PromptImprovement] Sweep failed', {
        tenantId, scheduleId, err: err.message,
      });
    }
  }
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

function createPromptImprovementWorker() {
  logger.info('[PromptImprovement] Worker starting', {
    pollIntervalMs: POLL_MS,
    workerId: WORKER_ID,
    evalPassThreshold: EVAL_PASS_THRESHOLD,
    feedbackAccThreshold: FEEDBACK_ACC_THRESHOLD,
  });

  const timer = setInterval(poll, POLL_MS);
  poll().catch((err) =>
    logger.error('[PromptImprovement] Initial poll failed', { err: err.message })
  );

  return {
    close() {
      clearInterval(timer);
      logger.info('[PromptImprovement] Worker stopped', { workerId: WORKER_ID });
    },
  };
}

module.exports = { createPromptImprovementWorker };
