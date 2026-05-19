'use strict';

/**
 * Agent Eval Worker — Phase 7
 *
 * Nightly sweep that runs deterministic eval over all enabled eval datasets for
 * each tenant and records a scored result. Uses FOR UPDATE SKIP LOCKED so
 * multiple backend instances never double-process the same schedule tick.
 *
 * Schedule: polls copilot.agent_schedules where workflow_name = 'agent_eval'
 * (seeded per tenant via migration 028).
 *
 * Per-dataset eval:
 *   runDeterministicEval(expected_output_json, input_json)
 *   — compares the stored expected output against the stored test input to
 *     verify key-presence and structural consistency without an LLM call.
 *   recordEvalResult() writes the scored result so /evals/stats can surface trends.
 */

const { postgresPool }  = require('../config/postgres');
const config            = require('../config/config');
const logger            = require('../config/logger');
const agentEvalService  = require('../services/agentEval.service');

const POLL_MS    = Number(config.agentEval?.workerIntervalMs || 3_600_000); // 1 hour poll
const WORKER_ID  = `agent-eval-worker-${process.pid}`;
const DEFAULT_INTERVAL_HOURS = 24;

function computeNextRunAt(scopeJson) {
  const hours = Number(scopeJson?.interval_hours || DEFAULT_INTERVAL_HOURS);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function claimDueSchedules() {
  const { rows } = await postgresPool.query(
    `SELECT *
     FROM copilot.agent_schedules
     WHERE workflow_name = 'agent_eval'
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

async function loadEnabledDatasets(tenantId) {
  // Datasets are not currently tenant-scoped in the schema, but we scope results by tenantId.
  const { rows } = await postgresPool.query(
    `SELECT id, name, workflow_name, input_json, expected_output_json
     FROM copilot.agent_eval_datasets
     WHERE enabled = true
     ORDER BY created_at ASC`
  );
  return rows;
}

async function runDatasetEval(tenantId, dataset) {
  // Deterministic consistency check: compare expected_output_json against input_json
  // to verify that all expected keys are satisfiable from the stored test fixture.
  const { passed, failureReason, score } = agentEvalService.runDeterministicEval(
    dataset.expected_output_json || {},
    dataset.input_json           || {}
  );

  await agentEvalService.recordEvalResult({
    datasetId:        dataset.id,
    tenantId,
    passed,
    actualOutputJson: dataset.input_json || {},
    score,
    failureReason:    failureReason || null,
    modelUsed:        'deterministic',
    latencyMs:        0,
  });

  return { datasetId: dataset.id, name: dataset.name, passed, score };
}

async function poll() {
  let schedules;
  try {
    schedules = await claimDueSchedules();
  } catch (err) {
    logger.error('[AgentEval] Schedule claim failed', { err: err.message });
    return;
  }

  for (const schedule of schedules) {
    const { id: scheduleId, tenant_id: tenantId, scope_json: scopeJson } = schedule;
    const nextRunAt = computeNextRunAt(scopeJson);

    await markScheduleRunning(scheduleId, nextRunAt);
    logger.info('[AgentEval] Running eval sweep', { tenantId, scheduleId });

    try {
      const datasets = await loadEnabledDatasets(tenantId);

      if (!datasets.length) {
        logger.info('[AgentEval] No enabled datasets, skipping', { tenantId });
        await markScheduleCompleted(scheduleId, computeNextRunAt(scopeJson));
        continue;
      }

      let passed = 0;
      for (const dataset of datasets) {
        const result = await runDatasetEval(tenantId, dataset);
        if (result.passed) passed += 1;
        logger.info('[AgentEval] Dataset evaluated', {
          tenantId,
          name: result.name,
          passed: result.passed,
          score: result.score,
        });
      }

      await markScheduleCompleted(scheduleId, computeNextRunAt(scopeJson));
      logger.info('[AgentEval] Sweep complete', {
        tenantId,
        total: datasets.length,
        passed,
        passRate: `${Math.round((passed / datasets.length) * 100)}%`,
      });
    } catch (err) {
      logger.error('[AgentEval] Sweep failed', { tenantId, scheduleId, err: err.message });
    }
  }
}

function createAgentEvalWorker() {
  logger.info('[AgentEval] Worker starting', { pollIntervalMs: POLL_MS, workerId: WORKER_ID });
  const timer = setInterval(poll, POLL_MS);
  poll().catch((err) => logger.error('[AgentEval] Initial poll failed', { err: err.message }));

  return {
    close() {
      clearInterval(timer);
      logger.info('[AgentEval] Worker stopped', { workerId: WORKER_ID });
    },
  };
}

module.exports = { createAgentEvalWorker };
