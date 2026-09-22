jest.mock('../config/postgres', () => ({
  postgresPool: {
    query: jest.fn(),
  },
}));

const { postgresPool } = require('../config/postgres');
const agentThread = require('../services/agentThread.service');

const row = {
  thread_id: 'thr-1',
  tenant_id: 't-1',
  user_id: 'u-1',
  title: 'Hello',
  engine_session_id: 'sess-1',
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('agentThread.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    postgresPool.query.mockResolvedValue({ rows: [row] });
  });

  const allQueries = () => postgresPool.query.mock.calls.map((call) => call[0]).join('\n');

  describe('createThread', () => {
    test('inserts and returns the created thread', async () => {
      const thread = await agentThread.createThread({ tenantId: 't-1', userId: 'u-1', title: 'Hello' });
      expect(thread.threadId).toBe('thr-1');
      expect(allQueries()).toContain('INSERT INTO copilot.agent_threads');
    });

    test('rejects missing identity', async () => {
      await expect(agentThread.createThread({ tenantId: null, userId: 'u-1' })).rejects.toThrow();
    });
  });

  describe('getThread', () => {
    test('returns the thread row', async () => {
      const thread = await agentThread.getThread({ tenantId: 't-1', threadId: 'thr-1' });
      expect(thread.title).toBe('Hello');
      expect(allQueries()).toContain('WHERE tenant_id = $1');
    });

    test('404s when missing', async () => {
      postgresPool.query.mockResolvedValue({ rows: [] });
      await expect(agentThread.getThread({ tenantId: 't-1', threadId: 'nope' })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('listThreads', () => {
    test('returns paginated threads', async () => {
      postgresPool.query
        .mockResolvedValueOnce({ rows: [row] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });
      const result = await agentThread.listThreads({ tenantId: 't-1', page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
    });
  });

  describe('appendMessage', () => {
    test('inserts a message and touches the thread', async () => {
      postgresPool.query
        .mockResolvedValueOnce({ rows: [{ id: '5' }] })
        .mockResolvedValueOnce({ rows: [] });
      const id = await agentThread.appendMessage({
        tenantId: 't-1',
        threadId: 'thr-1',
        role: 'assistant',
        content: 'answer',
        inputTokens: 10,
      });
      expect(id).toBe('5');
      expect(allQueries()).toContain('INSERT INTO copilot.agent_messages');
      expect(allQueries()).toContain('UPDATE copilot.agent_threads');
    });
  });

  describe('deleteThread', () => {
    test('deletes the tenant thread after verifying it exists', async () => {
      await agentThread.deleteThread({ tenantId: 't-1', threadId: 'thr-1' });
      expect(allQueries()).toContain('DELETE FROM copilot.agent_threads');
    });
  });
});