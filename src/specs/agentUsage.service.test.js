jest.mock('../config/postgres', () => ({
  postgresPool: {
    query: jest.fn(),
  },
}));

const { postgresPool } = require('../config/postgres');
const agentUsage = require('../services/agentUsage.service');

describe('agentUsage.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('estimateCostCents', () => {
    test('returns 0 for empty inputs', () => {
      expect(agentUsage.estimateCostCents('gpt-4o', 0, 0)).toBe(0);
    });

    test('uses model-specific pricing when known', () => {
      const cost = agentUsage.estimateCostCents('gpt-4o', 1_000_000, 1_000_000);
      expect(cost).toBe(1250); // 2.5 + 10
    });

    test('falls back to default pricing for unknown models', () => {
      const cost = agentUsage.estimateCostCents('unknown-model', 1_000_000, 1_000_000);
      expect(cost).toBe(400); // default 1 + 3
    });
  });

  describe('recordUsage', () => {
    test('inserts a usage event with computed cost', async () => {
      postgresPool.query.mockResolvedValue({ rows: [{ updated_at: null }] });

      const result = await agentUsage.recordUsage({
        runId: 'run-1',
        tenantId: 't-1',
        userId: 'u-1',
        threadId: 'thr-1',
        model: 'gpt-4o',
        inputTokens: 1000,
        outputTokens: 500,
        toolCalls: 2,
      });

      expect(result.recorded).toBe(true);
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.toolCalls).toBe(2);
      expect(result.estimatedCostCents).toBeGreaterThan(0);
      expect(postgresPool.query.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test('rejects missing runId or tenantId', async () => {
      await expect(agentUsage.recordUsage({ tenantId: 't-1' })).rejects.toThrow();
    });
  });

  describe('summarizeUsage', () => {
    test('aggregates totals and byModel', async () => {
      postgresPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              runs: 3,
              input_tokens: 300,
              output_tokens: 120,
              tool_calls: 4,
              subagent_calls: 1,
              retries: 0,
              duration_ms: 900,
              estimated_cost_cents: 5,
              quota_consumed: 420,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { model: 'gpt-4o', runs: 2, input_tokens: 200, output_tokens: 100 },
            { model: 'gpt-4o-mini', runs: 1, input_tokens: 100, output_tokens: 20 },
          ],
        });

      const summary = await agentUsage.summarizeUsage({ tenantId: 't-1' });
      expect(summary.runs).toBe(3);
      expect(summary.totalTokens).toBe(420);
      expect(summary.byModel).toHaveLength(2);
      expect(summary.byModel[0].model).toBe('gpt-4o');
    });
  });
});