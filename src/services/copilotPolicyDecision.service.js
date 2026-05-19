const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const Role = require('../models/role.model');
const ApiError = require('../utils/ApiError');
const { hashPayload } = require('./copilotPayloadHash.service');
const copilotApprovalService = require('./copilotApproval.service');

const normalizeRiskLevel = (riskLevel) => {
  const value = String(riskLevel || '').toUpperCase();
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(value)) return value;
  return 'LOW';
};

const asBoolean = (value, defaultValue = false) => {
  if (value === null || value === undefined) return defaultValue;
  return Boolean(value);
};

const normalizeList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch (_) {
      return [value];
    }
  }
  return [String(value)];
};

const normalizeRoleIds = (roleIds) => {
  const values = Array.isArray(roleIds) ? roleIds : normalizeList(roleIds);
  return values.map((roleId) => {
    if (roleId && typeof roleId === 'object') {
      return String(roleId._id || roleId.id || roleId);
    }
    return String(roleId);
  });
};

const getRolePermissionNames = async (roleIds) => {
  const normalizedRoleIds = normalizeRoleIds(roleIds);
  if (normalizedRoleIds.length === 0) return [];

  const roles = await Role.find({ _id: { $in: normalizedRoleIds } }).populate(
    'permissions'
  );
  const permissionNames = roles.flatMap((role) =>
    (role.permissions || [])
      .map((permission) => permission.name)
      .filter(Boolean)
  );
  return Array.from(new Set(permissionNames));
};

const permissionParts = (permission) => {
  if (!permission || typeof permission !== 'string') return null;
  const parts = permission.split(':');
  if (parts.length !== 2) return null;
  return { resource: parts[0], action: parts[1] };
};

const hasPermission = ({ userPermissions, requiredPermission }) => {
  const permissionSet = new Set(userPermissions);
  if (
    permissionSet.has('*') ||
    permissionSet.has('all:*') ||
    permissionSet.has(requiredPermission)
  ) {
    return true;
  }

  const requiredParts = permissionParts(requiredPermission);
  if (!requiredParts) return false;

  return (
    permissionSet.has(`${requiredParts.resource}:manage`) ||
    permissionSet.has(`${requiredParts.resource}:*`)
  );
};

const evaluateToolPolicy = async ({
  tenantId,
  userId,
  roleIds,
  userPermissions,
  isOwner,
  tool,
  payload,
  approvalToken,
}) => {
  const riskLevel = normalizeRiskLevel(
    tool?.risk_level || tool?.metadata?.riskLevel
  );
  const requiresApproval = Boolean(tool?.requires_approval);
  const requiredPermissions = normalizeList(tool?.required_permissions);
  // Tenant owners bypass role-based permission checks — they have full access.
  const actorPermissions =
    isOwner || requiredPermissions.length === 0
      ? requiredPermissions.map(() => '*')
      : userPermissions || (await getRolePermissionNames(roleIds));
  const missingPermissions = isOwner
    ? []
    : requiredPermissions.filter(
        (permission) =>
          !hasPermission({
            userPermissions: actorPermissions,
            requiredPermission: permission,
          })
      );
  const blockedRules = [];
  let approvalId = null;
  let approvalValidationReason = null;

  if (!tenantId) {
    blockedRules.push('tenant_required');
  }

  if (asBoolean(tool?.tenant_scope_required, true) && !tenantId) {
    blockedRules.push('tenant_scope_required');
  }

  if (tool?.enabled === false) {
    blockedRules.push('tool_disabled');
  }

  if (requiresApproval && !approvalToken) {
    blockedRules.push('approval_required');
  } else if (requiresApproval && approvalToken) {
    const approvalValidation =
      await copilotApprovalService.validateApprovalDecision({
        tenantId,
        userId,
        toolName: tool?.tool_name || null,
        actionType: tool?.action_type || null,
        entityId: payload?.entityId || null,
        payload,
        approvalToken,
      });
    if (!approvalValidation.ok) {
      blockedRules.push('approval_invalid');
      approvalValidationReason = approvalValidation.reason;
    } else {
      approvalId = approvalValidation.approvalId;
    }
  }

  if (tool?.idempotency_key_required && !payload?.idempotencyKey) {
    blockedRules.push('idempotency_key_required');
  }

  if (missingPermissions.length > 0) {
    blockedRules.push('missing_required_permissions');
  }

  const allowed = blockedRules.length === 0;
  return {
    allowed,
    reason: allowed ? 'allowed' : blockedRules.join(','),
    riskLevel,
    requiresApproval,
    requiredApprovers: [],
    requiredPermissions,
    missingPermissions,
    blockedRules,
    approvalId,
    approvalValidationReason,
    tenantId,
    userId: userId || null,
    toolName: tool?.tool_name || null,
    actionType: tool?.action_type || null,
    inputHash: hashPayload(payload),
  };
};

const logPolicyDecision = async ({ decision, payload, approvalToken }) => {
  await postgresPool.query(
    `INSERT INTO copilot.policy_decision_logs (
       tenant_id, user_id, tool_name, action_type, risk_level,
       allowed, reason, requires_approval, approval_id, input_hash,
       blocked_rules, request_json, decision_json
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       $11::jsonb, $12::jsonb, $13::jsonb
     )`,
    [
      decision.tenantId,
      decision.userId,
      decision.toolName,
      decision.actionType,
      decision.riskLevel,
      decision.allowed,
      decision.reason,
      decision.requiresApproval,
      decision.approvalId || approvalToken || null,
      decision.inputHash,
      JSON.stringify(decision.blockedRules || []),
      JSON.stringify(payload || {}),
      JSON.stringify(decision || {}),
    ]
  );
};

const assertPolicyAllowed = (decision) => {
  if (decision.allowed) return;

  if (decision.blockedRules.includes('approval_required')) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Tool requires approval before execution'
    );
  }

  if (decision.blockedRules.includes('approval_invalid')) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Approval is invalid for this tool execution: ${
        decision.approvalValidationReason || 'approval check failed'
      }`
    );
  }

  if (decision.blockedRules.includes('idempotency_key_required')) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Tool requires idempotencyKey before execution'
    );
  }

  if (decision.blockedRules.includes('missing_required_permissions')) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `Missing tool permissions: ${decision.missingPermissions.join(', ')}`
    );
  }

  throw new ApiError(
    httpStatus.FORBIDDEN,
    `Tool policy blocked execution: ${decision.reason}`
  );
};

module.exports = {
  evaluateToolPolicy,
  logPolicyDecision,
  assertPolicyAllowed,
  hashPayload,
};
