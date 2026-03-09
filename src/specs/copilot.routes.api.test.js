const request = require('supertest');

const mockCopilotActionService = {
  createAction: jest.fn(),
  reverseAction: jest.fn(),
  getActionById: jest.fn(),
  getFeed: jest.fn(),
  updateActionItemStatus: jest.fn(),
};

const mockCopilotAuditExportService = {
  createAuditExportJob: jest.fn(),
  listAuditExportJobs: jest.fn(),
  getAuditExportJobById: jest.fn(),
};

const mockCopilotProjectRulesService = {
  createRulesVersion: jest.fn(),
  getActiveRules: jest.fn(),
  listRuleVersions: jest.fn(),
  activateRuleVersion: jest.fn(),
};

const mockCopilotProjectScoreboardService = {
  computeScoreboard: jest.fn(),
  getLatestScoreboard: jest.fn(),
  getScoreboardHistory: jest.fn(),
};

const mockCopilotProjectRuleAnalysisService = {
  analyzeProjectRules: jest.fn(),
};

const mockCopilotNodeComparisonService = {
  compareNodePerformance: jest.fn(),
};

const mockCopilotNodeRankingService = {
  listProjectNodeRankings: jest.fn(),
};

const mockCopilotToolRuntimeService = {
  listTools: jest.fn(),
  executeToolCall: jest.fn(),
  listToolCallLogs: jest.fn(),
};

const mockCopilotSessionContextService = {
  getSessionContext: jest.fn(),
  upsertSessionContext: jest.fn(),
  getFocusState: jest.fn(),
  upsertFocusState: jest.fn(),
  clearFocusState: jest.fn(),
};

const mockCopilotEntityResolverService = {
  searchEntities: jest.fn(),
  resolveEntityReference: jest.fn(),
};
const mockCopilotOnboardingService = {
  validateOnboardingCsvDryRun: jest.fn(),
  importOnboardingCsv: jest.fn(),
};

jest.mock('../middlewares/auth', () => () => (req, res, next) => {
  req.user = {
    id: 'user-1',
    tenantId: 'tenant-1',
    role: 'admin',
    roles: ['role-1'],
  };
  next();
});

jest.mock('../services/copilotAction.service', () => mockCopilotActionService);
jest.mock('../services/copilotAuditExport.service', () => mockCopilotAuditExportService);
jest.mock('../services/copilotProjectRules.service', () => mockCopilotProjectRulesService);
jest.mock('../services/copilotProjectScoreboard.service', () => mockCopilotProjectScoreboardService);
jest.mock('../services/copilotProjectRuleAnalysis.service', () => mockCopilotProjectRuleAnalysisService);
jest.mock('../services/copilotNodeComparison.service', () => mockCopilotNodeComparisonService);
jest.mock('../services/copilotNodeRanking.service', () => mockCopilotNodeRankingService);
jest.mock('../services/copilotToolRuntime.service', () => mockCopilotToolRuntimeService);
jest.mock('../services/copilotSessionContext.service', () => mockCopilotSessionContextService);
jest.mock('../services/copilotEntityResolver.service', () => mockCopilotEntityResolverService);
jest.mock('../services/copilotOnboarding.service', () => mockCopilotOnboardingService);

const app = require('../app');

describe('copilot routes api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /v1/copilot/feed returns tenant-scoped feed', async () => {
    mockCopilotActionService.getFeed.mockResolvedValue([
      { id: 'item-1', status: 'open', tenant_id: 'tenant-1' },
    ]);

    const res = await request(app).get('/v1/copilot/feed?status=open&limit=10');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 1,
      results: [{ id: 'item-1', status: 'open', tenant_id: 'tenant-1' }],
    });
    expect(mockCopilotActionService.getFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        userId: 'user-1',
        roleId: 'admin',
        roleIds: ['role-1'],
        status: 'open',
        limit: 10,
      })
    );
  });

  test('POST /v1/copilot/audit-exports queues audit export job', async () => {
    mockCopilotAuditExportService.createAuditExportJob.mockResolvedValue({
      id: '0f43b375-2f7d-4686-a3df-94af40af918e',
      tenant_id: 'tenant-1',
      status: 'queued',
      export_type: 'action_events',
    });

    const res = await request(app).post('/v1/copilot/audit-exports').send({
      exportType: 'action_events',
      filters: { actionType: 'create_user' },
    });

    expect(res.status).toBe(202);
    expect(res.body.message).toBe('Audit export job queued');
    expect(res.body.job).toEqual(
      expect.objectContaining({
        id: '0f43b375-2f7d-4686-a3df-94af40af918e',
        status: 'queued',
      })
    );
    expect(mockCopilotAuditExportService.createAuditExportJob).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      requestedBy: 'user-1',
      exportType: 'action_events',
      filters: { actionType: 'create_user' },
    });
  });

  test('GET /v1/copilot/audit-exports returns job list', async () => {
    mockCopilotAuditExportService.listAuditExportJobs.mockResolvedValue([
      {
        id: '9bb0000b-d60f-40c0-b5f6-5c56f636fce9',
        status: 'completed',
      },
    ]);

    const res = await request(app).get(
      '/v1/copilot/audit-exports?status=completed&limit=5'
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      total: 1,
      results: [
        {
          id: '9bb0000b-d60f-40c0-b5f6-5c56f636fce9',
          status: 'completed',
        },
      ],
    });
    expect(mockCopilotAuditExportService.listAuditExportJobs).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: 'completed',
      limit: 5,
    });
  });

  test('GET /v1/copilot/audit-exports/:jobId returns job detail', async () => {
    const jobId = 'fcd87a3c-090d-4cc8-a28e-a84f90f3f6cb';
    mockCopilotAuditExportService.getAuditExportJobById.mockResolvedValue({
      id: jobId,
      tenant_id: 'tenant-1',
      status: 'processing',
    });

    const res = await request(app).get(`/v1/copilot/audit-exports/${jobId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: jobId,
      tenant_id: 'tenant-1',
      status: 'processing',
    });
    expect(
      mockCopilotAuditExportService.getAuditExportJobById
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      jobId,
    });
  });

  test('POST /v1/copilot/projects/:projectId/rules creates new active rule version', async () => {
    mockCopilotProjectRulesService.createRulesVersion.mockResolvedValue({
      id: 'pr-1',
      tenant_id: 'tenant-1',
      project_id: 'project-1',
      version: 1,
      active: true,
    });

    const res = await request(app)
      .post('/v1/copilot/projects/project-1/rules')
      .send({
        rules: {
          rules: [
            {
              key: 'submission_success_rate',
              metric: 'submission_success_rate',
              weight: 100,
              direction: 'higher_is_better',
              target: 95,
              warning: 85,
              critical: 70,
              enabled: true,
            },
          ],
        },
      });

    expect(res.status).toBe(201);
    expect(mockCopilotProjectRulesService.createRulesVersion).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      rulesJson: expect.any(Object),
      createdBy: 'user-1',
    });
  });

  test('GET /v1/copilot/projects/:projectId/rules returns active rules', async () => {
    mockCopilotProjectRulesService.getActiveRules.mockResolvedValue({
      id: 'pr-2',
      project_id: 'project-1',
      version: 2,
      active: true,
    });

    const res = await request(app).get('/v1/copilot/projects/project-1/rules');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: 'pr-2', version: 2, active: true })
    );
  });

  test('GET /v1/copilot/projects/:projectId/rules/versions returns versions', async () => {
    mockCopilotProjectRulesService.listRuleVersions.mockResolvedValue([
      { id: 'v2', version: 2, active: true },
      { id: 'v1', version: 1, active: false },
    ]);

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/rules/versions'
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('POST /v1/copilot/projects/:projectId/rules/:version/activate activates version', async () => {
    mockCopilotProjectRulesService.activateRuleVersion.mockResolvedValue({
      id: 'v1',
      project_id: 'project-1',
      version: 1,
      active: true,
    });

    const res = await request(app).post(
      '/v1/copilot/projects/project-1/rules/1/activate'
    );
    expect(res.status).toBe(200);
    expect(mockCopilotProjectRulesService.activateRuleVersion).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      version: 1,
    });
  });

  test('POST /v1/copilot/projects/:projectId/scoreboard/recompute triggers recompute', async () => {
    mockCopilotProjectScoreboardService.computeScoreboard.mockResolvedValue({
      id: 'sb-1',
      project_id: 'project-1',
      score: 82.5,
      score_status: 'WINNING',
    });

    const res = await request(app)
      .post('/v1/copilot/projects/project-1/scoreboard/recompute')
      .send({
        periodStart: '2026-03-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: 'sb-1',
        score: 82.5,
      })
    );
  });

  test('GET /v1/copilot/projects/:projectId/scoreboard returns latest', async () => {
    mockCopilotProjectScoreboardService.getLatestScoreboard.mockResolvedValue({
      id: 'sb-latest',
      score: 74,
      score_status: 'NEUTRAL',
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/scoreboard'
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: 'sb-latest', score: 74 })
    );
  });

  test('GET /v1/copilot/projects/:projectId/scoreboard/history returns timeline', async () => {
    mockCopilotProjectScoreboardService.getScoreboardHistory.mockResolvedValue([
      { id: 'sb-2', score: 77 },
      { id: 'sb-1', score: 72 },
    ]);

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/scoreboard/history?limit=2'
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('GET /v1/copilot/projects/:projectId/rules-analysis returns rule verdicts', async () => {
    mockCopilotProjectRuleAnalysisService.analyzeProjectRules.mockResolvedValue({
      projectId: 'project-1',
      overallStatus: 'NEUTRAL',
      overallScore: 67.5,
      totals: { pass: 2, warn: 1, fail: 1 },
      rules: [{ key: 'approval_rate', verdict: 'warn' }],
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/rules-analysis?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z'
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        projectId: 'project-1',
        overallStatus: 'NEUTRAL',
      })
    );
    expect(
      mockCopilotProjectRuleAnalysisService.analyzeProjectRules
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      periodStart: expect.any(Date),
      periodEnd: expect.any(Date),
    });
  });

  test('GET /v1/copilot/projects/:projectId/node-comparison compares node performance', async () => {
    mockCopilotNodeComparisonService.compareNodePerformance.mockResolvedValue({
      projectId: 'project-1',
      comparison: {
        left: { nodeId: 'node-1', nodeSetSize: 1, metrics: { submissionCount: 20 } },
        right: { nodeId: 'node-2', nodeSetSize: 1, metrics: { submissionCount: 10 } },
      },
      result: { primaryMetric: 'submissionCount', winner: 'left', delta: 10 },
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/node-comparison?leftNodeId=node-1&rightNodeId=node-2&leftScope=self&rightScope=family&enforceSameLevel=true&from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z'
    );

    expect(res.status).toBe(200);
    expect(res.body.result.winner).toBe('left');
    expect(
      mockCopilotNodeComparisonService.compareNodePerformance
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      leftNodeId: 'node-1',
      rightNodeId: 'node-2',
      leftScope: 'self',
      rightScope: 'family',
      enforceSameLevel: true,
      periodStart: expect.any(Date),
      periodEnd: expect.any(Date),
    });
  });

  test('GET /v1/copilot/projects/:projectId/node-rankings returns ranked nodes', async () => {
    mockCopilotNodeRankingService.listProjectNodeRankings.mockResolvedValue({
      projectId: 'project-1',
      scope: 'family',
      direction: 'top',
      metric: 'submissionCount',
      rankings: [{ rank: 1, nodeId: 'node-1', nodeName: 'HQ', submissionCount: 40 }],
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/node-rankings?scope=family&direction=top&metric=submissionCount&limit=5'
    );

    expect(res.status).toBe(200);
    expect(res.body.rankings?.[0]?.nodeId).toBe('node-1');
    expect(
      mockCopilotNodeRankingService.listProjectNodeRankings
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      projectId: 'project-1',
      scope: 'family',
      direction: 'top',
      metric: 'submissionCount',
      limit: 5,
      all: false,
      includeZero: false,
      periodStart: undefined,
      periodEnd: undefined,
    });
  });

  test('GET /v1/copilot/projects/:projectId/node-comparison/export returns csv', async () => {
    mockCopilotNodeComparisonService.compareNodePerformance.mockResolvedValue({
      comparison: {
        left: { nodeId: 'node-1', nodeName: 'Node A', metrics: { submissionCount: 20 } },
        right: { nodeId: 'node-2', nodeName: 'Node B', metrics: { submissionCount: 10 } },
      },
      result: { winner: 'left', primaryMetric: 'submissionCount', summary: 'Node A leads' },
      recommendations: ['Do x'],
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/node-comparison/export?leftNodeId=node-1&rightNodeId=node-2&format=csv'
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('type,key,left,right');
    expect(res.text).toContain('submissionCount');
  });

  test('GET /v1/copilot/projects/:projectId/node-rankings/export returns csv', async () => {
    mockCopilotNodeRankingService.listProjectNodeRankings.mockResolvedValue({
      scope: 'family',
      direction: 'top',
      metric: 'submissionCount',
      rankings: [
        {
          rank: 1,
          nodeId: 'node-1',
          nodeName: 'HQ',
          levelName: 'zone',
          submissionCount: 40,
          contributorCount: 5,
          factCount: 20,
          sumCandidateTotal: 1000,
          numericTotal: 1000,
          numericAverage: 50,
        },
      ],
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/node-rankings/export?scope=family&direction=top&metric=submissionCount&format=csv'
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('rank,nodeId,nodeName');
    expect(res.text).toContain('HQ');
  });

  test('GET /v1/copilot/projects/:projectId/node-rankings supports all=true', async () => {
    mockCopilotNodeRankingService.listProjectNodeRankings.mockResolvedValue({
      projectId: 'project-1',
      all: true,
      rankings: [],
    });

    const res = await request(app).get(
      '/v1/copilot/projects/project-1/node-rankings?all=true&includeZero=true'
    );
    expect(res.status).toBe(200);
    expect(
      mockCopilotNodeRankingService.listProjectNodeRankings
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        all: true,
        includeZero: true,
      })
    );
  });

  test('GET /v1/copilot/tools returns tools', async () => {
    mockCopilotToolRuntimeService.listTools.mockResolvedValue([
      { tool_name: 'create_user_tool', enabled: true },
    ]);

    const res = await request(app).get('/v1/copilot/tools');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  test('POST /v1/copilot/tools/:toolName/call executes tool runtime', async () => {
    mockCopilotToolRuntimeService.executeToolCall.mockResolvedValue({
      executed: true,
      mode: 'action_event',
      event: { id: 'evt-1' },
    });

    const res = await request(app)
      .post('/v1/copilot/tools/create_user_tool/call')
      .send({
        payload: { entityId: 'user-1', actionPayload: { email: 'x@example.com' } },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        executed: true,
        mode: 'action_event',
      })
    );
  });

  test('GET /v1/copilot/tools/calls returns call logs', async () => {
    mockCopilotToolRuntimeService.listToolCallLogs.mockResolvedValue([
      { id: 'log-1', tool_name: 'create_user_tool', status: 'success' },
    ]);

    const res = await request(app).get('/v1/copilot/tools/calls?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  test('GET /v1/copilot/context returns user session context', async () => {
    mockCopilotSessionContextService.getSessionContext.mockResolvedValue({
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      current_project_id: 'project-1',
      context_json: { intent: 'review' },
    });

    const res = await request(app).get('/v1/copilot/context');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ current_project_id: 'project-1' })
    );
  });

  test('PATCH /v1/copilot/context updates context', async () => {
    mockCopilotSessionContextService.upsertSessionContext.mockResolvedValue({
      id: 'ctx-1',
      current_project_id: 'project-2',
    });

    const res = await request(app).patch('/v1/copilot/context').send({
      currentProjectId: 'project-2',
      context: { intent: 'approve' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ id: 'ctx-1', current_project_id: 'project-2' })
    );
  });

  test('PUT /v1/copilot/focus upserts focus state', async () => {
    mockCopilotSessionContextService.upsertFocusState.mockResolvedValue({
      id: 'focus-1',
      focus_type: 'submission',
      focus_entity_id: 'sub-1',
    });

    const res = await request(app).put('/v1/copilot/focus').send({
      focusType: 'submission',
      focusEntityId: 'sub-1',
      focus: { tab: 'details' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({ focus_type: 'submission', focus_entity_id: 'sub-1' })
    );
  });

  test('DELETE /v1/copilot/focus clears focus state', async () => {
    mockCopilotSessionContextService.clearFocusState.mockResolvedValue({
      removed: true,
    });

    const res = await request(app).delete('/v1/copilot/focus?focusType=submission');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true });
  });

  test('POST /v1/copilot/search returns ranked entity hits', async () => {
    mockCopilotEntityResolverService.searchEntities.mockResolvedValue([
      { entityType: 'user', id: 'u1', label: 'Israel A', score: 1 },
      { entityType: 'role', id: 'r1', label: 'Regional Admin', score: 0.9 },
    ]);

    const res = await request(app).post('/v1/copilot/search').send({
      query: 'israel',
      entityTypes: ['user', 'role'],
      limit: 5,
    });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(mockCopilotEntityResolverService.searchEntities).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      query: 'israel',
      entityTypes: ['user', 'role'],
      limit: 5,
    });
  });

  test('POST /v1/copilot/resolve resolves single entity reference', async () => {
    mockCopilotEntityResolverService.resolveEntityReference.mockResolvedValue({
      status: 'resolved',
      candidate: { entityType: 'user', id: 'u1', label: 'Israel A', score: 1 },
      candidates: [{ entityType: 'user', id: 'u1', label: 'Israel A', score: 1 }],
    });

    const res = await request(app).post('/v1/copilot/resolve').send({
      entityType: 'user',
      value: 'isreal@sotsm.org',
      limit: 5,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
    expect(
      mockCopilotEntityResolverService.resolveEntityReference
    ).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorUserId: 'user-1',
      entityType: 'user',
      value: 'isreal@sotsm.org',
      limit: 5,
      source: 'resolve_api',
    });
  });

  test('POST /v1/copilot/onboarding/import-csv runs dry-run validation by default', async () => {
    mockCopilotOnboardingService.validateOnboardingCsvDryRun.mockResolvedValue({
      dryRun: true,
      ok: true,
      summary: { rowCount: 1, errors: 0, warnings: 0 },
    });

    const res = await request(app).post('/v1/copilot/onboarding/import-csv').send({
      csvText: 'record_type,role_name\nrole,Pastor',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        dryRun: true,
        ok: true,
      })
    );
    expect(mockCopilotOnboardingService.validateOnboardingCsvDryRun).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      csvText: 'record_type,role_name\nrole,Pastor',
    });
    expect(mockCopilotOnboardingService.importOnboardingCsv).not.toHaveBeenCalled();
  });

  test('POST /v1/copilot/onboarding/import-csv executes import when dryRun=false', async () => {
    mockCopilotOnboardingService.importOnboardingCsv.mockResolvedValue({
      dryRun: false,
      executed: true,
      ok: true,
      summary: { rowCount: 1, failed: 0, rolledBack: false },
    });

    const res = await request(app).post('/v1/copilot/onboarding/import-csv').send({
      dryRun: false,
      csvText: 'record_type,role_name\nrole,Pastor',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        dryRun: false,
        executed: true,
        ok: true,
      })
    );
    expect(mockCopilotOnboardingService.importOnboardingCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        csvText: 'record_type,role_name\nrole,Pastor',
        actorUser: expect.objectContaining({
          id: 'user-1',
          tenantId: 'tenant-1',
        }),
      })
    );
  });
});
