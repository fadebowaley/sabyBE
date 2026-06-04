const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');

const REFRESH_DELAY_MS = Number(
  process.env.SUBMISSION_ROLLUP_REFRESH_MS || 5_000
);

let refreshTimer = null;
let refreshInFlight = false;
let availableRollupViews = null;
let hasLoggedMissingRollups = false;

const rollupViews = [
  {
    viewName: 'mv_daily_submission_rollup',
  },
  {
    viewName: 'mv_weekly_submission_rollup',
  },
  {
    viewName: 'mv_monthly_submission_rollup',
  },
];

const getAvailableRollupViews = async () => {
  if (availableRollupViews) {
    return availableRollupViews;
  }

  const result = await postgresPool.query(
    `
      SELECT matviewname, ispopulated
      FROM pg_matviews
      WHERE schemaname = 'public'
        AND matviewname = ANY($1::text[])
    `,
    [rollupViews.map((item) => item.viewName)]
  );

  availableRollupViews = new Map(
    result.rows.map((row) => [row.matviewname, row.ispopulated])
  );
  return availableRollupViews;
};

const buildRefreshStatement = (viewName, isPopulated) =>
  isPopulated
    ? `REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName};`
    : `REFRESH MATERIALIZED VIEW ${viewName};`;

const refreshRollups = async () => {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  try {
    const rollupViewState = await getAvailableRollupViews();
    const viewsToRefresh = rollupViews.filter((item) =>
      rollupViewState.has(item.viewName)
    );

    if (viewsToRefresh.length === 0) {
      if (!hasLoggedMissingRollups) {
        logger.warn(
          '[Rollup] Submission rollup views are missing; refresh is skipped until migrations run'
        );
        hasLoggedMissingRollups = true;
      }
      return;
    }

    hasLoggedMissingRollups = false;

    let refreshedCount = 0;

    for (const { viewName } of viewsToRefresh) {
      const isPopulated = rollupViewState.get(viewName);
      const statement = buildRefreshStatement(viewName, isPopulated);
      try {
        await postgresPool.query(statement);
        refreshedCount += 1;
        availableRollupViews?.set(viewName, true);
      } catch (err) {
        if (err.code === '42P01') {
          availableRollupViews = null;
        }
        logger.warn(
          `[Rollup] Failed to refresh ${viewName}: ${err.message}`
        );
      }
    }

    if (refreshedCount === viewsToRefresh.length) {
      logger.info(
        `[Rollup] Submission rollups refreshed (${refreshedCount}/${viewsToRefresh.length})`
      );
    } else if (refreshedCount > 0) {
      logger.warn(
        `[Rollup] Submission rollups partially refreshed (${refreshedCount}/${viewsToRefresh.length})`
      );
    } else {
      logger.warn('[Rollup] Submission rollups refresh failed for all views');
    }
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
