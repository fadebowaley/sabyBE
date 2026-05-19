const crypto = require('crypto');
const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const { hashPayload } = require('./copilotPayloadHash.service');

const APPROVAL_STATUS = {
  PENDING_HUMAN: 'pending_human',
  APPROVED: 'approved',
  CONSUMED: 'consumed',
  REJECTED: 'rejected',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

const normalizeRiskLevel = (riskLevel) => {
  const value = String(riskLevel || '').toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value)) return value;
  return 'LOW';
};

const getRunner = (client) => client || postgresPool;

const getToolMetadata = async ({ client, toolName }) => {
  if (!toolName) return null;
  const runner = getRunner(client);
  const result = await runner.query(
    `SELECT tool_name, action_type, requires_approval, risk_level
     FROM copilot.tool_registry
     WHERE tool_name = $1
     LIMIT 1`,
    [toolName]
  );
  return result.rows[0] || null;
};

const getActionMetadata = async ({ client, actionType }) => {
  if (!actionType) return null;
  const runner = getRunner(client);
  const result = await runner.query(
    `SELECT action_type, requires_approval, approval_type
     FROM copilot.action_catalog
     WHERE action_type = $1
     LIMIT 1`,
    [actionType]
  );
  return result.rows[0] || null;
};

const createApprovalDecision = async ({
  client,
  tenantId,
  requestedByUserId,
  approvedByUserId,
  toolName,
  actionType,
  entityId = null,
  payload = {},
  approvalToken,
  traceId = null,
  expiresInSec = 600,
  reason = null,
  metadata = {},
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!requestedByUserId || !approvedByUserId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'requestedByUserId and approvedByUserId are required'
    );
  }
  if (!toolName && !actionType) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'toolName or actionType is required'
    );
  }

  const runner = getRunner(client);
  const tool = await getToolMetadata({ client, toolName });
  const effectiveActionType = actionType || tool?.action_type || null;
  const action = await getActionMetadata({
    client,
    actionType: effectiveActionType,
  });
  const requiresApproval = Boolean(
    tool?.requires_approval || action?.requires_approval
  );

  if (!requiresApproval) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Approval is not required for ${toolName || effectiveActionType}`
    );
  }

  const effectiveApprovalToken =
    approvalToken || `copilot-approval:${crypto.randomUUID()}`;
  const effectiveTraceId = traceId || null;
  const inputHash = hashPayload(payload);

  const existing = await runner.query(
    `SELECT *
     FROM copilot.approval_decisions
     WHERE approval_token = $1
     LIMIT 1`,
    [effectiveApprovalToken]
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (
      row.tenant_id !== tenantId ||
      row.requested_by_user_id !== String(requestedByUserId) ||
      (toolName || null) !== (row.tool_name || null) ||
      (effectiveActionType || null) !== (row.action_type || null) ||
      (entityId || null) !== (row.entity_id || null) ||
      row.input_hash !== inputHash
    ) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `Approval token reuse with different approval payload: ${effectiveApprovalToken}`
      );
    }
    return row;
  }

  const recordId = crypto.randomUUID();
  const riskLevel = normalizeRiskLevel(tool?.risk_level);
  const result = await runner.query(
    `INSERT INTO copilot.approval_decisions (
       id, tenant_id, requested_by_user_id, approved_by_user_id,
       tool_name, action_type, entity_id, risk_level, approval_token,
       input_hash, request_json, decision_json, trace_id, reason, metadata,
       status, approved_at, expires_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9,
       $10, $11::jsonb, $12::jsonb, $13, $14, $15::jsonb,
       'approved', NOW(), NOW() + ($16::text || ' seconds')::interval, NOW(), NOW()
     )
     RETURNING *`,
    [
      recordId,
      tenantId,
      String(requestedByUserId),
      String(approvedByUserId),
      toolName || null,
      effectiveActionType,
      entityId || null,
      riskLevel,
      effectiveApprovalToken,
      inputHash,
      JSON.stringify(payload || {}),
      JSON.stringify({
        source: 'chat_confirmation',
        reason: reason || 'user_confirmed_in_chat',
      }),
      effectiveTraceId,
      reason || null,
      JSON.stringify(metadata || {}),
      Math.max(60, Math.min(Number(expiresInSec) || 600, 3600)),
    ]
  );

  return result.rows[0];
};

const validateApprovalDecision = async ({
  client,
  tenantId,
  userId,
  toolName,
  actionType,
  entityId = null,
  payload = {},
  approvalToken,
}) => {
  if (!approvalToken) {
    return { ok: false, reason: 'approval_required' };
  }

  const runner = getRunner(client);
  const result = await runner.query(
    `SELECT *
     FROM copilot.approval_decisions
     WHERE approval_token = $1
     LIMIT 1`,
    [approvalToken]
  );
  const row = result.rows[0];
  if (!row) {
    return { ok: false, reason: 'approval_not_found' };
  }

  if (row.tenant_id !== tenantId) {
    return { ok: false, reason: 'approval_tenant_mismatch', approvalId: row.id };
  }
  if (userId && row.requested_by_user_id !== String(userId)) {
    return { ok: false, reason: 'approval_actor_mismatch', approvalId: row.id };
  }
  if (toolName && row.tool_name && row.tool_name !== toolName) {
    return { ok: false, reason: 'approval_tool_mismatch', approvalId: row.id };
  }
  if (actionType && row.action_type && row.action_type !== actionType) {
    return { ok: false, reason: 'approval_action_mismatch', approvalId: row.id };
  }
  if (entityId && row.entity_id && row.entity_id !== String(entityId)) {
    return { ok: false, reason: 'approval_entity_mismatch', approvalId: row.id };
  }
  if (row.input_hash !== hashPayload(payload)) {
    return { ok: false, reason: 'approval_input_mismatch', approvalId: row.id };
  }

  if (row.status === APPROVAL_STATUS.CONSUMED) {
    return { ok: false, reason: 'approval_already_used', approvalId: row.id };
  }
  if (
    [
      APPROVAL_STATUS.REJECTED,
      APPROVAL_STATUS.REVOKED,
      APPROVAL_STATUS.CANCELLED,
    ].includes(row.status)
  ) {
    return { ok: false, reason: 'approval_not_active', approvalId: row.id };
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await runner.query(
      `UPDATE copilot.approval_decisions
       SET status = $2, updated_at = NOW()
       WHERE id = $1`,
      [row.id, APPROVAL_STATUS.EXPIRED]
    );
    return { ok: false, reason: 'approval_expired', approvalId: row.id };
  }

  return {
    ok: true,
    approvalId: row.id,
    approvalToken: row.approval_token,
    traceId: row.trace_id || null,
    riskLevel: row.risk_level || null,
    record: row,
  };
};

const consumeApprovalDecision = async ({
  client,
  approvalId,
  approvalToken,
  result = {},
}) => {
  if (!approvalId && !approvalToken) return null;
  const runner = getRunner(client);
  const queryValue = approvalId || approvalToken;
  const queryColumn = approvalId ? 'id' : 'approval_token';
  const update = await runner.query(
    `UPDATE copilot.approval_decisions
        SET status = $2,
            consumed_at = COALESCE(consumed_at, NOW()),
            execution_result_json = $3::jsonb,
            updated_at = NOW()
      WHERE ${queryColumn} = $1
        AND status = 'approved'
      RETURNING *`,
    [queryValue, APPROVAL_STATUS.CONSUMED, JSON.stringify(result || {})]
  );
  return update.rows[0] || null;
};

/**
 * createHumanApprovalRequest — queues an action for human review.
 *
 * Creates an approval_decisions row with status = 'pending_human'.
 * The row is promoted to 'approved' (and the action executed) when a tenant
 * owner calls approveHumanDecision().
 *
 * @returns {Object} The approval_decisions row (includes approval_token for tracking)
 */
const createHumanApprovalRequest = async ({
  client,
  tenantId,
  requestedByUserId,
  toolName = null,
  actionType = null,
  entityId = null,
  payload = {},
  traceId = null,
  reason = null,
  metadata = {},
}) => {
  if (!tenantId) throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  if (!requestedByUserId) throw new ApiError(httpStatus.BAD_REQUEST, 'requestedByUserId is required');
  if (!toolName && !actionType) throw new ApiError(httpStatus.BAD_REQUEST, 'toolName or actionType is required');

  const runner = getRunner(client);
  const tool = await getToolMetadata({ client, toolName });
  const effectiveActionType = actionType || tool?.action_type || null;
  const inputHash = hashPayload(payload);
  const approvalToken = `copilot-human:${crypto.randomUUID()}`;
  const recordId = crypto.randomUUID();

  const result = await runner.query(
    `INSERT INTO copilot.approval_decisions (
       id, tenant_id, requested_by_user_id, approved_by_user_id,
       tool_name, action_type, entity_id, risk_level, approval_token,
       input_hash, request_json, decision_json, trace_id, reason, metadata,
       status, approved_at, expires_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, NULL,
       $4, $5, $6, 'HIGH', $7,
       $8, $9::jsonb, '{}'::jsonb, $10, $11, $12::jsonb,
       'pending_human', NULL, NOW() + INTERVAL '7 days', NOW(), NOW()
     )
     ON CONFLICT (approval_token) DO NOTHING
     RETURNING *`,
    [
      recordId,
      tenantId,
      String(requestedByUserId),
      toolName || null,
      effectiveActionType,
      entityId || null,
      approvalToken,
      inputHash,
      JSON.stringify(payload || {}),
      traceId || null,
      reason || null,
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows[0];
};

/**
 * listPendingHumanApprovals — returns all pending_human approval requests for a tenant.
 * Used by the approver UI so tenant owners can see what needs their attention.
 */
const listPendingHumanApprovals = async ({ client, tenantId, limit = 50 }) => {
  const runner = getRunner(client);
  const result = await runner.query(
    `SELECT id, tenant_id, requested_by_user_id, tool_name, action_type,
            entity_id, risk_level, approval_token, request_json, reason,
            metadata, status, created_at, expires_at
     FROM copilot.approval_decisions
     WHERE tenant_id = $1 AND status = 'pending_human'
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return result.rows;
};

/**
 * approveHumanDecision — tenant owner approves a pending_human request.
 *
 * Promotes the record to 'approved' so the executing agent can then call
 * callBackendCreateAction with the returned approvalToken.
 *
 * @returns {Object} Updated row or null if not found / already acted on
 */
const approveHumanDecision = async ({
  client,
  tenantId,
  approvalToken,
  approvedByUserId,
  reason = null,
}) => {
  if (!approvalToken || !tenantId || !approvedByUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId, approvalToken and approvedByUserId are required');
  }

  const runner = getRunner(client);
  const result = await runner.query(
    `UPDATE copilot.approval_decisions
     SET status            = 'approved',
         approved_by_user_id = $1,
         approved_at       = NOW(),
         reason            = COALESCE($2, reason),
         decision_json     = jsonb_build_object('source', 'human_approver', 'approvedBy', $1, 'reason', $2),
         updated_at        = NOW()
     WHERE approval_token = $3
       AND tenant_id      = $4
       AND status         = 'pending_human'
     RETURNING *`,
    [String(approvedByUserId), reason || null, approvalToken, tenantId]
  );
  return result.rows[0] || null;
};

/**
 * rejectHumanDecision — tenant owner rejects a pending_human request.
 */
const rejectHumanDecision = async ({
  client,
  tenantId,
  approvalToken,
  rejectedByUserId,
  reason = null,
}) => {
  if (!approvalToken || !tenantId || !rejectedByUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId, approvalToken and rejectedByUserId are required');
  }

  const runner = getRunner(client);
  const result = await runner.query(
    `UPDATE copilot.approval_decisions
     SET status            = 'rejected',
         approved_by_user_id = $1,
         approved_at       = NOW(),
         reason            = COALESCE($2, reason),
         decision_json     = jsonb_build_object('source', 'human_approver', 'rejectedBy', $1, 'reason', $2),
         updated_at        = NOW()
     WHERE approval_token = $3
       AND tenant_id      = $4
       AND status         = 'pending_human'
     RETURNING *`,
    [String(rejectedByUserId), reason || null, approvalToken, tenantId]
  );
  return result.rows[0] || null;
};

module.exports = {
  createApprovalDecision,
  createHumanApprovalRequest,
  listPendingHumanApprovals,
  approveHumanDecision,
  rejectHumanDecision,
  validateApprovalDecision,
  consumeApprovalDecision,
};
