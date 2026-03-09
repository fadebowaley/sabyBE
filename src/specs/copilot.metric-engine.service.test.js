const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const metricEngine = require('../services/copilotMetricEngine.service');

describe('copilotMetricEngine.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('collects builtin + fact rule metrics', async () => {
    mockPostgresPool.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM form_submissions')) {
        return { rows: [{ total: 10, success: 8, approved: 7, rejected: 2 }] };
      }
      if (sql.includes('PERCENTILE_CONT')) {
        return { rows: [{ median_minutes: 5, p95_minutes: 9 }] };
      }
      if (sql.includes('FROM copilot.action_outbox')) {
        return { rows: [{ processed: 20, dead_letter: 1 }] };
      }
      if (sql.includes('FROM copilot.action_items')) {
        return { rows: [{ overdue: 0 }] };
      }
      if (sql.includes('FROM copilot.action_events')) {
        return { rows: [{ reversed: 1, completed: 10 }] };
      }
      if (sql.includes('FROM form_submission_facts')) {
        return { rows: [{ metric_value: 4321.5 }] };
      }
      return { rows: [{}] };
    });

    const result = await metricEngine.collectRuleAwareMetrics({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-31T23:59:59.999Z',
      rules: [
        {
          metric: 'total_amount_collected',
          metricSpec: {
            source: 'fact',
            aggregate: 'sum',
            fieldKey: 'amount',
            unit: 'currency',
          },
        },
      ],
    });

    expect(result.submission_success_rate.value).toBeCloseTo(80);
    expect(result.total_amount_collected).toEqual(
      expect.objectContaining({
        value: 4321.5,
        unit: 'currency',
        source: 'fact',
      })
    );
  });

  test('parses fact shorthand metric', () => {
    const spec = metricEngine.__private.normalizeMetricSpec({
      metric: 'fact:sum:amount',
      unit: 'currency',
    });

    expect(spec).toEqual(
      expect.objectContaining({
        source: 'fact',
        aggregate: 'sum',
        fieldKey: 'amount',
      })
    );
  });

  test('supports fact metric filters and family node scope', async () => {
    mockPostgresPool.query.mockResolvedValue({ rows: [{ metric_value: 250 }] });

    await metricEngine.__private.aggregateFactMetric({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-31T23:59:59.999Z',
      metricSpec: {
        source: 'fact',
        aggregate: 'sum',
        fieldKey: 'amount',
        nodeId: 'node-1',
        scope: 'family',
        filters: [
          { fieldKey: 'payment_method', op: 'eq', value: 'pos' },
          { fieldKey: 'amount', op: 'gte', value: 1000 },
        ],
      },
    });

    const sql = String(mockPostgresPool.query.mock.calls[0]?.[0] || '');
    expect(sql).toContain('copilot.node_closure');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('cf1.field_key');
    expect(sql).toContain('cf2.field_key');
  });
});
