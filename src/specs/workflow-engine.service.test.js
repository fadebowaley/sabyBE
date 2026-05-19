const mockAgentTaskService = {
  createTask: jest.fn(),
  createTaskStep: jest.fn(),
  setCurrentTaskStep: jest.fn(),
  logAgentToolCall: jest.fn(),
  updateTaskStep: jest.fn(),
  updateTaskStatus: jest.fn(),
  createAgentError: jest.fn(),
  getStepByActionEventId: jest.fn(),
  maybeCompleteTaskFromSteps: jest.fn(),
};

jest.mock('../services/agentTask.service', () => mockAgentTaskService);

const workflowEngineService = require('../services/workflowEngine.service');

describe('workflowEngine.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentTaskService.createTask.mockResolvedValue({
      id: 'task-1',
      tenant_id: 'tenant-1',
    });
    mockAgentTaskService.createTaskStep.mockResolvedValue({
      id: 'step-1',
      task_id: 'task-1',
      tenant_id: 'tenant-1',
    });
    mockAgentTaskService.setCurrentTaskStep.mockResolvedValue({});
    mockAgentTaskService.logAgentToolCall.mockResolvedValue({ id: 'call-1' });
    mockAgentTaskService.updateTaskStep.mockResolvedValue({});
    mockAgentTaskService.updateTaskStatus.mockResolvedValue({});
    mockAgentTaskService.createAgentError.mockResolvedValue({ id: 'err-1' });
    mockAgentTaskService.getStepByActionEventId.mockResolvedValue({
      id: 'step-1',
      task_id: 'task-1',
      tenant_id: 'tenant-1',
    });
    mockAgentTaskService.maybeCompleteTaskFromSteps.mockResolvedValue({});
  });

  test('begins tool execution workflow with task and first step', async () => {
    const workflow = await workflowEngineService.beginToolExecutionWorkflow({
      tenantId: 'tenant-1',
      requestedByUserId: 'user-1',
      tool: {
        tool_name: 'reset_password_tool',
        action_type: 'reset_password',
        risk_level: 'CRITICAL',
        description: 'Reset a password',
      },
      payload: {
        actionPayload: {
          email: 'person@example.com',
        },
      },
      correlationId: '11111111-1111-4111-8111-111111111111',
    });

    expect(mockAgentTaskService.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        workflowName: 'tool_execution',
        intent: 'tool:reset_password',
        riskLevel: 'CRITICAL',
      })
    );
    expect(mockAgentTaskService.createTaskStep).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        toolName: 'reset_password_tool',
        actionType: 'reset_password',
      })
    );
    expect(workflow).toEqual(
      expect.objectContaining({
        task: expect.objectContaining({ id: 'task-1' }),
        step: expect.objectContaining({ id: 'step-1' }),
        inputHash: expect.any(String),
      })
    );
  });

  test('queues workflow action event and updates task state', async () => {
    await workflowEngineService.queueWorkflowActionEvent({
      workflowContext: {
        task: { id: 'task-1' },
        step: { id: 'step-1' },
      },
      tenantId: 'tenant-1',
      actionEventId: 'event-1',
      responseJson: { executed: true },
    });

    expect(mockAgentTaskService.updateTaskStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: 'step-1',
        status: 'queued',
        actionEventId: 'event-1',
      })
    );
    expect(mockAgentTaskService.updateTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        status: 'queued',
      })
    );
  });

  test('fails action event and records structured error', async () => {
    await workflowEngineService.failActionEvent({
      tenantId: 'tenant-1',
      actionEventId: 'event-1',
      outputJson: { error: 'boom' },
      errorMessage: 'boom',
    });

    expect(mockAgentTaskService.updateTaskStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: 'step-1',
        status: 'failed',
        actionEventId: 'event-1',
      })
    );
    expect(mockAgentTaskService.createAgentError).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        stepId: 'step-1',
        tenantId: 'tenant-1',
        errorType: 'action_worker',
      })
    );
  });
});
