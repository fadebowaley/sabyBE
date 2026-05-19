const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const TASK_STATUS_TRANSITIONS = {
  queued: ['planning', 'waiting_approval', 'executing', 'failed', 'cancelled', 'escalated', 'completed'],
  planning: ['queued', 'waiting_approval', 'executing', 'failed', 'cancelled', 'escalated', 'completed'],
  waiting_approval: ['queued', 'executing', 'failed', 'cancelled', 'escalated', 'completed'],
  executing: ['waiting_approval', 'failed', 'escalated', 'completed', 'cancelled'],
  escalated: ['executing', 'failed', 'completed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

const STEP_STATUS_TRANSITIONS = TASK_STATUS_TRANSITIONS;

const normalizeRiskLevel = (riskLevel) => {
  const value = String(riskLevel || 'MEDIUM').trim().toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value)
    ? value
    : 'MEDIUM';
};

const asPlainObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const getDb = (client) => client || postgresPool;

const assertTenantId = (tenantId) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
};

const ensureTransitionAllowed = ({ kind, currentStatus, nextStatus }) => {
  if (!currentStatus || currentStatus === nextStatus) return;
  const transitions =
    kind === 'task' ? TASK_STATUS_TRANSITIONS : STEP_STATUS_TRANSITIONS;
  const allowedNext = transitions[currentStatus] || [];
  if (!allowedNext.includes(nextStatus)) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Invalid ${kind} status transition from ${currentStatus} to ${nextStatus}`
    );
  }
};

const createTask = async ({
  tenantId,
  requestedByUserId = null,
  source = 'system',
  workflowName = null,
  intent,
  goalText,
  status = 'queued',
  riskLevel = 'MEDIUM',
  priority = 0,
  correlationId = null,
  approvalId = null,
  contextJson = {},
  planJson = {},
  deadlineAt = null,
  client = null,
}) => {
  assertTenantId(tenantId);
  if (!intent) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'intent is required');
  }
  if (!goalText) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'goalText is required');
  }

  const db = getDb(client);
  const result = await db.query(
    `INSERT INTO copilot.agent_tasks (
      tenant_id, requested_by_user_id, source, workflow_name, intent, goal_text,
      status, risk_level, priority, correlation_id, approval_id, context_json,
      plan_json, deadline_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11,$12::jsonb,
      $13::jsonb,$14
    )
    RETURNING *`,
    [
      tenantId,
      requestedByUserId || null,
      source,
      workflowName || null,
      intent,
      goalText,
      status,
      normalizeRiskLevel(riskLevel),
      Number(priority || 0),
      correlationId || null,
      approvalId || null,
      JSON.stringify(asPlainObject(contextJson)),
      JSON.stringify(asPlainObject(planJson)),
      deadlineAt || null,
    ]
  );

  return result.rows[0];
};

const createTaskStep = async ({
  taskId,
  tenantId,
  stepIndex,
  title,
  description = null,
  status = 'queued',
  toolName = null,
  actionType = null,
  actionEventId = null,
  inputJson = {},
  outputJson = {},
  dependsOnStepIds = [],
  retryCount = 0,
  maxRetries = 3,
  errorMessage = null,
  client = null,
}) => {
  assertTenantId(tenantId);
  if (!taskId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'taskId is required');
  }
  if (!title) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'title is required');
  }

  const db = getDb(client);
  const result = await db.query(
    `INSERT INTO copilot.agent_task_steps (
      task_id, tenant_id, step_index, title, description, status, tool_name,
      action_type, action_event_id, input_json, output_json, depends_on_step_ids,
      retry_count, max_retries, error_message
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10::jsonb,$11::jsonb,$12::jsonb,
      $13,$14,$15
    )
    RETURNING *`,
    [
      taskId,
      tenantId,
      Number(stepIndex),
      title,
      description || null,
      status,
      toolName || null,
      actionType || null,
      actionEventId || null,
      JSON.stringify(asPlainObject(inputJson)),
      JSON.stringify(asPlainObject(outputJson)),
      JSON.stringify(Array.isArray(dependsOnStepIds) ? dependsOnStepIds : []),
      Number(retryCount || 0),
      Number(maxRetries || 3),
      errorMessage || null,
    ]
  );
  return result.rows[0];
};

const setCurrentTaskStep = async ({ taskId, stepId, client = null }) => {
  const db = getDb(client);
  const result = await db.query(
    `UPDATE copilot.agent_tasks
     SET current_step_id = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [taskId, stepId || null]
  );
  return result.rows[0] || null;
};

const getTaskStatus = async ({ taskId, tenantId, client = null }) => {
  const db = getDb(client);
  const result = await db.query(
    `SELECT status
     FROM copilot.agent_tasks
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [taskId, tenantId]
  );
  return result.rows[0]?.status || null;
};

const getStepStatus = async ({ stepId, tenantId, client = null }) => {
  const db = getDb(client);
  const result = await db.query(
    `SELECT status
     FROM copilot.agent_task_steps
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [stepId, tenantId]
  );
  return result.rows[0]?.status || null;
};

const updateTaskStatus = async ({
  taskId,
  tenantId,
  status,
  currentStepId,
  contextJson,
  planJson,
  deadlineAt,
  client = null,
}) => {
  assertTenantId(tenantId);
  if (!taskId || !status) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'taskId and status are required');
  }
  const currentStatus = await getTaskStatus({ taskId, tenantId, client });
  if (!currentStatus) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent task not found');
  }
  ensureTransitionAllowed({ kind: 'task', currentStatus, nextStatus: status });

  const db = getDb(client);
  const result = await db.query(
    `UPDATE copilot.agent_tasks
     SET status = $3::text,
         current_step_id = COALESCE($4, current_step_id),
         context_json = CASE WHEN $5::jsonb IS NULL THEN context_json ELSE $5::jsonb END,
         plan_json = CASE WHEN $6::jsonb IS NULL THEN plan_json ELSE $6::jsonb END,
         deadline_at = COALESCE($7, deadline_at),
         started_at = CASE
           WHEN $3::text IN ('planning', 'queued', 'waiting_approval', 'executing') AND started_at IS NULL
             THEN NOW()
           ELSE started_at
         END,
         completed_at = CASE WHEN $3::text = 'completed' THEN NOW() ELSE completed_at END,
         failed_at = CASE WHEN $3::text = 'failed' THEN NOW() ELSE failed_at END,
         escalated_at = CASE WHEN $3::text = 'escalated' THEN NOW() ELSE escalated_at END,
         updated_at = NOW()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [
      taskId,
      tenantId,
      status,
      currentStepId || null,
      contextJson === undefined ? null : JSON.stringify(asPlainObject(contextJson)),
      planJson === undefined ? null : JSON.stringify(asPlainObject(planJson)),
      deadlineAt || null,
    ]
  );
  return result.rows[0];
};

const updateTaskStep = async ({
  stepId,
  tenantId,
  status,
  actionEventId,
  outputJson,
  retryCount,
  errorMessage,
  client = null,
}) => {
  assertTenantId(tenantId);
  if (!stepId || !status) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'stepId and status are required');
  }
  const currentStatus = await getStepStatus({ stepId, tenantId, client });
  if (!currentStatus) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent task step not found');
  }
  ensureTransitionAllowed({ kind: 'step', currentStatus, nextStatus: status });

  const db = getDb(client);
  const result = await db.query(
    `UPDATE copilot.agent_task_steps
     SET status = $3::text,
         action_event_id = COALESCE($4, action_event_id),
         output_json = CASE WHEN $5::jsonb IS NULL THEN output_json ELSE $5::jsonb END,
         retry_count = COALESCE($6, retry_count),
         error_message = COALESCE($7, error_message),
         started_at = CASE
           WHEN $3::text IN ('planning', 'queued', 'waiting_approval', 'executing') AND started_at IS NULL
             THEN NOW()
           ELSE started_at
         END,
         completed_at = CASE WHEN $3::text = 'completed' THEN NOW() ELSE completed_at END,
         failed_at = CASE WHEN $3::text = 'failed' THEN NOW() ELSE failed_at END,
         updated_at = NOW()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [
      stepId,
      tenantId,
      status,
      actionEventId || null,
      outputJson === undefined ? null : JSON.stringify(asPlainObject(outputJson)),
      retryCount === undefined ? null : Number(retryCount),
      errorMessage || null,
    ]
  );
  return result.rows[0];
};

const createAgentError = async ({
  taskId = null,
  stepId = null,
  toolCallId = null,
  tenantId,
  errorType,
  errorCode = null,
  message,
  stackHash = null,
  recoverable = false,
  resolutionStatus = 'open',
  metadataJson = {},
  client = null,
}) => {
  assertTenantId(tenantId);
  if (!errorType || !message) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'errorType and message are required');
  }

  const db = getDb(client);
  const result = await db.query(
    `INSERT INTO copilot.agent_errors (
      task_id, step_id, tool_call_id, tenant_id, error_type, error_code,
      message, stack_hash, recoverable, resolution_status, metadata_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      $7,$8,$9,$10,$11::jsonb
    )
    RETURNING *`,
    [
      taskId || null,
      stepId || null,
      toolCallId || null,
      tenantId,
      errorType,
      errorCode || null,
      message,
      stackHash || null,
      Boolean(recoverable),
      resolutionStatus,
      JSON.stringify(asPlainObject(metadataJson)),
    ]
  );
  return result.rows[0];
};

const logAgentToolCall = async ({
  taskId = null,
  stepId = null,
  tenantId,
  userId = null,
  toolName,
  actionEventId = null,
  requestJson = {},
  responseJson = {},
  status = 'success',
  durationMs = null,
  inputHash = null,
  modelDecisionJson = {},
  policyDecisionJson = {},
  errorMessage = null,
  startedAt = null,
  completedAt = null,
  client = null,
}) => {
  assertTenantId(tenantId);
  if (!toolName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'toolName is required');
  }

  const db = getDb(client);
  const result = await db.query(
    `INSERT INTO copilot.agent_tool_calls (
      task_id, step_id, tenant_id, user_id, tool_name, action_event_id, request_json,
      response_json, status, duration_ms, input_hash, model_decision_json,
      policy_decision_json, error_message, started_at, completed_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7::jsonb,
      $8::jsonb,$9,$10,$11,$12::jsonb,
      $13::jsonb,$14,$15,$16
    )
    RETURNING *`,
    [
      taskId || null,
      stepId || null,
      tenantId,
      userId || null,
      toolName,
      actionEventId || null,
      JSON.stringify(asPlainObject(requestJson)),
      JSON.stringify(asPlainObject(responseJson)),
      status,
      durationMs == null ? null : Number(durationMs),
      inputHash || null,
      JSON.stringify(asPlainObject(modelDecisionJson)),
      JSON.stringify(asPlainObject(policyDecisionJson)),
      errorMessage || null,
      startedAt || null,
      completedAt || null,
    ]
  );
  return result.rows[0];
};

const getStepByActionEventId = async ({ tenantId, actionEventId, client = null }) => {
  assertTenantId(tenantId);
  const db = getDb(client);
  const result = await db.query(
    `SELECT *
     FROM copilot.agent_task_steps
     WHERE tenant_id = $1
       AND action_event_id = $2
     ORDER BY created_at ASC
     LIMIT 1`,
    [tenantId, actionEventId]
  );
  return result.rows[0] || null;
};

const maybeCompleteTaskFromSteps = async ({ taskId, tenantId, client = null }) => {
  const db = getDb(client);
  const countsResult = await db.query(
    `SELECT
       COUNT(*)::int AS total_steps,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_steps,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_steps,
       COUNT(*) FILTER (WHERE status IN ('queued', 'planning', 'waiting_approval', 'executing', 'escalated'))::int AS active_steps
     FROM copilot.agent_task_steps
     WHERE task_id = $1
       AND tenant_id = $2`,
    [taskId, tenantId]
  );
  const counts = countsResult.rows[0] || {};

  if (Number(counts.failed_steps || 0) > 0) {
    return updateTaskStatus({
      taskId,
      tenantId,
      status: 'failed',
      client,
    });
  }
  if (
    Number(counts.total_steps || 0) > 0 &&
    Number(counts.total_steps || 0) === Number(counts.completed_steps || 0)
  ) {
    return updateTaskStatus({
      taskId,
      tenantId,
      status: 'completed',
      client,
    });
  }
  return null;
};

const listTasks = async ({ tenantId, status, source, limit = 50 }) => {
  assertTenantId(tenantId);
  const values = [tenantId];
  let where = 'WHERE t.tenant_id = $1';

  if (status) {
    values.push(status);
    where += ` AND t.status = $${values.length}`;
  }
  if (source) {
    values.push(source);
    where += ` AND t.source = $${values.length}`;
  }
  values.push(Math.max(1, Math.min(200, Number(limit) || 50)));

  const result = await postgresPool.query(
    `SELECT
       t.*,
       COUNT(s.id)::int AS step_count,
       COUNT(s.id) FILTER (WHERE s.status = 'completed')::int AS completed_step_count,
       COUNT(s.id) FILTER (WHERE s.status = 'failed')::int AS failed_step_count
     FROM copilot.agent_tasks t
     LEFT JOIN copilot.agent_task_steps s
       ON s.task_id = t.id
     ${where}
     GROUP BY t.id
     ORDER BY t.created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
};

const getTaskById = async ({ tenantId, taskId }) => {
  assertTenantId(tenantId);
  const taskResult = await postgresPool.query(
    `SELECT *
     FROM copilot.agent_tasks
     WHERE tenant_id = $1
       AND id = $2
     LIMIT 1`,
    [tenantId, taskId]
  );
  const task = taskResult.rows[0];
  if (!task) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Agent task not found');
  }

  const [steps, toolCalls, errors, escalations] = await Promise.all([
    postgresPool.query(
      `SELECT *
       FROM copilot.agent_task_steps
       WHERE tenant_id = $1
         AND task_id = $2
       ORDER BY step_index ASC, created_at ASC`,
      [tenantId, taskId]
    ),
    postgresPool.query(
      `SELECT *
       FROM copilot.agent_tool_calls
       WHERE tenant_id = $1
         AND task_id = $2
       ORDER BY created_at ASC`,
      [tenantId, taskId]
    ),
    postgresPool.query(
      `SELECT *
       FROM copilot.agent_errors
       WHERE tenant_id = $1
         AND task_id = $2
       ORDER BY created_at ASC`,
      [tenantId, taskId]
    ),
    postgresPool.query(
      `SELECT *
       FROM copilot.agent_escalations
       WHERE tenant_id = $1
         AND task_id = $2
       ORDER BY created_at ASC`,
      [tenantId, taskId]
    ),
  ]);

  return {
    ...task,
    steps: steps.rows,
    toolCalls: toolCalls.rows,
    errors: errors.rows,
    escalations: escalations.rows,
  };
};

module.exports = {
  createTask,
  createTaskStep,
  setCurrentTaskStep,
  updateTaskStatus,
  updateTaskStep,
  createAgentError,
  logAgentToolCall,
  getStepByActionEventId,
  maybeCompleteTaskFromSteps,
  listTasks,
  getTaskById,
};
