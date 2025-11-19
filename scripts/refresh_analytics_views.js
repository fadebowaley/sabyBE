#!/usr/bin/env node

/**
 * Refresh analytics materialized views.
 *
 * Usage:
 *   node sabyBackend/scripts/refresh_analytics_views.js
 */

/* eslint-disable no-console */
const {
  refreshMaterializedViews,
} = require('../src/services/analyticsRefresh.service');
const { postgresPool } = require('../src/config/postgres');

async function run() {
  try {
    await refreshMaterializedViews();
  } catch (error) {
    console.error('❌ Failed to refresh analytics views:', error.message);
    process.exitCode = 1;
  } finally {
    await postgresPool.end();
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  refreshMaterializedViews,
};
