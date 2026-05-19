const crypto = require('crypto');
const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const copilotActionService = require('./copilotAction.service');
const copilotEntityResolverService = require('./copilotEntityResolver.service');
const { validateToolPayload } = require('./copilotToolSchema.service');
const copilotPolicyDecisionService = require('./copilotPolicyDecision.service');
const copilotApprovalService = require('./copilotApproval.service');
const workflowEngineService = require('./workflowEngine.service');

const DEFAULT_LIMIT = 50;

const normalizeLimit = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, 200);
};

const listTools = async ({ enabledOnly = true } = {}) => {
  const where = enabledOnly ? 'WHERE enabled = TRUE' : '';
  const result = await postgresPool.query(
    `SELECT id, tool_name, description, category, action_type, enabled,
            requires_approval, reversible, timeout_ms, schema_json,
            risk_level, input_schema_json, output_schema_json,
            required_permissions, tenant_scope_required,
            idempotency_key_required, audit_required, retry_policy,
            rollback_strategy, metadata
     FROM copilot.tool_registry
     ${where}
     ORDER BY tool_name ASC`
  );
  return result.rows;
};

const getToolByName = async (toolName) => {
  const result = await postgresPool.query(
    `SELECT id, tool_name, description, category, action_type, enabled,
            requires_approval, reversible, timeout_ms, schema_json,
            risk_level, input_schema_json, output_schema_json,
            required_permissions, tenant_scope_required,
            idempotency_key_required, audit_required, retry_policy,
            rollback_strategy, metadata
     FROM copilot.tool_registry
     WHERE tool_name = $1
     LIMIT 1`,
    [toolName]
  );
  return result.rows[0] || null;
};

const logToolCall = async ({
  tenantId,
  userId,
  toolName,
  actionEventId,
  requestJson,
  responseJson,
  status,
  durationMs,
  errorMessage,
}) => {
  await postgresPool.query(
    `INSERT INTO copilot.tool_call_logs (
       tenant_id, user_id, tool_name, action_event_id, request_json, response_json, status, duration_ms, error_message
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)`,
    [
      tenantId,
      userId || null,
      toolName,
      actionEventId || null,
      JSON.stringify(requestJson || {}),
      JSON.stringify(responseJson || {}),
      status,
      durationMs || null,
      errorMessage || null,
    ]
  );
};

const resolveEntityTypeForAction = async (actionType) => {
  const result = await postgresPool.query(
    `SELECT entity_type
     FROM copilot.action_catalog
     WHERE action_type = $1
     LIMIT 1`,
    [actionType]
  );
  return result.rows[0]?.entity_type || null;
};

const tryAcquireLock = async ({
  tenantId,
  lockKey,
  holderId,
  ttlSeconds,
  metadata = {},
}) => {
  const result = await postgresPool.query(
    `INSERT INTO copilot.tool_call_locks (
       tenant_id, lock_key, holder_id, expires_at, metadata
     ) VALUES (
       $1, $2, $3, NOW() + ($4::text || ' seconds')::interval, $5::jsonb
     )
     ON CONFLICT (tenant_id, lock_key)
     DO UPDATE SET
       holder_id = EXCLUDED.holder_id,
       acquired_at = NOW(),
       expires_at = EXCLUDED.expires_at,
       metadata = EXCLUDED.metadata
     WHERE copilot.tool_call_locks.expires_at <= NOW()
     RETURNING id`,
    [tenantId, lockKey, holderId, ttlSeconds, JSON.stringify(metadata || {})]
  );

  return Boolean(result.rows[0]);
};

const releaseLock = async ({ tenantId, lockKey, holderId }) => {
  await postgresPool.query(
    `DELETE FROM copilot.tool_call_locks
     WHERE tenant_id = $1
       AND lock_key = $2
       AND holder_id = $3`,
    [tenantId, lockKey, holderId]
  );
};

const executeToolCall = async ({
  tenantId,
  userId,
  roleIds,
  isOwner,
  toolName,
  payload = {},
  lockKey,
  lockTtlSec = 30,
  approvalToken,
  correlationId = null,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const tool = await getToolByName(toolName);
  if (!tool || !tool.enabled) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tool not found or disabled');
  }

  const started = Date.now();
  let actionEventId = null;
  let acquiredLock = false;
  const holderId = `${userId || 'system'}:${crypto.randomUUID()}`;
  const effectiveLockKey = lockKey || payload?.lockKey || null;
  const workflowContext = await workflowEngineService.beginToolExecutionWorkflow({
    tenantId,
    requestedByUserId: userId,
    tool,
    payload,
    correlationId,
    source: 'tool_runtime',
  });

  try {
    try {
      validateToolPayload({
        toolName,
        schema: tool.input_schema_json || tool.schema_json,
        payload,
      });
    } catch (error) {
      await logToolCall({
        tenantId,
        userId,
        toolName,
        requestJson: payload,
        responseJson: {
          blocked: true,
          reason: 'schema_validation_failed',
        },
        status: 'blocked',
        durationMs: Date.now() - started,
        errorMessage: error.message,
      });
      await workflowEngineService.recordToolCall({
        workflowContext,
        tenantId,
        userId,
        toolName,
        requestJson: payload,
        responseJson: {
          blocked: true,
          reason: 'schema_validation_failed',
        },
        status: 'blocked',
        durationMs: Date.now() - started,
        errorMessage: error.message,
        startedAt: new Date(started),
        completedAt: new Date(),
      });
      await workflowEngineService.markWorkflowFailed({
        workflowContext,
        tenantId,
        responseJson: {
          blocked: true,
          reason: 'schema_validation_failed',
        },
        errorMessage: error.message,
        errorCode: 'SCHEMA_VALIDATION_FAILED',
        errorType: 'tool_schema',
      });
      throw error;
    }

    const policyDecision =
      await copilotPolicyDecisionService.evaluateToolPolicy({
        tenantId,
        userId,
        roleIds,
        isOwner: Boolean(isOwner),
        tool,
        payload,
        approvalToken,
      });
    await copilotPolicyDecisionService.logPolicyDecision({
      decision: policyDecision,
      payload,
      approvalToken,
    });

    if (!policyDecision.allowed) {
      await logToolCall({
        tenantId,
        userId,
        toolName,
        requestJson: payload,
        responseJson: {
          blocked: true,
          reason: policyDecision.reason,
          policyDecision,
        },
        status: 'blocked',
        durationMs: Date.now() - started,
        errorMessage: `Policy blocked tool call: ${policyDecision.reason}`,
      });
      await workflowEngineService.recordToolCall({
        workflowContext,
        tenantId,
        userId,
        toolName,
        requestJson: payload,
        responseJson: {
          blocked: true,
          reason: policyDecision.reason,
          policyDecision,
        },
        status: 'blocked',
        durationMs: Date.now() - started,
        policyDecisionJson: policyDecision,
        errorMessage: `Policy blocked tool call: ${policyDecision.reason}`,
        startedAt: new Date(started),
        completedAt: new Date(),
      });
      if (policyDecision.reason === 'approval_required') {
        await workflowEngineService.markWorkflowWaitingApproval({
          workflowContext,
          tenantId,
          responseJson: {
            blocked: true,
            reason: policyDecision.reason,
            policyDecision,
          },
        });
      } else {
        await workflowEngineService.markWorkflowFailed({
          workflowContext,
          tenantId,
          responseJson: {
            blocked: true,
            reason: policyDecision.reason,
            policyDecision,
          },
          errorMessage: `Policy blocked tool call: ${policyDecision.reason}`,
          errorCode: 'POLICY_BLOCKED',
          errorType: 'policy',
        });
      }
      copilotPolicyDecisionService.assertPolicyAllowed(policyDecision);
    }

    if (effectiveLockKey) {
      acquiredLock = await tryAcquireLock({
        tenantId,
        lockKey: effectiveLockKey,
        holderId,
        ttlSeconds: lockTtlSec,
        metadata: { toolName, userId },
      });
      if (!acquiredLock) {
        await logToolCall({
          tenantId,
          userId,
          toolName,
          requestJson: payload,
          responseJson: { blocked: true, reason: 'lock_busy' },
          status: 'blocked',
          durationMs: Date.now() - started,
          errorMessage: `Lock busy: ${effectiveLockKey}`,
        });
        await workflowEngineService.recordToolCall({
          workflowContext,
          tenantId,
          userId,
          toolName,
          requestJson: payload,
          responseJson: { blocked: true, reason: 'lock_busy' },
          status: 'blocked',
          durationMs: Date.now() - started,
          policyDecisionJson: policyDecision,
          errorMessage: `Lock busy: ${effectiveLockKey}`,
          startedAt: new Date(started),
          completedAt: new Date(),
        });
        await workflowEngineService.markWorkflowFailed({
          workflowContext,
          tenantId,
          responseJson: { blocked: true, reason: 'lock_busy' },
          errorMessage: `Lock busy: ${effectiveLockKey}`,
          errorCode: 'LOCK_BUSY',
          errorType: 'tool_lock',
          recoverable: true,
        });
        throw new ApiError(
          httpStatus.CONFLICT,
          `Tool lock is busy for key: ${effectiveLockKey}`
        );
      }
    }

    let responsePayload = { executed: true, mode: 'noop' };
    await workflowEngineService.markWorkflowExecuting({
      workflowContext,
      tenantId,
    });
    if (tool.action_type) {
      const entityType =
        payload.entityType ||
        (await resolveEntityTypeForAction(tool.action_type));
      if (!entityType) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Cannot resolve entity type for action ${tool.action_type}`
        );
      }

      const inputActionPayload = payload.actionPayload || payload;
      const resolveResult =
        await copilotEntityResolverService.resolveActionPayload({
          tenantId,
          actionType: tool.action_type,
          payload: inputActionPayload,
          actorUserId: userId,
          source: 'tool_runtime',
        });

      if (!resolveResult.canExecute) {
        const blockedResponse = {
          blocked: true,
          reason: 'entity_resolution_required',
          details: resolveResult.resolutionDetails,
        };
        await logToolCall({
          tenantId,
          userId,
          toolName,
          requestJson: payload,
          responseJson: blockedResponse,
          status: 'blocked',
          durationMs: Date.now() - started,
          errorMessage: 'Entity resolution failed or ambiguous',
        });
        await workflowEngineService.recordToolCall({
          workflowContext,
          tenantId,
          userId,
          toolName,
          requestJson: payload,
          responseJson: blockedResponse,
          status: 'blocked',
          durationMs: Date.now() - started,
          policyDecisionJson: policyDecision,
          errorMessage: 'Entity resolution failed or ambiguous',
          startedAt: new Date(started),
          completedAt: new Date(),
        });
        await workflowEngineService.markWorkflowFailed({
          workflowContext,
          tenantId,
          responseJson: blockedResponse,
          errorMessage: 'Entity resolution failed or ambiguous',
          errorCode: 'ENTITY_RESOLUTION_REQUIRED',
          errorType: 'entity_resolution',
          recoverable: true,
        });
        throw new ApiError(
          httpStatus.CONFLICT,
          'Entity resolution required before tool can execute'
        );
      }

      const derivedEntityId =
        payload.entityId ||
        resolveResult.resolvedPayload?.entityId ||
        resolveResult.resolvedPayload?.userId ||
        resolveResult.resolvedPayload?.roleId ||
        resolveResult.resolvedPayload?.nodeId ||
        resolveResult.resolvedPayload?.projectFormId ||
        resolveResult.resolvedPayload?.projectId ||
        null;

      const actionResult = await copilotActionService.createAction({
        tenantId,
        actorUserId: userId,
        actorRoleIds: roleIds,
        actionType: tool.action_type,
        entityType,
        entityId: derivedEntityId,
        payload: resolveResult.resolvedPayload,
        idempotencyKey: payload.idempotencyKey,
        correlationId: null,
        source: 'tool_runtime',
        priority: Number(payload.priority || 0),
      });

      actionEventId = actionResult?.event?.id || null;
      if (tool.requires_approval && policyDecision?.approvalId) {
        await copilotApprovalService.consumeApprovalDecision({
          approvalId: policyDecision.approvalId,
          result: {
            toolName,
            actionEventId,
            mode: 'action_event',
            deduped: Boolean(actionResult?.deduped),
          },
        });
      }
      responsePayload = {
        executed: true,
        mode: 'action_event',
        deduped: Boolean(actionResult?.deduped),
        event: actionResult?.event || null,
        resolution: resolveResult.resolutionDetails,
      };
      await workflowEngineService.queueWorkflowActionEvent({
        workflowContext,
        tenantId,
        actionEventId,
        responseJson: responsePayload,
      });
    } else {
      await workflowEngineService.completeImmediateWorkflow({
        workflowContext,
        tenantId,
        responseJson: responsePayload,
      });
    }

    await logToolCall({
      tenantId,
      userId,
      toolName,
      actionEventId,
      requestJson: payload,
      responseJson: responsePayload,
      status: 'success',
      durationMs: Date.now() - started,
    });
    await workflowEngineService.recordToolCall({
      workflowContext,
      tenantId,
      userId,
      toolName,
      actionEventId,
      requestJson: payload,
      responseJson: responsePayload,
      status: actionEventId ? 'accepted' : 'success',
      durationMs: Date.now() - started,
      policyDecisionJson: policyDecision,
      startedAt: new Date(started),
      completedAt: new Date(),
    });

    return responsePayload;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      await logToolCall({
        tenantId,
        userId,
        toolName,
        actionEventId,
        requestJson: payload,
        responseJson: {},
        status: 'failed',
        durationMs: Date.now() - started,
        errorMessage: error.message,
      });
      await workflowEngineService.recordToolCall({
        workflowContext,
        tenantId,
        userId,
        toolName,
        actionEventId,
        requestJson: payload,
        responseJson: {},
        status: 'failed',
        durationMs: Date.now() - started,
        errorMessage: error.message,
        startedAt: new Date(started),
        completedAt: new Date(),
      });
      await workflowEngineService.markWorkflowFailed({
        workflowContext,
        tenantId,
        responseJson: {},
        errorMessage: error.message,
        errorCode: 'TOOL_EXECUTION_FAILED',
        errorType: 'tool_runtime',
        recoverable: true,
      });
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Tool execution failed'
      );
    }
    throw error;
  } finally {
    if (acquiredLock && effectiveLockKey) {
      await releaseLock({
        tenantId,
        lockKey: effectiveLockKey,
        holderId,
      });
    }
  }
};

const listToolCallLogs = async ({ tenantId, toolName, status, limit }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const values = [tenantId];
  let whereClause = 'WHERE tenant_id = $1';

  if (toolName) {
    values.push(toolName);
    whereClause += ` AND tool_name = $${values.length}`;
  }
  if (status) {
    values.push(status);
    whereClause += ` AND status = $${values.length}`;
  }

  values.push(normalizeLimit(limit));
  const result = await postgresPool.query(
    `SELECT id, tenant_id, user_id, tool_name, action_event_id, request_json, response_json, status, duration_ms, error_message, created_at
     FROM copilot.tool_call_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
};

module.exports = {
  listTools,
  executeToolCall,
  listToolCallLogs,
};
