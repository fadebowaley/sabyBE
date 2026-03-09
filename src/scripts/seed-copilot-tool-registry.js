#!/usr/bin/env node

const { postgresPool, closePool } = require('../config/postgres');

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
          required: ['email', 'newPassword'],
        },
        approvalToken: { type: 'string' },
      },
    },
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
    schema_json: {
      type: 'object',
      properties: {
        actionPayload: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            userEmail: { type: 'string' },
          },
          required: ['email'],
        },
        approvalToken: { type: 'string' },
      },
    },
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
      },
    },
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
      },
    },
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
      },
    },
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
      },
    },
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
      },
    },
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
      },
    },
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
      },
    },
    metadata: { phase: '4.5', owner: 'copilot' },
  },
];

const seed = async () => {
  for (const tool of TOOLS) {
    // eslint-disable-next-line no-await-in-loop
    await postgresPool.query(
      `INSERT INTO copilot.tool_registry (
         tool_name, description, category, action_type, enabled,
         requires_approval, reversible, timeout_ms, schema_json, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
       ON CONFLICT (tool_name) DO UPDATE SET
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         action_type = EXCLUDED.action_type,
         enabled = EXCLUDED.enabled,
         requires_approval = EXCLUDED.requires_approval,
         reversible = EXCLUDED.reversible,
         timeout_ms = EXCLUDED.timeout_ms,
         schema_json = EXCLUDED.schema_json,
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
        JSON.stringify(tool.metadata),
      ]
    );
  }

  const result = await postgresPool.query(
    `SELECT tool_name, action_type, enabled, requires_approval
     FROM copilot.tool_registry
     WHERE tool_name = ANY($1::text[])
     ORDER BY tool_name ASC`,
    [TOOLS.map((t) => t.tool_name)]
  );
  // eslint-disable-next-line no-console
  console.log('[seed-copilot-tool-registry] seeded tools:', result.rows);
};

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
