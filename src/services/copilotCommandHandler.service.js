const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const userService = require('./user.service');
const roleService = require('./role.service');
const nodeService = require('./node.service');
const projectFormService = require('./projectForm.service');
const paymentService = require('./payment.service');
const {
  invalidateTenantEntityCaches,
} = require('./copilotEntityResolver.service');
const { User, Nodes, Level, Structures } = require('../models');
const { postgresPool } = require('../config/postgres');
const {
  queueSubmission,
  queueUpdateSubmission,
  queueDeleteSubmission,
} = require('./submission.service');

const requireObjectPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Action payload must be an object');
  }
};

const normalizeIdRef = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
};

const normalizeIdList = (value) => {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
};

const assertTenantOwned = ({ entity, tenantId, entityName }) => {
  if (!entity) {
    throw new ApiError(httpStatus.NOT_FOUND, `${entityName} not found`);
  }
  if (String(entity.tenantId || '') !== String(tenantId || '')) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `${entityName} does not belong to tenant`
    );
  }
};

const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSingleCandidateMapByRank = (levels = []) => {
  const map = new Map();
  for (const level of levels) {
    const rank = Number(level?.rank);
    if (!Number.isFinite(rank)) continue;
    if (!map.has(rank)) {
      map.set(rank, []);
    }
    map.get(rank).push(level);
  }
  return map;
};

const buildSingleCandidateMapByLevel = (structures = []) => {
  const map = new Map();
  for (const structure of structures) {
    const levelId = normalizeIdRef(structure?.level);
    if (!levelId) continue;
    if (!map.has(levelId)) {
      map.set(levelId, []);
    }
    map.get(levelId).push(structure);
  }
  return map;
};

const cascadeMoveFamilyLevelAlignment = async ({
  nodeId,
  targetLevelId,
  tenantId,
}) => {
  const rootNode = await nodeService.getNodeById(nodeId, { populate: 'level' });
  const resolvedTenantId = String(tenantId || rootNode?.tenantId || '');
  if (!resolvedTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unable to resolve tenant for move_node');
  }

  const targetLevel = await Level.findOne({
    _id: targetLevelId,
    tenantId: resolvedTenantId,
    deletedAt: null,
    isActive: true,
  }).lean();
  if (!targetLevel) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Target level (${targetLevelId}) not found or inactive`
    );
  }

  const rootRank = Number(rootNode?.level?.rank);
  const targetRank = Number(targetLevel?.rank);
  if (!Number.isFinite(rootRank) || !Number.isFinite(targetRank)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Could not compute level ranks for family move'
    );
  }
  const rankDelta = targetRank - rootRank;

  const rootPath = String(rootNode?.path || '');
  if (!rootPath) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Node path is missing for family move');
  }

  const subtree = await Nodes.find({
    tenantId: resolvedTenantId,
    deletedAt: null,
    path: { $regex: `^${escapeRegex(rootPath)}(?:/|$)` },
  }).populate('level');
  if (!Array.isArray(subtree) || subtree.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No nodes found in family subtree');
  }

  const allLevels = await Level.find({
    tenantId: resolvedTenantId,
    deletedAt: null,
    isActive: true,
  }).lean();
  const levelsByRank = buildSingleCandidateMapByRank(allLevels);

  const allStructures = await Structures.find({
    tenantId: resolvedTenantId,
    isActive: true,
  }).lean();
  const structuresByLevel = buildSingleCandidateMapByLevel(allStructures);

  const bulkOps = [];
  for (const node of subtree) {
    const currentRank = Number(node?.level?.rank);
    if (!Number.isFinite(currentRank)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Node (${normalizeIdRef(node?._id)}) does not have a valid level rank`
      );
    }

    const nextRank = currentRank + rankDelta;
    const nextLevelCandidates = levelsByRank.get(nextRank) || [];
    if (nextLevelCandidates.length !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        nextLevelCandidates.length === 0
          ? `No active level found at rank ${nextRank} for cascading family move`
          : `Multiple active levels found at rank ${nextRank}; cannot auto-select`
      );
    }
    const nextLevel = nextLevelCandidates[0];
    const nextLevelId = normalizeIdRef(nextLevel?._id || nextLevel?.id);

    const nextStructureCandidates = structuresByLevel.get(nextLevelId) || [];
    if (nextStructureCandidates.length !== 1) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        nextStructureCandidates.length === 0
          ? `No active structure found for level rank ${nextRank}`
          : `Multiple active structures found for level rank ${nextRank}; cannot auto-select`
      );
    }
    const nextStructureId = normalizeIdRef(
      nextStructureCandidates[0]?._id || nextStructureCandidates[0]?.id
    );

    bulkOps.push({
      updateOne: {
        filter: { _id: node._id },
        update: {
          $set: {
            level: nextLevelId,
            structure: nextStructureId,
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    await Nodes.bulkWrite(bulkOps, { ordered: true });
  }
};

const invalidateEntitySearchAndResolveCache = async (tenantId, entityType) => {
  try {
    if (!tenantId) return;
    await invalidateTenantEntityCaches({
      tenantId: String(tenantId),
      entityType: String(entityType || 'user'),
    });
  } catch (_) {
    // non-blocking cache invalidation
  }
};

const invalidateUserSearchAndResolveCache = async (tenantId) =>
  invalidateEntitySearchAndResolveCache(tenantId, 'user');

const invalidateRoleSearchAndResolveCache = async (tenantId) =>
  invalidateEntitySearchAndResolveCache(tenantId, 'role');

const handleCreateUser = async (event) => {
  requireObjectPayload(event.payload_json);
  const userBody = event.payload_json.userBody || { ...event.payload_json };

  if (!userBody.email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_user payload requires userBody.email'
    );
  }

  if (!userBody.createdBy && event.actor_user_id) {
    userBody.createdBy = event.actor_user_id;
  }

  if (!userBody.createdBy) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_user requires actor_user_id or payload.userBody.createdBy'
    );
  }

  if (userBody.isOwner === undefined) {
    userBody.isOwner = false;
  }

  if (userBody.isSuper === undefined) {
    userBody.isSuper = false;
  }

  if (!userBody.tenantId) {
    userBody.tenantId = event.tenant_id;
  }

  const createdUser = await userService.createUser(userBody);
  await invalidateUserSearchAndResolveCache(event.tenant_id || userBody.tenantId);
  return {
    handled: true,
    resultType: 'user_created',
    entityId: String(createdUser?._id || createdUser?.id || ''),
    email: createdUser?.email || userBody.email,
    firstname: createdUser?.firstname || userBody?.firstname || null,
    lastname: createdUser?.lastname || userBody?.lastname || null,
  };
};

const handleSubmitData = async (event) => {
  requireObjectPayload(event.payload_json);
  const submissionBody =
    event.payload_json.submissionBody || { ...event.payload_json };

  if (!submissionBody.tenantId) {
    submissionBody.tenantId = event.tenant_id;
  }
  if (!submissionBody.userId && event.actor_user_id) {
    submissionBody.userId = event.actor_user_id;
  }

  const queued = await queueSubmission(submissionBody);
  return {
    handled: true,
    resultType: 'submission_queued',
    jobId: queued.jobId,
    queueStatus: queued.status,
  };
};

const handleApproveSubmission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'approve_submission requires submissionId or submission entity_id'
    );
  }

  const queued = await queueUpdateSubmission({
    submissionId,
    updates: {
      ...(payload.updates || {}),
      status: 'approved',
    },
    userId: payload.userId || event.actor_user_id || null,
    tenantId: event.tenant_id,
  });

  return {
    handled: true,
    resultType: 'submission_approval_queued',
    submissionId,
    jobId: queued.jobId,
    queueStatus: queued.status,
  };
};

const queueSubmissionStatusUpdate = async (event, status, extraUpdates = {}) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${event.action_type} requires submissionId or submission entity_id`
    );
  }

  const queued = await queueUpdateSubmission({
    submissionId,
    updates: {
      ...(payload.updates || {}),
      ...extraUpdates,
      status,
    },
    userId: payload.userId || event.actor_user_id || null,
    tenantId: event.tenant_id,
  });

  return {
    handled: true,
    resultType: `${status}_queued`,
    submissionId,
    jobId: queued.jobId,
    queueStatus: queued.status,
  };
};

const handleRejectSubmission = async (event) =>
  queueSubmissionStatusUpdate(event, 'rejected');

const handleReopenSubmission = async (event) =>
  queueSubmissionStatusUpdate(event, 'reopened');

const handleRevokeApproval = async (event) =>
  queueSubmissionStatusUpdate(event, 'submitted');

const handleWithdrawSubmission = async (event) =>
  queueSubmissionStatusUpdate(event, 'withdrawn');

const handleDeleteSubmission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_submission requires submissionId or submission entity_id'
    );
  }

  const queued = await queueDeleteSubmission({
    submissionId,
    userId: payload.userId || event.actor_user_id || null,
    tenantId: event.tenant_id,
    permanent: Boolean(payload.permanent),
  });

  return {
    handled: true,
    resultType: 'submission_delete_queued',
    submissionId,
    permanent: Boolean(payload.permanent),
    jobId: queued.jobId,
    queueStatus: queued.status,
  };
};

const resolveActorUser = async (event) => {
  if (!event.actor_user_id) return null;
  const user = await User.findById(event.actor_user_id);
  return user || null;
};

const handleCreateRole = async (event) => {
  requireObjectPayload(event.payload_json);
  const roleBody = event.payload_json.roleBody || { ...event.payload_json };
  const normalizedRoleBody = {
    ...roleBody,
    name: roleBody.name || roleBody.roleName,
    description: roleBody.description || roleBody.roleDescription || '',
    roleName: roleBody.roleName || roleBody.name,
    roleDescription: roleBody.roleDescription || roleBody.description || '',
  };

  if (!normalizedRoleBody.roleName) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_role payload requires roleName (or name)'
    );
  }

  const actorUser = await resolveActorUser(event);
  if (!actorUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_role requires a valid actor user'
    );
  }

  if (!normalizedRoleBody.tenantId) {
    normalizedRoleBody.tenantId = event.tenant_id;
  }

  const role = await roleService.createRole(normalizedRoleBody, actorUser);
  await invalidateRoleSearchAndResolveCache(event.tenant_id || role?.tenantId);
  return {
    handled: true,
    resultType: 'role_created',
    entityId: String(role?._id || role?.id || ''),
    name: role?.name || normalizedRoleBody.roleName,
  };
};

const handleUpdateUser = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const userId = payload.userId || event.entity_id;

  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'update_user requires userId or user entity_id'
    );
  }

  const actorUser = await resolveActorUser(event);
  const updates = payload.userBody || payload.updateBody || { ...payload };
  delete updates.userId;
  delete updates.updateBody;
  delete updates.userBody;

  const updatedUser = await userService.updateUserById(userId, updates, actorUser);
  await invalidateUserSearchAndResolveCache(event.tenant_id || updatedUser?.tenantId);
  return {
    handled: true,
    resultType: 'user_updated',
    entityId: String(updatedUser?._id || updatedUser?.id || userId),
    email: updatedUser?.email || null,
    firstname: updatedUser?.firstname || null,
    lastname: updatedUser?.lastname || null,
  };
};

const handleDeactivateUser = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const userId = payload.userId || event.entity_id;

  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'deactivate_user requires userId or user entity_id'
    );
  }

  const result = await userService.softDeleteUserById(userId);
  if (result?.error) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error);
  }

  const deletedUser = result?.deletedUser || null;
  await invalidateUserSearchAndResolveCache(event.tenant_id || deletedUser?.tenantId);
  return {
    handled: true,
    resultType: 'user_deactivated',
    entityId: String(deletedUser?._id || deletedUser?.id || userId),
    email: deletedUser?.email || null,
    firstname: deletedUser?.firstname || null,
    lastname: deletedUser?.lastname || null,
  };
};

const handleReactivateUser = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const userId = payload.userId || event.entity_id;

  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'reactivate_user requires userId or user entity_id'
    );
  }

  const result = await userService.restoreUserByUserId(userId);
  if (result?.error) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error);
  }

  const restoredUser = result?.restoredUser || null;
  await invalidateUserSearchAndResolveCache(event.tenant_id || restoredUser?.tenantId);
  return {
    handled: true,
    resultType: 'user_reactivated',
    entityId: String(restoredUser?._id || restoredUser?.id || userId),
    email: restoredUser?.email || null,
    firstname: restoredUser?.firstname || null,
    lastname: restoredUser?.lastname || null,
  };
};

const handleDeleteUser = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const userId = payload.userId || event.entity_id;
  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_user requires userId or user entity_id'
    );
  }

  const deleted = await userService.deleteUserById(userId);
  await invalidateUserSearchAndResolveCache(event.tenant_id || deleted?.tenantId);
  return {
    handled: true,
    resultType: 'user_deleted',
    entityId: String(deleted?._id || deleted?.id || userId),
    email: deleted?.email || null,
    firstname: deleted?.firstname || null,
    lastname: deleted?.lastname || null,
  };
};

const handleResetPassword = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const email = String(payload.email || payload.userEmail || '').trim().toLowerCase();
  const newPassword = String(payload.newPassword || payload.password || '').trim();

  if (!email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'reset_password requires email'
    );
  }
  if (!newPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'reset_password requires newPassword'
    );
  }

  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (String(user.tenantId || '') !== String(event.tenant_id || '')) {
    throw new ApiError(httpStatus.FORBIDDEN, 'User does not belong to tenant');
  }

  await userService.updateUserById(
    user._id,
    {
      password: newPassword,
      otp: null,
      otpExpires: null,
    },
    await resolveActorUser(event)
  );
  await invalidateUserSearchAndResolveCache(event.tenant_id || user?.tenantId);

  return {
    handled: true,
    resultType: 'password_reset',
    entityId: String(user?._id || ''),
    email,
    firstname: user?.firstname || null,
    lastname: user?.lastname || null,
  };
};

const handleVerifyAccount = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const email = String(payload.email || payload.userEmail || '').trim().toLowerCase();

  if (!email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'verify_account requires email'
    );
  }

  const user = await userService.getUserByEmail(email);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (String(user.tenantId || '') !== String(event.tenant_id || '')) {
    throw new ApiError(httpStatus.FORBIDDEN, 'User does not belong to tenant');
  }

  const updated = await userService.updateUserById(
    user._id,
    {
      otpVerified: true,
      isEmailVerified: true,
      status: true,
      otp: null,
      otpExpires: null,
    },
    await resolveActorUser(event)
  );
  await invalidateUserSearchAndResolveCache(event.tenant_id || user?.tenantId);

  return {
    handled: true,
    resultType: 'account_verified',
    entityId: String(updated?._id || user?._id || ''),
    email,
    firstname: updated?.firstname || user?.firstname || null,
    lastname: updated?.lastname || user?.lastname || null,
  };
};

const handleDeleteRole = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const roleId = payload.roleId || event.entity_id;

  if (!roleId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_role requires roleId or role entity_id'
    );
  }

  const actorUser = await resolveActorUser(event);
  const deletedRole = await roleService.deleteRoleById(roleId, actorUser || null);
  await invalidateRoleSearchAndResolveCache(
    event.tenant_id || deletedRole?.tenantId
  );
  return {
    handled: true,
    resultType: 'role_deleted',
    entityId: String(deletedRole?._id || deletedRole?.id || roleId),
    name: deletedRole?.name || null,
  };
};

const handleAssignRole = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const userId = payload.userId || event.entity_id;
  const roleIds = payload.roleIds || payload.roles || payload.roleId;

  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'assign_role requires userId or user_role entity_id'
    );
  }
  if (!roleIds || (Array.isArray(roleIds) && roleIds.length === 0)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'assign_role requires roleId/roleIds/roles in payload'
    );
  }

  const targetUser = await userService.getUserById(userId);
  assertTenantOwned({
    entity: targetUser,
    tenantId: event.tenant_id,
    entityName: 'User',
  });

  const roleIdList = normalizeIdList(roleIds);
  const roles = await Promise.all(
    roleIdList.map((roleId) => roleService.getRoleById(roleId))
  );
  roles.forEach((role) =>
    assertTenantOwned({
      entity: role,
      tenantId: event.tenant_id,
      entityName: 'Role',
    })
  );

  const updatedUser = await userService.assignRoles(userId, roleIds);
  await invalidateUserSearchAndResolveCache(event.tenant_id || updatedUser?.tenantId);
  return {
    handled: true,
    resultType: 'role_assigned',
    entityId: String(updatedUser?._id || updatedUser?.id || userId),
    roleCount: Array.isArray(updatedUser?.roles) ? updatedUser.roles.length : 0,
  };
};

const handleUnassignRole = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const userId = payload.userId || event.entity_id;
  const roleIds = payload.roleIds || payload.roles || payload.roleId;

  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unassign_role requires userId or user_role entity_id'
    );
  }
  if (!roleIds || (Array.isArray(roleIds) && roleIds.length === 0)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unassign_role requires roleId/roleIds/roles in payload'
    );
  }

  const roleIdList = (Array.isArray(roleIds) ? roleIds : [roleIds]).map(String);
  const targetUser = await userService.getUserById(userId);
  assertTenantOwned({
    entity: targetUser,
    tenantId: event.tenant_id,
    entityName: 'User',
  });
  const roles = await Promise.all(
    roleIdList.map((roleId) => roleService.getRoleById(roleId))
  );
  roles.forEach((role) =>
    assertTenantOwned({
      entity: role,
      tenantId: event.tenant_id,
      entityName: 'Role',
    })
  );

  const actorUser = await resolveActorUser(event);
  const currentRoleIds = (targetUser.roles || []).map(String);
  const filteredRoles = currentRoleIds.filter((id) => !roleIdList.includes(id));
  const updatedUser = await userService.updateUserById(
    userId,
    { roles: filteredRoles },
    actorUser || null
  );
  await invalidateUserSearchAndResolveCache(event.tenant_id || updatedUser?.tenantId);

  return {
    handled: true,
    resultType: 'role_unassigned',
    entityId: String(updatedUser?._id || updatedUser?.id || userId),
    roleCount: Array.isArray(updatedUser?.roles) ? updatedUser.roles.length : 0,
  };
};

const handleGrantPermission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const roleId = payload.roleId || event.entity_id;
  const permissionIds =
    payload.permissionIds || payload.permissions || payload.permissionId;

  if (!roleId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'grant_permission requires roleId or role_permission entity_id'
    );
  }
  if (
    !permissionIds ||
    (Array.isArray(permissionIds) && permissionIds.length === 0)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'grant_permission requires permissionId/permissionIds/permissions'
    );
  }

  const role = await roleService.getRoleById(roleId);
  assertTenantOwned({
    entity: role,
    tenantId: event.tenant_id,
    entityName: 'Role',
  });

  const updatedRole = await roleService.assignPermissions(roleId, permissionIds);
  await invalidateRoleSearchAndResolveCache(event.tenant_id || updatedRole?.tenantId);
  return {
    handled: true,
    resultType: 'permission_granted',
    entityId: String(updatedRole?._id || updatedRole?.id || roleId),
    permissionCount: Array.isArray(updatedRole?.permissions)
      ? updatedRole.permissions.length
      : 0,
  };
};

const handleRevokePermission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const roleId = payload.roleId || event.entity_id;
  const permissionIds =
    payload.permissionIds || payload.permissions || payload.permissionId;

  if (!roleId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'revoke_permission requires roleId or role_permission entity_id'
    );
  }
  if (
    !permissionIds ||
    (Array.isArray(permissionIds) && permissionIds.length === 0)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'revoke_permission requires permissionId/permissionIds/permissions'
    );
  }

  const role = await roleService.getRoleById(roleId);
  assertTenantOwned({
    entity: role,
    tenantId: event.tenant_id,
    entityName: 'Role',
  });

  const updatedRole = await roleService.removePermissionsFromRole(
    roleId,
    permissionIds
  );
  await invalidateRoleSearchAndResolveCache(event.tenant_id || updatedRole?.tenantId);
  return {
    handled: true,
    resultType: 'permission_revoked',
    entityId: String(updatedRole?._id || updatedRole?.id || roleId),
    permissionCount: Array.isArray(updatedRole?.permissions)
      ? updatedRole.permissions.length
      : 0,
  };
};

const handleCreateNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const nodeBody = payload.nodeBody || { ...payload };

  if (!nodeBody.name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'create_node payload requires name');
  }
  if (!nodeBody.level) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'create_node payload requires level');
  }
  if (!nodeBody.structure) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_node payload requires structure'
    );
  }

  if (!nodeBody.tenantId) {
    nodeBody.tenantId = event.tenant_id;
  }

  const node = await nodeService.createNode(nodeBody);
  return {
    handled: true,
    resultType: 'node_created',
    entityId: String(node?._id || node?.id || node?.nodeId || ''),
    nodeId: node?.nodeId || null,
    name: node?.name || nodeBody.name,
  };
};

const handleMoveNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const nodeId = payload.nodeId || event.entity_id;
  const targetParentId = payload.targetParentId || payload.parentId;
  const moveFamily = payload.moveFamily !== false;
  const level = payload.level || null;
  const structure = payload.structure || null;

  if (!nodeId || !targetParentId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'move_node requires nodeId/entity_id and targetParentId'
    );
  }

  const [sourceNode, targetParentNode] = await Promise.all([
    nodeService.getNodeById(nodeId, { populate: '' }),
    nodeService.getNodeById(targetParentId, { populate: '' }),
  ]);
  assertTenantOwned({
    entity: sourceNode,
    tenantId: event.tenant_id,
    entityName: 'Node',
  });
  assertTenantOwned({
    entity: targetParentNode,
    tenantId: event.tenant_id,
    entityName: 'Target parent node',
  });

  if (moveFamily && level) {
    await cascadeMoveFamilyLevelAlignment({
      nodeId,
      targetLevelId: level,
      tenantId: event.tenant_id,
    });
  } else if (level || structure) {
    const levelUpdate = {};
    if (level) levelUpdate.level = level;
    if (structure) levelUpdate.structure = structure;
    await nodeService.updateNodeById(nodeId, levelUpdate);
  }

  const node = await nodeService.moveNodeToParent(nodeId, targetParentId);
  return {
    handled: true,
    resultType: 'node_moved',
    entityId: String(node?._id || node?.id || nodeId),
    parent: targetParentId,
    movedFamily: moveFamily,
  };
};

const handleDeleteNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const nodeId = payload.nodeId || event.entity_id;
  const hardDelete = Boolean(payload.hardDelete);

  if (!nodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_node requires nodeId or node entity_id'
    );
  }

  const node = await nodeService.deleteNodeById(nodeId, hardDelete, {
    includeDeleted: hardDelete,
  });
  return {
    handled: true,
    resultType: hardDelete ? 'node_deleted_hard' : 'node_deleted_soft',
    entityId: String(node?._id || node?.id || nodeId),
  };
};

const handleRestoreNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const nodeId = payload.nodeId || event.entity_id;
  if (!nodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'restore_node requires nodeId or node entity_id'
    );
  }

  const node = await nodeService.restoreNodeById(nodeId, payload.restoreBody || {});
  return {
    handled: true,
    resultType: 'node_restored',
    entityId: String(node?._id || node?.id || nodeId),
  };
};

const handleAssignUserToNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const nodeId = payload.nodeId || event.entity_id;
  const userId = payload.userId;

  if (!nodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'assign_user_to_node requires nodeId or node entity_id'
    );
  }
  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'assign_user_to_node payload requires userId'
    );
  }

  const node = await nodeService.getNodeById(nodeId);
  const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
  const merged = Array.from(new Set([...currentUsers, String(userId)]));
  const updated = await nodeService.assignUsersToNode(nodeId, merged);

  return {
    handled: true,
    resultType: 'node_user_assigned',
    nodeId: String(nodeId),
    userId: String(userId),
    totalUsers: (updated?.users || []).length,
  };
};

const handleUnassignUserFromNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const nodeId = payload.nodeId || event.entity_id;
  const userId = payload.userId;

  if (!nodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unassign_user_from_node requires nodeId or node entity_id'
    );
  }
  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unassign_user_from_node payload requires userId'
    );
  }

  const node = await nodeService.getNodeById(nodeId);
  const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
  const filtered = currentUsers.filter((id) => id !== String(userId));
  const updated = await nodeService.assignUsersToNode(nodeId, filtered);

  return {
    handled: true,
    resultType: 'node_user_unassigned',
    nodeId: String(nodeId),
    userId: String(userId),
    totalUsers: (updated?.users || []).length,
  };
};

const handleCreateProject = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormBody = payload.projectFormBody || { ...payload };

  if (!projectFormBody.identity?.name) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_project requires payload.projectFormBody.identity.name'
    );
  }

  const actorUser = await resolveActorUser(event);
  if (!actorUser) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_project requires a valid actor user'
    );
  }

  const created = await projectFormService.createProjectForm(
    projectFormBody,
    event.tenant_id,
    actorUser._id
  );
  return {
    handled: true,
    resultType: 'project_created',
    entityId: String(created?._id || created?.id || ''),
    projectId: created?.projectId || null,
    projectName: created?.configuration?.projectName || null,
  };
};

const handleArchiveProject = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormId = payload.projectFormId || event.entity_id;
  if (!projectFormId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'archive_project requires projectFormId or project entity_id'
    );
  }
  const projectForm = await projectFormService.getProjectFormById(projectFormId);
  assertTenantOwned({
    entity: projectForm,
    tenantId: event.tenant_id,
    entityName: 'Project',
  });

  const archived = await projectFormService.archiveProjectForm(projectFormId);
  return {
    handled: true,
    resultType: 'project_archived',
    entityId: String(archived?._id || archived?.id || projectFormId),
    status: archived?.status || null,
  };
};

const handleRestoreProject = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormId = payload.projectFormId || event.entity_id;
  if (!projectFormId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'restore_project requires projectFormId or project entity_id'
    );
  }
  const projectForm = await projectFormService.getProjectFormById(
    projectFormId,
    { includeDeleted: true }
  );
  assertTenantOwned({
    entity: projectForm,
    tenantId: event.tenant_id,
    entityName: 'Project',
  });

  const restored = await projectFormService.restoreProjectFormById(projectFormId);
  return {
    handled: true,
    resultType: 'project_restored',
    entityId: String(restored?._id || restored?.id || projectFormId),
    status: restored?.status || null,
  };
};

const paymentReferenceFallback = () =>
  `copilot-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const handleCreatePayment = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const paymentBody = payload.paymentBody || { ...payload };

  if (paymentBody.amount === undefined || paymentBody.total === undefined) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_payment requires amount and total'
    );
  }
  if (!paymentBody.currency || !paymentBody.paymentMethod || !paymentBody.purpose) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_payment requires currency, paymentMethod, and purpose'
    );
  }

  const createPayload = {
    ...paymentBody,
    tenantId: paymentBody.tenantId || event.tenant_id,
    userId: paymentBody.userId || event.actor_user_id,
    beneficiaryType:
      paymentBody.beneficiaryType ||
      (paymentBody.purpose === 'collection' ? 'tenant' : 'saby'),
    reference: paymentBody.reference || paymentReferenceFallback(),
  };

  const { payment, created } = await paymentService.createOrGetPayment(createPayload);
  return {
    handled: true,
    resultType: created ? 'payment_created' : 'payment_deduped',
    entityId: String(payment?._id || payment?.id || ''),
    reference: payment?.reference || createPayload.reference,
    status: payment?.status || null,
  };
};

const withPaymentId = (event) => {
  const payload = event.payload_json || {};
  const paymentId = payload.paymentId || event.entity_id;
  if (!paymentId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${event.action_type} requires paymentId or payment entity_id`
    );
  }
  return paymentId;
};

const handleProcessPayment = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const paymentId = withPaymentId(event);
  const payment = await paymentService.processPayment(
    paymentId,
    payload.paymentDetails || payload,
    event.tenant_id
  );
  return {
    handled: true,
    resultType: 'payment_processing',
    entityId: String(payment?._id || payment?.id || paymentId),
    status: payment?.status || null,
  };
};

const handleCompletePayment = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const paymentId = withPaymentId(event);
  const payment = await paymentService.completePayment(
    paymentId,
    payload.completionDetails || payload,
    event.tenant_id
  );
  return {
    handled: true,
    resultType: 'payment_completed',
    entityId: String(payment?._id || payment?.id || paymentId),
    status: payment?.status || null,
  };
};

const handleCancelPayment = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const paymentId = withPaymentId(event);
  const payment = await paymentService.cancelPayment(
    paymentId,
    payload.reason || null,
    event.tenant_id
  );
  return {
    handled: true,
    resultType: 'payment_cancelled',
    entityId: String(payment?._id || payment?.id || paymentId),
    status: payment?.status || null,
  };
};

const handleRefundPayment = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const paymentId = withPaymentId(event);
  const payment = await paymentService.refundPayment(
    paymentId,
    payload.refundDetails || payload,
    event.tenant_id
  );
  return {
    handled: true,
    resultType: 'payment_refunded',
    entityId: String(payment?._id || payment?.id || paymentId),
    status: payment?.status || null,
  };
};

const resolveActionItemId = (event) => {
  const payload = event.payload_json || {};
  return payload.actionItemId || event.entity_id || null;
};

const setActionItemStatus = async (event, nextStatus) => {
  const actionItemId = resolveActionItemId(event);
  if (!actionItemId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${event.action_type} requires actionItemId or task entity_id`
    );
  }

  const result = await postgresPool.query(
    `UPDATE copilot.action_items
     SET status = $2,
         completed_at = CASE WHEN $2 IN ('done','cancelled') THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, status`,
    [actionItemId, nextStatus]
  );
  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Action item not found');
  }
  return result.rows[0];
};

const handleCreateTask = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const updateResult = await postgresPool.query(
    `UPDATE copilot.action_items
     SET title = COALESCE($2, title),
         summary = COALESCE($3, summary),
         due_at = COALESCE($4::timestamptz, due_at),
         assigned_user_id = COALESCE($5, assigned_user_id),
         assigned_role_id = COALESCE($6, assigned_role_id),
         updated_at = NOW()
     WHERE source_event_id = $1
     RETURNING id, title, status`,
    [
      event.id,
      payload.title || null,
      payload.summary || null,
      payload.dueAt || null,
      payload.assignedUserId || null,
      payload.assignedRoleId || null,
    ]
  );

  return {
    handled: true,
    resultType: 'task_created',
    taskItemId: updateResult.rows[0]?.id || null,
    title: updateResult.rows[0]?.title || payload.title || null,
  };
};

const handleCompleteTask = async (event) => {
  const item = await setActionItemStatus(event, 'done');
  return {
    handled: true,
    resultType: 'task_completed',
    taskItemId: item.id,
    status: item.status,
  };
};

const handleReopenTask = async (event) => {
  const item = await setActionItemStatus(event, 'open');
  return {
    handled: true,
    resultType: 'task_reopened',
    taskItemId: item.id,
    status: item.status,
  };
};

const handleCancelTask = async (event) => {
  const item = await setActionItemStatus(event, 'cancelled');
  return {
    handled: true,
    resultType: 'task_cancelled',
    taskItemId: item.id,
    status: item.status,
  };
};

const executeActionEvent = async (event) => {
  switch (event.action_type) {
    case 'create_user':
      return handleCreateUser(event);
    case 'update_user':
      return handleUpdateUser(event);
    case 'deactivate_user':
      return handleDeactivateUser(event);
    case 'reactivate_user':
      return handleReactivateUser(event);
    case 'delete_user':
      return handleDeleteUser(event);
    case 'reset_password':
      return handleResetPassword(event);
    case 'verify_account':
      return handleVerifyAccount(event);
    case 'create_role':
      return handleCreateRole(event);
    case 'delete_role':
      return handleDeleteRole(event);
    case 'assign_role':
      return handleAssignRole(event);
    case 'unassign_role':
      return handleUnassignRole(event);
    case 'grant_permission':
      return handleGrantPermission(event);
    case 'revoke_permission':
      return handleRevokePermission(event);
    case 'create_node':
      return handleCreateNode(event);
    case 'move_node':
      return handleMoveNode(event);
    case 'delete_node':
      return handleDeleteNode(event);
    case 'restore_node':
      return handleRestoreNode(event);
    case 'assign_user_to_node':
      return handleAssignUserToNode(event);
    case 'unassign_user_from_node':
      return handleUnassignUserFromNode(event);
    case 'create_project':
      return handleCreateProject(event);
    case 'archive_project':
      return handleArchiveProject(event);
    case 'restore_project':
      return handleRestoreProject(event);
    case 'create_payment':
      return handleCreatePayment(event);
    case 'process_payment':
      return handleProcessPayment(event);
    case 'complete_payment':
      return handleCompletePayment(event);
    case 'cancel_payment':
      return handleCancelPayment(event);
    case 'refund_payment':
      return handleRefundPayment(event);
    case 'create_task':
      return handleCreateTask(event);
    case 'complete_task':
      return handleCompleteTask(event);
    case 'reopen_task':
      return handleReopenTask(event);
    case 'cancel_task':
      return handleCancelTask(event);
    case 'submit_data':
      return handleSubmitData(event);
    case 'approve_submission':
      return handleApproveSubmission(event);
    case 'reject_submission':
      return handleRejectSubmission(event);
    case 'reopen_submission':
      return handleReopenSubmission(event);
    case 'revoke_approval':
      return handleRevokeApproval(event);
    case 'withdraw_submission':
      return handleWithdrawSubmission(event);
    case 'delete_submission':
      return handleDeleteSubmission(event);
    default:
      return { handled: false, resultType: 'noop' };
  }
};

module.exports = {
  executeActionEvent,
};
