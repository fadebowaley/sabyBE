const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');
const {
  computeScoreboard,
} = require('../services/copilotProjectScoreboard.service');

const POLL_MS = Number(process.env.COPILOT_SCOREBOARD_WORKER_INTERVAL_MS || 60 * 60 * 1000);

const createCopilotScoreboardWorker = () => {
  let closed = false;
  let inFlight = false;
  let timer = null;

  const tick = async () => {
    if (closed || inFlight) return;
    inFlight = true;
    try {
      const projectsResult = await postgresPool.query(
        `SELECT DISTINCT tenant_id, project_id
         FROM copilot.project_rules
         WHERE active = TRUE`
      );

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

      for (let i = 0; i < projectsResult.rows.length; i += 1) {
        const row = projectsResult.rows[i];
        // eslint-disable-next-line no-await-in-loop
        await computeScoreboard({
          tenantId: row.tenant_id,
          projectId: row.project_id,
          periodStart,
          periodEnd: now,
          computedBy: 'scoreboard-worker',
        });
      }

      if (projectsResult.rows.length > 0) {
        logger.info(
          `[CopilotScoreboardWorker] Computed scoreboards for ${projectsResult.rows.length} project(s)`
        );
      }
    } catch (error) {
      logger.error(
        `[CopilotScoreboardWorker] Tick failed: ${error.message}`
      );
    } finally {
      inFlight = false;
    }
  };

  timer = setInterval(() => {
    tick();
  }, POLL_MS);
  timer.unref();

  logger.info(
    `[CopilotScoreboardWorker] Started (interval=${POLL_MS}ms)`
  );

  return {
    close: async () => {
      closed = true;
      if (timer) clearInterval(timer);
      logger.info('[CopilotScoreboardWorker] Stopped');
    },
  };
};

module.exports = {
  createCopilotScoreboardWorker,
};
