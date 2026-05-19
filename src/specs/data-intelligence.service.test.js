// ── Mock setup ────────────────────────────────────────────────────────────────

const mockPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPool }));

// operationalMetrics calls copilotMetricEngine; mock collectBuiltInKpis
const mockCollectBuiltInKpis = jest.fn();
jest.mock('../services/copilotMetricEngine.service', () => ({
  collectBuiltInKpis: (...args) => mockCollectBuiltInKpis(...args),
}));

// intelligenceGateway called by executiveInsight
const mockResolveCallPlan = jest.fn();
jest.mock('../services/intelligenceGateway.service', () => ({
  resolveCallPlan: (...args) => mockResolveCallPlan(...args),
}));

// ── Modules under test ────────────────────────────────────────────────────────

const operationalMetrics = require('../services/operationalMetrics.service');
const anomalyDetection   = require('../services/anomalyDetection.service');
const executiveInsight   = require('../services/executiveInsight.service');

const TENANT  = 'tenant-phase5';
const PROJECT = 'proj-phase5';

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// operationalMetrics helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('operationalMetrics — currentMonthLabel', () => {
  test('returns YYYY-MM format', () => {
    const label = operationalMetrics.currentMonthLabel();
    expect(label).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('operationalMetrics — monthStart / monthEnd', () => {
  test('monthStart returns first day of month at UTC midnight', () => {
    const s = operationalMetrics.monthStart('2026-05');
    expect(s).toBe('2026-05-01T00:00:00.000Z');
  });

  test('monthEnd returns last day of month at 23:59:59.999 UTC', () => {
    const e = operationalMetrics.monthEnd('2026-05');
    expect(e).toBe('2026-05-31T23:59:59.999Z');
  });
});

describe('operationalMetrics.computeAndSaveMetrics', () => {
  test('merges built-in KPIs with compliance and action metrics, writes snapshots', async () => {
    // collectBuiltInKpis
    mockCollectBuiltInKpis.mockResolvedValue({
      submission_success_rate: { value: 85, unit: 'percent' },
    });

    // compliance metrics query
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        total_nodes: 10, compliant_nodes: 7, partial_nodes: 2,
        incomplete_nodes: 1, avg_completeness_pct: '82.50',
      }],
    });

    // action item metrics query
    mockPool.query.mockResolvedValueOnce({
      rows: [{ open_count: 3, done_count: 5, cancelled_count: 1, overdue_count: 1, total_count: 9 }],
    });

    // model cost metrics query
    mockPool.query.mockResolvedValueOnce({
      rows: [{ total_cost_usd: '0.1200', total_calls: 42, total_tokens: 8000 }],
    });

    // UPSERT per metric (one call per metric — use mockResolvedValue for all remaining)
    mockPool.query.mockResolvedValue({ rows: [] });

    const metrics = await operationalMetrics.computeAndSaveMetrics({
      tenantId:   TENANT,
      projectId:  PROJECT,
      monthLabel: '2026-05',
    });

    expect(metrics).toHaveProperty('submission_success_rate');
    expect(metrics).toHaveProperty('compliance_rate');
    expect(metrics).toHaveProperty('action_item_resolution_rate');
    expect(metrics).toHaveProperty('model_cost_usd');
    expect(metrics.compliance_rate.value).toBeCloseTo(70); // 7/10 * 100
    expect(metrics.action_item_resolution_rate.value).toBeCloseTo(55.56); // 5/9*100
  });

  test('continues when compliance table is missing (42P01)', async () => {
    mockCollectBuiltInKpis.mockResolvedValue({
      submission_success_rate: { value: 90, unit: 'percent' },
    });

    // compliance query → table not found
    mockPool.query.mockRejectedValueOnce(Object.assign(new Error('relation not found'), { code: '42P01' }));
    // action items
    mockPool.query.mockResolvedValueOnce({ rows: [{ open_count: 0, done_count: 0, cancelled_count: 0, overdue_count: 0, total_count: 0 }] });
    // model cost
    mockPool.query.mockResolvedValueOnce({ rows: [{ total_cost_usd: '0', total_calls: 0, total_tokens: 0 }] });
    // upserts
    mockPool.query.mockResolvedValue({ rows: [] });

    const metrics = await operationalMetrics.computeAndSaveMetrics({
      tenantId: TENANT, projectId: PROJECT, monthLabel: '2026-05',
    });

    expect(metrics).toHaveProperty('submission_success_rate');
    // compliance metrics not present — that's fine
    expect(metrics.compliance_rate).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// anomalyDetection helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('anomalyDetection — classifySeverity', () => {
  test.each([
    [10,  null],
    [20,  'low'],
    [40,  'medium'],
    [60,  'high'],
    [80,  'critical'],
    [-80, 'critical'],   // absolute value used
  ])('deviation %d% → %s', (pct, expected) => {
    expect(anomalyDetection.classifySeverity(pct)).toBe(expected);
  });
});

describe('anomalyDetection — rollingAverage', () => {
  test('returns null for empty history', () => {
    expect(anomalyDetection.rollingAverage([])).toBeNull();
  });

  test('computes average of historical values', () => {
    const history = [{ value: 60 }, { value: 80 }, { value: 70 }];
    expect(anomalyDetection.rollingAverage(history)).toBeCloseTo(70);
  });
});

describe('anomalyDetection.detectAnomalies', () => {
  test('flags high-severity anomaly and writes to metric_anomalies', async () => {
    // getMetricHistory for compliance_rate
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { month_label: '2026-04', metric_value: '90', metric_unit: 'percent' },
        { month_label: '2026-03', metric_value: '88', metric_unit: 'percent' },
        { month_label: '2026-02', metric_value: '92', metric_unit: 'percent' },
      ],
    });
    // upsertAnomaly INSERT
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // resolveStaleAnomalies UPDATE
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const currentMetrics = {
      compliance_rate: { value: 40, unit: 'percent' }, // ~55% drop from ~90 baseline
    };

    const flagged = await anomalyDetection.detectAnomalies({
      tenantId:       TENANT,
      projectId:      PROJECT,
      currentMetrics,
      periodStart:    '2026-05-01T00:00:00.000Z',
      periodEnd:      '2026-05-31T23:59:59.999Z',
    });

    expect(flagged).toHaveLength(1);
    expect(flagged[0].metricName).toBe('compliance_rate');
    expect(['high', 'critical']).toContain(flagged[0].severity);
  });

  test('ignores metrics below the noise floor (< 15% deviation)', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { month_label: '2026-04', metric_value: '85', metric_unit: 'percent' },
        { month_label: '2026-03', metric_value: '87', metric_unit: 'percent' },
      ],
    });
    mockPool.query.mockResolvedValue({ rows: [] });

    const flagged = await anomalyDetection.detectAnomalies({
      tenantId: TENANT, projectId: PROJECT,
      currentMetrics: { compliance_rate: { value: 84, unit: 'percent' } }, // only ~1.2% drop
      periodStart: '2026-05-01T00:00:00.000Z',
      periodEnd:   '2026-05-31T23:59:59.999Z',
    });

    expect(flagged).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// executiveInsight
// ─────────────────────────────────────────────────────────────────────────────

describe('executiveInsight.queueInsightGeneration', () => {
  const CALL_PLAN = {
    model: { modelKey: 'gpt-4o', modelName: 'gpt-4o' },
    systemPrompt: 'You are a senior analyst.',
    promptVersion: 1,
    promptId: 'prompt-uuid-1',
    budgetStatus: { allowed: true },
  };

  const setupContextMocks = () => {
    // getLatestSnapshots
    mockPool.query.mockResolvedValueOnce({
      rows: [{ metric_name: 'compliance_rate', metric_value: '70', metric_unit: 'percent', bucket_start: new Date(), bucket_end: new Date(), dimensions_json: {}, created_at: new Date() }],
    });
    // listAnomalies
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // loadComplianceRunContext
    mockPool.query.mockResolvedValueOnce({ rows: [] });
  };

  test('creates pending insight record with call plan', async () => {
    // Check for existing in-flight record → none
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    setupContextMocks();
    mockResolveCallPlan.mockResolvedValue(CALL_PLAN);
    // INSERT insight record
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'insight-uuid-1', status: 'pending' }] });

    const result = await executiveInsight.queueInsightGeneration({
      tenantId: TENANT, actorId: 'user-1', projectId: PROJECT, monthLabel: '2026-05',
    });

    expect(result.insightId).toBe('insight-uuid-1');
    expect(result.status).toBe('pending');
    expect(result.callPlan.model.modelKey).toBe('gpt-4o');
    expect(mockResolveCallPlan).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'executive_report', tenantId: TENANT })
    );
  });

  test('returns existing in-flight record without re-queuing (idempotent)', async () => {
    // Existing in-flight found
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'existing-insight', status: 'processing' }] });

    const result = await executiveInsight.queueInsightGeneration({
      tenantId: TENANT, actorId: 'user-1', projectId: PROJECT, monthLabel: '2026-05',
    });

    expect(result.insightId).toBe('existing-insight');
    expect(result.status).toBe('processing');
    expect(result.callPlan).toBeNull();
    expect(mockResolveCallPlan).not.toHaveBeenCalled();
  });
});

describe('executiveInsight.completeInsight', () => {
  const BRIEF = {
    headline:           'Compliance dropped 30% in May',
    keyInsights:        ['Lagos branch: 40% submission rate'],
    risks:              ['3 branches at risk of escalation'],
    recommendedActions: ['Dispatch field officer to Lagos'],
  };

  test('stores brief and marks insight completed', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'insight-1', status: 'completed', brief_json: BRIEF, generated_at: new Date() }],
    });

    const result = await executiveInsight.completeInsight({ insightId: 'insight-1', briefJson: BRIEF });

    expect(result.status).toBe('completed');
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('copilot.operational_insights'),
      expect.arrayContaining(['insight-1'])
    );
  });

  test('throws INSIGHT_NOT_FOUND when insight is already in terminal state', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      executiveInsight.completeInsight({ insightId: 'bad-id', briefJson: BRIEF })
    ).rejects.toMatchObject({ code: 'INSIGHT_NOT_FOUND' });
  });
});
