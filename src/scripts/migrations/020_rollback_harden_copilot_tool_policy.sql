DROP INDEX IF EXISTS copilot.idx_policy_decision_logs_tenant_allowed_created;
DROP INDEX IF EXISTS copilot.idx_policy_decision_logs_tenant_tool_created;
DROP INDEX IF EXISTS copilot.idx_policy_decision_logs_tenant_created;

DROP TABLE IF EXISTS copilot.policy_decision_logs;

ALTER TABLE copilot.tool_registry
  DROP CONSTRAINT IF EXISTS tool_registry_risk_level_chk;

ALTER TABLE copilot.tool_registry
  DROP COLUMN IF EXISTS rollback_strategy,
  DROP COLUMN IF EXISTS retry_policy,
  DROP COLUMN IF EXISTS audit_required,
  DROP COLUMN IF EXISTS idempotency_key_required,
  DROP COLUMN IF EXISTS tenant_scope_required,
  DROP COLUMN IF EXISTS required_permissions,
  DROP COLUMN IF EXISTS output_schema_json,
  DROP COLUMN IF EXISTS input_schema_json,
  DROP COLUMN IF EXISTS risk_level;
