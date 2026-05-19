#!/usr/bin/env node

const { postgresPool, closePool } = require('../config/postgres');

const retryPolicy = { maxAttempts: 1, backoffMs: 0 };
const actionEventOutputSchema = {
  type: 'object',
  properties: {
    executed: { type: 'boolean' },
    mode: { type: 'string' },
    deduped: { type: 'boolean' },
    event: { type: 'object' },
    resolution: { type: 'array' },
  },
};

const TOOLS = [
  {
    tool_name: 'reset_password_tool',
    description: 'Admin support: reset account password by user email',
    category: 'auth',
    action_type: 'reset_password',
    enabled: true,
    requires_approval: true,
    reversible: false,
    timeout_ms: 20000,
    risk_level: 'CRITICAL',
    required_permissions: ['user:manage'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy:
      'No automatic rollback. Require a new approved reset if correction is needed.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            userEmail: { type: 'string' },
            newPassword: { type: 'string' },
          },
          required: ['newPassword'],
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: 'auth-support', owner: 'copilot' },
  },
  {
    tool_name: 'verify_account_tool',
    description: 'Admin support: mark user account as verified/active by email',
    category: 'auth',
    action_type: 'verify_account',
    enabled: true,
    requires_approval: true,
    reversible: false,
    timeout_ms: 20000,
    risk_level: 'HIGH',
    required_permissions: ['user:manage'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy:
      'No automatic rollback. Use a separate approved deactivate/update action if needed.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            userEmail: { type: 'string' },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: 'auth-support', owner: 'copilot' },
  },
  {
    tool_name: 'assign_role_tool',
    description: 'Assign one or more roles to a user',
    category: 'identity',
    action_type: 'assign_role',
    enabled: true,
    requires_approval: true,
    reversible: true,
    timeout_ms: 20000,
    risk_level: 'CRITICAL',
    required_permissions: ['role:assign', 'user:update'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy: 'Reverse with approved unassign_role action.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            userEmail: { type: 'string' },
            userName: { type: 'string' },
            roleId: { type: 'string' },
            roleIds: { type: 'array', items: { type: 'string' } },
            roleName: { type: 'string' },
            roleNames: { type: 'array', items: { type: 'string' } },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
  {
    tool_name: 'unassign_role_tool',
    description: 'Remove one or more roles from a user',
    category: 'identity',
    action_type: 'unassign_role',
    enabled: true,
    requires_approval: true,
    reversible: true,
    timeout_ms: 20000,
    risk_level: 'CRITICAL',
    required_permissions: ['role:assign', 'user:update'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy: 'Reverse with approved assign_role action.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            userEmail: { type: 'string' },
            userName: { type: 'string' },
            roleId: { type: 'string' },
            roleIds: { type: 'array', items: { type: 'string' } },
            roleName: { type: 'string' },
            roleNames: { type: 'array', items: { type: 'string' } },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
  {
    tool_name: 'grant_permission_tool',
    description: 'Grant permission(s) to a role',
    category: 'identity',
    action_type: 'grant_permission',
    enabled: true,
    requires_approval: true,
    reversible: true,
    timeout_ms: 20000,
    risk_level: 'CRITICAL',
    required_permissions: ['permission:manage', 'role:update'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy: 'Reverse with approved revoke_permission action.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            roleId: { type: 'string' },
            roleName: { type: 'string' },
            permissionId: { type: 'string' },
            permissionIds: { type: 'array', items: { type: 'string' } },
            permissionName: { type: 'string' },
            permissionNames: { type: 'array', items: { type: 'string' } },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
  {
    tool_name: 'revoke_permission_tool',
    description: 'Revoke permission(s) from a role',
    category: 'identity',
    action_type: 'revoke_permission',
    enabled: true,
    requires_approval: true,
    reversible: true,
    timeout_ms: 20000,
    risk_level: 'CRITICAL',
    required_permissions: ['permission:manage', 'role:update'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy: 'Reverse with approved grant_permission action.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            roleId: { type: 'string' },
            roleName: { type: 'string' },
            permissionId: { type: 'string' },
            permissionIds: { type: 'array', items: { type: 'string' } },
            permissionName: { type: 'string' },
            permissionNames: { type: 'array', items: { type: 'string' } },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
  {
    tool_name: 'move_node_tool',
    description: 'Move a node under a different parent node',
    category: 'structure',
    action_type: 'move_node',
    enabled: true,
    requires_approval: true,
    reversible: false,
    timeout_ms: 20000,
    risk_level: 'HIGH',
    required_permissions: ['node:move'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy:
      'No automatic rollback. Require an approved move_node action back to the prior parent.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            nodeName: { type: 'string' },
            targetParentId: { type: 'string' },
            targetParentName: { type: 'string' },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
  {
    tool_name: 'archive_project_tool',
    description: 'Archive project by form id or project name',
    category: 'project',
    action_type: 'archive_project',
    enabled: true,
    requires_approval: true,
    reversible: true,
    timeout_ms: 20000,
    risk_level: 'HIGH',
    required_permissions: ['project:archive'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy: 'Reverse with approved restore_project action.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            projectFormId: { type: 'string' },
            projectName: { type: 'string' },
            projectId: { type: 'string' },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
  {
    tool_name: 'restore_project_tool',
    description: 'Restore archived project by form id or project name',
    category: 'project',
    action_type: 'restore_project',
    enabled: true,
    requires_approval: true,
    reversible: true,
    timeout_ms: 20000,
    risk_level: 'MEDIUM',
    required_permissions: ['project:restore'],
    tenant_scope_required: true,
    idempotency_key_required: true,
    audit_required: true,
    retry_policy: retryPolicy,
    rollback_strategy: 'Reverse with approved archive_project action.',
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            projectFormId: { type: 'string' },
            projectName: { type: 'string' },
            projectId: { type: 'string' },
          },
        },
        approvalToken: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['actionPayload'],
    },
    output_schema_json: actionEventOutputSchema,
    metadata: { phase: '4.5', owner: 'copilot' },
  },
];

const seed = async () => {
  await Promise.all(
    TOOLS.map((tool) =>
      postgresPool.query(
        `INSERT INTO copilot.tool_registry (
         tool_name, description, category, action_type, enabled,
         requires_approval, reversible, timeout_ms, schema_json,
         risk_level, input_schema_json, output_schema_json, required_permissions,
         tenant_scope_required, idempotency_key_required, audit_required,
         retry_policy, rollback_strategy, metadata
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,
         $10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17::jsonb,$18,$19::jsonb
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
         updated_at = NOW()`,
        [
          tool.tool_name,
          tool.description,
          tool.category,
          tool.action_type,
          tool.enabled,
          tool.requires_approval,
          tool.reversible,
          tool.timeout_ms,
          JSON.stringify(tool.schema_json),
          tool.risk_level,
          JSON.stringify(tool.schema_json),
          JSON.stringify(tool.output_schema_json || {}),
          JSON.stringify(tool.required_permissions || []),
          tool.tenant_scope_required,
          tool.idempotency_key_required,
          tool.audit_required,
          JSON.stringify(tool.retry_policy || {}),
          tool.rollback_strategy || null,
          JSON.stringify(tool.metadata),
        ]
      )
    )
  );

  const result = await postgresPool.query(
    `SELECT tool_name, action_type, enabled, requires_approval, risk_level
     FROM copilot.tool_registry
     WHERE tool_name = ANY($1::text[])
     ORDER BY tool_name ASC`,
    [TOOLS.map((t) => t.tool_name)]
  );
  // eslint-disable-next-line no-console
  console.log('[seed-copilot-tool-registry] seeded tools:', result.rows);
};

if (require.main === module) {
  seed()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (error) => {
      // eslint-disable-next-line no-console
      console.error('[seed-copilot-tool-registry] failed:', error.message);
      await closePool();
      process.exit(1);
    });
}

module.exports = {
  TOOLS,
};
