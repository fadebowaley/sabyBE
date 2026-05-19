CREATE TABLE IF NOT EXISTS copilot.approval_decisions (
  id                    VARCHAR(64) PRIMARY KEY,
  tenant_id             VARCHAR(64) NOT NULL,
  requested_by_user_id  VARCHAR(255) NOT NULL,
  approved_by_user_id   VARCHAR(255) NOT NULL,
  tool_name             VARCHAR(120),
  action_type           VARCHAR(100),
  entity_id             VARCHAR(255),
  risk_level            VARCHAR(16) NOT NULL DEFAULT 'LOW',
  approval_token        VARCHAR(255) NOT NULL UNIQUE,
  input_hash            CHAR(64) NOT NULL,
  request_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_result_json JSONB,
  trace_id              UUID,
  reason                TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                VARCHAR(32) NOT NULL DEFAULT 'approved',
  approved_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  consumed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT approval_decisions_risk_level_chk CHECK (
    risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  ),
  CONSTRAINT approval_decisions_status_chk CHECK (
    status IN ('approved', 'consumed', 'rejected', 'revoked', 'expired', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_tenant_status_created
  ON copilot.approval_decisions (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_tenant_actor_created
  ON copilot.approval_decisions (tenant_id, requested_by_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_trace
  ON copilot.approval_decisions (trace_id);
