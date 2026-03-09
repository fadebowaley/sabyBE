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

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

jest.mock('../services/copilotAction.service', () => mockCopilotActionService);
jest.mock('../services/copilotEntityResolver.service', () => mockCopilotEntityResolverService);

const toolRuntimeService = require('../services/copilotToolRuntime.service');

describe('copilotToolRuntime.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
          },
        ],
      })
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
          },
        ],
      })
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
          },
        ],
      })
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
});
