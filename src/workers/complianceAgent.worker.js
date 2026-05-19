/**
 * Compliance Agent Worker
 *
 * Polls copilot.agent_schedules for enabled compliance_monitor schedules
 * and runs the deterministic compliance monitoring workflow per tenant.
 *
 * Polling pattern: identical to copilotAction.worker — setInterval + FOR UPDATE SKIP LOCKED
 * so multiple backend instances never double-process the same schedule tick.
 *
 * Schedule record lifecycle per tick:
 *  1. Claim schedule via FOR UPDATE SKIP LOCKED
 *  2. Set next_run_at to prevent re-entry during execution
 *  3. Call complianceAgentService.runComplianceMonitor()
 *  4. Update last_run_at and next_run_at on the schedule record
 *
 * next_run_at is computed from scope_json.interval_hours (default 24 h).
 * Full cron expression parsing is deferred to Phase 4 (model router / intelligence gateway).
 */

const { postgresPool } = require('../config/postgres');
const config = require('../config/config');
const logger = require('../config/logger');
const complianceAgentService = require('../services/complianceAgent.service');
const incidentPlaybookService = require('../services/incidentPlaybook.service');

// Auto-open an incident when escalation count crosses this threshold in one run
const ESCALATION_INCIDENT_THRESHOLD = Number(config.compliance?.escalationIncidentThreshold || 3);

const POLL_MS = Number(config.compliance?.workerIntervalMs || 60_000);
const WORKER_ID = `compliance-agent-worker-${process.pid}`;
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
     WHERE workflow_name = 'compliance_monitor'
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

const processSchedule = async (schedule) => {
  const { id: scheduleId, tenant_id: tenantId, scope_json: scopeJson } = schedule;
  const nextRunAt = computeNextRunAt(scopeJson);

  // Advance next_run_at immediately so a concurrent worker instance skips it
  await markScheduleRunning(scheduleId, nextRunAt);

  logger.info(
    `[${WORKER_ID}] Starting compliance monitor — tenant=${tenantId} schedule=${scheduleId}`
  );

  try {
    const result = await complianceAgentService.runComplianceMonitor({
      tenantId,
      scheduleId,
    });

    logger.info(
      `[${WORKER_ID}] Compliance run complete — tenant=${tenantId} ` +
        `taskId=${result.taskId} projects=${result.projectsScanned} ` +
        `actionItems=${result.totalActionItemsCreated} escalations=${result.totalEscalationsCreated}`
    );

    // Auto-open a high-severity incident when escalation count is alarming
    if ((result.totalEscalationsCreated || 0) >= ESCALATION_INCIDENT_THRESHOLD) {
      try {
        await incidentPlaybookService.openIncident({
          tenantId,
          incidentType: 'compliance_escalation',
          title: `Compliance sweep: ${result.totalEscalationsCreated} overdue escalations detected`,
          severity: result.totalEscalationsCreated >= 10 ? 'critical' : 'high',
          taskId: result.taskId || null,
          contextJson: {
            projectsScanned: result.projectsScanned,
            totalEscalationsCreated: result.totalEscalationsCreated,
            totalActionItemsCreated: result.totalActionItemsCreated,
          },
        });
        logger.warn(
          `[${WORKER_ID}] Incident opened — escalations=${result.totalEscalationsCreated} tenant=${tenantId}`
        );
      } catch (incErr) {
        logger.error(`[${WORKER_ID}] Failed to open compliance incident: ${incErr.message}`);
      }
    }

    await markScheduleCompleted(scheduleId, nextRunAt);
  } catch (err) {
    logger.error(
      `[${WORKER_ID}] Compliance run failed — tenant=${tenantId} schedule=${scheduleId}: ${err.message}`
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
    logger.error(`[${WORKER_ID}] Failed to claim compliance schedules: ${err.message}`);
    return;
  }

  for (const schedule of schedules) {
    await processSchedule(schedule);
  }
};

let intervalHandle = null;

const createComplianceAgentWorker = () => {
  if (intervalHandle) return intervalHandle;

  logger.info(
    `[${WORKER_ID}] Compliance agent worker starting — poll interval ${POLL_MS}ms`
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
        logger.info(`[${WORKER_ID}] Compliance agent worker stopped`);
      }
    },
  };
};

module.exports = { createComplianceAgentWorker };
