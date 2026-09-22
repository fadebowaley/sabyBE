const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
};

const mockCopilotActionService = {
  createAction: jest.fn(),
};

const mockCopilotEntityResolverService = {
  resolveActionPayload: jest.fn(),
};
const mockCopilotApprovalService = {
  validateApprovalDecision: jest.fn(),
  consumeApprovalDecision: jest.fn(),
};
const mockWorkflowEngineService = {
  beginToolExecutionWorkflow: jest.fn(),
  recordToolCall: jest.fn(),
  markWorkflowWaitingApproval: jest.fn(),
  markWorkflowFailed: jest.fn(),
  markWorkflowExecuting: jest.fn(),
  queueWorkflowActionEvent: jest.fn(),
  completeImmediateWorkflow: jest.fn(),
};

const mockRoleFind = jest.fn();

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

jest.mock('../models/role.model', () => ({
  find: (...args) => mockRoleFind(...args),
}));

jest.mock('../services/copilotAction.service', () => mockCopilotActionService);
jest.mock(
  '../services/copilotEntityResolver.service',
  () => mockCopilotEntityResolverService
);
jest.mock(
  '../services/copilotApproval.service',
  () => mockCopilotApprovalService
);
jest.mock(
  '../services/workflowEngine.service',
  () => mockWorkflowEngineService
);

const toolRuntimeService = require('../services/copilotToolRuntime.service');
const { TOOLS } = require('../scripts/seed-copilot-tool-registry');

const SEEDED_TOOL_FIXTURES = {
  reset_password_tool: {
    entityType: 'user',
    actionPayload: {
      email: 'person@example.com',
      newPassword: 'NewSecret123!',
      userId: 'user-reset-1',
    },
    expectedEntityId: 'user-reset-1',
  },
  verify_account_tool: {
    entityType: 'user',
    actionPayload: {
      email: 'person@example.com',
      userId: 'user-verify-1',
    },
    expectedEntityId: 'user-verify-1',
  },
  assign_role_tool: {
    entityType: 'user_role',
    actionPayload: {
      userId: 'user-assign-1',
      roleIds: ['role-admin-1'],
    },
    expectedEntityId: 'user-assign-1',
  },
  unassign_role_tool: {
    entityType: 'user_role',
    actionPayload: {
      userId: 'user-unassign-1',
      roleIds: ['role-admin-1'],
    },
    expectedEntityId: 'user-unassign-1',
  },
  grant_permission_tool: {
    entityType: 'role_permission',
    actionPayload: {
      roleId: 'role-grant-1',
      permissionIds: ['permission-manage-1'],
    },
    expectedEntityId: 'role-grant-1',
  },
  revoke_permission_tool: {
    entityType: 'role_permission',
    actionPayload: {
      roleId: 'role-revoke-1',
      permissionIds: ['permission-manage-1'],
    },
    expectedEntityId: 'role-revoke-1',
  },
  move_node_tool: {
    entityType: 'node',
    actionPayload: {
      nodeId: 'node-move-1',
      targetParentId: 'node-parent-1',
    },
    expectedEntityId: 'node-move-1',
  },
  archive_project_tool: {
    entityType: 'project',
    actionPayload: {
      projectFormId: 'project-archive-1',
    },
    expectedEntityId: 'project-archive-1',
  },
  restore_project_tool: {
    entityType: 'project',
    actionPayload: {
      projectFormId: 'project-restore-1',
    },
    expectedEntityId: 'project-restore-1',
  },
  // action_* tools use flat schemas (no actionPayload wrapper) — the payload
  // is built from the fixture fields directly in the test.each below.
  action_create_user: {
    entityType: 'user',
    actionPayload: {
      entityId: 'user-create-1',
      userBody: { email: 'person@example.com', firstname: 'Person' },
    },
    expectedEntityId: 'user-create-1',
  },
  action_update_user: {
    entityType: 'user',
    actionPayload: {
      entityId: 'user-update-1',
      userBody: { email: 'person@example.com' },
    },
    expectedEntityId: 'user-update-1',
  },
  action_deactivate_user: {
    entityType: 'user',
    actionPayload: { entityId: 'user-deactivate-1' },
    expectedEntityId: 'user-deactivate-1',
  },
  action_delete_user: {
    entityType: 'user',
    actionPayload: { entityId: 'user-delete-1' },
    expectedEntityId: 'user-delete-1',
  },
  action_reset_password: {
    entityType: 'user',
    actionPayload: {
      entityId: 'user-reset-pw-1',
      email: 'person@example.com',
      newPassword: 'NewSecret123!',
    },
    expectedEntityId: 'user-reset-pw-1',
  },
  action_assign_role: {
    entityType: 'user_role',
    actionPayload: { userId: 'user-assign-1', roleIds: ['role-admin-1'] },
    expectedEntityId: 'user-assign-1',
  },
  action_unassign_role: {
    entityType: 'user_role',
    actionPayload: { userId: 'user-unassign-1', roleIds: ['role-admin-1'] },
    expectedEntityId: 'user-unassign-1',
  },
  action_reactivate_user: {
    entityType: 'user',
    actionPayload: { userId: 'user-reactivate-1' },
    expectedEntityId: 'user-reactivate-1',
  },
  action_verify_account: {
    entityType: 'user',
    actionPayload: {
      userId: 'user-verify-1',
      email: 'person@example.com',
    },
    expectedEntityId: 'user-verify-1',
  },
  action_assign_user_to_node: {
    entityType: 'node_user',
    actionPayload: {
      userId: 'user-node-1',
      nodeId: 'node-1',
    },
    expectedEntityId: 'user-node-1',
  },
  action_unassign_user_from_node: {
    entityType: 'node_user',
    actionPayload: {
      userId: 'user-node-1',
      nodeId: 'node-1',
    },
    expectedEntityId: 'user-node-1',
  },
  action_create_role: {
    entityType: 'role',
    actionPayload: {
      entityId: 'role-create-1',
      roleName: 'Admin',
      permissionIds: ['permission-manage-1'],
    },
    expectedEntityId: 'role-create-1',
  },
  action_delete_role: {
    entityType: 'role',
    actionPayload: { entityId: 'role-delete-1' },
    expectedEntityId: 'role-delete-1',
  },
  action_grant_permission: {
    entityType: 'role_permission',
    actionPayload: {
      roleId: 'role-grant-1',
      permissionIds: ['permission-manage-1'],
    },
    expectedEntityId: 'role-grant-1',
  },
  action_revoke_permission: {
    entityType: 'role_permission',
    actionPayload: {
      roleId: 'role-revoke-1',
      permissionIds: ['permission-manage-1'],
    },
    expectedEntityId: 'role-revoke-1',
  },
  action_create_node: {
    entityType: 'node',
    actionPayload: {
      entityId: 'node-create-1',
      nodeName: 'Operations',
      nodeType: 'department',
    },
    expectedEntityId: 'node-create-1',
  },
  action_delete_node: {
    entityType: 'node',
    actionPayload: { entityId: 'node-delete-1' },
    expectedEntityId: 'node-delete-1',
  },
  action_move_node: {
    entityType: 'node',
    actionPayload: {
      nodeId: 'node-move-1',
      targetParentId: 'node-parent-1',
    },
    expectedEntityId: 'node-move-1',
  },
  action_submit_data: {
    entityType: 'submission',
    actionPayload: {
      entityId: 'submission-1',
      projectFormId: 'form-report-1',
      data: {},
    },
    expectedEntityId: 'submission-1',
  },
  action_approve_submission: {
    entityType: 'submission',
    actionPayload: { entityId: 'submission-approve-1' },
    expectedEntityId: 'submission-approve-1',
  },
  action_reject_submission: {
    entityType: 'submission',
    actionPayload: {
      entityId: 'submission-reject-1',
      reason: 'Documentation missing',
    },
    expectedEntityId: 'submission-reject-1',
  },
  action_reopen_submission: {
    entityType: 'submission',
    actionPayload: { entityId: 'submission-reopen-1' },
    expectedEntityId: 'submission-reopen-1',
  },
  action_delete_submission: {
    entityType: 'submission',
    actionPayload: { entityId: 'submission-delete-1' },
    expectedEntityId: 'submission-delete-1',
  },
  action_create_project: {
    entityType: 'project',
    actionPayload: {
      entityId: 'project-create-1',
      projectFormId: 'form-project-1',
      projectName: 'Expansion',
    },
    expectedEntityId: 'project-create-1',
  },
  action_archive_project: {
    entityType: 'project',
    actionPayload: {
      entityId: 'project-archive-1',
      projectFormId: 'form-project-1',
    },
    expectedEntityId: 'project-archive-1',
  },
  action_restore_project: {
    entityType: 'project',
    actionPayload: {
      entityId: 'project-restore-1',
      projectFormId: 'form-project-1',
    },
    expectedEntityId: 'project-restore-1',
  },
  action_create_project_form: {
    entityType: 'project_form',
    actionPayload: {
      entityId: 'project-form-create-1',
      title: 'Quarterly Report',
    },
    expectedEntityId: 'project-form-create-1',
  },
  action_create_payment: {
    entityType: 'payment',
    actionPayload: {
      entityId: 'payment-1',
      amount: 250,
      currency: 'USD',
      payerEmail: 'person@example.com',
    },
    expectedEntityId: 'payment-1',
  },
  action_create_task: {
    entityType: 'task',
    actionPayload: {
      entityId: 'task-create-1',
      title: 'Ship feature',
      assignees: ['user-1'],
    },
    expectedEntityId: 'task-create-1',
  },
  action_complete_task: {
    entityType: 'task',
    actionPayload: { entityId: 'task-complete-1' },
    expectedEntityId: 'task-complete-1',
  },
  action_reopen_task: {
    entityType: 'task',
    actionPayload: { entityId: 'task-reopen-1' },
    expectedEntityId: 'task-reopen-1',
  },
  action_cancel_task: {
    entityType: 'task',
    actionPayload: { entityId: 'task-cancel-1' },
    expectedEntityId: 'task-cancel-1',
  },
};

describe('copilotToolRuntime.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleFind.mockReturnValue({
      populate: jest.fn().mockResolvedValue([]),
    });
    mockCopilotApprovalService.validateApprovalDecision.mockResolvedValue({
      ok: true,
      approvalId: 'approval-1',
    });
    mockCopilotApprovalService.consumeApprovalDecision.mockResolvedValue({
      id: 'approval-1',
      status: 'consumed',
    });
    mockWorkflowEngineService.beginToolExecutionWorkflow.mockResolvedValue({
      task: { id: 'task-1' },
      step: { id: 'step-1' },
      inputHash: 'hash-1',
    });
    mockWorkflowEngineService.recordToolCall.mockResolvedValue({});
    mockWorkflowEngineService.markWorkflowWaitingApproval.mockResolvedValue({});
    mockWorkflowEngineService.markWorkflowFailed.mockResolvedValue({});
    mockWorkflowEngineService.markWorkflowExecuting.mockResolvedValue({});
    mockWorkflowEngineService.queueWorkflowActionEvent.mockResolvedValue({});
    mockWorkflowEngineService.completeImmediateWorkflow.mockResolvedValue({});
  });

  test('lists enabled tools', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ tool_name: 'create_user_tool', enabled: true }],
    });

    const tools = await toolRuntimeService.listTools({ enabledOnly: true });
    expect(tools).toHaveLength(1);
    expect(tools[0].tool_name).toBe('create_user_tool');
  });

  test('executes tool by creating action event and logs success', async () => {
    mockCopilotEntityResolverService.resolveActionPayload.mockResolvedValue({
      canExecute: true,
      resolvedPayload: { email: 'user@example.com' },
      resolutionDetails: [],
      blockingErrors: [],
    });

    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'create_user_tool',
            enabled: true,
            requires_approval: false,
            action_type: 'create_user',
            input_schema_json: {
              type: 'object',
              properties: {
                actionPayload: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                  },
                  required: ['email'],
                },
              },
              required: ['actionPayload'],
            },
            risk_level: 'MEDIUM',
            tenant_scope_required: true,
            idempotency_key_required: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // policy decision log insert
      .mockResolvedValueOnce({
        rows: [{ entity_type: 'user' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // log insert

    mockCopilotActionService.createAction.mockResolvedValue({
      deduped: false,
      event: { id: 'evt-1' },
    });

    const result = await toolRuntimeService.executeToolCall({
      tenantId: 'tenant-1',
      userId: 'user-1',
      roleIds: ['role-1'],
      toolName: 'create_user_tool',
      correlationId: '11111111-1111-4111-8111-111111111111',
      payload: {
        actionPayload: { email: 'user@example.com' },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        executed: true,
        mode: 'action_event',
      })
    );
    expect(mockCopilotActionService.createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actionType: 'create_user',
        entityType: 'user',
        correlationId: '11111111-1111-4111-8111-111111111111',
      })
    );
    expect(
      mockWorkflowEngineService.beginToolExecutionWorkflow
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        correlationId: '11111111-1111-4111-8111-111111111111',
        source: 'tool_runtime',
      })
    );
    expect(
      mockWorkflowEngineService.queueWorkflowActionEvent
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actionEventId: 'evt-1',
      })
    );
  });

  test('blocks tool call when resolver returns ambiguity', async () => {
    mockCopilotEntityResolverService.resolveActionPayload.mockResolvedValue({
      canExecute: false,
      resolvedPayload: {},
      resolutionDetails: [
        {
          field: 'userId',
          status: 'ambiguous',
          candidates: [
            { id: 'u1', label: 'Israel A', score: 1 },
            { id: 'u2', label: 'Israel B', score: 0.9 },
          ],
        },
      ],
      blockingErrors: [{ field: 'userId', status: 'ambiguous' }],
    });

    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'assign_role_tool',
            enabled: true,
            requires_approval: false,
            action_type: 'assign_role',
            input_schema_json: {},
            risk_level: 'CRITICAL',
            tenant_scope_required: true,
            idempotency_key_required: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // policy decision log insert
      .mockResolvedValueOnce({
        rows: [{ entity_type: 'user_role' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // blocked log insert

    await expect(
      toolRuntimeService.executeToolCall({
        tenantId: 'tenant-1',
        userId: 'user-1',
        roleIds: ['role-1'],
        toolName: 'assign_role_tool',
        payload: {
          actionPayload: {
            userName: 'Israel',
            roleName: 'Regional Admin',
          },
        },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
      message: expect.stringContaining('Entity resolution required'),
    });
    expect(mockCopilotActionService.createAction).not.toHaveBeenCalled();
  });

  test('blocks approval-required tool without token', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'dangerous_tool',
            enabled: true,
            requires_approval: true,
            action_type: null,
            input_schema_json: {},
            risk_level: 'HIGH',
            tenant_scope_required: true,
            idempotency_key_required: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // policy decision log insert
      .mockResolvedValueOnce({ rows: [] }); // blocked log insert

    await expect(
      toolRuntimeService.executeToolCall({
        tenantId: 'tenant-1',
        userId: 'user-1',
        toolName: 'dangerous_tool',
        payload: {},
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
      message: expect.stringContaining('requires approval'),
    });
  });

  test('blocks tool call when payload does not match schema', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'create_user_tool',
            enabled: true,
            requires_approval: false,
            action_type: 'create_user',
            input_schema_json: {
              type: 'object',
              properties: {
                actionPayload: {
                  type: 'object',
                  properties: {
                    email: { type: 'string' },
                  },
                  required: ['email'],
                },
              },
              required: ['actionPayload'],
            },
            risk_level: 'MEDIUM',
            tenant_scope_required: true,
            idempotency_key_required: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // blocked schema validation log insert

    await expect(
      toolRuntimeService.executeToolCall({
        tenantId: 'tenant-1',
        userId: 'user-1',
        roleIds: ['role-1'],
        toolName: 'create_user_tool',
        payload: {
          actionPayload: {},
        },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('Invalid payload'),
    });
    expect(mockCopilotActionService.createAction).not.toHaveBeenCalled();
    expect(mockPostgresPool.query).toHaveBeenCalledTimes(2);
  });

  test('blocks idempotency-required tool without idempotency key', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'critical_tool',
            enabled: true,
            requires_approval: false,
            action_type: 'reset_password',
            input_schema_json: {},
            risk_level: 'CRITICAL',
            tenant_scope_required: true,
            idempotency_key_required: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // policy decision log insert
      .mockResolvedValueOnce({ rows: [] }); // blocked log insert

    await expect(
      toolRuntimeService.executeToolCall({
        tenantId: 'tenant-1',
        userId: 'user-1',
        toolName: 'critical_tool',
        payload: {},
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('idempotencyKey'),
    });
    expect(mockCopilotActionService.createAction).not.toHaveBeenCalled();
  });

  test('blocks tool call when actor lacks required tool permission', async () => {
    mockRoleFind.mockReturnValueOnce({
      populate: jest.fn().mockResolvedValue([
        {
          permissions: [{ name: 'user:read' }],
        },
      ]),
    });

    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            tool_name: 'critical_tool',
            enabled: true,
            requires_approval: false,
            action_type: null,
            input_schema_json: {},
            risk_level: 'CRITICAL',
            required_permissions: ['user:manage'],
            tenant_scope_required: true,
            idempotency_key_required: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // policy decision log insert
      .mockResolvedValueOnce({ rows: [] }); // blocked log insert

    await expect(
      toolRuntimeService.executeToolCall({
        tenantId: 'tenant-1',
        userId: 'user-1',
        roleIds: ['role-1'],
        toolName: 'critical_tool',
        payload: {},
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.FORBIDDEN,
      message: expect.stringContaining('Missing tool permissions'),
    });
    expect(mockCopilotActionService.createAction).not.toHaveBeenCalled();
  });

  test.each(TOOLS.map((tool) => [tool.tool_name, tool]))(
    'executes seeded tool contract: %s',
    async (_toolName, tool) => {
      const fixture = SEEDED_TOOL_FIXTURES[tool.tool_name];
      expect(fixture).toBeDefined();

      mockRoleFind.mockReturnValueOnce({
        populate: jest.fn().mockResolvedValue([
          {
            permissions: tool.required_permissions.map((name) => ({ name })),
          },
        ]),
      });

      const wrapped = Boolean(tool.schema_json?.properties?.actionPayload);
      const payload = wrapped
        ? {
            actionPayload: fixture.actionPayload,
            idempotencyKey: `idem-${tool.tool_name}`,
          }
        : {
            ...fixture.actionPayload,
            idempotencyKey: `idem-${tool.tool_name}`,
          };

      mockCopilotEntityResolverService.resolveActionPayload.mockResolvedValue({
        canExecute: true,
        resolvedPayload: fixture.actionPayload,
        resolutionDetails: [],
        blockingErrors: [],
      });

      mockPostgresPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              ...tool,
              input_schema_json: tool.schema_json,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // policy decision log insert
        .mockResolvedValueOnce({
          rows: [{ entity_type: fixture.entityType }],
        })
        .mockResolvedValueOnce({ rows: [] }); // tool call log insert

      mockCopilotActionService.createAction.mockResolvedValue({
        deduped: false,
        event: { id: `event-${tool.tool_name}` },
      });

      const result = await toolRuntimeService.executeToolCall({
        tenantId: 'tenant-1',
        userId: 'user-1',
        roleIds: ['role-1'],
        toolName: tool.tool_name,
        approvalToken: `approval-${tool.tool_name}`,
        payload,
      });

      expect(result).toEqual(
        expect.objectContaining({
          executed: true,
          mode: 'action_event',
          deduped: false,
        })
      );
      expect(
        mockCopilotEntityResolverService.resolveActionPayload
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          actionType: tool.action_type,
          payload: wrapped
            ? fixture.actionPayload
            : expect.objectContaining(fixture.actionPayload),
          actorUserId: 'user-1',
          source: 'tool_runtime',
        })
      );
      expect(mockCopilotActionService.createAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          actorRoleIds: ['role-1'],
          actionType: tool.action_type,
          entityType: fixture.entityType,
          entityId: fixture.expectedEntityId,
          payload: fixture.actionPayload,
          idempotencyKey: `idem-${tool.tool_name}`,
          source: 'tool_runtime',
        })
      );
      if (tool.requires_approval) {
        expect(
          mockCopilotApprovalService.consumeApprovalDecision
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            approvalId: 'approval-1',
          })
        );
      }
    }
  );
});
