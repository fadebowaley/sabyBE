ALTER TABLE IF EXISTS copilot.onboarding_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64);

UPDATE copilot.onboarding_jobs
SET request_hash = source_file_sha256
WHERE request_hash IS NULL
  AND source_file_sha256 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_jobs_tenant_idempotency_key
  ON copilot.onboarding_jobs (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_jobs_tenant_request_hash
  ON copilot.onboarding_jobs (tenant_id, request_hash)
  WHERE request_hash IS NOT NULL;
