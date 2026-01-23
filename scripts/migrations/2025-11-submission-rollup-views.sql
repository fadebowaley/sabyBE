-- =============================================================================
-- Materialized views for daily / weekly / monthly submission rollups
-- Date: 2025-11-14
-- =============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_daily_submission_rollup;
DROP MATERIALIZED VIEW IF EXISTS mv_weekly_submission_rollup;
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_submission_rollup;

-- DAILY ROLLUP ---------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_daily_submission_rollup AS
WITH facts AS (
  SELECT
    day_bucket,
    tenant_id,
    project_id,
    node_id,
    submission_id,
    field_key,
    field_label,
    field_type,
    value_numeric,
    value_boolean,
    value_date,
    value_text,
    value_sum_candidate,
    created_at
  FROM form_submission_facts
  WHERE day_bucket IS NOT NULL
),
text_distributions AS (
  SELECT
    day_bucket,
    tenant_id,
    project_id,
    node_id,
    field_key,
    jsonb_object_agg(value_text, occurrences) AS distribution
  FROM (
    SELECT
      day_bucket,
      tenant_id,
      project_id,
      node_id,
      field_key,
      value_text,
      COUNT(*) AS occurrences
    FROM facts
    WHERE value_text IS NOT NULL
    GROUP BY day_bucket, tenant_id, project_id, node_id, field_key, value_text
  ) grouped
  GROUP BY day_bucket, tenant_id, project_id, node_id, field_key
),
field_stats AS (
  SELECT
    day_bucket,
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
  FROM facts
  GROUP BY day_bucket, tenant_id, project_id, node_id, field_key
),
field_metrics AS (
  SELECT
    fs.day_bucket,
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
    ON td.day_bucket = fs.day_bucket
   AND td.tenant_id = fs.tenant_id
   AND td.project_id = fs.project_id
   AND td.node_id = fs.node_id
   AND td.field_key = fs.field_key
  GROUP BY fs.day_bucket, fs.tenant_id, fs.project_id, fs.node_id
),
overall_metrics AS (
  SELECT
    day_bucket,
    tenant_id,
    project_id,
    node_id,
    jsonb_build_object(
      'field_key', '__TOTAL__',
      'field_label', 'Daily Totals',
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
      day_bucket,
      tenant_id,
      project_id,
      node_id,
      COUNT(DISTINCT submission_id) AS submission_total,
      SUM(value_sum_candidate) AS numeric_sum,
      SUM(CASE WHEN value_boolean IS TRUE THEN 1 ELSE 0 END) AS true_total,
      SUM(CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END) AS boolean_total
    FROM facts
    GROUP BY day_bucket, tenant_id, project_id, node_id
  ) totals
)
SELECT
  fs.submission_date AS day_bucket,
  fs.tenant_id,
  fs.project_id,
  fs.node_id,
  COUNT(*) AS submissions_count,
  NOW() AS last_refreshed,
  jsonb_build_object(
    'avg_percentage', AVG(fs.event_compliance_percentage),
    'min_percentage', MIN(fs.event_compliance_percentage),
    'max_percentage', MAX(fs.event_compliance_percentage),
    'complete_count', SUM(CASE WHEN fs.completeness_status = 'complete' THEN 1 ELSE 0 END),
    'partial_count', SUM(CASE WHEN fs.completeness_status = 'partial' THEN 1 ELSE 0 END),
    'incomplete_count', SUM(CASE WHEN fs.completeness_status = 'incomplete' THEN 1 ELSE 0 END)
  ) AS compliance_summary,
  CASE
    WHEN om.total_metric IS NULL THEN COALESCE(fm.metrics, '[]'::jsonb)
    ELSE COALESCE(fm.metrics, '[]'::jsonb) || jsonb_build_array(om.total_metric)
  END AS field_metrics
FROM form_submissions fs
LEFT JOIN field_metrics fm
  ON fm.day_bucket = fs.submission_date
 AND fm.tenant_id = fs.tenant_id
 AND fm.project_id = fs.project_id
 AND fm.node_id IS NOT DISTINCT FROM fs.node_id
LEFT JOIN overall_metrics om
  ON om.day_bucket = fs.submission_date
 AND om.tenant_id = fs.tenant_id
 AND om.project_id = fs.project_id
 AND om.node_id IS NOT DISTINCT FROM fs.node_id
GROUP BY fs.submission_date, fs.tenant_id, fs.project_id, fs.node_id, fm.metrics, om.total_metric;

CREATE UNIQUE INDEX mv_daily_submission_rollup_idx
  ON mv_daily_submission_rollup (day_bucket, tenant_id, project_id, node_id);

-- WEEKLY ROLLUP --------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_weekly_submission_rollup AS
WITH facts AS (
  SELECT
    week_bucket,
    tenant_id,
    project_id,
    node_id,
    submission_id,
    field_key,
    field_label,
    field_type,
    value_numeric,
    value_boolean,
    value_date,
    value_text,
    value_sum_candidate,
    created_at
  FROM form_submission_facts
  WHERE week_bucket IS NOT NULL
),
text_distributions AS (
  SELECT
    week_bucket,
    tenant_id,
    project_id,
    node_id,
    field_key,
    jsonb_object_agg(value_text, occurrences) AS distribution
  FROM (
    SELECT
      week_bucket,
      tenant_id,
      project_id,
      node_id,
      field_key,
      value_text,
      COUNT(*) AS occurrences
    FROM facts
    WHERE value_text IS NOT NULL
    GROUP BY week_bucket, tenant_id, project_id, node_id, field_key, value_text
  ) grouped
  GROUP BY week_bucket, tenant_id, project_id, node_id, field_key
),
field_stats AS (
  SELECT
    week_bucket,
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
  FROM facts
  GROUP BY week_bucket, tenant_id, project_id, node_id, field_key
),
field_metrics AS (
  SELECT
    fs.week_bucket,
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
    ON td.week_bucket = fs.week_bucket
   AND td.tenant_id = fs.tenant_id
   AND td.project_id = fs.project_id
   AND td.node_id = fs.node_id
   AND td.field_key = fs.field_key
  GROUP BY fs.week_bucket, fs.tenant_id, fs.project_id, fs.node_id
),
overall_metrics AS (
  SELECT
    week_bucket,
    tenant_id,
    project_id,
    node_id,
    jsonb_build_object(
      'field_key', '__TOTAL__',
      'field_label', 'Weekly Totals',
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
      week_bucket,
      tenant_id,
      project_id,
      node_id,
      COUNT(DISTINCT submission_id) AS submission_total,
      SUM(value_sum_candidate) AS numeric_sum,
      SUM(CASE WHEN value_boolean IS TRUE THEN 1 ELSE 0 END) AS true_total,
      SUM(CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END) AS boolean_total
    FROM facts
    GROUP BY week_bucket, tenant_id, project_id, node_id
  ) totals
)
SELECT
  fs.submission_week AS week_bucket,
  fs.tenant_id,
  fs.project_id,
  fs.node_id,
  COUNT(*) AS submissions_count,
  NOW() AS last_refreshed,
  jsonb_build_object(
    'avg_percentage', AVG(fs.event_compliance_percentage),
    'min_percentage', MIN(fs.event_compliance_percentage),
    'max_percentage', MAX(fs.event_compliance_percentage),
    'complete_count', SUM(CASE WHEN fs.completeness_status = 'complete' THEN 1 ELSE 0 END),
    'partial_count', SUM(CASE WHEN fs.completeness_status = 'partial' THEN 1 ELSE 0 END),
    'incomplete_count', SUM(CASE WHEN fs.completeness_status = 'incomplete' THEN 1 ELSE 0 END)
  ) AS compliance_summary,
  CASE
    WHEN om.total_metric IS NULL THEN COALESCE(fm.metrics, '[]'::jsonb)
    ELSE COALESCE(fm.metrics, '[]'::jsonb) || jsonb_build_array(om.total_metric)
  END AS field_metrics
FROM form_submissions fs
LEFT JOIN field_metrics fm
  ON fm.week_bucket = fs.submission_week
 AND fm.tenant_id = fs.tenant_id
 AND fm.project_id = fs.project_id
 AND fm.node_id IS NOT DISTINCT FROM fs.node_id
LEFT JOIN overall_metrics om
  ON om.week_bucket = fs.submission_week
 AND om.tenant_id = fs.tenant_id
 AND om.project_id = fs.project_id
 AND om.node_id IS NOT DISTINCT FROM fs.node_id
GROUP BY fs.submission_week, fs.tenant_id, fs.project_id, fs.node_id, fm.metrics, om.total_metric;

CREATE UNIQUE INDEX mv_weekly_submission_rollup_idx
  ON mv_weekly_submission_rollup (week_bucket, tenant_id, project_id, node_id);

-- MONTHLY ROLLUP -------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_monthly_submission_rollup AS
WITH facts AS (
  SELECT
    month_bucket,
    tenant_id,
    project_id,
    node_id,
    submission_id,
    field_key,
    field_label,
    field_type,
    value_numeric,
    value_boolean,
    value_date,
    value_text,
    value_sum_candidate,
    created_at
  FROM form_submission_facts
  WHERE month_bucket IS NOT NULL
),
text_distributions AS (
  SELECT
    month_bucket,
    tenant_id,
    project_id,
    node_id,
    field_key,
    jsonb_object_agg(value_text, occurrences) AS distribution
  FROM (
    SELECT
      month_bucket,
      tenant_id,
      project_id,
      node_id,
      field_key,
      value_text,
      COUNT(*) AS occurrences
    FROM facts
    WHERE value_text IS NOT NULL
    GROUP BY month_bucket, tenant_id, project_id, node_id, field_key, value_text
  ) grouped
  GROUP BY month_bucket, tenant_id, project_id, node_id, field_key
),
field_stats AS (
  SELECT
    month_bucket,
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
  FROM facts
  GROUP BY month_bucket, tenant_id, project_id, node_id, field_key
),
field_metrics AS (
  SELECT
    fs.month_bucket,
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
    ON td.month_bucket = fs.month_bucket
   AND td.tenant_id = fs.tenant_id
   AND td.project_id = fs.project_id
   AND td.node_id = fs.node_id
   AND td.field_key = fs.field_key
  GROUP BY fs.month_bucket, fs.tenant_id, fs.project_id, fs.node_id
),
overall_metrics AS (
  SELECT
    month_bucket,
    tenant_id,
    project_id,
    node_id,
    jsonb_build_object(
      'field_key', '__TOTAL__',
      'field_label', 'Monthly Totals',
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
      month_bucket,
      tenant_id,
      project_id,
      node_id,
      COUNT(DISTINCT submission_id) AS submission_total,
      SUM(value_sum_candidate) AS numeric_sum,
      SUM(CASE WHEN value_boolean IS TRUE THEN 1 ELSE 0 END) AS true_total,
      SUM(CASE WHEN value_boolean IS NOT NULL THEN 1 ELSE 0 END) AS boolean_total
    FROM facts
    GROUP BY month_bucket, tenant_id, project_id, node_id
  ) totals
)
SELECT
  COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date) AS month_bucket,
  fs.tenant_id,
  fs.project_id,
  fs.node_id,
  COUNT(*) AS submissions_count,
  NOW() AS last_refreshed,
  jsonb_build_object(
    'avg_percentage', AVG(fs.event_compliance_percentage),
    'min_percentage', MIN(fs.event_compliance_percentage),
    'max_percentage', MAX(fs.event_compliance_percentage),
    'complete_count', SUM(CASE WHEN fs.completeness_status = 'complete' THEN 1 ELSE 0 END),
    'partial_count', SUM(CASE WHEN fs.completeness_status = 'partial' THEN 1 ELSE 0 END),
    'incomplete_count', SUM(CASE WHEN fs.completeness_status = 'incomplete' THEN 1 ELSE 0 END)
  ) AS compliance_summary,
  CASE
    WHEN om.total_metric IS NULL THEN COALESCE(fm.metrics, '[]'::jsonb)
    ELSE COALESCE(fm.metrics, '[]'::jsonb) || jsonb_build_array(om.total_metric)
  END AS field_metrics
FROM form_submissions fs
LEFT JOIN field_metrics fm
  ON fm.month_bucket = COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date)
 AND fm.tenant_id = fs.tenant_id
 AND fm.project_id = fs.project_id
 AND fm.node_id IS NOT DISTINCT FROM fs.node_id
LEFT JOIN overall_metrics om
  ON om.month_bucket = COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date)
 AND om.tenant_id = fs.tenant_id
 AND om.project_id = fs.project_id
 AND om.node_id IS NOT DISTINCT FROM fs.node_id
GROUP BY COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date),
         fs.tenant_id,
         fs.project_id,
         fs.node_id,
         fm.metrics,
         om.total_metric;

CREATE UNIQUE INDEX mv_monthly_submission_rollup_idx
  ON mv_monthly_submission_rollup (month_bucket, tenant_id, project_id, node_id);

-- Populate the new materialized views
REFRESH MATERIALIZED VIEW mv_daily_submission_rollup;
REFRESH MATERIALIZED VIEW mv_weekly_submission_rollup;
REFRESH MATERIALIZED VIEW mv_monthly_submission_rollup;
-- =============================================================================
-- Materialized views for daily / weekly / monthly submission rollups
-- Date: 2025-11-14
-- Helper CTE reused across views to aggregate field-level metrics
-- (Duplicated per view because Postgres cannot share CTEs between MV definitions)

-- DAILY ROLLUP ---------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_submission_rollup AS
WITH field_metrics AS (
  SELECT
    day_bucket,
    tenant_id,
    project_id,
    node_id,
    jsonb_agg(
      jsonb_build_object(
        'field_key', field_key,
        'field_label', field_label,
        'value_count', value_count,
        'sum_numeric', sum_numeric,
        'avg_numeric', avg_numeric,
        'min_numeric', min_numeric,
        'max_numeric', max_numeric
      )
      ORDER BY field_key
    ) AS metrics
  FROM (
    SELECT
      day_bucket,
      tenant_id,
      project_id,
      node_id,
      field_key,
      MIN(field_label) AS field_label,
      COUNT(*) AS value_count,
      SUM(value_numeric) AS sum_numeric,
      AVG(value_numeric) FILTER (WHERE value_numeric IS NOT NULL) AS avg_numeric,
      MIN(value_numeric) AS min_numeric,
      MAX(value_numeric) AS max_numeric
    FROM form_submission_facts
    WHERE day_bucket IS NOT NULL
    GROUP BY day_bucket, tenant_id, project_id, node_id, field_key
  ) agg
  GROUP BY day_bucket, tenant_id, project_id, node_id
)
SELECT
  fs.submission_date AS day_bucket,
  fs.tenant_id,
  fs.project_id,
  fs.node_id,
  COUNT(*) AS submissions_count,
  COALESCE(field_metrics.metrics, '[]'::jsonb) AS field_metrics
FROM form_submissions fs
LEFT JOIN field_metrics
  ON field_metrics.day_bucket = fs.submission_date
  AND field_metrics.tenant_id = fs.tenant_id
  AND field_metrics.project_id = fs.project_id
  AND field_metrics.node_id IS NOT DISTINCT FROM fs.node_id
GROUP BY fs.submission_date, fs.tenant_id, fs.project_id, fs.node_id, field_metrics.metrics;

CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_submission_rollup_idx
  ON mv_daily_submission_rollup (day_bucket, tenant_id, project_id, node_id);

-- WEEKLY ROLLUP --------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_weekly_submission_rollup AS
WITH field_metrics AS (
  SELECT
    week_bucket,
    tenant_id,
    project_id,
    node_id,
    jsonb_agg(
      jsonb_build_object(
        'field_key', field_key,
        'field_label', field_label,
        'value_count', value_count,
        'sum_numeric', sum_numeric,
        'avg_numeric', avg_numeric,
        'min_numeric', min_numeric,
        'max_numeric', max_numeric
      )
      ORDER BY field_key
    ) AS metrics
  FROM (
    SELECT
      week_bucket,
      tenant_id,
      project_id,
      node_id,
      field_key,
      MIN(field_label) AS field_label,
      COUNT(*) AS value_count,
      SUM(value_numeric) AS sum_numeric,
      AVG(value_numeric) FILTER (WHERE value_numeric IS NOT NULL) AS avg_numeric,
      MIN(value_numeric) AS min_numeric,
      MAX(value_numeric) AS max_numeric
    FROM form_submission_facts
    WHERE week_bucket IS NOT NULL
    GROUP BY week_bucket, tenant_id, project_id, node_id, field_key
  ) agg
  GROUP BY week_bucket, tenant_id, project_id, node_id
)
SELECT
  fs.submission_week AS week_bucket,
  fs.tenant_id,
  fs.project_id,
  fs.node_id,
  COUNT(*) AS submissions_count,
  COALESCE(field_metrics.metrics, '[]'::jsonb) AS field_metrics
FROM form_submissions fs
LEFT JOIN field_metrics
  ON field_metrics.week_bucket = fs.submission_week
  AND field_metrics.tenant_id = fs.tenant_id
  AND field_metrics.project_id = fs.project_id
  AND field_metrics.node_id IS NOT DISTINCT FROM fs.node_id
GROUP BY fs.submission_week, fs.tenant_id, fs.project_id, fs.node_id, field_metrics.metrics;

CREATE UNIQUE INDEX IF NOT EXISTS mv_weekly_submission_rollup_idx
  ON mv_weekly_submission_rollup (week_bucket, tenant_id, project_id, node_id);

-- MONTHLY ROLLUP -------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_submission_rollup AS
WITH field_metrics AS (
  SELECT
    month_bucket,
    tenant_id,
    project_id,
    node_id,
    jsonb_agg(
      jsonb_build_object(
        'field_key', field_key,
        'field_label', field_label,
        'value_count', value_count,
        'sum_numeric', sum_numeric,
        'avg_numeric', avg_numeric,
        'min_numeric', min_numeric,
        'max_numeric', max_numeric
      )
      ORDER BY field_key
    ) AS metrics
  FROM (
    SELECT
      month_bucket,
      tenant_id,
      project_id,
      node_id,
      field_key,
      MIN(field_label) AS field_label,
      COUNT(*) AS value_count,
      SUM(value_numeric) AS sum_numeric,
      AVG(value_numeric) FILTER (WHERE value_numeric IS NOT NULL) AS avg_numeric,
      MIN(value_numeric) AS min_numeric,
      MAX(value_numeric) AS max_numeric
    FROM form_submission_facts
    WHERE month_bucket IS NOT NULL
    GROUP BY month_bucket, tenant_id, project_id, node_id, field_key
  ) agg
  GROUP BY month_bucket, tenant_id, project_id, node_id
)
SELECT
  COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date) AS month_bucket,
  fs.tenant_id,
  fs.project_id,
  fs.node_id,
  COUNT(*) AS submissions_count,
  COALESCE(field_metrics.metrics, '[]'::jsonb) AS field_metrics
FROM form_submissions fs
LEFT JOIN field_metrics
  ON field_metrics.month_bucket = COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date)
  AND field_metrics.tenant_id = fs.tenant_id
  AND field_metrics.project_id = fs.project_id
  AND field_metrics.node_id IS NOT DISTINCT FROM fs.node_id
GROUP BY COALESCE(fs.month, DATE_TRUNC('month', fs.submitted_at)::date),
         fs.tenant_id,
         fs.project_id,
         fs.node_id,
         field_metrics.metrics;

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_submission_rollup_idx
  ON mv_monthly_submission_rollup (month_bucket, tenant_id, project_id, node_id);

-- Populate the new materialized views
REFRESH MATERIALIZED VIEW mv_daily_submission_rollup;
REFRESH MATERIALIZED VIEW mv_weekly_submission_rollup;
REFRESH MATERIALIZED VIEW mv_monthly_submission_rollup;

