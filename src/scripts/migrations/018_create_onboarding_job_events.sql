CREATE TABLE IF NOT EXISTS copilot.onboarding_job_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     VARCHAR(64) NOT NULL,
  job_id        UUID NOT NULL REFERENCES copilot.onboarding_jobs(id) ON DELETE CASCADE,
  event_type    VARCHAR(64) NOT NULL,
  stage         VARCHAR(32),
  status        VARCHAR(32),
  progress_pct  INTEGER,
  message       TEXT,
  payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT onboarding_job_events_progress_chk CHECK (
    progress_pct IS NULL OR (progress_pct >= 0 AND progress_pct <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_onboarding_job_events_tenant_job_created
  ON copilot.onboarding_job_events (tenant_id, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_job_events_tenant_created
  ON copilot.onboarding_job_events (tenant_id, created_at DESC);
