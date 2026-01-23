-- ------------------------------------------------------------
-- Analytics Views & Materialized Views for Submission Facts
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Enriched submission view combining facts with base submissions
CREATE OR REPLACE VIEW form_submission_enriched_view AS
SELECT
  fs.id AS submission_id,
  fs.tenant_id,
  fs.project_id,
  fs.form_id,
  fs.node_id,
  fs.user_id,
  fs.source,
  fs.status,
  fs.perm_enabled,
  fs.event_compliance_percentage,
  fs.created_at,
  fs.updated_at,
  fs.month,
  fs.year,
  COALESCE(SUM(f.value_sum_candidate), 0) AS numeric_total,
  AVG(f.value_sum_candidate) AS numeric_average,
  COUNT(f.field_key) AS fields_count,
  COUNT(*) FILTER (WHERE f.value_boolean = TRUE) AS boolean_true_count,
  COUNT(*) FILTER (WHERE f.value_boolean = FALSE) AS boolean_false_count,
  COUNT(DISTINCT f.field_key) AS distinct_fields_count,
  MAX(f.value_date) AS latest_value_date,
  MIN(f.value_date) AS earliest_value_date
FROM form_submissions fs
LEFT JOIN form_submission_facts f ON f.submission_id = fs.id
GROUP BY
  fs.id,
  fs.tenant_id,
  fs.project_id,
  fs.form_id,
  fs.node_id,
  fs.user_id,
  fs.source,
  fs.status,
  fs.perm_enabled,
  fs.event_compliance_percentage,
  fs.created_at,
  fs.updated_at,
  fs.month,
  fs.year;

-- 2. Numeric field level summary (materialized view)
CREATE MATERIALIZED VIEW IF NOT EXISTS form_submission_numeric_field_mv AS
SELECT
  f.tenant_id,
  f.project_id,
  f.form_id,
  f.field_key,
  MIN(f.field_label) AS field_label,
  COUNT(*) AS value_count,
  COUNT(DISTINCT f.submission_id) AS submission_count,
  SUM(f.value_numeric) AS numeric_sum,
  AVG(f.value_numeric) AS numeric_avg,
  MIN(f.value_numeric) AS numeric_min,
  MAX(f.value_numeric) AS numeric_max,
  SUM(f.value_sum_candidate) AS numeric_sum_candidate,
  DATE_TRUNC('month', COALESCE(fs.created_at, NOW())) AS month_bucket
FROM form_submission_facts f
LEFT JOIN form_submissions fs ON fs.id = f.submission_id
GROUP BY
  f.tenant_id,
  f.project_id,
  f.form_id,
  f.field_key,
  DATE_TRUNC('month', COALESCE(fs.created_at, NOW()));

CREATE INDEX IF NOT EXISTS form_submission_numeric_field_mv_idx
  ON form_submission_numeric_field_mv (tenant_id, project_id, form_id, field_key, month_bucket);
CREATE UNIQUE INDEX IF NOT EXISTS form_submission_numeric_field_mv_uniq
  ON form_submission_numeric_field_mv (tenant_id, project_id, form_id, field_key, month_bucket);

-- 3. Daily submission metrics materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS form_submission_daily_metrics_mv AS
SELECT
  esv.tenant_id,
  esv.project_id,
  DATE_TRUNC('day', esv.created_at)::date AS period_day,
  COUNT(*) AS submissions_count,
  SUM(esv.numeric_total) AS numeric_total_sum,
  AVG(esv.numeric_total) AS numeric_total_avg,
  AVG(esv.event_compliance_percentage) AS avg_compliance,
  COUNT(DISTINCT esv.node_id) AS unique_nodes,
  COUNT(DISTINCT esv.user_id) AS unique_users,
  SUM(esv.boolean_true_count) AS boolean_true_total,
  SUM(esv.boolean_false_count) AS boolean_false_total
FROM form_submission_enriched_view esv
GROUP BY
  esv.tenant_id,
  esv.project_id,
  DATE_TRUNC('day', esv.created_at);

CREATE INDEX IF NOT EXISTS form_submission_daily_metrics_mv_idx
  ON form_submission_daily_metrics_mv (tenant_id, project_id, period_day);
CREATE UNIQUE INDEX IF NOT EXISTS form_submission_daily_metrics_mv_uniq
  ON form_submission_daily_metrics_mv (tenant_id, project_id, period_day);

-- Helper comment:
-- Refresh command (run when new data ingested):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY form_submission_numeric_field_mv;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY form_submission_daily_metrics_mv;

