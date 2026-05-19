-- Harden copilot tool contracts and policy decision audit logging.

ALTER TABLE copilot.tool_registry
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(16) NOT NULL DEFAULT 'LOW',
  ADD COLUMN IF NOT EXISTS input_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS required_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tenant_scope_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS idempotency_key_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS audit_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS retry_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rollback_strategy TEXT;

ALTER TABLE copilot.tool_registry
  DROP CONSTRAINT IF EXISTS tool_registry_risk_level_chk;

ALTER TABLE copilot.tool_registry
  ADD CONSTRAINT tool_registry_risk_level_chk
  CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

UPDATE copilot.tool_registry
SET input_schema_json = schema_json
WHERE input_schema_json = '{}'::jsonb
  AND schema_json <> '{}'::jsonb;

CREATE TABLE IF NOT EXISTS copilot.policy_decision_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           VARCHAR(64) NOT NULL,
  user_id             VARCHAR(255),
  tool_name           VARCHAR(120),
  action_type         VARCHAR(100),
  risk_level          VARCHAR(16) NOT NULL DEFAULT 'LOW',
  allowed             BOOLEAN NOT NULL DEFAULT FALSE,
  reason              TEXT NOT NULL,
  requires_approval   BOOLEAN NOT NULL DEFAULT FALSE,
  approval_id         VARCHAR(255),
  input_hash          VARCHAR(128) NOT NULL,
  blocked_rules       JSONB NOT NULL DEFAULT '[]'::jsonb,
  request_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT policy_decision_logs_risk_level_chk CHECK (
    risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  )
);

CREATE INDEX IF NOT EXISTS idx_policy_decision_logs_tenant_created
  ON copilot.policy_decision_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_decision_logs_tenant_tool_created
  ON copilot.policy_decision_logs (tenant_id, tool_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_decision_logs_tenant_allowed_created
  ON copilot.policy_decision_logs (tenant_id, allowed, created_at DESC);
