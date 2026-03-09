const mockPostgresPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const mockRulesService = {
  getActiveRules: jest.fn(),
};

jest.mock('../services/copilotProjectRules.service', () => mockRulesService);

const scoreboardService = require('../services/copilotProjectScoreboard.service');

const makeClient = (onQuery) => ({
  query: jest.fn((sql, params) => onQuery(sql, params)),
  release: jest.fn(),
});

describe('copilotProjectScoreboard.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes and persists scoreboard for period', async () => {
    mockRulesService.getActiveRules.mockResolvedValue({
      version: 1,
      rules_json: {
        rules: [
          {
            key: 'submission_success_rate',
            metric: 'submission_success_rate',
            weight: 100,
            direction: 'higher_is_better',
            target: 95,
            warning: 85,
            critical: 70,
          },
        ],
      },
    });

    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [{ total: 10, success: 9, approved: 7, rejected: 1 }],
      })
      .mockResolvedValueOnce({ rows: [{ median_minutes: 5, p95_minutes: 12 }] })
      .mockResolvedValueOnce({ rows: [{ processed: 20, dead_letter: 1 }] })
      .mockResolvedValueOnce({ rows: [{ overdue: 2 }] })
      .mockResolvedValueOnce({ rows: [{ reversed: 1, completed: 30 }] });

    const client = makeClient(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('INSERT INTO copilot.project_kpi_snapshots')) return { rows: [] };
      if (sql.includes('INSERT INTO copilot.project_scoreboard')) {
        return {
          rows: [
            {
              id: 'score-1',
              project_id: 'project-1',
              score_status: 'NEUTRAL',
              score: 80,
            },
          ],
        };
      }
      if (sql.includes('COMMIT')) return { rows: [] };
      return { rows: [] };
    });
    mockPostgresPool.connect.mockResolvedValue(client);

    const result = await scoreboardService.computeScoreboard({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      periodStart: '2026-03-01T00:00:00.000Z',
      periodEnd: '2026-03-31T23:59:59.999Z',
      computedBy: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({ id: 'score-1', project_id: 'project-1' })
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('returns latest scoreboard', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ id: 'score-latest', project_id: 'project-1', score: 75 }],
    });

    const result = await scoreboardService.getLatestScoreboard({
      tenantId: 'tenant-1',
      projectId: 'project-1',
    });

    expect(result).toEqual(
      expect.objectContaining({ id: 'score-latest', score: 75 })
    );
  });
});
