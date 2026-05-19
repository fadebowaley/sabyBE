const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');

const REFRESH_DELAY_MS = Number(
  process.env.SUBMISSION_ROLLUP_REFRESH_MS || 5_000
);

let refreshTimer = null;
let refreshInFlight = false;
let availableRollupViews = null;
let hasLoggedMissingRollups = false;

const refreshStatements = [
  {
    viewName: 'mv_daily_submission_rollup',
    statement:
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_submission_rollup;',
  },
  {
    viewName: 'mv_weekly_submission_rollup',
    statement:
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_weekly_submission_rollup;',
  },
  {
    viewName: 'mv_monthly_submission_rollup',
    statement:
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_submission_rollup;',
  },
];

const getAvailableRollupViews = async () => {
  if (availableRollupViews) {
    return availableRollupViews;
  }

  const result = await postgresPool.query(
    `
      SELECT matviewname
      FROM pg_matviews
      WHERE schemaname = 'public'
        AND matviewname = ANY($1::text[])
    `,
    [refreshStatements.map((item) => item.viewName)]
  );

  availableRollupViews = new Set(result.rows.map((row) => row.matviewname));
  return availableRollupViews;
};

const refreshRollups = async () => {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  try {
    const existingViews = await getAvailableRollupViews();
    const statementsToRun = refreshStatements.filter((item) =>
      existingViews.has(item.viewName)
    );

    if (statementsToRun.length === 0) {
      if (!hasLoggedMissingRollups) {
        logger.warn(
          '[Rollup] Submission rollup views are missing; refresh is skipped until migrations run'
        );
        hasLoggedMissingRollups = true;
      }
      return;
    }

    for (const { statement, viewName } of statementsToRun) {
      try {
        await postgresPool.query(statement);
      } catch (err) {
        if (err.code === '42P01') {
          availableRollupViews = null;
        }
        logger.warn(
          `[Rollup] Failed to refresh ${viewName}: ${err.message}`
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
