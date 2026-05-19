const mockPostgresPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPostgresPool }));

const mockProjectFormFind = jest.fn();
jest.mock('../models', () => ({
  ProjectForm: { find: (...args) => ({ lean: () => mockProjectFormFind(...args) }) },
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

const svc = require('../services/complianceAgent.service');

const TENANT = 'tenant-phase3';

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// loadIncompleteNodes
// ---------------------------------------------------------------------------

describe('loadIncompleteNodes', () => {
  test('returns incomplete and partial rows for the given tenant/project/month', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        { node_id: 'node-1', compliance_status: 'incomplete', completeness_percentage: '0.00' },
        { node_id: 'node-2', compliance_status: 'partial', completeness_percentage: '40.00' },
      ],
    });

    const rows = await svc.loadIncompleteNodes({
      tenantId: TENANT,
      projectId: 'proj-1',
      month: '2026-05-01',
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('event_compliance_tracking'),
      [TENANT, 'proj-1', '2026-05-01']
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].compliance_status).toBe('incomplete');
  });
});

// ---------------------------------------------------------------------------
// hasOpenActionItemForNode — dedup guard
// ---------------------------------------------------------------------------

describe('hasOpenActionItemForNode', () => {
  test('returns true when an open item already exists', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ id: 'item-1' }] });

    const result = await svc.hasOpenActionItemForNode({
      tenantId: TENANT,
      projectId: 'proj-1',
      nodeId: 'node-1',
      month: '2026-05-01',
    });

    expect(result).toBe(true);
  });

  test('returns false when no open item exists', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await svc.hasOpenActionItemForNode({
      tenantId: TENANT,
      projectId: 'proj-1',
      nodeId: 'node-2',
      month: '2026-05-01',
    });

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createMissingSubmissionActionItem
// ---------------------------------------------------------------------------

describe('createMissingSubmissionActionItem', () => {
  test('inserts action item with correct tenant isolation and entity_type', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ id: 'item-created-1' }] });

    const result = await svc.createMissingSubmissionActionItem({
      tenantId: TENANT,
      projectId: 'proj-1',
      projectName: 'Growth Tracker',
      nodeId: 'node-3',
      month: '2026-05-01',
      completenessPercentage: 25,
      complianceStatus: 'incomplete',
      taskId: 'task-1',
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining("'compliance_submission'"),
      expect.arrayContaining([TENANT, 'proj-1', 'node-3'])
    );
    expect(result.id).toBe('item-created-1');
  });
});

// ---------------------------------------------------------------------------
// createEscalationRecord
// ---------------------------------------------------------------------------

describe('createEscalationRecord', () => {
  test('inserts escalation with tenant_id and action_item_id in metadata', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({ rows: [{ id: 'esc-1' }] });

    const result = await svc.createEscalationRecord({
      tenantId: TENANT,
      taskId: 'task-1',
      actionItemId: 'item-1',
      reason: 'Action item overdue: Missing submission',
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('copilot.agent_escalations'),
      expect.arrayContaining([TENANT, 'Action item overdue: Missing submission'])
    );
    expect(result.id).toBe('esc-1');
  });
});

// ---------------------------------------------------------------------------
// runComplianceMonitor — full orchestration
// ---------------------------------------------------------------------------

describe('runComplianceMonitor', () => {
  const setupMocks = () => {
    // createTask
    mockAgentTask.createTask.mockResolvedValue({ id: 'task-phase3' });
    // createTaskStep — load, detect, escalate, snapshot
    mockAgentTask.createTaskStep.mockResolvedValue({ id: 'step-x' });
    mockAgentTask.setCurrentTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStatus.mockResolvedValue(null);
    mockAgentTask.createAgentError.mockResolvedValue(null);

    // loadActiveProjects → 1 project
    mockProjectFormFind.mockResolvedValue([
      { _id: 'pf-1', projectId: 'proj-1', name: 'Test Project' },
    ]);

    // loadIncompleteNodes → 1 incomplete node
    mockPostgresPool.query.mockImplementation((sql) => {
      if (sql.includes('event_compliance_tracking') && sql.includes("IN ('incomplete', 'partial')")) {
        return Promise.resolve({
          rows: [{ node_id: 'node-a', compliance_status: 'incomplete', completeness_percentage: '10.00' }],
        });
      }
      if (sql.includes('copilot.action_items') && sql.includes('entity_type')) {
        // hasOpenActionItemForNode → no existing item
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('INSERT INTO copilot.action_items')) {
        return Promise.resolve({ rows: [{ id: 'new-item-1' }] });
      }
      if (sql.includes('COUNT(*)') && sql.includes('event_compliance_tracking')) {
        // countAllNodes
        return Promise.resolve({
          rows: [{ total_nodes: 5, compliant_nodes: 3, partial_nodes: 1, incomplete_nodes: 1, avg_percentage: '60.00' }],
        });
      }
      if (sql.includes('copilot.action_items') && sql.includes('due_at < NOW()')) {
        // findOverdueActionItems → none
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('copilot.compliance_run_snapshots')) {
        return Promise.resolve({ rows: [{ id: 'snap-1' }] });
      }
      return Promise.resolve({ rows: [] });
    });
  };

  test('creates agent task, scans one project, creates action item, completes task', async () => {
    setupMocks();

    const result = await svc.runComplianceMonitor({ tenantId: TENANT });

    expect(mockAgentTask.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        workflowName: 'compliance_monitor',
        riskLevel: 'LOW',
      })
    );
    expect(result.taskId).toBe('task-phase3');
    expect(result.projectsScanned).toBe(1);
    expect(result.totalActionItemsCreated).toBe(1);
    expect(mockAgentTask.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', tenantId: TENANT })
    );
  });

  test('skips creating action item when duplicate already exists (dedup)', async () => {
    setupMocks();
    // Override: hasOpenActionItemForNode returns existing item
    mockPostgresPool.query.mockImplementation((sql) => {
      if (sql.includes('event_compliance_tracking') && sql.includes("IN ('incomplete', 'partial')")) {
        return Promise.resolve({
          rows: [{ node_id: 'node-a', compliance_status: 'incomplete', completeness_percentage: '10.00' }],
        });
      }
      if (sql.includes('copilot.action_items') && sql.includes('entity_type')) {
        // hasOpenActionItemForNode → existing open item
        return Promise.resolve({ rows: [{ id: 'existing-item' }] });
      }
      if (sql.includes('COUNT(*)') && sql.includes('event_compliance_tracking')) {
        return Promise.resolve({
          rows: [{ total_nodes: 1, compliant_nodes: 0, partial_nodes: 0, incomplete_nodes: 1, avg_percentage: '10.00' }],
        });
      }
      if (sql.includes('due_at < NOW()')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('copilot.compliance_run_snapshots')) {
        return Promise.resolve({ rows: [{ id: 'snap-2' }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await svc.runComplianceMonitor({ tenantId: TENANT });

    expect(result.totalActionItemsCreated).toBe(0);
  });

  test('marks task failed and does not swallow the error when project load fails', async () => {
    mockAgentTask.createTask.mockResolvedValue({ id: 'task-fail' });
    mockAgentTask.createTaskStep.mockResolvedValue({ id: 'step-fail' });
    mockAgentTask.setCurrentTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStep.mockResolvedValue(null);
    mockAgentTask.updateTaskStatus.mockResolvedValue(null);
    mockAgentTask.createAgentError.mockResolvedValue(null);
    mockProjectFormFind.mockRejectedValue(new Error('DB unavailable'));

    await expect(svc.runComplianceMonitor({ tenantId: TENANT })).rejects.toThrow('DB unavailable');

    expect(mockAgentTask.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', tenantId: TENANT })
    );
  });
});
