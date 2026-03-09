const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const copilotActionService = require('../services/copilotAction.service');

const makeClient = ({ onQuery }) => ({
  query: jest.fn((sql, params) => onQuery(sql, params)),
  release: jest.fn(),
});

describe('copilot action tenant boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getActionById rejects when event is outside tenant scope', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      copilotActionService.getActionById(
        'tenant-allowed',
        '00000000-0000-4000-8000-000000000001'
      )
    ).rejects.toMatchObject({
      statusCode: httpStatus.NOT_FOUND,
      message: 'Action event not found',
    });
  });

  test('getActionItemById rejects when action item is outside tenant scope', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      copilotActionService.getActionItemById(
        'tenant-allowed',
        '00000000-0000-4000-8000-000000000002'
      )
    ).rejects.toMatchObject({
      statusCode: httpStatus.NOT_FOUND,
      message: 'Action item not found',
    });
  });

  test('reverseAction rejects when original event is outside tenant scope', async () => {
    const client = makeClient({
      onQuery: async (sql) => {
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('FROM copilot.action_events ae')) {
          return { rows: [] };
        }
        if (sql.includes('ROLLBACK')) return { rows: [] };
        return { rows: [] };
      },
    });

    mockPostgresPool.connect.mockResolvedValue(client);

    await expect(
      copilotActionService.reverseAction({
        tenantId: 'tenant-allowed',
        actorUserId: 'user-1',
        eventId: '00000000-0000-4000-8000-000000000003',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.NOT_FOUND,
      message: 'Action event not found',
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('getFeed defaults status filter to open', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    await copilotActionService.getFeed({
      tenantId: 'tenant-1',
      userId: 'user-1',
      roleIds: ['role-1'],
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM copilot.action_items'),
      ['tenant-1', 'user-1', ['role-1'], 'open', 50]
    );
  });
});
