DROP INDEX IF EXISTS idx_onboarding_jobs_tenant_request_hash;
DROP INDEX IF EXISTS idx_onboarding_jobs_tenant_idempotency_key;

ALTER TABLE IF EXISTS copilot.onboarding_jobs
  DROP COLUMN IF EXISTS request_hash,
  DROP COLUMN IF EXISTS idempotency_key;
