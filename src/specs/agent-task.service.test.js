const httpStatus = require('http-status');

const mockPostgresPool = {
  query: jest.fn(),
};

jest.mock('../config/postgres', () => ({
  postgresPool: mockPostgresPool,
}));

const agentTaskService = require('../services/agentTask.service');

describe('agentTask.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates an agent task with normalized risk level', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ id: 'task-1', risk_level: 'MEDIUM' }],
    });

    const task = await agentTaskService.createTask({
      tenantId: 'tenant-1',
      intent: 'tool:reset_password',
      goalText: 'Execute tool reset_password_tool',
      riskLevel: 'not-real',
    });

    expect(mockPostgresPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO copilot.agent_tasks'),
      expect.arrayContaining(['tenant-1', null, 'system', null, 'tool:reset_password'])
    );
    expect(task).toEqual({ id: 'task-1', risk_level: 'MEDIUM' });
  });

  test('rejects invalid task status transitions', async () => {
    mockPostgresPool.query.mockResolvedValueOnce({
      rows: [{ status: 'completed' }],
    });

    await expect(
      agentTaskService.updateTaskStatus({
        taskId: 'task-1',
        tenantId: 'tenant-1',
        status: 'executing',
      })
    ).rejects.toMatchObject({
      statusCode: httpStatus.CONFLICT,
      message: expect.stringContaining('Invalid task status transition'),
    });
  });

  test('returns task detail with steps, tool calls, errors, and escalations', async () => {
    mockPostgresPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 'task-1', tenant_id: 'tenant-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'step-1', task_id: 'task-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'call-1', task_id: 'task-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'err-1', task_id: 'task-1' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'esc-1', task_id: 'task-1' }],
      });

    const task = await agentTaskService.getTaskById({
      tenantId: 'tenant-1',
      taskId: 'task-1',
    });

    expect(task).toEqual(
      expect.objectContaining({
        id: 'task-1',
        steps: [{ id: 'step-1', task_id: 'task-1' }],
        toolCalls: [{ id: 'call-1', task_id: 'task-1' }],
        errors: [{ id: 'err-1', task_id: 'task-1' }],
        escalations: [{ id: 'esc-1', task_id: 'task-1' }],
      })
    );
  });
});
