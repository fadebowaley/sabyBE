-- Migration 025: Data Intelligence Layer
-- Phase 5: Metric Anomalies + Operational Insights

-- ── Metric Anomalies ──────────────────────────────────────────────────────────
-- Records computed deviations from baseline for any tracked metric.
-- Written by the anomaly detection job; cleared when resolved or superseded.

CREATE TABLE IF NOT EXISTS copilot.metric_anomalies (
  id               UUID                     NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id        VARCHAR(64)              NOT NULL,
  project_id       VARCHAR(64),
  metric_name      VARCHAR(100)             NOT NULL,
  current_value    NUMERIC(20,6)            NOT NULL,
  baseline_value   NUMERIC(20,6),
  deviation_pct    NUMERIC(10,4),
  severity         VARCHAR(16)              NOT NULL DEFAULT 'medium',
  period_start     TIMESTAMPTZ              NOT NULL,
  period_end       TIMESTAMPTZ              NOT NULL,
  resolved_at      TIMESTAMPTZ,
  metadata         JSONB                    NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ              NOT NULL DEFAULT now(),

  CONSTRAINT metric_anomalies_pkey PRIMARY KEY (id),
  CONSTRAINT metric_anomalies_severity_chk
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_metric_anomalies_tenant_project
  ON copilot.metric_anomalies (tenant_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_anomalies_unresolved
  ON copilot.metric_anomalies (tenant_id, severity, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE TRIGGER trg_metric_anomalies_updated_at
  BEFORE UPDATE ON copilot.metric_anomalies
  FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

-- ── Operational Insights ──────────────────────────────────────────────────────
-- Stores the full lifecycle of an AI-generated executive briefing:
--   pending → saby-copilot picks up the call plan and context
--   processing → LLM call in flight
--   completed → brief_json populated
--   failed → error_message populated
--
-- context_json holds the pre-assembled metrics + anomalies + compliance data
-- that was used to build the prompt. call_plan_json holds the resolved model
-- and rendered prompt returned by the intelligence gateway. Both are stored so
-- any brief can be reproduced or audited later.

CREATE TABLE IF NOT EXISTS copilot.operational_insights (
  id               UUID                     NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id        VARCHAR(64)              NOT NULL,
  project_id       VARCHAR(64),
  period_label     VARCHAR(32)              NOT NULL,
  status           VARCHAR(16)              NOT NULL DEFAULT 'pending',
  context_json     JSONB                    NOT NULL DEFAULT '{}',
  call_plan_json   JSONB                    NOT NULL DEFAULT '{}',
  brief_json       JSONB,
  model_key        VARCHAR(64),
  prompt_version   INTEGER,
  prompt_id        UUID,
  error_message    TEXT,
  generated_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ              NOT NULL DEFAULT now(),

  CONSTRAINT operational_insights_pkey PRIMARY KEY (id),
  CONSTRAINT operational_insights_status_chk
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_operational_insights_tenant
  ON copilot.operational_insights (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_insights_pending
  ON copilot.operational_insights (tenant_id, status, created_at DESC)
  WHERE status IN ('pending', 'processing');

-- One pending/processing insight per tenant+project+period at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_insights_active_period
  ON copilot.operational_insights (tenant_id, COALESCE(project_id, ''), period_label)
  WHERE status IN ('pending', 'processing');

CREATE TRIGGER trg_operational_insights_updated_at
  BEFORE UPDATE ON copilot.operational_insights
  FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();
