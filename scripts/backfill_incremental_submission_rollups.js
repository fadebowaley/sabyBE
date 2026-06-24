#!/usr/bin/env node

/* eslint-disable no-console, no-await-in-loop */
const { postgresPool } = require('../src/config/postgres');
const {
  ensureRollupTables,
  recomputeRollupBucket,
} = require('../src/services/incrementalSubmissionRollup.service');

const distinctQueries = {
  daily: `
    SELECT DISTINCT
      tenant_id,
      project_id,
      node_id,
      submission_date AS bucket_value
    FROM form_submissions
    WHERE status <> 'deleted'
      AND submission_date IS NOT NULL
  `,
  weekly: `
    SELECT DISTINCT
      tenant_id,
      project_id,
      node_id,
      submission_week AS bucket_value
    FROM form_submissions
    WHERE status <> 'deleted'
      AND submission_week IS NOT NULL
  `,
  monthly: `
    SELECT DISTINCT
      tenant_id,
      project_id,
      node_id,
      COALESCE(month, DATE_TRUNC('month', submitted_at AT TIME ZONE 'UTC')::date) AS bucket_value
    FROM form_submissions
    WHERE status <> 'deleted'
  `,
};

async function truncateRollupTables() {
  await postgresPool.query(`
    TRUNCATE TABLE submission_rollup_daily;
    TRUNCATE TABLE submission_rollup_weekly;
    TRUNCATE TABLE submission_rollup_monthly;
  `);
}

async function backfillGranularity(granularity) {
  const { rows } = await postgresPool.query(distinctQueries[granularity]);
  for (const row of rows) {
    await recomputeRollupBucket(postgresPool, granularity, {
      granularity,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      node_id: row.node_id || null,
      bucketValue:
        row.bucket_value instanceof Date
          ? row.bucket_value.toISOString().slice(0, 10)
          : String(row.bucket_value),
    });
  }
}

async function run() {
  try {
    await ensureRollupTables();
    await truncateRollupTables();
    await backfillGranularity('daily');
    await backfillGranularity('weekly');
    await backfillGranularity('monthly');
    console.log('Incremental submission rollups backfilled.');
  } finally {
    await postgresPool.end();
  }
}

run().catch((error) => {
  console.error('Failed to backfill submission rollups:', error);
  process.exit(1);
});
