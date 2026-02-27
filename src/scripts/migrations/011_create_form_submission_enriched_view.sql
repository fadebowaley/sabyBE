-- =============================================================================
-- Migration: 011_create_form_submission_enriched_view.sql
-- Purpose : Ensure analytics view exists for /analytics/submissions endpoints
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Ensure facts table exists before creating the enriched view.
CREATE TABLE IF NOT EXISTS form_submission_facts (
  fact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL,
  tenant_id VARCHAR(64),
  project_id VARCHAR(64),
  form_id VARCHAR(64),
  node_id VARCHAR(64),
  user_id VARCHAR(64),
  source VARCHAR(32) DEFAULT 'unknown',
  field_key VARCHAR(128) NOT NULL,
  field_label TEXT,
  field_type TEXT,
  value_text TEXT,
  value_numeric NUMERIC,
  value_boolean BOOLEAN,
  value_date TIMESTAMPTZ,
  value_json JSONB,
  value_sum_candidate NUMERIC,
  value_years NUMERIC,
  value_months NUMERIC,
  value_category TEXT,
  value_bucket TEXT,
  value_array_length INTEGER,
  value_normalised TEXT,
  month_bucket DATE,
  day_bucket DATE,
  week_bucket DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS form_submission_facts_submission_idx
  ON form_submission_facts (submission_id);
CREATE INDEX IF NOT EXISTS form_submission_facts_project_idx
  ON form_submission_facts (project_id, month_bucket);
CREATE UNIQUE INDEX IF NOT EXISTS form_submission_facts_unique_field
  ON form_submission_facts (submission_id, field_key);
CREATE INDEX IF NOT EXISTS form_submission_facts_day_idx
  ON form_submission_facts (day_bucket);
CREATE INDEX IF NOT EXISTS form_submission_facts_week_idx
  ON form_submission_facts (week_bucket);

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
