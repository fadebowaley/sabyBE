const { postgresPool } = require('../config/postgres');

const ROLLUP_TABLES = {
  daily: {
    tableName: 'submission_rollup_daily',
    bucketColumn: 'day_bucket',
    bucketExpression: 'submission_date',
  },
  weekly: {
    tableName: 'submission_rollup_weekly',
    bucketColumn: 'week_bucket',
    bucketExpression: 'submission_week',
  },
  monthly: {
    tableName: 'submission_rollup_monthly',
    bucketColumn: 'month_bucket',
    bucketExpression:
      "COALESCE(month, DATE_TRUNC('month', submitted_at AT TIME ZONE 'UTC')::date)",
  },
};

let ensurePromise = null;

const ensureRollupTables = async () => {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = postgresPool.query(`
    CREATE TABLE IF NOT EXISTS submission_rollup_daily (
      day_bucket DATE NOT NULL,
      tenant_id VARCHAR(64) NOT NULL,
      project_id VARCHAR(64) NOT NULL,
      node_id VARCHAR(64),
      node_scope VARCHAR(64) NOT NULL DEFAULT '',
      submissions_count INTEGER NOT NULL DEFAULT 0,
      compliance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      field_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_refreshed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (day_bucket, tenant_id, project_id, node_scope)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_rollup_daily_lookup
      ON submission_rollup_daily (tenant_id, project_id, node_id, day_bucket DESC);

    CREATE TABLE IF NOT EXISTS submission_rollup_weekly (
      week_bucket DATE NOT NULL,
      tenant_id VARCHAR(64) NOT NULL,
      project_id VARCHAR(64) NOT NULL,
      node_id VARCHAR(64),
      node_scope VARCHAR(64) NOT NULL DEFAULT '',
      submissions_count INTEGER NOT NULL DEFAULT 0,
      compliance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      field_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_refreshed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (week_bucket, tenant_id, project_id, node_scope)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_rollup_weekly_lookup
      ON submission_rollup_weekly (tenant_id, project_id, node_id, week_bucket DESC);

    CREATE TABLE IF NOT EXISTS submission_rollup_monthly (
      month_bucket DATE NOT NULL,
      tenant_id VARCHAR(64) NOT NULL,
      project_id VARCHAR(64) NOT NULL,
      node_id VARCHAR(64),
      node_scope VARCHAR(64) NOT NULL DEFAULT '',
      submissions_count INTEGER NOT NULL DEFAULT 0,
      compliance_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      field_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_refreshed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (month_bucket, tenant_id, project_id, node_scope)
    );

    CREATE INDEX IF NOT EXISTS idx_submission_rollup_monthly_lookup
      ON submission_rollup_monthly (tenant_id, project_id, node_id, month_bucket DESC);
  `);

  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
};

const normalizeNodeScope = (nodeId) => nodeId || '';
const metricLabelByGranularity = {
  daily: 'Daily Totals',
  weekly: 'Weekly Totals',
  monthly: 'Monthly Totals',
};

const toDateString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const getBucketValue = (submission, granularity) => {
  if (!submission) return null;

  if (granularity === 'daily') {
    return toDateString(submission.submission_date || submission.submitted_at);
  }

  if (granularity === 'weekly') {
    return toDateString(submission.submission_week || submission.submitted_at);
  }

  const monthValue =
    submission.month ||
    (submission.submitted_at
      ? new Date(
          Date.UTC(
            new Date(submission.submitted_at).getUTCFullYear(),
            new Date(submission.submitted_at).getUTCMonth(),
            1
          )
        )
      : null);

  return toDateString(monthValue);
};

const buildKeyMap = (before, after) => {
  const keyMap = new Map();

  const register = (submission, granularity) => {
    if (!submission?.tenant_id || !submission?.project_id) {
      return;
    }

    const bucketValue = getBucketValue(submission, granularity);
    if (!bucketValue) {
      return;
    }

    const mapKey = [
      granularity,
      submission.tenant_id,
      submission.project_id,
      submission.node_id || '',
      bucketValue,
    ].join(':');

    keyMap.set(mapKey, {
      granularity,
      tenant_id: submission.tenant_id,
      project_id: submission.project_id,
      node_id: submission.node_id || null,
      bucketValue,
    });
  };

  ['daily', 'weekly', 'monthly'].forEach((granularity) => {
    register(before, granularity);
    register(after, granularity);
  });

  return [...keyMap.values()];
};

const getFieldMetricsForBucket = async (client, granularity, key) => {
  const config = ROLLUP_TABLES[granularity];
  const bucketColumn = config.bucketColumn;
  const totalLabel = metricLabelByGranularity[granularity] || 'Totals';

  const query = `
    WITH filtered_facts AS (
      SELECT
        f.${bucketColumn} AS bucket_value,
        f.tenant_id,
        f.project_id,
        f.node_id,
        f.submission_id,
        f.field_key,
        f.field_label,
        f.field_type,
        f.value_numeric,
        f.value_boolean,
        f.value_date,
        f.value_text,
        f.value_sum_candidate,
        f.created_at
      FROM form_submission_facts f
      INNER JOIN form_submissions fs
        ON fs.id = f.submission_id
      WHERE f.tenant_id = $1
        AND f.project_id = $2
        AND f.node_id IS NOT DISTINCT FROM $3
        AND f.${bucketColumn} = $4::date
        AND fs.status <> 'deleted'
    ),
    text_distributions AS (
      SELECT
        bucket_value,
        tenant_id,
        project_id,
        node_id,
        field_key,
        jsonb_object_agg(value_text, occurrences) AS distribution
      FROM (
        SELECT
          bucket_value,
          tenant_id,
          project_id,
          node_id,
          field_key,
          value_text,
          COUNT(*) AS occurrences
        FROM filtered_facts
        WHERE value_text IS NOT NULL
        GROUP BY bucket_value, tenant_id, project_id, node_id, field_key, value_text
      ) grouped
      GROUP BY bucket_value, tenant_id, project_id, node_id, field_key
    ),
    field_stats AS (
      SELECT
        bucket_value,
        tenant_id,
        project_id,
        node_id,
        field_key,
        MIN(field_label) AS field_label,
        MIN(field_type) AS field_type,
        COUNT(*) AS value_count,
        COUNT(*) FILTER (WHERE value_numeric IS NOT NULL) AS numeric_count,
        SUM(value_numeric) AS numeric_sum,
        AVG(value_numeric) FILTER (WHERE value_numeric IS NOT NULL) AS numeric_avg,
        MIN(value_numeric) AS numeric_min,
        MAX(value_numeric) AS numeric_max,
        COUNT(*) FILTER (WHERE value_boolean IS NOT NULL) AS boolean_count,
        SUM(CASE WHEN value_boolean IS TRUE THEN 1 ELSE 0 END) AS true_count,
        SUM(CASE WHEN value_boolean IS FALSE THEN 1 ELSE 0 END) AS false_count,
        MIN(value_date) AS min_date,
        MAX(value_date) AS max_date,
        ARRAY_AGG(value_text ORDER BY created_at) FILTER (WHERE value_text IS NOT NULL) AS text_values
      FROM filtered_facts
      GROUP BY bucket_value, tenant_id, project_id, node_id, field_key
    ),
    field_metrics AS (
      SELECT
        fs.bucket_value,
        fs.tenant_id,
        fs.project_id,
        fs.node_id,
        jsonb_agg(
          jsonb_build_object(
            'field_key', fs.field_key,
            'field_label', fs.field_label,
            'field_type', fs.field_type,
            'value_count', fs.value_count,
            'numeric', CASE
              WHEN fs.numeric_count > 0 THEN jsonb_build_object(
                'sum', fs.numeric_sum,
                'avg', fs.numeric_avg,
                'min', fs.numeric_min,
                'max', fs.numeric_max
              )
              ELSE NULL
            END,
            'text', CASE
              WHEN fs.text_values IS NOT NULL THEN jsonb_build_object(
                'samples', to_jsonb(COALESCE(fs.text_values[1:3], ARRAY[]::text[])),
                'has_more', COALESCE(array_length(fs.text_values, 1), 0) > 3
              )
              ELSE NULL
            END,
            'distribution', td.distribution,
            'boolean', CASE
              WHEN fs.boolean_count > 0 THEN jsonb_build_object(
                'true_count', fs.true_count,
                'false_count', fs.false_count,
                'true_pct', ROUND((fs.true_count::numeric / NULLIF(fs.boolean_count, 0)) * 100, 2)
              )
              ELSE NULL
            END,
            'date_range', CASE
              WHEN fs.min_date IS NOT NULL OR fs.max_date IS NOT NULL THEN jsonb_build_object(
                'min', fs.min_date,
                'max', fs.max_date
              )
              ELSE NULL
            END
          )
          ORDER BY fs.field_key
        ) AS metrics
      FROM field_stats fs
      LEFT JOIN text_distributions td
        ON td.bucket_value = fs.bucket_value
       AND td.tenant_id = fs.tenant_id
       AND td.project_id = fs.project_id
       AND td.node_id IS NOT DISTINCT FROM fs.node_id
       AND td.field_key = fs.field_key
      GROUP BY fs.bucket_value, fs.tenant_id, fs.project_id, fs.node_id
    ),
    overall_metrics AS (
      SELECT
        bucket_value,
        tenant_id,
        project_id,
        node_id,
        jsonb_build_object(
          'field_key', '__TOTAL__',
          'field_label', $5::text,
          'value_count', submission_total,
          'numeric', jsonb_build_object('sum', numeric_sum),
          'boolean', CASE
            WHEN boolean_total > 0 THEN jsonb_build_object(
              'true_count', true_total,
              'false_count', boolean_total - true_total,
              'true_pct', ROUND((true_total::numeric / NULLIF(boolean_total, 0)) * 100, 2)
            )
            ELSE NULL
          END
        ) AS total_metric
      FROM (
        SELECT
          bucket_value,
          tenant_id,
          project_id,
          node_id,
          COUNT(DISTINCT submission_id) AS submission_total,
          SUM(value_sum_candidate) AS numeric_sum,
          SUM(CASE WHEN value_boolean IS TRUE THEN 1 ELSE 0 END) AS true_total,
          SUM(CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END) AS boolean_total
        FROM filtered_facts
        GROUP BY bucket_value, tenant_id, project_id, node_id
      ) totals
    )
    SELECT
      CASE
        WHEN om.total_metric IS NULL THEN COALESCE(fm.metrics, '[]'::jsonb)
        ELSE COALESCE(fm.metrics, '[]'::jsonb) || jsonb_build_array(om.total_metric)
      END AS field_metrics
    FROM field_metrics fm
    FULL OUTER JOIN overall_metrics om
      ON om.bucket_value = fm.bucket_value
     AND om.tenant_id = fm.tenant_id
     AND om.project_id = fm.project_id
     AND om.node_id IS NOT DISTINCT FROM fm.node_id
    LIMIT 1
  `;

  const { rows } = await client.query(query, [
    key.tenant_id,
    key.project_id,
    key.node_id,
    key.bucketValue,
    totalLabel,
  ]);

  return rows[0]?.field_metrics || [];
};

const recomputeRollupBucket = async (client, granularity, key) => {
  const config = ROLLUP_TABLES[granularity];
  const { tableName, bucketColumn, bucketExpression } = config;

  const aggregateQuery = `
    SELECT
      COUNT(*)::int AS submissions_count,
      jsonb_build_object(
        'avg_percentage', AVG(event_compliance_percentage),
        'min_percentage', MIN(event_compliance_percentage),
        'max_percentage', MAX(event_compliance_percentage),
        'complete_count', SUM(CASE WHEN completeness_status = 'complete' THEN 1 ELSE 0 END),
        'partial_count', SUM(CASE WHEN completeness_status = 'partial' THEN 1 ELSE 0 END),
        'incomplete_count', SUM(CASE WHEN completeness_status = 'incomplete' THEN 1 ELSE 0 END)
      ) AS compliance_summary
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_id = $2
      AND node_id IS NOT DISTINCT FROM $3
      AND ${bucketExpression} = $4::date
      AND status <> 'deleted'
  `;

  const { rows } = await client.query(aggregateQuery, [
    key.tenant_id,
    key.project_id,
    key.node_id,
    key.bucketValue,
  ]);

  const aggregate = rows[0];
  const submissionsCount = Number(aggregate?.submissions_count || 0);

  if (submissionsCount <= 0) {
    await client.query(
      `
        DELETE FROM ${tableName}
        WHERE ${bucketColumn} = $1::date
          AND tenant_id = $2
          AND project_id = $3
          AND node_scope = $4
      `,
      [
        key.bucketValue,
        key.tenant_id,
        key.project_id,
        normalizeNodeScope(key.node_id),
      ]
    );
    return;
  }

  const fieldMetrics = await getFieldMetricsForBucket(client, granularity, key);

  await client.query(
    `
      INSERT INTO ${tableName} (
        ${bucketColumn},
        tenant_id,
        project_id,
        node_id,
        node_scope,
        submissions_count,
        compliance_summary,
        field_metrics,
        last_refreshed
      )
      VALUES ($1::date, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, NOW())
      ON CONFLICT (${bucketColumn}, tenant_id, project_id, node_scope)
      DO UPDATE SET
        submissions_count = EXCLUDED.submissions_count,
        compliance_summary = EXCLUDED.compliance_summary,
        node_id = EXCLUDED.node_id,
        field_metrics = EXCLUDED.field_metrics,
        last_refreshed = NOW()
    `,
    [
      key.bucketValue,
      key.tenant_id,
      key.project_id,
      key.node_id,
      normalizeNodeScope(key.node_id),
      submissionsCount,
      JSON.stringify(aggregate.compliance_summary || {}),
      JSON.stringify(fieldMetrics || []),
    ]
  );
};

const syncRollupsForSubmissionChange = async ({
  before = null,
  after = null,
  client = null,
} = {}) => {
  const keys = buildKeyMap(before, after);
  if (keys.length === 0) {
    return;
  }

  await ensureRollupTables();

  const db = client || postgresPool;
  for (const key of keys) {
    await recomputeRollupBucket(db, key.granularity, key);
  }
};

module.exports = {
  ensureRollupTables,
  recomputeRollupBucket,
  syncRollupsForSubmissionChange,
  ROLLUP_TABLES,
};
