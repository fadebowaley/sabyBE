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
      // table checks
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.action_events' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.action_outbox' }],
      })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_dlq' }] })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.action_catalog' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.tool_registry' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.tool_call_logs' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.policy_decision_logs' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.approval_decisions' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_tasks' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_task_steps' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_tool_calls' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_errors' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_schedules' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_escalations' }],
      })
      // column checks
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    await expect(assertCopilotSchemaReady()).resolves.toEqual({ ok: true });
  });

  test('fails fast when result_json column is missing', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.action_events' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.action_outbox' }],
      })
      .mockResolvedValueOnce({ rows: [{ table_name: 'copilot.action_dlq' }] })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.action_catalog' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.tool_registry' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.tool_call_logs' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.policy_decision_logs' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.approval_decisions' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_tasks' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_task_steps' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_tool_calls' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_errors' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_schedules' }],
      })
      .mockResolvedValueOnce({
        rows: [{ table_name: 'copilot.agent_escalations' }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    await expect(assertCopilotSchemaReady()).rejects.toThrow(
      /missing columns: copilot.action_events.result_json/
    );
  });
});
