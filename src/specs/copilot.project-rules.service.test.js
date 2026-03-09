const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
  connect: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const copilotProjectRulesService = require('../services/copilotProjectRules.service');

const makeClient = (onQuery) => ({
  query: jest.fn((sql, params) => onQuery(sql, params)),
  release: jest.fn(),
});

const validRules = {
  version: 1,
  scoring: {
    maxScore: 100,
  },
  rules: [
    {
      key: 'submission_success_rate',
      metric: 'submission_success_rate',
      weight: 60,
      direction: 'higher_is_better',
      target: 95,
      warning: 85,
      critical: 70,
      enabled: true,
    },
    {
      key: 'submission_rejection_rate',
      metric: 'submission_rejection_rate',
      weight: 40,
      direction: 'lower_is_better',
      target: 5,
      warning: 10,
      critical: 20,
      enabled: true,
    },
  ],
};

describe('copilotProjectRules.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates new project rule version and activates it', async () => {
    const client = makeClient(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('MAX(version)')) return { rows: [{ next_version: 3 }] };
      if (sql.includes('UPDATE copilot.project_rules') && sql.includes('active = FALSE')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO copilot.project_rules')) {
        return {
          rows: [{ id: 'rule-3', tenant_id: 'tenant-1', project_id: 'project-1', version: 3, active: true }],
        };
      }
      if (sql.includes('COMMIT')) return { rows: [] };
      return { rows: [] };
    });
    mockPostgresPool.connect.mockResolvedValue(client);

    const result = await copilotProjectRulesService.createRulesVersion({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      rulesJson: validRules,
      createdBy: 'user-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 'rule-3',
        project_id: 'project-1',
        version: 3,
        active: true,
      })
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects rules when enabled weights do not sum to 100', async () => {
    await expect(
      copilotProjectRulesService.createRulesVersion({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        rulesJson: {
          rules: [
            {
              key: 'a',
              metric: 'm1',
              weight: 30,
              direction: 'higher_is_better',
              target: 90,
              warning: 80,
              critical: 70,
              enabled: true,
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('weights must sum to 100'),
    });
  });

  test('activating missing rule version returns not found', async () => {
    const client = makeClient(async (sql) => {
      if (sql.includes('BEGIN')) return { rows: [] };
      if (sql.includes('WHERE tenant_id = $1') && sql.includes('version = $3')) {
        return { rows: [] };
      }
      if (sql.includes('ROLLBACK')) return { rows: [] };
      return { rows: [] };
    });
    mockPostgresPool.connect.mockResolvedValue(client);

    await expect(
      copilotProjectRulesService.activateRuleVersion({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        version: 99,
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.NOT_FOUND,
      message: expect.stringContaining('Rule version not found'),
    });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  test('rejects invalid metricSpec aggregate', async () => {
    await expect(
      copilotProjectRulesService.createRulesVersion({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        rulesJson: {
          rules: [
            {
              key: 'dynamic_metric',
              metric: 'fact:bad:amount',
              weight: 100,
              direction: 'higher_is_better',
              target: 90,
              warning: 70,
              critical: 50,
              metricSpec: {
                source: 'fact',
                aggregate: 'invalid',
                fieldKey: 'amount',
              },
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('metricSpec.aggregate'),
    });
  });

  test('rejects invalid metricSpec filter op', async () => {
    await expect(
      copilotProjectRulesService.createRulesVersion({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        rulesJson: {
          rules: [
            {
              key: 'dynamic_metric',
              metric: 'fact:sum:amount',
              weight: 100,
              direction: 'higher_is_better',
              target: 90,
              warning: 70,
              critical: 50,
              metricSpec: {
                source: 'fact',
                aggregate: 'sum',
                fieldKey: 'amount',
                filters: [{ fieldKey: 'channel', op: 'bad_op', value: 'pos' }],
              },
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.BAD_REQUEST,
      message: expect.stringContaining('metricSpec.filters[0].op'),
    });
  });
});
