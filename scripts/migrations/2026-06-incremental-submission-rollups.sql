-- =============================================================================
-- Incremental submission rollup tables
-- Date: 2026-06-02
-- =============================================================================

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
