const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
  connect: jest.fn(),
};
const mockCopilotApprovalService = {
  validateApprovalDecision: jest.fn(),
  consumeApprovalDecision: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));
jest.mock('../services/copilotApproval.service', () => mockCopilotApprovalService);

const copilotActionService = require('../services/copilotAction.service');

const makeClient = ({ onQuery }) => {
  const query = jest.fn(async (sql, params) => onQuery(sql, params));
  return {
    query,
    release: jest.fn(),
  };
};

describe('copilotAction.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCopilotApprovalService.validateApprovalDecision.mockResolvedValue({
      ok: true,
      approvalId: 'approval-1',
    });
    mockCopilotApprovalService.consumeApprovalDecision.mockResolvedValue({
      id: 'approval-1',
      status: 'consumed',
    });
  });

  test('rejects unknown action type', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      copilotActionService.createAction({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        actionType: 'not_in_catalog',
        entityType: 'user',
        entityId: 'u-1',
        payload: {},
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('Unknown action type'),
    });
  });

  test('enforces RBAC when scoped policy exists and actor has no matching allow_execute', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          action_type: 'create_user',
          entity_type: 'user',
          can_reverse: true,
          reverse_action_type: 'delete_user',
          requires_approval: false,
        },
      ],
    });

    const client = makeClient({
      onQuery: async (sql) => {
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('FROM copilot.action_permissions') && sql.includes('COUNT')) {
          return { rows: [{ count: 1 }] };
        }
        if (sql.includes('FROM copilot.action_permissions') && sql.includes('allow_execute')) {
          return { rows: [] };
        }
        if (sql.includes('ROLLBACK')) return { rows: [] };
        return { rows: [] };
      },
    });

    mockPostgresPool.connect.mockResolvedValue(client);

    await expect(
      copilotActionService.createAction({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        actorRoleIds: ['role-1'],
        actionType: 'create_user',
        entityType: 'user',
        entityId: 'u-1',
        payload: { email: 'test@example.com' },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.FORBIDDEN,
      message: expect.stringContaining('Not permitted to execute action'),
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects idempotency-key reuse with different payload hash', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          action_type: 'create_user',
          entity_type: 'user',
          can_reverse: true,
          reverse_action_type: 'delete_user',
          requires_approval: false,
        },
      ],
    });

    const client = makeClient({
      onQuery: async (sql) => {
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('FROM copilot.action_permissions') && sql.includes('COUNT')) {
          return { rows: [{ count: 0 }] };
        }
        if (sql.includes('FROM copilot.action_idempotency ai')) {
          return {
            rows: [
              {
                id: 'event-1',
                request_hash: 'a-different-hash',
              },
            ],
          };
        }
        if (sql.includes('ROLLBACK')) return { rows: [] };
        return { rows: [] };
      },
    });

    mockPostgresPool.connect.mockResolvedValue(client);

    await expect(
      copilotActionService.createAction({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        actionType: 'create_user',
        entityType: 'user',
        entityId: 'u-1',
        payload: { email: 'new@example.com' },
        idempotencyKey: 'idem-1',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
      message: expect.stringContaining('Idempotency key reuse with different payload'),
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('blocks approval-required action without approval token', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          action_type: 'assign_role',
          entity_type: 'user_role',
          can_reverse: true,
          reverse_action_type: 'unassign_role',
          requires_approval: true,
        },
      ],
    });

    const client = makeClient({
      onQuery: async (sql) => {
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('FROM copilot.action_permissions') && sql.includes('COUNT')) {
          return { rows: [{ count: 0 }] };
        }
        if (sql.includes('ROLLBACK')) return { rows: [] };
        return { rows: [] };
      },
    });

    mockPostgresPool.connect.mockResolvedValue(client);

    await expect(
      copilotActionService.createAction({
        tenantId: 'tenant-1',
        actorUserId: 'user-1',
        actionType: 'assign_role',
        entityType: 'user_role',
        entityId: 'user-1',
        payload: { userId: 'user-1', roleIds: ['role-1'] },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
      message: expect.stringContaining('requires approval'),
    });
  });

  test('reconciles queued event to failed when outbox is dead_letter', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            tenant_id: 'tenant-1',
            status: 'queued',
            error_message: null,
            result_json: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ status: 'dead_letter', last_error: 'Email already taken' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'event-1',
            tenant_id: 'tenant-1',
            status: 'failed',
            error_message: 'Email already taken',
          },
        ],
      });

    const result = await copilotActionService.getActionById('tenant-1', 'event-1');

    expect(result.status).toBe('failed');
    expect(result.error_message).toContain('Email already taken');
    expect(mockPostgresPool.query).toHaveBeenCalledTimes(3);
  });
});
