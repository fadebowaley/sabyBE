const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

const MATERIALIZED_VIEWS = [
  'form_submission_numeric_field_mv',
  'form_submission_daily_metrics_mv',
];

async function refreshMaterializedViews() {
  for (const viewName of MATERIALIZED_VIEWS) {
    const start = Date.now();
    logger.info(`[AnalyticsRefresh] Refreshing ${viewName}...`);
    await postgresPool.query(`REFRESH MATERIALIZED VIEW ${viewName};`);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    logger.info(`[AnalyticsRefresh] ✅ ${viewName} refreshed in ${duration}s`);
  }
}

module.exports = {
  MATERIALIZED_VIEWS,
  refreshMaterializedViews,
};
