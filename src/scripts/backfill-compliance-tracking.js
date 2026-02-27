/**
 * One-time backfill for monthly + daily compliance counters.
 * Recomputes tracking rows from form_submissions (status != 'deleted').
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

const runBackfill = async () => {
  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    logger.info('[backfill] Resetting derived tracking counters');
    await client.query('DELETE FROM event_compliance_daily_tracking');
    await client.query(`
      UPDATE event_compliance_tracking
      SET submitted_count = 0,
          total_events_submitted = 0,
          updated_at = NOW(),
          last_calculated_at = NOW()
    `);

    logger.info('[backfill] Rebuilding daily counters');
    await client.query(`
      INSERT INTO event_compliance_daily_tracking (
        tenant_id, project_id, node_id, event_date, submitted_count, last_submission_at, updated_at, created_at
      )
      SELECT
        tenant_id,
        project_id,
        node_id,
        event_date::date,
        COUNT(*)::int,
        MAX(submitted_at),
        NOW(),
        NOW()
      FROM form_submissions
      WHERE status != 'deleted'
        AND node_id IS NOT NULL
        AND event_date IS NOT NULL
      GROUP BY tenant_id, project_id, node_id, event_date
      ON CONFLICT (tenant_id, project_id, node_id, event_date)
      DO UPDATE SET
        submitted_count = EXCLUDED.submitted_count,
        last_submission_at = EXCLUDED.last_submission_at,
        updated_at = NOW()
    `);

    logger.info('[backfill] Rebuilding monthly counters');
    await client.query(`
      INSERT INTO event_compliance_tracking (
        tenant_id, project_id, node_id, month, year,
        submitted_count, total_events_submitted,
        total_events_required, completeness_percentage, compliance_status,
        events_breakdown, weekly_progress, missing_events, notifications_sent,
        is_locked, last_calculated_at, updated_at, created_at
      )
      SELECT
        tenant_id,
        project_id,
        node_id,
        COALESCE(month, date_trunc('month', COALESCE(event_date::timestamp, submitted_at, NOW()))::date) AS month_key,
        EXTRACT(YEAR FROM COALESCE(month, date_trunc('month', COALESCE(event_date::timestamp, submitted_at, NOW()))::date))::int AS year_key,
        COUNT(*)::int AS submitted_count,
        COUNT(*)::int AS total_events_submitted,
        0,
        0,
        'incomplete',
        '{}'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        false,
        NOW(),
        NOW(),
        NOW()
      FROM form_submissions
      WHERE status != 'deleted'
        AND node_id IS NOT NULL
      GROUP BY tenant_id, project_id, node_id, month_key, year_key
      ON CONFLICT (tenant_id, project_id, node_id, month)
      DO UPDATE SET
        submitted_count = EXCLUDED.submitted_count,
        total_events_submitted = EXCLUDED.total_events_submitted,
        updated_at = NOW(),
        last_calculated_at = NOW()
    `);

    await client.query('COMMIT');
    logger.info('[backfill] Completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[backfill] Failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  runBackfill()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runBackfill };

