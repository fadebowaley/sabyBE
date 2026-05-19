const agentTaskService = require('./agentTask.service');
const { hashPayload } = require('./copilotPayloadHash.service');

const beginToolExecutionWorkflow = async ({
  tenantId,
  requestedByUserId = null,
  tool,
  payload = {},
  correlationId = null,
  source = 'tool_runtime',
}) => {
  const task = await agentTaskService.createTask({
    tenantId,
    requestedByUserId,
    source,
    workflowName: 'tool_execution',
    intent: tool.action_type
      ? `tool:${tool.action_type}`
      : `tool:${tool.tool_name}`,
    goalText: `Execute tool ${tool.tool_name}`,
    status: 'planning',
    riskLevel: tool.risk_level || 'MEDIUM',
    priority: Number(payload.priority || 0),
    correlationId,
    contextJson: {
      toolName: tool.tool_name,
      actionType: tool.action_type || null,
      payload,
    },
    planJson: {
      steps: [
        {
          stepIndex: 1,
          title: `Execute ${tool.tool_name}`,
          toolName: tool.tool_name,
          actionType: tool.action_type || null,
        },
      ],
    },
  });

  const step = await agentTaskService.createTaskStep({
    taskId: task.id,
    tenantId,
    stepIndex: 1,
    title: `Execute ${tool.tool_name}`,
    description: tool.description || null,
    status: 'planning',
    toolName: tool.tool_name,
    actionType: tool.action_type || null,
    inputJson: payload,
  });

  await agentTaskService.setCurrentTaskStep({
    taskId: task.id,
    stepId: step.id,
  });

  return {
    task,
    step,
    inputHash: hashPayload(payload || {}),
  };
};

const recordToolCall = async ({
  workflowContext,
  tenantId,
  userId = null,
  toolName,
  actionEventId = null,
  requestJson = {},
  responseJson = {},
  status,
  durationMs = null,
  policyDecisionJson = {},
  errorMessage = null,
  startedAt = null,
  completedAt = null,
}) => {
  return agentTaskService.logAgentToolCall({
    taskId: workflowContext?.task?.id || null,
    stepId: workflowContext?.step?.id || null,
    tenantId,
    userId,
    toolName,
    actionEventId,
    requestJson,
    responseJson,
    status,
    durationMs,
    inputHash: workflowContext?.inputHash || null,
    policyDecisionJson,
    errorMessage,
    startedAt,
    completedAt,
  });
};

const markWorkflowWaitingApproval = async ({
  workflowContext,
  tenantId,
  responseJson = {},
}) => {
  await agentTaskService.updateTaskStep({
    stepId: workflowContext.step.id,
    tenantId,
    status: 'waiting_approval',
    outputJson: responseJson,
  });
  await agentTaskService.updateTaskStatus({
    taskId: workflowContext.task.id,
    tenantId,
    status: 'waiting_approval',
    currentStepId: workflowContext.step.id,
  });
};

const markWorkflowFailed = async ({
  workflowContext,
  tenantId,
  responseJson = {},
  errorMessage,
  errorCode = null,
  errorType = 'tool_runtime',
  recoverable = false,
}) => {
  await agentTaskService.updateTaskStep({
    stepId: workflowContext.step.id,
    tenantId,
    status: 'failed',
    outputJson: responseJson,
    errorMessage,
  });
  await agentTaskService.updateTaskStatus({
    taskId: workflowContext.task.id,
    tenantId,
    status: 'failed',
    currentStepId: workflowContext.step.id,
  });
  await agentTaskService.createAgentError({
    taskId: workflowContext.task.id,
    stepId: workflowContext.step.id,
    tenantId,
    errorType,
    errorCode,
    message: errorMessage,
    recoverable,
    metadataJson: responseJson,
  });
};

const markWorkflowExecuting = async ({ workflowContext, tenantId }) => {
  await agentTaskService.updateTaskStep({
    stepId: workflowContext.step.id,
    tenantId,
    status: 'executing',
  });
  await agentTaskService.updateTaskStatus({
    taskId: workflowContext.task.id,
    tenantId,
    status: 'executing',
    currentStepId: workflowContext.step.id,
  });
};

const queueWorkflowActionEvent = async ({
  workflowContext,
  tenantId,
  actionEventId,
  responseJson = {},
}) => {
  await agentTaskService.updateTaskStep({
    stepId: workflowContext.step.id,
    tenantId,
    status: 'waiting_approval',
    actionEventId,
    outputJson: responseJson,
  });
  await agentTaskService.updateTaskStatus({
    taskId: workflowContext.task.id,
    tenantId,
    status: 'waiting_approval',
    currentStepId: workflowContext.step.id,
  });
};

const completeImmediateWorkflow = async ({
  workflowContext,
  tenantId,
  responseJson = {},
}) => {
  await agentTaskService.updateTaskStep({
    stepId: workflowContext.step.id,
    tenantId,
    status: 'completed',
    outputJson: responseJson,
  });
  await agentTaskService.updateTaskStatus({
    taskId: workflowContext.task.id,
    tenantId,
    status: 'completed',
    currentStepId: workflowContext.step.id,
  });
};

const markActionEventExecuting = async ({
  tenantId,
  actionEventId,
  client = null,
}) => {
  const step = await agentTaskService.getStepByActionEventId({
    tenantId,
    actionEventId,
    client,
  });
  if (!step) return null;

  await agentTaskService.updateTaskStep({
    stepId: step.id,
    tenantId,
    status: 'executing',
    client,
  });
  await agentTaskService.updateTaskStatus({
    taskId: step.task_id,
    tenantId,
    status: 'executing',
    currentStepId: step.id,
    client,
  });
  return step;
};

const completeActionEvent = async ({
  tenantId,
  actionEventId,
  outputJson = {},
  client = null,
}) => {
  const step = await agentTaskService.getStepByActionEventId({
    tenantId,
    actionEventId,
    client,
  });
  if (!step) return null;

  await agentTaskService.updateTaskStep({
    stepId: step.id,
    tenantId,
    status: 'completed',
    actionEventId,
    outputJson,
    client,
  });
  await agentTaskService.maybeCompleteTaskFromSteps({
    taskId: step.task_id,
    tenantId,
    client,
  });
  return step;
};

const failActionEvent = async ({
  tenantId,
  actionEventId,
  outputJson = {},
  errorMessage,
  errorCode = 'ACTION_EVENT_FAILED',
  client = null,
}) => {
  const step = await agentTaskService.getStepByActionEventId({
    tenantId,
    actionEventId,
    client,
  });
  if (!step) return null;

  await agentTaskService.updateTaskStep({
    stepId: step.id,
    tenantId,
    status: 'failed',
    actionEventId,
    outputJson,
    errorMessage,
    client,
  });
  await agentTaskService.updateTaskStatus({
    taskId: step.task_id,
    tenantId,
    status: 'failed',
    currentStepId: step.id,
    client,
  });
  await agentTaskService.createAgentError({
    taskId: step.task_id,
    stepId: step.id,
    tenantId,
    errorType: 'action_worker',
    errorCode,
    message: errorMessage,
    recoverable: true,
    metadataJson: outputJson,
    client,
  });
  return step;
};

module.exports = {
  beginToolExecutionWorkflow,
  recordToolCall,
  markWorkflowWaitingApproval,
  markWorkflowFailed,
  markWorkflowExecuting,
  queueWorkflowActionEvent,
  completeImmediateWorkflow,
  markActionEventExecuting,
  completeActionEvent,
  failActionEvent,
};
