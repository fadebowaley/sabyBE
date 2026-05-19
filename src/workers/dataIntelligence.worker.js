'use strict';

/**
 * Data Intelligence Worker — Phase 5
 *
 * Runs the full operational intelligence pipeline on a daily schedule:
 *   1. Load all active projects for the tenant from each due schedule
 *   2. computeAndSaveMetrics() — write KPI snapshots for current month
 *   3. detectAnomalies()       — flag deviations from historical baseline
 *   4. queueInsightGeneration() — assemble context + call plan → pending insight
 *
 * Polling pattern: identical to complianceAgent.worker — setInterval +
 * FOR UPDATE SKIP LOCKED on copilot.agent_schedules (workflow_name = 'data_intelligence').
 *
 * saby-copilot independently polls for pending operational_insights records,
 * executes the LLM call, and posts the brief back via /intelligence/insights/:id/complete.
 */

const { postgresPool }           = require('../config/postgres');
const config                     = require('../config/config');
const logger                     = require('../config/logger');
const { ProjectForm }            = require('../models');
const { computeAndSaveMetrics, currentMonthLabel } = require('../services/operationalMetrics.service');
const { detectAnomalies }        = require('../services/anomalyDetection.service');
const { queueInsightGeneration } = require('../services/executiveInsight.service');
const incidentPlaybookService    = require('../services/incidentPlaybook.service');
const notificationQueueService   = require('../services/notificationQueue.service');

// Severities that warrant an immediate alert notification to tenant admins.
const ALERT_SEVERITIES = new Set(['high', 'critical']);

const POLL_MS    = Number(config.dataIntelligence?.workerIntervalMs || 3_600_000); // 1 hour
const WORKER_ID  = `data-intelligence-worker-${process.pid}`;
const DEFAULT_INTERVAL_HOURS = 24;

// ─── Schedule helpers ─────────────────────────────────────────────────────────

function computeNextRunAt(scopeJson) {
  const hours = Number((scopeJson && scopeJson.interval_hours) || DEFAULT_INTERVAL_HOURS);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function claimDueSchedules() {
  const { rows } = await postgresPool.query(
    `SELECT *
     FROM copilot.agent_schedules
     WHERE workflow_name = 'data_intelligence'
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
     SET next_run_at = $1, updated_at = now()
     WHERE id = $2`,
    [nextRunAt, scheduleId]
  );
}

async function markScheduleCompleted(scheduleId, nextRunAt) {
  await postgresPool.query(
    `UPDATE copilot.agent_schedules
     SET last_run_at = now(), next_run_at = $1, updated_at = now()
     WHERE id = $2`,
    [nextRunAt, scheduleId]
  );
}

// ─── Per-project pipeline ─────────────────────────────────────────────────────

async function runPipelineForProject({ tenantId, projectId, projectName, monthLabel }) {
  let metrics = {};
  try {
    metrics = await computeAndSaveMetrics({ tenantId, projectId, monthLabel });
    logger.info('[DataIntelligence] Metrics computed', { tenantId, projectId, monthLabel, count: Object.keys(metrics).length });
  } catch (err) {
    logger.error('[DataIntelligence] Metric compute failed', { tenantId, projectId, err: err.message });
    return { projectId, stage: 'metrics', error: err.message };
  }

  let anomalies = [];
  try {
    const { monthStart, monthEnd } = require('../services/operationalMetrics.service');
    anomalies = await detectAnomalies({
      tenantId,
      projectId,
      currentMetrics: metrics,
      periodStart: monthStart(monthLabel),
      periodEnd:   monthEnd(monthLabel),
    });
    logger.info('[DataIntelligence] Anomalies detected', { tenantId, projectId, flagged: anomalies.length });

    // ── Alert notifications for high + critical anomalies ────────────────────
    // Queue one notification job per qualifying anomaly so email delivery
    // retries are isolated and don't block each other.
    const alertAnomalies = anomalies.filter((a) => ALERT_SEVERITIES.has(a.severity));
    for (const anomaly of alertAnomalies) {
      notificationQueueService
        .queueAnomalyAlert({ tenantId, anomaly, projectId, projectName, monthLabel })
        .catch((err) =>
          logger.error('[DataIntelligence] Failed to queue anomaly alert', {
            tenantId, projectId, err: err.message,
          })
        );
    }

    // ── Auto-open incident for critical anomalies ─────────────────────────────
    // Playbook is now auto-selected inside openIncident() when playbookId=null.
    const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical');
    for (const anomaly of criticalAnomalies) {
      try {
        await incidentPlaybookService.openIncident({
          tenantId,
          incidentType: 'data_anomaly',
          title: `Critical anomaly: ${anomaly.metricKey || anomaly.metric_key} in project ${projectName}`,
          severity: 'critical',
          contextJson: {
            projectId,
            projectName,
            monthLabel,
            metricKey: anomaly.metricKey || anomaly.metric_key,
            deviation: anomaly.deviation || null,
          },
          // playbookId intentionally omitted — auto-selected by openIncident()
        });
        logger.warn('[DataIntelligence] Incident opened for critical anomaly', { tenantId, projectId, anomaly });
      } catch (incErr) {
        logger.error('[DataIntelligence] Failed to open anomaly incident', { tenantId, projectId, err: incErr.message });
      }
    }
  } catch (err) {
    logger.warn('[DataIntelligence] Anomaly detection failed (non-fatal)', { tenantId, projectId, err: err.message });
  }

  try {
    const result = await queueInsightGeneration({
      tenantId,
      actorId:   `worker:${WORKER_ID}`,
      projectId,
      monthLabel,
    });
    logger.info('[DataIntelligence] Insight queued', { tenantId, projectId, insightId: result.insightId, status: result.status });
  } catch (err) {
    logger.warn('[DataIntelligence] Insight queue failed (non-fatal)', { tenantId, projectId, err: err.message });
  }

  return { projectId, stage: 'complete' };
}

// ─── Main poll loop ───────────────────────────────────────────────────────────

async function poll() {
  let schedules;
  try {
    schedules = await claimDueSchedules();
  } catch (err) {
    logger.error('[DataIntelligence] Schedule claim failed', { err: err.message });
    return;
  }

  for (const schedule of schedules) {
    const tenantId    = schedule.tenant_id;
    const scopeJson   = schedule.scope_json || {};
    const nextRunAt   = computeNextRunAt(scopeJson);
    const monthLabel  = currentMonthLabel();

    // Advance next_run_at before execution to prevent re-entry
    await markScheduleRunning(schedule.id, nextRunAt);

    logger.info('[DataIntelligence] Running pipeline', { tenantId, scheduleId: schedule.id, monthLabel });

    try {
      // Load all active projects for this tenant
      const projects = await ProjectForm.find({
        tenantId,
        status:    'active',
        deletedAt: null,
      }).lean();

      if (!projects.length) {
        logger.info('[DataIntelligence] No active projects, skipping', { tenantId });
        await markScheduleCompleted(schedule.id, computeNextRunAt(scopeJson));
        continue;
      }

      // Run per-project pipeline; isolate per-project errors
      for (const project of projects) {
        await runPipelineForProject({
          tenantId,
          projectId:   String(project.projectId || project._id),
          projectName: project.name,
          monthLabel,
        });
      }

      await markScheduleCompleted(schedule.id, computeNextRunAt(scopeJson));
      logger.info('[DataIntelligence] Pipeline complete', { tenantId, projectCount: projects.length });
    } catch (err) {
      logger.error('[DataIntelligence] Pipeline failed', { tenantId, scheduleId: schedule.id, err: err.message });
      // Schedule will retry on next poll since next_run_at was already advanced
    }
  }
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

function createDataIntelligenceWorker() {
  logger.info('[DataIntelligence] Worker starting', { pollIntervalMs: POLL_MS, workerId: WORKER_ID });
  const timer = setInterval(poll, POLL_MS);

  // Run once immediately on startup
  poll().catch((err) => logger.error('[DataIntelligence] Initial poll failed', { err: err.message }));

  return {
    close() {
      clearInterval(timer);
      logger.info('[DataIntelligence] Worker stopped', { workerId: WORKER_ID });
    },
  };
}

module.exports = { createDataIntelligenceWorker };
