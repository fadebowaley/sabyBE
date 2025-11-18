const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');

const REFRESH_DELAY_MS = Number(
  process.env.SUBMISSION_ROLLUP_REFRESH_MS || 5_000
);

let refreshTimer = null;
let refreshInFlight = false;

const refreshStatements = [
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_submission_rollup;',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_weekly_submission_rollup;',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_submission_rollup;',
];

const refreshRollups = async () => {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  try {
    for (const statement of refreshStatements) {
      try {
        await postgresPool.query(statement);
      } catch (err) {
        logger.warn(
          `[Rollup] Failed to execute "${statement.trim()}": ${err.message}`
        );
      }
    }
    logger.info('[Rollup] Submission rollups refreshed');
  } catch (error) {
    logger.error(`[Rollup] Refresh failed: ${error.message}`);
  } finally {
    refreshInFlight = false;
  }
};

const scheduleRefresh = () => {
  if (refreshTimer) {
    return;
  }

  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await refreshRollups();
  }, REFRESH_DELAY_MS);
};

module.exports = {
  refreshRollups,
  scheduleRefresh,
};

