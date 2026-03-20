const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const {
  assertCopilotSchemaReady,
} = require('../services/copilotSchemaGuard.service');

describe('copilotSchemaGuard.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes when required copilot tables and columns exist', async () => {
    mockPostgresPool.query
      // 4 table checks
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_events' }] })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_outbox' }] })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_dlq' }] })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_catalog' }] })
      // column check
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    await expect(assertCopilotSchemaReady()).resolves.toEqual({ ok: true });
  });

  test('fails fast when result_json column is missing', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_events' }] })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_outbox' }] })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_dlq' }] })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_catalog' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(assertCopilotSchemaReady()).rejects.toThrow(
      /missing columns: copilot.action_events.result_json/
    );
  });
});
