const mockPostgresPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPostgresPool }));

const mockConfig = { peopleIntelligence: {} };
jest.mock('../config/config', () => mockConfig);

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mockAgentTask = {
  createTask: jest.fn(),
  createTaskStep: jest.fn(),
  setCurrentTaskStep: jest.fn(),
  updateTaskStep: jest.fn(),
  updateTaskStatus: jest.fn(),
  createAgentError: jest.fn(),
};
jest.mock('../services/agentTask.service', () => mockAgentTask);

const mockPeople = {
  getPeopleSnapshot: jest.fn(),
  buildPeopleState: jest.fn(),
  detectObservations: jest.fn(),
};
jest.mock('../services/copilotPeople.service', () => mockPeople);

const mockPeopleHistory = {
  detectFlux: jest.fn(),
};
jest.mock('../services/peopleHistory.service', () => mockPeopleHistory);

const svc = require('../services/peopleIntelligence.service');

const TENANT = 'tenant-peopledemo';

const observations = [
  {
    ruleId: 'data_quality',
    severity: 'warning',
    subject: { kind: 'USER', id: 'u-1' },
    summary: 'Incomplete data for Uzo',
  },
  {
    ruleId: 'lifecycle_problem',
    severity: 'critical',
    subject: { kind: 'USER', id: 'u-7' },
    summary: 'Stale access retained by inactive user',
  },
  {
    ruleId: 'org_gap',
    severity: 'warning',
    subject: { kind: 'NODE', id: 'n-lagos' },
    summary: 'Lagos has active members but no admin',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('classifyObservation', () => {
  test('maps lifecycle_problem to ESCALATION with users.deactivate', () => {
    expect(svc.classifyObservation(observations[1])).toEqual({
      responseClass: 'ESCALATION',
      suggestedCapability: 'users.deactivate',
    });
  });

  test('maps org_gap to REQUIRES_APPROVAL with users.assign', () => {
    expect(svc.classifyObservation(observations[2])).toEqual({
      responseClass: 'REQUIRES_APPROVAL',
      suggestedCapability: 'users.assign',
    });
  });

  test('maps warning data_quality to REQUIRES_APPROVAL and info to INFORMATION', () => {
    expect(svc.classifyObservation(observations[0])).toEqual({
      responseClass: 'REQUIRES_APPROVAL',
      suggestedCapability: 'users.assign',
    });
    expect(
      svc.classifyObservation({
        ruleId: 'data_quality',
        severity: 'info',
        subject: { kind: 'USER', id: 'u-2' },
      })
    ).toEqual({ responseClass: 'INFORMATION', suggestedCapability: null });
  });
});

describe('hasExistingEscalation', () => {
  test('returns true when the people_key is already open', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ id: 'esc-1' }] });

    const result = await svc.hasExistingEscalation({
      tenantId: TENANT,
      peopleKey: 'lifecycle_problem:USER:u-7',
    });

    expect(result).toBe(true);
    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining("metadata_json->>'people_key'"),
      expect.arrayContaining([TENANT, 'lifecycle_problem:USER:u-7'])
    );
  });

  test('returns false when no escalation exists', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });
    const result = await svc.hasExistingEscalation({
      tenantId: TENANT,
      peopleKey: 'org_gap:NODE:n-lagos',
    });
    expect(result).toBe(false);
  });
});

describe('createEscalationRecord', () => {
  test('inserts a tenant-scoped escalation with people_key metadata', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ id: 'esc-new' }] });

    const result = await svc.createEscalationRecord({
      tenantId: TENANT,
      taskId: 'task-1',
      stepId: 'step-3',
      reason: 'Stale access retained by inactive user',
      peopleKey: 'lifecycle_problem:USER:u-7',
      observation: observations[1],
      classification: {
        responseClass: 'ESCALATION',
        suggestedCapability: 'users.deactivate',
      },
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('copilot.agent_escalations'),
      expect.arrayContaining([
        TENANT,
        'Stale access retained by inactive user',
        'u-7',
      ])
    );
    expect(result.id).toBe('esc-new');
  });
});

describe('runPeopleIntelligence', () => {
  const setupMocks = () => {
    mockAgentTask.createTask.mockResolvedValue({ id: 'task-pi-1' });
    mockAgentTask.createTaskStep.mockResolvedValue({ id: 'step-x' });
    mockAgentTask.setCurrentTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStatus.mockResolvedValue(null);
    mockAgentTask.createAgentError.mockResolvedValue(null);

    mockPeople.getPeopleSnapshot.mockResolvedValue({
      tenantId: TENANT,
      users: [],
    });
    mockPeople.buildPeopleState.mockImplementation((s) => s);
    mockPeople.detectObservations.mockReturnValue(observations);
    mockPeopleHistory.detectFlux.mockResolvedValue([]);

    // hasExistingEscalation → none open for any people_key
    mockPostgresPool.query.mockResolvedValue({ rows: [] });
  };

  test('records all observations and escalates only the ESCALATION class', async () => {
    setupMocks();

    const result = await svc.runPeopleIntelligence({ tenantId: TENANT });

    expect(mockAgentTask.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        workflowName: 'people_intelligence',
        intent: 'people:observe_classify_escalate',
        riskLevel: 'LOW',
      })
    );

    // 3 observations → 3 record steps + observe + escalate steps
    expect(mockAgentTask.createTaskStep).toHaveBeenCalledTimes(5);

    // only lifecycle_problem (1) triggers an escalation
    expect(result.observationCount).toBe(3);
    expect(result.escalationsCreated).toBe(1);
    expect(result.deduplicatedCount).toBe(0);

    const insertCalls = mockPostgresPool.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO copilot.agent_escalations')
    );
    expect(insertCalls).toHaveLength(1);
    expect(String(insertCalls[0][1])).toContain('lifecycle_problem');

    expect(mockAgentTask.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        status: 'completed',
        contextJson: expect.objectContaining({
          observationCount: 3,
          escalationsCreated: 1,
        }),
      })
    );
  });

  test('deduplicates escalations that are already open', async () => {
    setupMocks();

    // lifecycle_problem already escalated → row returned
    mockPostgresPool.query.mockImplementation((sql) =>
      String(sql).includes('INSERT INTO copilot.agent_escalations')
        ? Promise.resolve({ rows: [{ id: 'esc-existing' }] })
        : Promise.resolve({ rows: [{ id: 'existing-open' }] })
    );

    const result = await svc.runPeopleIntelligence({ tenantId: TENANT });

    expect(result.escalationsCreated).toBe(0);
    expect(result.deduplicatedCount).toBe(1);

    const insertCalls = mockPostgresPool.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO copilot.agent_escalations')
    );
    expect(insertCalls).toHaveLength(0);
  });

  test('merges access_flux history findings into the observation set', async () => {
    mockAgentTask.createTask.mockResolvedValue({ id: 'task-pi-flux' });
    mockAgentTask.createTaskStep.mockResolvedValue({ id: 'step-x' });
    mockAgentTask.setCurrentTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStatus.mockResolvedValue(null);
    mockAgentTask.createAgentError.mockResolvedValue(null);

    mockPeople.getPeopleSnapshot.mockResolvedValue({
      tenantId: TENANT,
      users: [],
    });
    mockPeople.buildPeopleState.mockImplementation((s) => s);
    mockPeople.detectObservations.mockReturnValue([]);
    mockPeopleHistory.detectFlux.mockResolvedValue([
      {
        ruleId: 'access_flux',
        severity: 'warning',
        subject: { kind: 'USER', id: 'u-1' },
        summary: '4 access change(s) on USER u-1 within 168h',
        evidence: [{ source: 'history:USER:u-1', detail: '4 total' }],
      },
    ]);

    mockPostgresPool.query.mockResolvedValue({ rows: [] });

    const result = await svc.runPeopleIntelligence({ tenantId: TENANT });

    expect(result.observationCount).toBe(1);
    expect(result.escalationsCreated).toBe(0);
    expect(mockAgentTask.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        contextJson: expect.objectContaining({ observationCount: 1 }),
      })
    );
  });

  test('marks the task failed when the snapshot load throws', async () => {
    mockAgentTask.createTask.mockResolvedValue({ id: 'task-fail' });
    mockAgentTask.createTaskStep.mockResolvedValue({ id: 'step-fail' });
    mockAgentTask.setCurrentTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStatus.mockResolvedValue(null);

    mockPeople.getPeopleSnapshot.mockRejectedValue(new Error('DB unavailable'));

    await expect(
      svc.runPeopleIntelligence({ tenantId: TENANT })
    ).rejects.toThrow('DB unavailable');

    expect(mockAgentTask.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', tenantId: TENANT })
    );
  });
});
