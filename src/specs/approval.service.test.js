const mockWorkflowService = {
  getWorkflows: jest.fn(),
  getPendingStepsForActor: jest.fn(),
  actionStep: jest.fn(),
};

const mockApprovalNotificationService = {
  notifyApprovalAction: jest.fn(),
};

const mockProjectForm = {
  findOne: jest.fn(),
};

const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../services/workflow.service', () => mockWorkflowService);
jest.mock('../services/approvalNotification.service', () => mockApprovalNotificationService);
jest.mock('../models/projectForm.model', () => mockProjectForm);
jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const approvalService = require('../services/approval.service');

describe('approval.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('projects submission approval status from in-progress workflow levels', async () => {
    mockWorkflowService.getWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        workflow_def_id: 'wf-def-1',
        workflow_name: 'Main Approval',
        workflow_type: 'approval',
        status: 'in_progress',
        current_step_id: 'step-2',
        submitted_by_user_id: 'user-1',
        submitted_by_user_name: 'Ada',
        submitted_by_user_email: 'ada@example.com',
        initiated_at: '2026-06-30T10:00:00.000Z',
        completed_at: null,
        steps: [
          {
            id: 'approval-1',
            workflow_id: 'wf-1',
            step_def_id: 'step-1',
            step_name: 'Level 1',
            step_order: 0,
            action_type: 'APPROVE',
            status: 'approved',
            assignee_type: 'role',
            assignee_role: 'manager',
            assignee_roles: ['manager'],
            assignee_users: [],
          },
          {
            id: 'approval-2',
            workflow_id: 'wf-1',
            step_def_id: 'step-2',
            step_name: 'Level 2',
            step_order: 1,
            action_type: 'APPROVE',
            status: 'in_progress',
            assignee_type: 'user',
            assignee_role: null,
            assignee_roles: [],
            assignee_users: ['user-2'],
          },
        ],
      },
    ]);

    const result = await approvalService.getSubmissionApproval({
      submissionId: 'submission-1',
      tenantId: 'tenant-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        submissionId: 'submission-1',
        approvalRequired: true,
        status: 'Awaiting Level 2',
        currentLevel: 2,
        workflowCount: 1,
      })
    );
    expect(result.workflows[0].levels).toHaveLength(2);
    expect(result.workflows[0].levels[1]).toEqual(
      expect.objectContaining({
        approvalId: 'approval-2',
        level: 2,
        status: 'Pending',
      })
    );
  });

  test('builds approval queue from role or user-assigned pending steps', async () => {
    mockWorkflowService.getPendingStepsForActor.mockResolvedValue([
      {
        id: 'approval-2',
        workflow_id: 'wf-1',
        submission_id: 'submission-1',
        workflow_name: 'Main Approval',
        workflow_type: 'approval',
        step_order: 1,
        step_name: 'Level 2',
        action_type: 'APPROVE',
        status: 'in_progress',
        due_at: '2026-07-01T10:00:00.000Z',
        assignee_type: 'user',
        assignee_role: null,
        assignee_roles: [],
        assignee_users: ['user-2'],
        submitted_by_user_name: 'Ada',
        submitted_by_user_email: 'ada@example.com',
      },
    ]);

    const result = await approvalService.getApprovalQueue({
      tenantId: 'tenant-1',
      role: 'manager',
      userId: 'user-2',
      limit: 20,
    });

    expect(mockWorkflowService.getPendingStepsForActor).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      role: 'manager',
      roles: [],
      userId: 'user-2',
      limit: 20,
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        approvalId: 'approval-2',
        submissionId: 'submission-1',
        level: 2,
        status: 'Pending',
      })
    );
  });

  test('acts on approval by resolving workflow context and returning refreshed submission approval', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'approval-2',
          workflow_id: 'wf-1',
          submission_id: 'submission-1',
          step_def_id: 'step-2',
          tenant_id: 'tenant-1',
          project_id: 'project-1',
          workflow_def_id: 'wf-def-1',
          workflow_status: 'in_progress',
        },
      ],
    });
    mockProjectForm.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        capabilities: {
          experience: {
            workflow: {
              workflows: [{ id: 'wf-def-1', steps: [{ id: 'step-2' }] }],
            },
          },
        },
      }),
    });
    mockWorkflowService.actionStep.mockResolvedValue({
      workflowStatus: 'approved',
    });
    mockWorkflowService.getWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        workflow_def_id: 'wf-def-1',
        workflow_name: 'Main Approval',
        workflow_type: 'approval',
        status: 'approved',
        current_step_id: null,
        steps: [],
      },
    ]);

    const result = await approvalService.actOnApproval({
      approvalId: 'approval-2',
      tenantId: 'tenant-1',
      actor: {
        userId: 'user-9',
        userName: 'Reviewer',
        userEmail: 'reviewer@example.com',
      },
      action: 'approve',
      comments: 'Looks good',
    });

    expect(mockWorkflowService.actionStep).toHaveBeenCalledWith(
      'wf-1',
      'step-2',
      'approved',
      expect.objectContaining({ userId: 'user-9' }),
      'Looks good',
      expect.objectContaining({ id: 'wf-def-1' })
    );
    expect(result.submissionApproval).toEqual(
      expect.objectContaining({
        submissionId: 'submission-1',
        status: 'Approved',
      })
    );
    expect(mockApprovalNotificationService.notifyApprovalAction).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        submissionId: 'submission-1',
        action: 'approve',
      })
    );
  });

  test('maps request-changes approval actions to changes_requested workflow actions', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'approval-2',
          workflow_id: 'wf-1',
          submission_id: 'submission-1',
          step_def_id: 'step-2',
          tenant_id: 'tenant-1',
          project_id: 'project-1',
          workflow_def_id: 'wf-def-1',
          workflow_status: 'in_progress',
        },
      ],
    });
    mockProjectForm.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        capabilities: {
          experience: {
            workflow: {
              workflows: [{ id: 'wf-def-1', steps: [{ id: 'step-2' }] }],
            },
          },
        },
      }),
    });
    mockWorkflowService.actionStep.mockResolvedValue({
      workflowStatus: 'changes_requested',
    });
    mockWorkflowService.getWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        workflow_def_id: 'wf-def-1',
        workflow_name: 'Main Approval',
        workflow_type: 'approval',
        status: 'changes_requested',
        current_step_id: null,
        steps: [],
      },
    ]);

    const result = await approvalService.actOnApproval({
      approvalId: 'approval-2',
      tenantId: 'tenant-1',
      actor: {
        userId: 'user-9',
        userName: 'Reviewer',
        userEmail: 'reviewer@example.com',
      },
      action: 'request_changes',
      comments: 'Fix the numbers',
    });

    expect(mockWorkflowService.actionStep).toHaveBeenCalledWith(
      'wf-1',
      'step-2',
      'changes_requested',
      expect.objectContaining({ userId: 'user-9' }),
      'Fix the numbers',
      expect.objectContaining({ id: 'wf-def-1' })
    );
    expect(result.submissionApproval).toEqual(
      expect.objectContaining({
        submissionId: 'submission-1',
        status: 'Changes Requested',
      })
    );
  });

  test('bulk approval returns per-item success and failure results without aborting the batch', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'approval-1',
            workflow_id: 'wf-1',
            submission_id: 'submission-1',
            step_def_id: 'step-1',
            tenant_id: 'tenant-1',
            project_id: 'project-1',
            workflow_def_id: 'wf-def-1',
            workflow_status: 'in_progress',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });
    mockProjectForm.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        capabilities: {
          experience: {
            workflow: {
              workflows: [{ id: 'wf-def-1', steps: [{ id: 'step-1' }] }],
            },
          },
        },
      }),
    });
    mockWorkflowService.actionStep.mockResolvedValue({
      workflowStatus: 'approved',
    });
    mockWorkflowService.getWorkflows.mockResolvedValue([
      {
        id: 'wf-1',
        workflow_def_id: 'wf-def-1',
        workflow_name: 'Main Approval',
        workflow_type: 'approval',
        status: 'approved',
        current_step_id: null,
        steps: [],
      },
    ]);

    const result = await approvalService.actOnApprovalsBulk({
      approvalIds: ['approval-1', 'approval-404'],
      tenantId: 'tenant-1',
      actor: {
        userId: 'user-9',
        userName: 'Reviewer',
        userEmail: 'reviewer@example.com',
      },
      action: 'approve',
      comments: 'Bulk go-ahead',
    });

    expect(result).toEqual(
      expect.objectContaining({
        action: 'approve',
        total: 2,
        succeeded: 1,
        failed: 1,
      })
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        approvalId: 'approval-1',
        success: true,
        submissionId: 'submission-1',
      })
    );
    expect(result.results[1]).toEqual(
      expect.objectContaining({
        approvalId: 'approval-404',
        success: false,
        error: expect.objectContaining({
          message: 'Approval task not found',
          statusCode: 404,
        }),
      })
    );
  });
});
