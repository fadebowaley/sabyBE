/**
 * People Intelligence Agent Worker
 *
 * Polls copilot.agent_schedules for enabled people_intelligence schedules
 * and runs the deterministic people-intelligence workflow per tenant.
 *
 * Polling pattern: identical to complianceAgent.worker — setInterval +
 * FOR UPDATE SKIP LOCKED so multiple backend instances never double-process
 * the same schedule tick.
 *
 * Schedule record lifecycle per tick:
 *  1. Claim schedule via FOR UPDATE SKIP LOCKED
 *  2. Set next_run_at to prevent re-entry during execution
 *  3. Call peopleIntelligenceService.runPeopleIntelligence()
 *  4. Update last_run_at and next_run_at on the schedule record
 *
 * next_run_at is computed from scope_json.interval_hours (default 24 h).
 * Full cron expression parsing is deferred to Phase 4 (model router /
 * intelligence gateway).
 */

const { postgresPool } = require('../config/postgres');
const config = require('../config/config');
const logger = require('../config/logger');
const peopleIntelligenceService = require('../services/peopleIntelligence.service');
const incidentPlaybookService = require('../services/incidentPlaybook.service');

// Auto-open an incident when escalation count crosses this threshold in one run
const { ESCALATION_INCIDENT_THRESHOLD } = peopleIntelligenceService;

const POLL_MS = Number(config.peopleIntelligence?.workerIntervalMs || 60_000);
const WORKER_ID = `people-intelligence-worker-${process.pid}`;
const DEFAULT_INTERVAL_HOURS = 24;

const computeNextRunAt = (scopeJson) => {
  const hours = Number(
    (scopeJson && scopeJson.interval_hours) || DEFAULT_INTERVAL_HOURS
  );
  const next = new Date(Date.now() + hours * 60 * 60 * 1000);
  return next.toISOString();
};

const claimDueSchedules = async () => {
  const { rows } = await postgresPool.query(
    `SELECT *
     FROM copilot.agent_schedules
     WHERE workflow_name = 'people_intelligence'
       AND enabled = TRUE
       AND (next_run_at IS NULL OR next_run_at <= NOW())
     ORDER BY next_run_at ASC NULLS FIRST
     LIMIT 10
     FOR UPDATE SKIP LOCKED`
  );
  return rows;
};

const markScheduleRunning = async (scheduleId, nextRunAt) => {
  await postgresPool.query(
    `UPDATE copilot.agent_schedules
     SET next_run_at = $2::timestamptz,
         updated_at  = NOW()
     WHERE id = $1`,
    [scheduleId, nextRunAt]
  );
};

const markScheduleCompleted = async (scheduleId, nextRunAt) => {
  await postgresPool.query(
    `UPDATE copilot.agent_schedules
     SET last_run_at = NOW(),
         next_run_at = $2::timestamptz,
         updated_at  = NOW()
     WHERE id = $1`,
    [scheduleId, nextRunAt]
  );
};

/**
 * Idempotently back-fills a people_intelligence schedule row for every tenant
 * that has copilot action events but no schedule yet (new tenants created
 * after migration 038). ON CONFLICT DO NOTHING keeps re-runs safe.
 */
const ensureSchedulesForActiveTenants = async () => {
  await postgresPool.query(
    `INSERT INTO copilot.agent_schedules
       (tenant_id, workflow_name, trigger_type, cron_expression, scope_json,
        enabled, next_run_at, created_by)
     SELECT DISTINCT ON (ae.tenant_id)
       ae.tenant_id,
       'people_intelligence',
       'schedule',
       '0 5 * * *',
       '{"interval_hours": 24}'::jsonb,
       TRUE,
       NOW(),
       'worker:bootstrap'
     FROM copilot.action_events ae
     LEFT JOIN copilot.agent_schedules s
       ON s.tenant_id = ae.tenant_id
      AND s.workflow_name = 'people_intelligence'
     WHERE s.id IS NULL
     ON CONFLICT DO NOTHING`
  );
};

const processSchedule = async (schedule) => {
  const {
    id: scheduleId,
    tenant_id: tenantId,
    scope_json: scopeJson,
  } = schedule;
  const nextRunAt = computeNextRunAt(scopeJson);

  // Advance next_run_at immediately so a concurrent worker instance skips it
  await markScheduleRunning(scheduleId, nextRunAt);

  logger.info(
    `[${WORKER_ID}] Starting people intelligence — tenant=${tenantId} schedule=${scheduleId}`
  );

  try {
    const result = await peopleIntelligenceService.runPeopleIntelligence({
      tenantId,
      scheduleId,
    });

    logger.info(
      `[${WORKER_ID}] People intelligence run complete — tenant=${tenantId} ` +
        `taskId=${result.taskId} observations=${result.observationCount} ` +
        `escalations=${result.escalationsCreated} deduplicated=${result.deduplicatedCount}`
    );

    // Auto-open a high-severity incident when escalation count is alarming
    if ((result.escalationsCreated || 0) >= ESCALATION_INCIDENT_THRESHOLD) {
      try {
        await incidentPlaybookService.openIncident({
          tenantId,
          incidentType: 'people_intelligence_escalation',
          title: `People intelligence: ${result.escalationsCreated} escalations detected`,
          severity: result.escalationsCreated >= 10 ? 'critical' : 'high',
          taskId: result.taskId || null,
          contextJson: {
            observationCount: result.observationCount,
            escalationsCreated: result.escalationsCreated,
            deduplicatedCount: result.deduplicatedCount,
          },
        });
        logger.warn(
          `[${WORKER_ID}] Incident opened — escalations=${result.escalationsCreated} tenant=${tenantId}`
        );
      } catch (incErr) {
        logger.error(
          `[${WORKER_ID}] Failed to open people incident: ${incErr.message}`
        );
      }
    }

    await markScheduleCompleted(scheduleId, nextRunAt);
  } catch (err) {
    logger.error(
      `[${WORKER_ID}] People intelligence run failed — tenant=${tenantId} schedule=${scheduleId}: ${err.message}`
    );
    // next_run_at was already advanced; the schedule will retry on the next tick
    // after the interval, preventing a tight failure loop.
  }
};

const tick = async () => {
  let schedules = [];
  try {
    schedules = await claimDueSchedules();
  } catch (err) {
    logger.error(
      `[${WORKER_ID}] Failed to claim people schedules: ${err.message}`
    );
    return;
  }

  await Promise.all(schedules.map((schedule) => processSchedule(schedule)));
};

let intervalHandle = null;

const createPeopleIntelligenceWorker = () => {
  if (intervalHandle) return intervalHandle;

  logger.info(
    `[${WORKER_ID}] People intelligence worker starting — poll interval ${POLL_MS}ms`
  );

  // Back-fill schedules for tenants created after migration 038 (non-fatal)
  ensureSchedulesForActiveTenants().catch((err) =>
    logger.error(`[${WORKER_ID}] Schedule bootstrap failed: ${err.message}`)
  );

  intervalHandle = setInterval(async () => {
    try {
      await tick();
    } catch (err) {
      logger.error(`[${WORKER_ID}] Unhandled tick error: ${err.message}`);
    }
  }, POLL_MS);

  // Run once immediately on boot so a due schedule fires without waiting one interval
  tick().catch((err) =>
    logger.error(`[${WORKER_ID}] Initial tick error: ${err.message}`)
  );

  return {
    close: () => {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        logger.info(`[${WORKER_ID}] People intelligence worker stopped`);
      }
    },
  };
};

module.exports = { createPeopleIntelligenceWorker };
