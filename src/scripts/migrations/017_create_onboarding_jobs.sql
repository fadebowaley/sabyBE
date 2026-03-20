CREATE TABLE IF NOT EXISTS copilot.onboarding_jobs (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              VARCHAR(64) NOT NULL,
  thread_id              VARCHAR(128),
  status                 VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  stage                  VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  mode                   VARCHAR(16) NOT NULL DEFAULT 'import',
  upload_bytes           BIGINT NOT NULL DEFAULT 0,
  upload_received_bytes  BIGINT NOT NULL DEFAULT 0,
  total_rows             INTEGER NOT NULL DEFAULT 0,
  processed_rows         INTEGER NOT NULL DEFAULT 0,
  progress_pct           INTEGER NOT NULL DEFAULT 0,
  source_file_name       TEXT NOT NULL,
  source_mime_type       VARCHAR(255),
  source_file_path       TEXT NOT NULL,
  source_file_sha256     CHAR(64),
  summary_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_json             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by             VARCHAR(64),
  started_at             TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT onboarding_jobs_status_chk CHECK (
    status IN ('uploaded', 'queued', 'validating', 'importing', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT onboarding_jobs_mode_chk CHECK (mode IN ('import', 'dry_run')),
  CONSTRAINT onboarding_jobs_progress_chk CHECK (progress_pct >= 0 AND progress_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_jobs_tenant_created
  ON copilot.onboarding_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_jobs_tenant_status
  ON copilot.onboarding_jobs (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_onboarding_jobs_thread
  ON copilot.onboarding_jobs (tenant_id, thread_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_onboarding_jobs_updated_at ON copilot.onboarding_jobs;
CREATE TRIGGER trg_onboarding_jobs_updated_at
BEFORE UPDATE ON copilot.onboarding_jobs
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

