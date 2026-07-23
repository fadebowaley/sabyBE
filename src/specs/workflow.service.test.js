const mockPostgresPool = {
  query: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

jest.mock('../config/logger', () => mockLogger);

const workflowService = require('../services/workflow.service');

describe('workflow.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('initWorkflows is idempotent for existing approved workflow instances', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'wf-existing',
          workflow_def_id: 'wf-def-1',
          workflow_name: 'Existing Approval',
          status: 'approved',
        },
      ],
    });

    const result = await workflowService.initWorkflows(
      {
        id: 'submission-1',
        tenant_id: 'tenant-1',
      },
      [
        {
          id: 'wf-def-1',
          name: 'Existing Approval',
          enabled: true,
          triggerOn: 'submission',
          steps: [{ id: 'step-1', stepOrder: 0 }],
        },
      ],
      {}
    );

    expect(result).toEqual([
      expect.objectContaining({
        workflowId: 'wf-existing',
        workflowDefId: 'wf-def-1',
        existing: true,
        status: 'approved',
      }),
    ]);
    expect(
      mockPostgresPool.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('UPDATE form_submissions') &&
          Array.isArray(params) &&
          params[0] === 'pending_approval'
      )
    ).toBe(false);
  });

  test('initWorkflows marks submission pending approval when new active workflow is created', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'step-instance-1',
            step_def_id: 'step-1',
            step_name: 'Level 1',
            action_type: 'APPROVE',
            status: 'in_progress',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await workflowService.initWorkflows(
      {
        id: 'submission-1',
        tenant_id: 'tenant-1',
        project_id: 'project-1',
        form_id: 'form-1',
      },
      [
        {
          id: 'wf-def-1',
          name: 'Main Approval',
          enabled: true,
          triggerOn: 'submission',
          steps: [
            {
              id: 'step-1',
              name: 'Level 1',
              stepOrder: 0,
              actionType: 'APPROVE',
              assigneeType: 'role',
              assigneeRole: 'manager',
              sla: { hours: 24 },
            },
          ],
        },
      ],
      {}
    );

    expect(
      mockPostgresPool.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('UPDATE form_submissions') &&
          Array.isArray(params) &&
          params[0] === 'pending_approval' &&
          params[1] === 'submission-1'
      )
    ).toBe(true);
  });

  test('actionStep rejects actors that are not assigned to the in-progress approval step', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'wf-1', submission_id: 'submission-1' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'step-instance-1',
            workflow_id: 'wf-1',
            step_def_id: 'step-1',
            status: 'in_progress',
            assignee_type: 'role',
            assignee_role: 'manager',
            assignee_roles: ['manager'],
            assignee_users: [],
          },
        ],
      });

    await expect(
      workflowService.actionStep(
        'wf-1',
        'step-1',
        'approved',
        {
          userId: 'user-2',
          role: 'finance',
        },
        null,
        {
          steps: [{ id: 'step-1', stepOrder: 0 }],
        }
      )
    ).rejects.toMatchObject({
      message: 'You are not allowed to action this approval step',
    });
  });

  test('actionStep can request changes and mark the submission accordingly', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'wf-1', submission_id: 'submission-1' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'step-instance-1',
            workflow_id: 'wf-1',
            step_def_id: 'step-1',
            status: 'in_progress',
            assignee_type: 'role',
            assignee_role: 'manager',
            assignee_roles: ['manager'],
            assignee_users: [],
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const result = await workflowService.actionStep(
      'wf-1',
      'step-1',
      'changes_requested',
      {
        userId: 'user-1',
        userName: 'Manager',
        userEmail: 'manager@example.com',
        role: 'manager',
      },
      'Please update the attachment',
      {
        steps: [{ id: 'step-1', stepOrder: 0 }],
      }
    );

    expect(result).toEqual({
      workflowStatus: 'changes_requested',
      stepStatus: 'changes_requested',
    });
    expect(
      mockPostgresPool.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes('UPDATE submission_workflows') &&
          String(sql).includes("status = 'changes_requested'")
      )
    ).toBe(true);
    expect(
      mockPostgresPool.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('UPDATE form_submissions') &&
          Array.isArray(params) &&
          params[0] === 'changes_requested' &&
          params[1] === 'submission-1'
      )
    ).toBe(true);
  });

  test('actionStep can escalate an approval step to a configured role', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'wf-1', submission_id: 'submission-1' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'step-instance-1',
            workflow_id: 'wf-1',
            step_def_id: 'step-1',
            status: 'in_progress',
            assignee_type: 'role',
            assignee_role: 'manager',
            assignee_roles: ['manager'],
            assignee_users: [],
          },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const result = await workflowService.actionStep(
      'wf-1',
      'step-1',
      'escalated',
      {
        userId: 'user-1',
        userName: 'Manager',
        userEmail: 'manager@example.com',
        role: 'manager',
      },
      'Escalating to finance lead',
      {
        steps: [
          {
            id: 'step-1',
            stepOrder: 0,
            escalationType: 'role',
            escalationRoles: ['finance_lead'],
          },
        ],
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        workflowStatus: 'escalated',
        stepStatus: 'in_progress',
        reassignedTo: expect.objectContaining({
          type: 'role',
          role: 'finance_lead',
        }),
      })
    );
    expect(
      mockPostgresPool.query.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes('UPDATE submission_workflow_steps') &&
          Array.isArray(params) &&
          params[0] === 'role' &&
          params[1] === 'finance_lead'
      )
    ).toBe(true);
    expect(
      mockPostgresPool.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes('UPDATE submission_workflows') &&
          String(sql).includes("status = 'escalated'")
      )
    ).toBe(true);
  });
});
