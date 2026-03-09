const mockPostgresPool = {
  connect: jest.fn(),
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const mockExecuteActionEvent = jest.fn();
jest.mock('../services/copilotCommandHandler.service', () => ({
  executeActionEvent: (...args) => mockExecuteActionEvent(...args),
}));

const { __private } = require('../workers/copilotAction.worker');

const makeClient = (onQuery) => ({
  query: jest.fn((sql, params) => onQuery(sql, params)),
  release: jest.fn(),
});

describe('copilot action worker projection flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processOutboxRecord completes event, updates state projection and closes action item', async () => {
    mockExecuteActionEvent.mockResolvedValue({
      handled: true,
      resultType: 'user_created',
    });

    const client = makeClient(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('FROM copilot.action_events') && sql.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              id: 'event-1',
              tenant_id: 'tenant-1',
              action_type: 'create_user',
              entity_type: 'user',
              entity_id: 'user-1',
              source: 'api',
              payload_json: { userBody: { email: 'x@example.com' } },
            },
          ],
        };
      }
      if (sql.includes('FROM copilot.action_items') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 'item-1', status: 'open' }] };
      }
      if (sql.includes('COMMIT')) return { rows: [] };
      return { rows: [] };
    });

    mockPostgresPool.connect.mockResolvedValue(client);

    await __private.processOutboxRecord({
      id: 'outbox-1',
      event_id: 'event-1',
      retry_count: 0,
      max_retries: 3,
    });

    expect(mockExecuteActionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', action_type: 'create_user' })
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO copilot.action_state'),
      expect.any(Array)
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE copilot.action_items'),
      expect.any(Array)
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO copilot.action_item_history'),
      expect.any(Array)
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('processOutboxRecord retries and marks event failed when handler is missing', async () => {
    mockExecuteActionEvent.mockResolvedValue({
      handled: false,
    });

    const client = makeClient(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('FROM copilot.action_events') && sql.includes('FOR UPDATE')) {
        return {
          rows: [
            {
              id: 'event-2',
              tenant_id: 'tenant-1',
              action_type: 'unknown_action',
              entity_type: 'user',
              entity_id: 'user-2',
              payload_json: {},
              source: 'api',
            },
          ],
        };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });

    mockPostgresPool.connect.mockResolvedValue(client);
    mockPostgresPool.query.mockResolvedValue({ rows: [] });

    await __private.processOutboxRecord({
      id: 'outbox-2',
      event_id: 'event-2',
      retry_count: 0,
      max_retries: 3,
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending'"),
      expect.any(Array)
    );
    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE copilot.action_events'),
      expect.any(Array)
    );
    expect(client.release).toHaveBeenCalled();
  });
});
