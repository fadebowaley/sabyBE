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

describe('copilot action item history/status updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('writes action_item_history on valid status transition', async () => {
    const client = makeClient({
      onQuery: async (sql) => {
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('FROM copilot.action_items') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                tenant_id: 'tenant-1',
                status: 'open',
              },
            ],
          };
        }
        if (sql.includes('UPDATE copilot.action_items')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                tenant_id: 'tenant-1',
                status: 'in_progress',
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO copilot.action_item_history')) {
          return { rows: [] };
        }
        if (sql.includes('COMMIT')) return { rows: [] };
        return { rows: [] };
      },
    });

    mockPostgresPool.connect.mockResolvedValue(client);

    const updated = await copilotActionService.updateActionItemStatus({
      tenantId: 'tenant-1',
      actionItemId: '00000000-0000-4000-8000-000000000001',
      status: 'in_progress',
      changedBy: 'user-1',
      reason: 'Starting work',
      metadata: { source: 'test' },
    });

    expect(updated.status).toBe('in_progress');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO copilot.action_item_history'),
      expect.arrayContaining([
        '00000000-0000-4000-8000-000000000001',
        'tenant-1',
        'open',
        'in_progress',
      ])
    );
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects invalid status transition and rolls back', async () => {
    const client = makeClient({
      onQuery: async (sql) => {
        if (sql.includes('BEGIN')) return { rows: [] };
        if (sql.includes('FROM copilot.action_items') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                tenant_id: 'tenant-1',
                status: 'done',
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
      copilotActionService.updateActionItemStatus({
        tenantId: 'tenant-1',
        actionItemId: '00000000-0000-4000-8000-000000000001',
        status: 'in_progress',
        changedBy: 'user-1',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('Invalid action item status transition'),
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
