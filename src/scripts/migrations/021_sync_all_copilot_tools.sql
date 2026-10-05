-- 021_sync_all_copilot_tools.sql
-- Synchronize all 58 copilot agent tools

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'reset_password_tool', 'Admin support: reset account password by user email', 'auth', 'reset_password', true,
  true, false, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"email":{"type":"string"},"userEmail":{"type":"string"},"newPassword":{"type":"string"}},"required":["newPassword"]},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"email":{"type":"string"},"userEmail":{"type":"string"},"newPassword":{"type":"string"}},"required":["newPassword"]},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Require a new approved reset if correction is needed.', '{"phase":"auth-support","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'verify_account_tool', 'Admin support: mark user account as verified/active by email', 'auth', 'verify_account', true,
  true, false, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"email":{"type":"string"},"userEmail":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"email":{"type":"string"},"userEmail":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Use a separate approved deactivate/update action if needed.', '{"phase":"auth-support","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'assign_role_tool', 'Assign one or more roles to a user', 'identity', 'assign_role', true,
  true, true, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"userId":{"type":"string"},"userEmail":{"type":"string"},"userName":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"roleName":{"type":"string"},"roleNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"userId":{"type":"string"},"userEmail":{"type":"string"},"userName":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"roleName":{"type":"string"},"roleNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["role:assign","user:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with approved unassign_role action.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'unassign_role_tool', 'Remove one or more roles from a user', 'identity', 'unassign_role', true,
  true, true, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"userId":{"type":"string"},"userEmail":{"type":"string"},"userName":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"roleName":{"type":"string"},"roleNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"userId":{"type":"string"},"userEmail":{"type":"string"},"userName":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"roleName":{"type":"string"},"roleNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["role:assign","user:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with approved assign_role action.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'grant_permission_tool', 'Grant permission(s) to a role', 'identity', 'grant_permission', true,
  true, true, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionName":{"type":"string"},"permissionNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionName":{"type":"string"},"permissionNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["permission:manage","role:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with approved revoke_permission action.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'revoke_permission_tool', 'Revoke permission(s) from a role', 'identity', 'revoke_permission', true,
  true, true, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionName":{"type":"string"},"permissionNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionName":{"type":"string"},"permissionNames":{"type":"array","items":{"type":"string"}}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["permission:manage","role:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with approved grant_permission action.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'move_node_tool', 'Move a node under a different parent node', 'structure', 'move_node', true,
  true, false, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"nodeId":{"type":"string"},"nodeName":{"type":"string"},"targetParentId":{"type":"string"},"targetParentName":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"nodeId":{"type":"string"},"nodeName":{"type":"string"},"targetParentId":{"type":"string"},"targetParentName":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:move"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Require an approved move_node action back to the prior parent.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'archive_project_tool', 'Archive project by form id or project name', 'project', 'archive_project', true,
  true, true, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["project:archive"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with approved restore_project action.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'restore_project_tool', 'Restore archived project by form id or project name', 'project', 'restore_project', true,
  true, true, 20000, '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"actionPayload":{"type":"object","properties":{"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}},"approvalToken":{"type":"string"},"idempotencyKey":{"type":"string"}},"required":["actionPayload"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["project:restore"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with approved archive_project action.', '{"phase":"4.5","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_user', 'Create a new user in the tenant', 'people', 'create_user', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"userBody":{"type":"object","properties":{"email":{"type":"string"},"firstname":{"type":"string"},"lastname":{"type":"string"},"phone":{"type":"string"},"password":{"type":"string"}}},"userRoleId":{"type":"string"},"nodeIds":{"type":"array","items":{"type":"string"}}},"required":["userBody"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"userBody":{"type":"object","properties":{"email":{"type":"string"},"firstname":{"type":"string"},"lastname":{"type":"string"},"phone":{"type":"string"},"password":{"type":"string"}}},"userRoleId":{"type":"string"},"nodeIds":{"type":"array","items":{"type":"string"}}},"required":["userBody"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved deactivate_user action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_update_user', 'Update a user profile', 'people', 'update_user', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"userBody":{"type":"object","properties":{"email":{"type":"string"},"firstname":{"type":"string"},"lastname":{"type":"string"},"phone":{"type":"string"}}}},"required":["userBody"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"userBody":{"type":"object","properties":{"email":{"type":"string"},"firstname":{"type":"string"},"lastname":{"type":"string"},"phone":{"type":"string"}}}},"required":["userBody"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Apply a corrected update if needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_deactivate_user', 'Deactivate a user account', 'people', 'deactivate_user', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved reactivate_user action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_user', 'Permanently delete a user account', 'people', 'delete_user', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:delete"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Deleted users cannot be restored.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_reset_password', 'Reset a user account password', 'people', 'reset_password', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"email":{"type":"string"},"newPassword":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"entityId":{"type":"string"},"email":{"type":"string"},"newPassword":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Require a new approved reset if correction is needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_assign_role', 'Assign one or more roles to a user', 'people', 'assign_role', true,
  false, true, 20000, '{"type":"object","properties":{"userId":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"nodeIds":{"type":"array","items":{"type":"string"}}},"required":["userId"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"userId":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}},"nodeIds":{"type":"array","items":{"type":"string"}}},"required":["userId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:assign"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved unassign_role action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_unassign_role', 'Unassign one or more roles from a user', 'people', 'unassign_role', true,
  false, true, 20000, '{"type":"object","properties":{"userId":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}}},"required":["userId"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"userId":{"type":"string"},"roleId":{"type":"string"},"roleIds":{"type":"array","items":{"type":"string"}}},"required":["userId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:assign"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved assign_role action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_reactivate_user', 'Reactivate a deactivated user account', 'people', 'reactivate_user', true,
  false, true, 20000, '{"type":"object","properties":{"userId":{"type":"string"}},"required":["userId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"userId":{"type":"string"}},"required":["userId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved deactivate_user action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_verify_account', 'Verify a user account (email + OTP + active)', 'people', 'verify_account', true,
  false, false, 20000, '{"type":"object","properties":{"email":{"type":"string"},"userId":{"type":"string"},"phone":{"type":"string"},"channel":{"type":"string","enum":["all","email","phone"]},"verifyPhone":{"type":"boolean"},"verifyEmail":{"type":"boolean"},"isPhoneVerified":{"type":"boolean"}},"required":[]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"email":{"type":"string"},"userId":{"type":"string"},"phone":{"type":"string"},"channel":{"type":"string","enum":["all","email","phone"]},"verifyPhone":{"type":"boolean"},"verifyEmail":{"type":"boolean"},"isPhoneVerified":{"type":"boolean"}},"required":[]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["user:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Deactivate the account if verification must be undone.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_assign_user_to_node', 'Assign a user to a workspace node', 'people', 'assign_user_to_node', true,
  false, true, 20000, '{"type":"object","properties":{"userId":{"type":"string"},"nodeId":{"type":"string"}},"required":["userId","nodeId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"userId":{"type":"string"},"nodeId":{"type":"string"}},"required":["userId","nodeId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved unassign_user_from_node action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_unassign_user_from_node', 'Unassign a user from a workspace node', 'people', 'unassign_user_from_node', true,
  false, true, 20000, '{"type":"object","properties":{"userId":{"type":"string"},"nodeId":{"type":"string"}},"required":["userId","nodeId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"userId":{"type":"string"},"nodeId":{"type":"string"}},"required":["userId","nodeId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved assign_user_to_node action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_role', 'Create a role in the tenant', 'people', 'create_role', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"roleName":{"type":"string"},"description":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}}},"required":["roleName"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"roleName":{"type":"string"},"description":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}}},"required":["roleName"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["role:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved delete_role action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_role', 'Delete a role from the tenant', 'people', 'delete_role', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["role:delete"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Recreate the role if needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_grant_permission', 'Grant permission(s) to a role', 'people', 'grant_permission', true,
  false, true, 20000, '{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionNames":{"type":"array","items":{"type":"string"}}}}'::jsonb,
  'HIGH', '{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionNames":{"type":"array","items":{"type":"string"}}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["role:permissions"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved revoke_permission action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_revoke_permission', 'Revoke permission(s) from a role', 'people', 'revoke_permission', true,
  false, true, 20000, '{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionNames":{"type":"array","items":{"type":"string"}}}}'::jsonb,
  'HIGH', '{"type":"object","properties":{"roleId":{"type":"string"},"roleName":{"type":"string"},"permissionId":{"type":"string"},"permissionIds":{"type":"array","items":{"type":"string"}},"permissionNames":{"type":"array","items":{"type":"string"}}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["role:permissions"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved grant_permission action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_node', 'Create a node in the structure', 'structure', 'create_node', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"nodeName":{"type":"string"},"nodeType":{"type":"string"},"parentNodeId":{"type":"string"}},"required":["nodeName"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"nodeName":{"type":"string"},"nodeType":{"type":"string"},"parentNodeId":{"type":"string"}},"required":["nodeName"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved delete_node action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_level', 'Create a hierarchical level with rank seniority', 'structure', 'create_level', true,
  false, false, 20000, '{"type":"object","properties":{"name":{"type":"string"},"rank":{"type":"number"},"isSpecial":{"type":"boolean"},"description":{"type":"string"}},"required":["name"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"name":{"type":"string"},"rank":{"type":"number"},"isSpecial":{"type":"boolean"},"description":{"type":"string"}},"required":["name"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Delete created level if permitted.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_structure', 'Create an organizational structure blueprint', 'structure', 'create_structure', true,
  false, false, 20000, '{"type":"object","properties":{"name":{"type":"string"},"level":{"type":"string"},"type":{"type":"string"},"description":{"type":"string"},"isSpecial":{"type":"boolean"}},"required":["name"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"name":{"type":"string"},"level":{"type":"string"},"type":{"type":"string"},"description":{"type":"string"},"isSpecial":{"type":"boolean"}},"required":["name"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Delete created structure if permitted.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_bulk_import_nodes', 'Bulk import nodes in batch up to 1,000,000 nodes', 'structure', 'bulk_import_nodes', true,
  false, false, 60000, '{"type":"object","properties":{"filePath":{"type":"string"},"csvText":{"type":"string"},"batchSize":{"type":"number"},"dryRun":{"type":"boolean"}}}'::jsonb,
  'HIGH', '{"type":"object","properties":{"filePath":{"type":"string"},"csvText":{"type":"string"},"batchSize":{"type":"number"},"dryRun":{"type":"boolean"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Purge imported batch nodes.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_node', 'Delete a node from the structure', 'structure', 'delete_node', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:delete"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved restore_node action when available.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_move_node', 'Move a node under a different parent node', 'structure', 'move_node', true,
  false, false, 20000, '{"type":"object","properties":{"nodeId":{"type":"string"},"nodeName":{"type":"string"},"targetParentId":{"type":"string"},"targetParentName":{"type":"string"}},"required":["nodeId","targetParentId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"nodeId":{"type":"string"},"nodeName":{"type":"string"},"targetParentId":{"type":"string"},"targetParentName":{"type":"string"}},"required":["nodeId","targetParentId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["node:move"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Require an approved move_node action back to the prior parent.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_submit_data', 'Submit data into a project form', 'submission', 'submit_data', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"data":{"type":"object"}}}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"data":{"type":"object"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["submission:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved withdraw_submission action when available.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_approve_submission', 'Approve a pending submission', 'submission', 'approve_submission', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["submission:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved revoke_approval action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_reject_submission', 'Reject a pending submission', 'submission', 'reject_submission', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"reason":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"},"reason":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["submission:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved reopen_submission action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_reopen_submission', 'Reopen a rejected or withdrawn submission', 'submission', 'reopen_submission', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["submission:update"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved reject_submission action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_submission', 'Delete a submission', 'submission', 'delete_submission', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["submission:delete"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Deleted submissions cannot be restored.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_project', 'Create a project from a project form', 'project', 'create_project', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectName":{"type":"string"},"projectFormId":{"type":"string"},"description":{"type":"string"}},"required":["projectFormId"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"projectName":{"type":"string"},"projectFormId":{"type":"string"},"description":{"type":"string"}},"required":["projectFormId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["create:project-form"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved archive_project action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_archive_project', 'Archive a project by form id or project name', 'project', 'archive_project', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["project:archive"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved restore_project action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_restore_project', 'Restore an archived project by form id or project name', 'project', 'restore_project', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"projectName":{"type":"string"},"projectId":{"type":"string"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["project:restore"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved archive_project action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_project_form', 'Create a project form', 'project', 'create_project_form', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"title":{"type":"string"},"body":{"type":"object"},"schemaJson":{"type":"object"}}}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"title":{"type":"string"},"body":{"type":"object"},"schemaJson":{"type":"object"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["create:project-form"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Archive the form if no longer needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_payment', 'Create a payment', 'payment', 'create_payment', true,
  false, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"amount":{"type":"number"},"currency":{"type":"string"},"payerEmail":{"type":"string"},"description":{"type":"string"}},"required":["amount"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"},"amount":{"type":"number"},"currency":{"type":"string"},"payerEmail":{"type":"string"},"description":{"type":"string"}},"required":["amount"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["payment:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Complete or cancel the payment through the payment flow.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_task', 'Create a task', 'calendar', 'create_task', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"title":{"type":"string"},"assignees":{"type":"array","items":{"type":"string"}},"dueDate":{"type":"string"},"calendarId":{"type":"string"}},"required":["title"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"title":{"type":"string"},"assignees":{"type":"array","items":{"type":"string"}},"dueDate":{"type":"string"},"calendarId":{"type":"string"}},"required":["title"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved cancel_task action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_complete_task', 'Complete a task', 'calendar', 'complete_task', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved reopen_task action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_reopen_task', 'Reopen a completed task', 'calendar', 'reopen_task', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved complete_task action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_cancel_task', 'Cancel a task', 'calendar', 'cancel_task', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"}},"required":["entityId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved reopen_task action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_send_inmail', 'Send an internal In-Mail message to specified users or groups', 'communication', 'send_inmail', true,
  false, false, 20000, '{"type":"object","properties":{"to":{"type":"array","items":{"type":"string"}},"subject":{"type":"string"},"body":{"type":"string"},"attachments":{"type":"array"}},"required":["subject","body"]}'::jsonb,
  'LOW', '{"type":"object","properties":{"to":{"type":"array","items":{"type":"string"}},"subject":{"type":"string"},"body":{"type":"string"},"attachments":{"type":"array"}},"required":["subject","body"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["inmail:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Issue a follow-up clarification message.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_send_announcement', 'Broadcast an organizational announcement to a node branch or role group', 'communication', 'send_announcement', true,
  true, false, 30000, '{"type":"object","properties":{"targetNodeId":{"type":"string"},"roleName":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"to":{"type":"array","items":{"type":"string"}},"attachments":{"type":"array"}},"required":["subject","body"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"targetNodeId":{"type":"string"},"roleName":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"to":{"type":"array","items":{"type":"string"}},"attachments":{"type":"array"}},"required":["subject","body"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["inmail:create"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback. Issue an approved retraction announcement.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_mark_inmail_read', 'Mark an internal In-Mail message as read', 'communication', 'mark_inmail_read', true,
  false, false, 10000, '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb,
  'LOW', '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["inmail:update"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'No automatic rollback needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_create_event', 'Create an event on the calendar', 'calendar', 'create_event', true,
  false, true, 20000, '{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"startAt":{"type":"string"},"endAt":{"type":"string"},"assignees":{"type":"array","items":{"type":"string"}},"videoConference":{"type":"boolean"},"meetingProvider":{"type":"string","enum":["google_meet","jitsi","custom"]},"agendaTopics":{"type":"array","items":{"type":"string"}},"reminder":{"type":"object"},"reminderMinutes":{"type":"number"}},"required":["title"]}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"startAt":{"type":"string"},"endAt":{"type":"string"},"assignees":{"type":"array","items":{"type":"string"}},"videoConference":{"type":"boolean"},"meetingProvider":{"type":"string","enum":["google_meet","jitsi","custom"]},"agendaTopics":{"type":"array","items":{"type":"string"}},"reminder":{"type":"object"},"reminderMinutes":{"type":"number"}},"required":["title"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Reverse with an approved delete_event action.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_event', 'Delete a calendar event', 'calendar', 'delete_event', true,
  true, false, 20000, '{"type":"object","properties":{"eventId":{"type":"string"}},"required":["eventId"]}'::jsonb,
  'HIGH', '{"type":"object","properties":{"eventId":{"type":"string"}},"required":["eventId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:manage"]'::jsonb,
  true, true, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Irreversible deletion. Requires manual reconstruction.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_query_events', 'Query and list calendar events and meetings with optional date range, status, or search query', 'calendar', 'query_events', true,
  false, false, 10000, '{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"},"status":{"type":"string"},"query":{"type":"string"},"limit":{"type":"number"}}}'::jsonb,
  'LOW', '{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"},"status":{"type":"string"},"query":{"type":"string"},"limit":{"type":"number"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:read"]'::jsonb,
  true, false, false,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Read-only query. No rollback needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_query_tasks', 'Query and list operational tasks, deliverables, and reminders with optional status or date range', 'calendar', 'query_tasks', true,
  false, false, 10000, '{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"},"status":{"type":"string"},"query":{"type":"string"},"limit":{"type":"number"}}}'::jsonb,
  'LOW', '{"type":"object","properties":{"from":{"type":"string"},"to":{"type":"string"},"status":{"type":"string"},"query":{"type":"string"},"limit":{"type":"number"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["calendar:read"]'::jsonb,
  true, false, false,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Read-only query. No rollback needed.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_update_project_form', 'Update project form fields, identity, elements, layout, or capabilities', 'project', 'update_project_form', true,
  false, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"title":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"elements":{"type":"array"},"capabilities":{"type":"object"},"layout":{"type":"object"},"settings":{"type":"object"},"body":{"type":"object"}}}'::jsonb,
  'MEDIUM', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"},"title":{"type":"string"},"name":{"type":"string"},"description":{"type":"string"},"elements":{"type":"array"},"capabilities":{"type":"object"},"layout":{"type":"object"},"settings":{"type":"object"},"body":{"type":"object"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["update:project-form"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Form versioning rollback.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_publish_project_form', 'Publish project form to accept submissions', 'project', 'publish_project_form', true,
  true, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"}}}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["update:project-form"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Unpublish form back to draft state.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_unpublish_project_form', 'Unpublish project form back to draft', 'project', 'unpublish_project_form', true,
  true, true, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"}}}'::jsonb,
  'HIGH', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["update:project-form"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Re-publish form.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_project_form', 'Soft-delete a project form', 'project', 'delete_project_form', true,
  true, false, 20000, '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"}}}'::jsonb,
  'CRITICAL', '{"type":"object","properties":{"entityId":{"type":"string"},"projectFormId":{"type":"string"}}}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["delete:project-form"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Restore soft-deleted form.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_archive_inmail', 'Archive an internal In-Mail message', 'communication', 'archive_inmail', true,
  false, true, 10000, '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb,
  'LOW', '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["inmail:update"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Unarchive inmail message.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_delete_inmail', 'Move an internal In-Mail message to trash', 'communication', 'delete_inmail', true,
  false, true, 10000, '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb,
  'LOW', '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["inmail:delete"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Restore message from trash.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO copilot.tool_registry (
  tool_name, description, category, action_type, enabled,
  requires_approval, reversible, timeout_ms, schema_json,
  risk_level, input_schema_json, output_schema_json, required_permissions,
  tenant_scope_required, idempotency_key_required, audit_required,
  retry_policy, rollback_strategy, metadata
) VALUES (
  'action_star_inmail', 'Toggle starred status on an internal In-Mail message', 'communication', 'star_inmail', true,
  false, true, 10000, '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb,
  'LOW', '{"type":"object","properties":{"messageId":{"type":"string"}},"required":["messageId"]}'::jsonb, '{"type":"object","properties":{"executed":{"type":"boolean"},"mode":{"type":"string"},"deduped":{"type":"boolean"},"event":{"type":"object"},"resolution":{"type":"array"}}}'::jsonb, '["inmail:update"]'::jsonb,
  true, false, true,
  '{"maxAttempts":1,"backoffMs":0}'::jsonb, 'Unstar message.', '{"phase":"copilot-embed","owner":"copilot"}'::jsonb
)
ON CONFLICT (tool_name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  action_type = EXCLUDED.action_type,
  enabled = EXCLUDED.enabled,
  requires_approval = EXCLUDED.requires_approval,
  reversible = EXCLUDED.reversible,
  timeout_ms = EXCLUDED.timeout_ms,
  schema_json = EXCLUDED.schema_json,
  risk_level = EXCLUDED.risk_level,
  input_schema_json = EXCLUDED.input_schema_json,
  output_schema_json = EXCLUDED.output_schema_json,
  required_permissions = EXCLUDED.required_permissions,
  tenant_scope_required = EXCLUDED.tenant_scope_required,
  idempotency_key_required = EXCLUDED.idempotency_key_required,
  audit_required = EXCLUDED.audit_required,
  retry_policy = EXCLUDED.retry_policy,
  rollback_strategy = EXCLUDED.rollback_strategy,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

