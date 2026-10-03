const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const userService = require('./user.service');
const roleService = require('./role.service');
const nodeService = require('./node.service');
const levelService = require('./level.service');
const structureService = require('./structure.service');
const projectFormService = require('./projectForm.service');
const paymentService = require('./payment.service');
const {
  invalidateTenantEntityCaches,
} = require('./copilotEntityResolver.service');
const { User, Nodes, Level, Structures, InMail, WorkItem, ProjectForm, ProjectFormSubmission } = require('../models');
const inmailService = require('./inmail.service');
const workItemService = require('./workItem.service');
const projectFormSubmissionService = require('./projectFormSubmission.service');
const mongoose = require('mongoose');
const { postgresPool } = require('../config/postgres');
const {
  queueSubmission,
  queueUpdateSubmission,
  queueDeleteSubmission,
} = require('./submission.service');
const {
  validateCopilotActionPayload,
} = require('../validations/copilotAction.validation');

const requireObjectPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Action payload must be an object'
    );
  }
};

const throwActionValidation = (validation) => {
  const err = new ApiError(
    httpStatus.BAD_REQUEST,
    validation.feedback.message,
    true,
    '',
    validation.feedback
  );
  err.feedback = validation.feedback;
  throw err;
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
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Unable to resolve tenant for move_node'
    );
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
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Node path is missing for family move'
    );
  }

  const subtree = await Nodes.find({
    tenantId: resolvedTenantId,
    deletedAt: null,
    path: { $regex: `^${escapeRegex(rootPath)}(?:/|$)` },
  }).populate('level');
  if (!Array.isArray(subtree) || subtree.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No nodes found in family subtree'
    );
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

const invalidateNodeSearchAndResolveCache = async (tenantId) =>
  invalidateEntitySearchAndResolveCache(tenantId, 'node');

const resolveUserDoc = async (id, tenantId) => {
  if (!id) return null;
  const isObj = mongoose.Types.ObjectId.isValid(id);
  let u = isObj ? await User.findById(id) : null;
  if (!u) {
    u = await User.findOne({ userId: id, ...(tenantId ? { tenantId } : {}) });
  }
  return u;
};

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

  if (userBody.status === undefined) {
    userBody.status = true;
  }

  if (!userBody.tenantId) {
    userBody.tenantId = event.tenant_id;
  }

  const initialRoleId = event.payload_json?.userRoleId || event.payload_json?.roleId;
  if (initialRoleId && (!userBody.roles || userBody.roles.length === 0)) {
    userBody.roles = [initialRoleId];
  }

  const createValidation = validateCopilotActionPayload(
    'create_user',
    userBody
  );
  if (!createValidation.ok) {
    throwActionValidation(createValidation);
  }

  const createdUser = await userService.createUser(userBody);

  const rawNodeIds = event.payload_json?.nodeIds || (event.payload_json?.nodeId ? [event.payload_json.nodeId] : []);
  const nodeIds = Array.isArray(rawNodeIds) ? rawNodeIds.filter(Boolean) : [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    try {
      const nId = nodeIds[i];
      // eslint-disable-next-line no-await-in-loop
      const node = await nodeService.getNodeById(nId);
      if (node) {
        const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
        const merged = Array.from(new Set([...currentUsers, String(createdUser._id || createdUser.id)]));
        // eslint-disable-next-line no-await-in-loop
        await nodeService.assignUsersToNode(nId, merged);
      }
    } catch (nodeErr) {
      // Non-fatal node attachment failure
    }
  }

  await invalidateUserSearchAndResolveCache(
    event.tenant_id || userBody.tenantId
  );
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
  const payload = event.payload_json;
  const submissionBody = payload.submissionBody || { ...payload };

  const formId = submissionBody.formId || submissionBody.projectFormId || event.entity_id;
  let projectId = submissionBody.projectId;
  const rawData =
    submissionBody.data ||
    submissionBody.submissionData ||
    submissionBody.formData ||
    {};
  const wrappedData = {
    submissionData: rawData,
    formData: rawData,
    data: rawData,
  };
  const actorUser = await resolveActorUser(event);

  if (formId) {
    const pf = await ProjectForm.findOne({
      $or: [{ _id: formId }, { projectId: formId }],
      tenantId: event.tenant_id,
      deletedAt: null,
    });
    if (pf) {
      projectId = pf.projectId || String(pf._id);
      tenantId = pf.tenantId;
    }
  }

  // Create submission directly via projectFormSubmissionService
  const created = await projectFormSubmissionService.createSubmission(
    wrappedData,
    projectId || formId,
    tenantId,
    actorUser?._id || null
  );

  return {
    handled: true,
    resultType: 'submission_created',
    entityId: String(created._id || created.id),
    submissionId: String(created._id || created.id),
    projectId,
    status: created.status || 'submitted',
  };
};

const handleApproveSubmission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || payload.id || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'approve_submission requires submissionId or submission entity_id'
    );
  }

  const submission = await ProjectFormSubmission.findOne({
    _id: submissionId,
    tenantId: event.tenant_id,
    deletedAt: null,
  });

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  submission.status = 'approved';
  submission.processedAt = new Date();
  if (event.actor_user_id) {
    submission.processedBy = event.actor_user_id;
  }
  await submission.save();

  return {
    handled: true,
    resultType: 'submission_approved',
    entityId: String(submission._id || submission.id),
    submissionId: String(submission._id || submission.id),
    status: 'approved',
  };
};

const handleRejectSubmission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || payload.id || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'reject_submission requires submissionId or submission entity_id'
    );
  }

  const submission = await ProjectFormSubmission.findOne({
    _id: submissionId,
    tenantId: event.tenant_id,
    deletedAt: null,
  });

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  submission.status = 'rejected';
  submission.processedAt = new Date();
  if (payload.reason) {
    submission.rejectionReason = payload.reason;
  }
  if (event.actor_user_id) {
    submission.processedBy = event.actor_user_id;
  }
  await submission.save();

  return {
    handled: true,
    resultType: 'submission_rejected',
    entityId: String(submission._id || submission.id),
    submissionId: String(submission._id || submission.id),
    status: 'rejected',
  };
};

const handleReopenSubmission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || payload.id || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'reopen_submission requires submissionId or submission entity_id'
    );
  }

  const submission = await ProjectFormSubmission.findOne({
    _id: submissionId,
    tenantId: event.tenant_id,
    deletedAt: null,
  });

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  submission.status = 'submitted';
  await submission.save();

  return {
    handled: true,
    resultType: 'submission_reopened',
    entityId: String(submission._id || submission.id),
    submissionId: String(submission._id || submission.id),
    status: 'submitted',
  };
};

const handleDeleteSubmission = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const submissionId = payload.submissionId || payload.id || event.entity_id;

  if (!submissionId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_submission requires submissionId or submission entity_id'
    );
  }

  const submission = await ProjectFormSubmission.findOne({
    _id: submissionId,
    tenantId: event.tenant_id,
    deletedAt: null,
  });

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  submission.deletedAt = new Date();
  await submission.save();

  return {
    handled: true,
    resultType: 'submission_deleted',
    entityId: String(submission._id || submission.id),
    submissionId: String(submission._id || submission.id),
    status: 'deleted',
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
  const rawUserId = payload.userId || event.entity_id;

  if (!rawUserId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'update_user requires userId or user entity_id'
    );
  }

  const userDoc = await resolveUserDoc(rawUserId, event.tenant_id);
  const userId = userDoc ? String(userDoc._id) : rawUserId;

  const actorUser = await resolveActorUser(event);
  const updates = payload.userBody || payload.updateBody || { ...payload };
  delete updates.userId;
  delete updates.updateBody;
  delete updates.userBody;
  delete updates.nodeId;
  delete updates.nodeIds;

  const updatedUser = await userService.updateUserById(
    userId,
    updates,
    actorUser
  );

  const rawNodeIds = payload.nodeIds || (payload.nodeId ? [payload.nodeId] : []);
  const nodeIds = Array.isArray(rawNodeIds) ? rawNodeIds.filter(Boolean) : [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const node = await nodeService.getNodeById(nodeIds[i]);
      if (node) {
        const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
        const userObjId = String(updatedUser._id || updatedUser.id);
        const merged = Array.from(new Set([...currentUsers, userObjId]));
        // eslint-disable-next-line no-await-in-loop
        await nodeService.assignUsersToNode(node._id, merged);
        // eslint-disable-next-line no-await-in-loop
        await invalidateNodeSearchAndResolveCache(event.tenant_id || node?.tenantId);
      }
    } catch {
      // non-fatal node assignment error on update
    }
  }

  await invalidateUserSearchAndResolveCache(
    event.tenant_id || updatedUser?.tenantId
  );
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

  const deactivateValidation = validateCopilotActionPayload('deactivate_user', {
    userId,
  });
  if (!deactivateValidation.ok) {
    throwActionValidation(deactivateValidation);
  }

  const result = await userService.softDeleteUserById(userId);
  if (result?.error) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error);
  }

  const deletedUser = result?.deletedUser || null;
  await invalidateUserSearchAndResolveCache(
    event.tenant_id || deletedUser?.tenantId
  );
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

  const reactivateValidation = validateCopilotActionPayload('reactivate_user', {
    userId,
  });
  if (!reactivateValidation.ok) {
    throwActionValidation(reactivateValidation);
  }

  const result = await userService.restoreUserByUserId(userId);
  if (result?.error) {
    throw new ApiError(httpStatus.BAD_REQUEST, result.error);
  }

  const restoredUser = result?.restoredUser || null;
  await invalidateUserSearchAndResolveCache(
    event.tenant_id || restoredUser?.tenantId
  );
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

  const deleteValidation = validateCopilotActionPayload('delete_user', {
    userId,
  });
  if (!deleteValidation.ok) {
    throwActionValidation(deleteValidation);
  }

  const deleted = await userService.deleteUserById(userId);
  await invalidateUserSearchAndResolveCache(
    event.tenant_id || deleted?.tenantId
  );
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
  const email = String(payload.email || payload.userEmail || '')
    .trim()
    .toLowerCase();
  const newPassword = String(
    payload.newPassword || payload.password || ''
  ).trim();

  if (!email) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'reset_password requires email');
  }
  if (!newPassword) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'reset_password requires newPassword'
    );
  }

  const resetValidation = validateCopilotActionPayload('reset_password', {
    email,
    newPassword,
  });
  if (!resetValidation.ok) {
    throwActionValidation(resetValidation);
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
  const email = String(payload.email || payload.userEmail || '')
    .trim()
    .toLowerCase();
  const rawUserId = payload.userId || payload.id || event.entity_id;
  const phone = payload.phone || payload.phoneNumber;

  let user = null;
  if (email) {
    user = await userService.getUserByEmail(email);
  } else if (rawUserId) {
    user = await resolveUserDoc(rawUserId, event.tenant_id);
  } else if (phone) {
    user = await User.findOne({
      $or: [{ phone }, { phoneNumber: phone }],
      tenantId: event.tenant_id,
    });
  }

  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'User not found for account verification'
    );
  }
  if (String(user.tenantId || '') !== String(event.tenant_id || '')) {
    throw new ApiError(httpStatus.FORBIDDEN, 'User does not belong to tenant');
  }

  const verifyEmail =
    payload.verifyEmail !== false && payload.channel !== 'phone';
  const verifyPhone =
    payload.verifyPhone === true ||
    payload.isPhoneVerified === true ||
    payload.channel === 'phone' ||
    payload.channel === 'all' ||
    (payload.verifyEmail === false && payload.verifyPhone !== false) ||
    (payload.channel === undefined &&
      payload.verifyPhone === undefined &&
      Boolean(user.phone || user.phoneNumber));

  const updateFields = {
    otpVerified: true,
    status: true,
    otp: null,
    otpExpires: null,
  };
  if (verifyEmail) {
    updateFields.isEmailVerified = true;
  }
  if (verifyPhone) {
    updateFields.isPhoneVerified = true;
  }

  const updated = await userService.updateUserById(
    user._id,
    updateFields,
    await resolveActorUser(event)
  );
  await invalidateUserSearchAndResolveCache(event.tenant_id || user?.tenantId);

  return {
    handled: true,
    resultType: 'account_verified',
    entityId: String(updated?._id || user?._id || ''),
    email: user.email,
    isEmailVerified: updated?.isEmailVerified ?? user.isEmailVerified,
    isPhoneVerified: updated?.isPhoneVerified ?? user.isPhoneVerified,
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
  const deletedRole = await roleService.deleteRoleById(
    roleId,
    actorUser || null
  );
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

  const rawNodeIds = payload.nodeIds || (payload.nodeId ? [payload.nodeId] : []);
  const nodeIds = Array.isArray(rawNodeIds) ? rawNodeIds.filter(Boolean) : [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const node = await nodeService.getNodeById(nodeIds[i]);
      if (node) {
        const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
        const userObjId = String(targetUser._id || targetUser.id);
        const merged = Array.from(new Set([...currentUsers, userObjId]));
        // eslint-disable-next-line no-await-in-loop
        await nodeService.assignUsersToNode(node._id, merged);
        // eslint-disable-next-line no-await-in-loop
        await invalidateNodeSearchAndResolveCache(event.tenant_id || node?.tenantId);
      }
    } catch {
      // non-fatal node assignment error
    }
  }

  await invalidateUserSearchAndResolveCache(
    event.tenant_id || updatedUser?.tenantId
  );
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
  await invalidateUserSearchAndResolveCache(
    event.tenant_id || updatedUser?.tenantId
  );

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

  const updatedRole = await roleService.assignPermissions(
    roleId,
    permissionIds
  );
  await invalidateRoleSearchAndResolveCache(
    event.tenant_id || updatedRole?.tenantId
  );
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
  await invalidateRoleSearchAndResolveCache(
    event.tenant_id || updatedRole?.tenantId
  );
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
  const tenantId = event.tenant_id || nodeBody.tenantId;

  // 1. Name normalization (accepts name or nodeName)
  const name = String(nodeBody.name || nodeBody.nodeName || '').trim();
  if (!name) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_node payload requires name'
    );
  }
  nodeBody.name = name;

  // 2. Parent resolution (accepts parent, parentNodeId, parentId)
  const parentRef = nodeBody.parent || nodeBody.parentNodeId || nodeBody.parentId;
  let resolvedParent = null;
  if (parentRef) {
    if (mongoose.Types.ObjectId.isValid(parentRef)) {
      resolvedParent = await Nodes.findOne({ _id: parentRef, tenantId });
    }
    if (!resolvedParent) {
      resolvedParent = await Nodes.findOne({ nodeId: String(parentRef), tenantId });
    }
    if (!resolvedParent) {
      resolvedParent = await Nodes.findOne({
        tenantId,
        name: new RegExp(`^${escapeRegex(String(parentRef).trim())}$`, 'i'),
      });
    }
    if (resolvedParent) {
      nodeBody.parent = resolvedParent._id;
    }
  }

  // 3. Level resolution (accepts level, levelId, levelName, or parent inheritance)
  const levelRef = nodeBody.level || nodeBody.levelId || nodeBody.levelName;
  let resolvedLevel = null;
  if (levelRef) {
    if (mongoose.Types.ObjectId.isValid(levelRef)) {
      resolvedLevel = await Level.findOne({ _id: levelRef, tenantId });
    }
    if (!resolvedLevel) {
      resolvedLevel = await Level.findOne({
        tenantId,
        name: new RegExp(`^${escapeRegex(String(levelRef).trim())}$`, 'i'),
      });
    }
  }

  // If level not explicitly given, try to resolve from parent's level + 1 rank
  if (!resolvedLevel && resolvedParent && resolvedParent.level) {
    const parentLevelDoc = await Level.findById(resolvedParent.level);
    if (parentLevelDoc) {
      const nextRank = (parentLevelDoc.rank ?? 0) + 1;
      resolvedLevel = await Level.findOne({ tenantId, rank: nextRank, isActive: true });
    }
  }

  // If still not resolved and tenant has levels, pick default
  if (!resolvedLevel && !levelRef) {
    resolvedLevel = await Level.findOne({ tenantId, isActive: true }).sort({ rank: 1 });
  }

  if (resolvedLevel) {
    nodeBody.level = resolvedLevel._id;
  } else if (!nodeBody.level) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_node payload requires level (provide level ID or level name)'
    );
  }

  // 4. Structure resolution (accepts structure, structureId, structureName, or inheritance)
  const structRef = nodeBody.structure || nodeBody.structureId || nodeBody.structureName;
  let resolvedStructure = null;
  if (structRef) {
    if (mongoose.Types.ObjectId.isValid(structRef)) {
      resolvedStructure = await Structures.findOne({ _id: structRef, tenantId });
    }
    if (!resolvedStructure) {
      resolvedStructure = await Structures.findOne({
        tenantId,
        name: new RegExp(`^${escapeRegex(String(structRef).trim())}$`, 'i'),
      });
    }
  }

  // Inherit structure from level if level links to one
  if (!resolvedStructure && resolvedLevel) {
    resolvedStructure = await Structures.findOne({ tenantId, level: resolvedLevel._id, isActive: true });
  }

  // Inherit structure from parent node if parent exists
  if (!resolvedStructure && resolvedParent && resolvedParent.structure) {
    resolvedStructure = await Structures.findById(resolvedParent.structure);
  }

  // Fallback to active tenant structure
  if (!resolvedStructure && !structRef) {
    resolvedStructure = await Structures.findOne({ tenantId, isActive: true });
  }

  if (resolvedStructure) {
    nodeBody.structure = resolvedStructure._id;
  } else if (!nodeBody.structure) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_node payload requires structure (provide structure ID or structure name)'
    );
  }

  nodeBody.tenantId = tenantId;

  const node = await nodeService.createNode(nodeBody);
  return {
    handled: true,
    resultType: 'node_created',
    entityId: String(node?._id || node?.id || node?.nodeId || ''),
    nodeId: node?.nodeId || null,
    name: node?.name || nodeBody.name,
  };
};

const handleCreateLevel = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const tenantId = event.tenant_id || payload.tenantId;
  const name = String(payload.name || payload.levelName || '').trim();
  if (!name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'create_level payload requires name');
  }
  const rank = Number(payload.rank ?? payload.levelRank);
  if (!Number.isFinite(rank)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'create_level payload requires numeric rank');
  }

  const level = await levelService.createLevel({
    tenantId,
    name,
    rank,
    description: payload.description || '',
    isSpecial: Boolean(payload.isSpecial),
    isActive: true,
  });

  return {
    handled: true,
    resultType: 'level_created',
    entityId: String(level?._id || level?.id || ''),
    name: level?.name || name,
    rank: level?.rank ?? rank,
  };
};

const handleCreateStructure = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const tenantId = event.tenant_id || payload.tenantId;
  const name = String(payload.name || payload.structureName || '').trim();
  if (!name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'create_structure payload requires name');
  }

  let levelId = payload.level || payload.levelId;
  if (levelId && !mongoose.Types.ObjectId.isValid(levelId)) {
    const levelDoc = await Level.findOne({
      tenantId,
      name: new RegExp(`^${escapeRegex(String(levelId).trim())}$`, 'i'),
    });
    if (levelDoc) levelId = levelDoc._id;
  }

  const structure = await structureService.createStructure({
    tenantId,
    name,
    level: levelId || null,
    description: payload.description || '',
    isSpecial: Boolean(payload.isSpecial),
    isActive: true,
  });

  return {
    handled: true,
    resultType: 'structure_created',
    entityId: String(structure?._id || structure?.id || ''),
    name: structure?.name || name,
  };
};

const parseRawCsvText = (text) => {
  const lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  const parseRow = (line) => {
    const row = [];
    let insideQuote = false;
    let entry = '';
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = '';
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    return row.map((c) => c.replace(/^["']|["']$/g, '').trim());
  };

  const headers = parseRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseRow(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    rows.push(obj);
  }
  return rows;
};

const handleBulkImportNodes = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const tenantId = event.tenant_id || payload.tenantId;

  let rawRows = [];
  if (Array.isArray(payload.nodes)) {
    rawRows = payload.nodes;
  } else if (payload.csvText) {
    rawRows = parseRawCsvText(payload.csvText);
  } else if (payload.filePath && fs.existsSync(payload.filePath)) {
    const fileContent = fs.readFileSync(payload.filePath, 'utf8');
    if (payload.filePath.endsWith('.json')) {
      const parsed = JSON.parse(fileContent);
      rawRows = Array.isArray(parsed) ? parsed : parsed.nodes || [];
    } else {
      rawRows = parseRawCsvText(fileContent);
    }
  }

  // Pre-load tenant levels and structures to resolve ObjectIds
  const tenantLevels = await Level.find({ tenantId, deletedAt: null });
  const tenantStructures = await Structures.find({ tenantId, deletedAt: null });

  const levelByRank = new Map();
  const levelByName = new Map();
  tenantLevels.forEach((lvl) => {
    levelByRank.set(Number(lvl.rank), lvl);
    levelByName.set(String(lvl.name).trim().toLowerCase(), lvl);
  });

  const structureByName = new Map();
  const structureByType = new Map();
  const structureByLevelId = new Map();
  tenantStructures.forEach((str) => {
    structureByName.set(String(str.name).trim().toLowerCase(), str);
    if (str.type) structureByType.set(String(str.type).trim().toLowerCase(), str);
    if (str.level) structureByLevelId.set(String(str.level), str);
  });

  // Ensure every level has a matching Structure (required by Node pre-save hook)
  for (const lvl of tenantLevels) {
    const lvlIdStr = String(lvl._id);
    if (!structureByLevelId.has(lvlIdStr)) {
      const newStruct = await Structures.create({
        tenantId,
        name: `${lvl.name} Structure`,
        level: lvl._id,
        parent: null,
        isActive: true,
        isSpecial: Boolean(lvl.isSpecial),
        type: lvl.rank === 0 ? 'headquarters' : 'branch',
      });
      structureByLevelId.set(lvlIdStr, newStruct);
      tenantStructures.push(newStruct);
    }
  }
  const defaultStructure = tenantStructures[0] || null;

  // Process rows and build tree relationships
  const stack = {}; // rank -> nodeName
  const nodeObjects = [];

  for (let idx = 0; idx < rawRows.length; idx += 1) {
    const row = rawRows[idx];
    const name = row.NODE_NAME || row.node_name || row['CHURCH NAME'] || row.church_name || row.name || row.nodeName;
    if (!name) continue;

    const rawLevel = row.LEVEL ?? row.level ?? row.level_name ?? row.levelName ?? '';
    let rank = Number(rawLevel);
    let resolvedLevel = null;
    if (Number.isFinite(rank) && levelByRank.has(rank)) {
      resolvedLevel = levelByRank.get(rank);
    } else if (typeof rawLevel === 'string' && levelByName.has(rawLevel.trim().toLowerCase())) {
      resolvedLevel = levelByName.get(rawLevel.trim().toLowerCase());
      rank = Number(resolvedLevel.rank);
    } else {
      rank = Number.isFinite(rank) ? rank : 0;
    }

    let parentName = row.PARENT || row.parent || row.parent_node_name || row.parentName || null;
    if (!parentName && rank > 0) {
      for (let r = rank - 1; r >= 0; r -= 1) {
        if (stack[r]) {
          parentName = stack[r];
          break;
        }
      }
    }

    stack[rank] = name;
    Object.keys(stack).forEach((r) => {
      if (Number(r) > rank) delete stack[r];
    });

    const rawStructure = row.STRUCTURE || row.structure || row.structure_name || row.structureName || '';
    const resolvedStructure =
      (resolvedLevel ? structureByLevelId.get(String(resolvedLevel._id)) : null) ||
      structureByName.get(String(rawStructure).trim().toLowerCase()) ||
      structureByType.get(String(rawStructure).trim().toLowerCase()) ||
      defaultStructure;

    nodeObjects.push({
      name,
      parentName,
      level: resolvedLevel ? resolvedLevel._id : null,
      structure: resolvedStructure ? resolvedStructure._id : null,
      type: rawStructure || (resolvedStructure ? resolvedStructure.type : 'branch'),
      address: row.ADDRESS || row.address || '',
      city: row.CITY || row.city || '',
      state: row.REGION_STATE || row.state || '',
      country: row.COUNTRY || row.country || '',
      tenantId,
      isActive: true,
    });
  }

  if (payload.dryRun) {
    return {
      handled: true,
      resultType: 'bulk_import_nodes_dry_run',
      count: nodeObjects.length,
      sample: nodeObjects.slice(0, 5),
    };
  }

  // Topological node creation & parent linking
  const nameToDoc = new Map();
  const existingNodes = await Nodes.find({ tenantId, deletedAt: null }, { name: 1, _id: 1, path: 1, nodeId: 1 });
  existingNodes.forEach((en) => {
    nameToDoc.set(String(en.name).trim().toLowerCase(), en);
  });

  const createdNodes = [];
  for (let i = 0; i < nodeObjects.length; i += 1) {
    const n = nodeObjects[i];
    const existing = nameToDoc.get(String(n.name).trim().toLowerCase());
    if (existing) {
      createdNodes.push(existing);
      continue;
    }

    let parentNode = null;
    if (n.parentName) {
      parentNode = nameToDoc.get(String(n.parentName).trim().toLowerCase());
    }

    const generatedIds = await Nodes.generateNodeIds(1);
    const nodeDoc = new Nodes({
      tenantId,
      name: n.name,
      nodeId: generatedIds[0],
      level: n.level,
      structure: n.structure,
      type: n.type,
      parent: parentNode ? parentNode._id : null,
      address: n.address,
      city: n.city,
      state: n.state,
      country: n.country,
      isActive: true,
    });

    if (parentNode) {
      nodeDoc.path = `${parentNode.path || parentNode._id}/${nodeDoc._id}`;
    } else {
      nodeDoc.path = String(nodeDoc._id);
    }

    await nodeDoc.save();
    nameToDoc.set(String(n.name).trim().toLowerCase(), nodeDoc);
    createdNodes.push(nodeDoc);
  }

  await invalidateNodeSearchAndResolveCache(tenantId);

  // Replicate to PostgreSQL dimensions (public.node_dimension and copilot.node_dimension)
  try {
    const { upsertNodeDimension } = require('./nodeSync.service');
    for (const nodeDoc of createdNodes) {
      await upsertNodeDimension(nodeDoc);
    }
  } catch (err) {
    logger.warn(`[handleBulkImportNodes] Warning: failed to upsert public.node_dimension: ${err.message}`);
  }

  try {
    const { syncTenantNodeHierarchy } = require('./copilotNodeDimensionSync.service');
    await syncTenantNodeHierarchy(tenantId);
  } catch (err) {
    logger.warn(`[handleBulkImportNodes] Warning: failed to sync copilot.node_dimension: ${err.message}`);
  }

  return {
    handled: true,
    resultType: 'bulk_import_nodes_completed',
    count: createdNodes.length,
    totalNodes: createdNodes.length,
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

  const node = await nodeService.restoreNodeById(
    nodeId,
    payload.restoreBody || {}
  );
  return {
    handled: true,
    resultType: 'node_restored',
    entityId: String(node?._id || node?.id || nodeId),
  };
};

const handleAssignUserToNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const rawNodeId = payload.nodeId || event.entity_id;
  const rawUserId = payload.userId;

  if (!rawNodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'assign_user_to_node requires nodeId or node entity_id'
    );
  }
  if (!rawUserId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'assign_user_to_node payload requires userId'
    );
  }

  const user = await resolveUserDoc(rawUserId, event.tenant_id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, `User not found: ${rawUserId}`);
  }

  const node = await nodeService.getNodeById(rawNodeId);
  const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
  const userObjectIdStr = String(user._id);
  const merged = Array.from(new Set([...currentUsers, userObjectIdStr]));
  const updated = await nodeService.assignUsersToNode(node._id, merged);
  await invalidateNodeSearchAndResolveCache(event.tenant_id || node?.tenantId);
  await invalidateUserSearchAndResolveCache(event.tenant_id || user?.tenantId);

  return {
    handled: true,
    resultType: 'node_user_assigned',
    nodeId: String(node.nodeId || node._id),
    userId: String(user.userId || user._id),
    totalUsers: (updated?.users || []).length,
  };
};

const handleUnassignUserFromNode = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const rawNodeId = payload.nodeId || event.entity_id;
  const rawUserId = payload.userId;

  if (!rawNodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unassign_user_from_node requires nodeId or node entity_id'
    );
  }
  if (!rawUserId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unassign_user_from_node payload requires userId'
    );
  }

  const user = await resolveUserDoc(rawUserId, event.tenant_id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, `User not found: ${rawUserId}`);
  }

  const node = await nodeService.getNodeById(rawNodeId);
  const currentUsers = (node.users || []).map(normalizeIdRef).filter(Boolean);
  const userObjectIdStr = String(user._id);
  const filtered = currentUsers.filter((id) => id !== userObjectIdStr);
  const updated = await nodeService.assignUsersToNode(node._id, filtered);
  await invalidateNodeSearchAndResolveCache(event.tenant_id || node?.tenantId);
  await invalidateUserSearchAndResolveCache(event.tenant_id || user?.tenantId);

  return {
    handled: true,
    resultType: 'node_user_unassigned',
    nodeId: String(node.nodeId || node._id),
    userId: String(user.userId || user._id),
    totalUsers: (updated?.users || []).length,
  };
};

const handleCreateProject = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  let projectFormBody = payload.projectFormBody || (payload.body && typeof payload.body === 'object' ? payload.body : { ...payload });

  const formName =
    projectFormBody.identity?.name ||
    payload.title ||
    payload.name ||
    payload.projectName ||
    projectFormBody.title ||
    projectFormBody.name ||
    projectFormBody.projectName;

  if (!projectFormBody.identity) {
    projectFormBody.identity = {};
  }
  if (!projectFormBody.identity.name && formName) {
    projectFormBody.identity.name = formName;
  }

  if (!projectFormBody.identity.name) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'create_project requires payload.projectFormBody.identity.name or title'
    );
  }

  if (!Array.isArray(projectFormBody.elements) && Array.isArray(payload.elements)) {
    projectFormBody.elements = payload.elements;
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

  // Read-back verification
  const verified = await ProjectForm.findOne({
    _id: created._id,
    tenantId: event.tenant_id,
    deletedAt: null,
  });
  if (!verified) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Form creation verification failed: form not found post-creation'
    );
  }

  return {
    handled: true,
    resultType: 'project_created',
    entityId: String(verified._id || verified.id || ''),
    projectId: verified.projectId || null,
    projectName: verified.identity?.name || verified.configuration?.projectName || null,
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
  const projectForm = await projectFormService.getProjectFormById(
    projectFormId
  );
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

  const restored = await projectFormService.restoreProjectFormById(
    projectFormId
  );
  return {
    handled: true,
    resultType: 'project_restored',
    entityId: String(restored?._id || restored?.id || projectFormId),
    status: restored?.status || null,
  };
};

const handleUpdateProjectForm = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormId = payload.projectFormId || payload.id || payload.formId || event.entity_id;
  if (!projectFormId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'update_project_form requires projectFormId, id, or entity_id'
    );
  }
  const projectForm = await projectFormService.getProjectFormById(projectFormId);
  assertTenantOwned({
    entity: projectForm,
    tenantId: event.tenant_id,
    entityName: 'ProjectForm',
  });

  const actorUser = await resolveActorUser(event);
  const actorUserId = actorUser?._id ? String(actorUser._id) : null;

  const updateBody = payload.projectFormBody || payload.updateBody || { ...payload };
  delete updateBody.projectFormId;
  delete updateBody.id;
  delete updateBody.formId;
  delete updateBody.entityId;
  delete updateBody.idempotencyKey;
  delete updateBody.approvalToken;
  delete updateBody.correlationId;
  delete updateBody.lockKey;

  if (updateBody.title && !updateBody.identity?.name) {
    updateBody.identity = updateBody.identity || {};
    updateBody.identity.name = updateBody.title;
  }
  if (updateBody.name && !updateBody.identity?.name) {
    updateBody.identity = updateBody.identity || {};
    updateBody.identity.name = updateBody.name;
  }
  if (updateBody.description !== undefined) {
    updateBody.identity = updateBody.identity || {};
    updateBody.identity.description = updateBody.description;
  }

  const updated = await projectFormService.updateProjectFormById(
    projectFormId,
    updateBody,
    { actorUserId }
  );

  return {
    handled: true,
    resultType: 'project_form_updated',
    entityId: String(updated._id || updated.id || projectFormId),
    title: updated.identity?.name || updated.title || null,
    elementsCount: Array.isArray(updated.elements) ? updated.elements.length : 0,
    status: updated.identity?.status || updated.status || null,
    schemaVersion: updated.schemaVersion || updated.metadata?.schemaVersion || null,
  };
};

const handlePublishProjectForm = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormId = payload.projectFormId || payload.id || payload.formId || event.entity_id;
  if (!projectFormId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'publish_project_form requires projectFormId, id, or entity_id'
    );
  }
  const projectForm = await projectFormService.getProjectFormById(projectFormId);
  assertTenantOwned({
    entity: projectForm,
    tenantId: event.tenant_id,
    entityName: 'ProjectForm',
  });

  const published = await projectFormService.publishProjectForm(projectFormId);
  return {
    handled: true,
    resultType: 'project_form_published',
    entityId: String(published._id || published.id || projectFormId),
    status: published.identity?.status || published.status || 'published',
  };
};

const handleUnpublishProjectForm = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormId = payload.projectFormId || payload.id || payload.formId || event.entity_id;
  if (!projectFormId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'unpublish_project_form requires projectFormId, id, or entity_id'
    );
  }
  const projectForm = await projectFormService.getProjectFormById(projectFormId);
  assertTenantOwned({
    entity: projectForm,
    tenantId: event.tenant_id,
    entityName: 'ProjectForm',
  });

  const unpublished = await projectFormService.unpublishProjectForm(projectFormId);
  return {
    handled: true,
    resultType: 'project_form_unpublished',
    entityId: String(unpublished._id || unpublished.id || projectFormId),
    status: unpublished.identity?.status || unpublished.status || 'draft',
  };
};

const handleDeleteProjectForm = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const projectFormId = payload.projectFormId || payload.id || payload.formId || event.entity_id;
  if (!projectFormId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_project_form requires projectFormId, id, or entity_id'
    );
  }
  const projectForm = await projectFormService.getProjectFormById(projectFormId);
  assertTenantOwned({
    entity: projectForm,
    tenantId: event.tenant_id,
    entityName: 'ProjectForm',
  });

  const actorUser = await resolveActorUser(event);
  const deleted = await projectFormService.softDeleteProjectFormById(
    projectFormId,
    actorUser?._id || null
  );
  return {
    handled: true,
    resultType: 'project_form_deleted',
    entityId: String(deleted?._id || deleted?.id || projectFormId),
    status: 'deleted',
  };
};

const paymentReferenceFallback = () =>
  `copilot-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

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
  if (
    !paymentBody.currency ||
    !paymentBody.paymentMethod ||
    !paymentBody.purpose
  ) {
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

  const { payment, created } = await paymentService.createOrGetPayment(
    createPayload
  );
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
  return (
    payload.actionItemId ||
    payload.id ||
    payload.taskId ||
    payload.taskItemId ||
    payload.entityId ||
    event.entity_id ||
    null
  );
};

const setActionItemStatus = async (event, nextStatus) => {
  const actionItemId = resolveActionItemId(event);
  if (!actionItemId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${event.action_type} requires actionItemId or task entity_id`
    );
  }

  // 1. Try updating canonical MongoDB WorkItem
  const mongoStatus =
    nextStatus === 'done'
      ? 'completed'
      : nextStatus === 'open'
      ? 'scheduled'
      : 'cancelled';
  let mongoItem = null;
  try {
    const isMongoId = mongoose.Types.ObjectId.isValid(actionItemId);
    const query = isMongoId
      ? { $or: [{ _id: actionItemId }, { shareCode: actionItemId }], tenantId: event.tenant_id }
      : { shareCode: actionItemId, tenantId: event.tenant_id };
    mongoItem = await WorkItem.findOneAndUpdate(
      query,
      { $set: { status: mongoStatus } },
      { new: true }
    );
  } catch (err) {
    // Non-fatal if ID format is not a Mongo ObjectId
  }

  if (mongoItem) {
    return {
      entityId: String(mongoItem._id),
      id: String(mongoItem._id),
      status: mongoItem.status,
    };
  }

  // 2. Fallback to copilot.action_items in Postgres
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
  const tenantId = event.tenant_id;
  const actorUserId = event.actor_user_id || payload.userId || 'system';

  const startAt = payload.startAt || new Date().toISOString();
  const endAt =
    payload.dueAt ||
    payload.dueDate ||
    payload.endAt ||
    new Date(new Date(startAt).getTime() + 24 * 60 * 60 * 1000).toISOString();

  let assignees = [];
  if (Array.isArray(payload.assignees)) {
    assignees = payload.assignees.map((a) => {
      if (typeof a === 'string') {
        if (a === '@all' || a === 'all' || a === 'allofus') return { kind: 'all', name: '@all (All Users)' };
        return { kind: 'user', userId: a };
      }
      return a;
    });
  } else if (payload.assignedAll || payload.assignToAll) {
    assignees = [{ kind: 'all', name: '@all (All Users)' }];
  } else if (payload.assignedUserId) {
    assignees = [{ kind: 'user', userId: payload.assignedUserId }];
  } else if (payload.assignedRoleId || payload.roleId) {
    assignees = [{ kind: 'role', roleId: payload.assignedRoleId || payload.roleId }];
  }

  const reminder =
    payload.reminder ||
    (payload.reminderMinutes != null
      ? {
          enabled: true,
          leadTimeMinutes: Number(payload.reminderMinutes),
          channels: payload.reminderChannels || ['email'],
        }
      : undefined);

  let workItem = null;
  if (workItemService && typeof workItemService.createWorkItem === 'function') {
    workItem = await workItemService.createWorkItem(
      {
        type: 'task',
        title: payload.title,
        description: payload.description || payload.summary || '',
        startAt,
        endAt,
        priority: payload.priority || 'medium',
        assignees,
        formAttachment: payload.formAttachment,
        reminder,
        idempotencyKey: payload.idempotencyKey,
      },
      { tenantId, id: actorUserId, _id: actorUserId }
    );
  }

  // Read-back verification
  let verified = null;
  if (workItem && workItem._id) {
    verified = await WorkItem.findOne({ _id: workItem._id, tenantId });
    if (!verified) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Task verification failed: workItem not found post-creation'
      );
    }
  }

  // Also maintain postgres action_items if source_event_id is present
  let postgresItem = null;
  try {
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
    postgresItem = updateResult.rows[0];
  } catch (err) {
    // Non-fatal if postgres table is absent or unlinked
  }

  return {
    handled: true,
    resultType: 'task_created',
    entityId: verified ? String(verified._id) : (postgresItem?.id || null),
    taskId: verified ? String(verified._id) : (postgresItem?.id || null),
    taskItemId: verified ? String(verified._id) : (postgresItem?.id || null),
    title: verified ? verified.title : (postgresItem?.title || payload.title || null),
    status: verified ? verified.status : (postgresItem?.status || 'scheduled'),
  };
};

const handleCreateEvent = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const tenantId = event.tenant_id;
  const actorUserId = event.actor_user_id || payload.userId || 'system';

  const startAt = payload.startAt || payload.startDate || new Date().toISOString();
  const endAt =
    payload.endAt ||
    payload.endDate ||
    new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();

  let assignees = [];
  if (Array.isArray(payload.assignees)) {
    assignees = payload.assignees.map((a) => {
      if (typeof a === 'string') {
        if (a === '@all' || a === 'all' || a === 'allofus') return { kind: 'all', name: '@all (All Users)' };
        return { kind: 'user', userId: a };
      }
      return a;
    });
  } else if (payload.assignedAll || payload.assignToAll) {
    assignees = [{ kind: 'all', name: '@all (All Users)' }];
  } else if (payload.assignedUserId) {
    assignees = [{ kind: 'user', userId: payload.assignedUserId }];
  } else if (payload.assignedRoleId || payload.roleId) {
    assignees = [{ kind: 'role', roleId: payload.assignedRoleId || payload.roleId }];
  }

  const meeting =
    payload.meeting ||
    (payload.videoConference || payload.createMeeting
      ? {
          enabled: true,
          provider: payload.meetingProvider || 'google_meet',
        }
      : undefined);

  const reminder =
    payload.reminder ||
    (payload.reminderMinutes != null
      ? {
          enabled: true,
          leadTimeMinutes: Number(payload.reminderMinutes),
          channels: payload.reminderChannels || ['inmail'],
        }
      : undefined);

  const workItem = await workItemService.createWorkItem(
    {
      type: 'event',
      title: payload.title,
      description: payload.description || '',
      startAt,
      endAt,
      allDay: Boolean(payload.allDay),
      assignees,
      meeting,
      agendaTopics: payload.agendaTopics,
      formAttachment: payload.formAttachment,
      reminder,
      idempotencyKey: payload.idempotencyKey,
    },
    { tenantId, id: actorUserId, _id: actorUserId }
  );

  // Read-back verification
  const verified = await WorkItem.findOne({ _id: workItem._id, tenantId });
  if (!verified) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Event verification failed: workItem not found post-creation'
    );
  }

  const clientUrl = process.env.SABYFE_URL || 'https://saby.ai';
  const baseUrl = clientUrl.replace(/\/+$/, '');
  const shareCode = verified.shareCode || String(verified._id);
  const agendaUrl = `${baseUrl}/a/${shareCode}`;

  return {
    handled: true,
    resultType: 'event_created',
    entityId: String(verified._id),
    eventId: String(verified._id),
    title: verified.title,
    shareCode: verified.shareCode,
    agendaUrl,
    shortUrl: `/a/${shareCode}`,
    meetingUrl: verified.meeting?.joinUrl || null,
  };
};

const handleDeleteEvent = async (event) => {
  const eventId = event.payload_json?.eventId || event.entity_id;
  if (!eventId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'delete_event requires eventId or entity_id'
    );
  }
  const deleted = await WorkItem.findOneAndDelete({
    _id: eventId,
    tenantId: event.tenant_id,
  });
  if (!deleted) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'Event not found or does not belong to tenant'
    );
  }
  return {
    handled: true,
    resultType: 'event_deleted',
    eventId: String(deleted._id),
  };
};

const handleQueryEvents = async (event) => {
  const payload = event.payload_json || {};
  const tenantId = event.tenant_id;
  const items = await workItemService.queryWorkItems(
    {
      type: 'event',
      from: payload.from,
      to: payload.to,
      status: payload.status,
      query: payload.query || payload.search,
      limit: payload.limit,
    },
    { tenantId }
  );

  return {
    handled: true,
    resultType: 'events_queried',
    count: items.length,
    events: items.map((item) => ({
      id: String(item._id),
      title: item.title,
      description: item.description || '',
      startAt: item.startAt,
      endAt: item.endAt,
      status: item.status,
      meetingUrl: item.meeting?.joinUrl || null,
      meetingProvider: item.meeting?.provider || null,
      shareCode: item.shareCode || null,
      agendaTopics: item.agendaTopics || [],
      assignees: (item.assignees || []).map((a) => a.name || a.userId),
    })),
  };
};

const handleQueryTasks = async (event) => {
  const payload = event.payload_json || {};
  const tenantId = event.tenant_id;
  const items = await workItemService.queryWorkItems(
    {
      type: 'task',
      from: payload.from,
      to: payload.to,
      status: payload.status,
      query: payload.query || payload.search,
      limit: payload.limit,
    },
    { tenantId }
  );

  return {
    handled: true,
    resultType: 'tasks_queried',
    count: items.length,
    tasks: items.map((item) => ({
      id: String(item._id),
      title: item.title,
      description: item.description || '',
      startAt: item.startAt,
      endAt: item.endAt,
      status: item.status,
      priority: item.priority || 'medium',
      assignees: (item.assignees || []).map((a) => a.name || a.userId),
    })),
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

const handleSendInMail = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const tenantId = event.tenant_id;
  const actorUserId = event.actor_user_id || payload.fromUserId || payload.userId;

  if (!actorUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'send_inmail requires an authenticated actorUserId');
  }

  const recipients = payload.to || payload.recipients || [];
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'send_inmail requires recipients array');
  }

  const message = await inmailService.sendMessage(
    {
      subject: payload.subject,
      body: payload.body,
      recipients,
      attachments: payload.attachments || [],
      channel: payload.channel || 'direct',
    },
    { _id: actorUserId, tenantId }
  );

  // Read-back verification
  const verified = await InMail.findOne({ _id: message._id, tenantId });
  if (!verified) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'InMail verification failed: message not found post-creation');
  }

  return {
    handled: true,
    resultType: 'send_inmail_completed',
    messageId: String(verified._id),
    recipientCount: verified.to.length,
    subject: verified.subject,
  };
};

const handleSendAnnouncement = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const tenantId = event.tenant_id;
  const actorUserId = event.actor_user_id || payload.fromUserId || payload.userId;

  if (!actorUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'send_announcement requires an authenticated actorUserId');
  }

  let recipients = payload.to || payload.recipients || [];

  // If targeted at a specific node/branch, resolve users in that branch via structure
  if (payload.targetNodeId) {
    const targetNode = await Nodes.findOne({ _id: payload.targetNodeId, tenantId });
    if (targetNode) {
      const branchNodes = await Nodes.find({
        tenantId,
        path: { $regex: `^${targetNode.path}` },
        deletedAt: null,
      }).select('users');
      const branchUserIds = new Set();
      branchNodes.forEach((n) => {
        (n.users || []).forEach((u) => branchUserIds.add(String(u)));
      });
      recipients = [...new Set([...recipients, ...branchUserIds])];
    }
  }

  // If targeted at a specific role (e.g. "Branch Operations Lead")
  if (payload.roleName) {
    recipients = [...new Set([...recipients, `all+${payload.roleName}`])];
  }

  // Default to 'allofus' if no specific recipients/nodes/roles provided
  if (recipients.length === 0) {
    recipients = ['allofus'];
  }

  const message = await inmailService.sendMessage(
    {
      subject: payload.subject,
      body: payload.body,
      recipients,
      attachments: payload.attachments || [],
      channel: 'announcement',
    },
    { _id: actorUserId, tenantId }
  );

  // Read-back verification
  const verified = await InMail.findOne({ _id: message._id, tenantId });
  if (!verified) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Announcement verification failed: message not found post-creation');
  }

  return {
    handled: true,
    resultType: 'send_announcement_completed',
    messageId: String(verified._id),
    recipientCount: verified.to.length,
    subject: verified.subject,
    channel: 'announcement',
  };
};

const handleMarkInMailRead = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const messageId = payload.messageId || event.entity_id;
  const actorUserId = event.actor_user_id || payload.userId;

  if (!messageId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'mark_inmail_read requires messageId');
  }
  if (!actorUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'mark_inmail_read requires actorUserId');
  }

  const updated = await inmailService.markAsRead(messageId, actorUserId);

  return {
    handled: true,
    resultType: 'mark_inmail_read_completed',
    messageId: String(updated._id),
    isRead: updated.read,
  };
};

const handleArchiveInMail = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const messageId = payload.messageId || payload.id || event.entity_id;

  if (!messageId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'archive_inmail requires messageId');
  }

  const updated = await inmailService.archiveMessage(messageId);

  return {
    handled: true,
    resultType: 'archive_inmail_completed',
    messageId: String(updated._id),
    status: updated.status,
  };
};

const handleDeleteInMail = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const messageId = payload.messageId || payload.id || event.entity_id;

  if (!messageId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'delete_inmail requires messageId');
  }

  const deleted = await inmailService.deleteMessage(messageId);

  return {
    handled: true,
    resultType: 'delete_inmail_completed',
    messageId: String(deleted._id),
    status: deleted.status,
    deletedAt: deleted.deletedAt,
  };
};

const handleStarInMail = async (event) => {
  requireObjectPayload(event.payload_json);
  const payload = event.payload_json;
  const messageId = payload.messageId || payload.id || event.entity_id;
  const starred = payload.starred !== undefined ? Boolean(payload.starred) : true;

  if (!messageId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'star_inmail requires messageId');
  }

  const updated = await inmailService.starMessage(messageId, starred);

  return {
    handled: true,
    resultType: 'star_inmail_completed',
    messageId: String(updated._id),
    starred: updated.starred,
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
    case 'create_level':
      return handleCreateLevel(event);
    case 'create_structure':
      return handleCreateStructure(event);
    case 'bulk_import_nodes':
    case 'action_bulk_import_nodes':
      return handleBulkImportNodes(event);
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
    case 'action_create_project':
    case 'create_project_form':
    case 'action_create_project_form':
      return handleCreateProject(event);
    case 'update_project_form':
    case 'action_update_project_form':
    case 'edit_project_form':
    case 'action_edit_project_form':
      return handleUpdateProjectForm(event);
    case 'publish_project_form':
    case 'action_publish_project_form':
      return handlePublishProjectForm(event);
    case 'unpublish_project_form':
    case 'action_unpublish_project_form':
      return handleUnpublishProjectForm(event);
    case 'delete_project_form':
    case 'action_delete_project_form':
      return handleDeleteProjectForm(event);
    case 'archive_project':
    case 'action_archive_project':
      return handleArchiveProject(event);
    case 'restore_project':
    case 'action_restore_project':
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
    case 'create_event':
    case 'action_create_event':
      return handleCreateEvent(event);
    case 'delete_event':
    case 'action_delete_event':
      return handleDeleteEvent(event);
    case 'query_events':
    case 'action_query_events':
    case 'read_events':
    case 'action_read_events':
      return handleQueryEvents(event);
    case 'query_tasks':
    case 'action_query_tasks':
    case 'read_tasks':
    case 'action_read_tasks':
      return handleQueryTasks(event);
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
    case 'send_inmail':
    case 'action_send_inmail':
      return handleSendInMail(event);
    case 'send_announcement':
    case 'action_send_announcement':
      return handleSendAnnouncement(event);
    case 'mark_inmail_read':
    case 'action_mark_inmail_read':
      return handleMarkInMailRead(event);
    case 'archive_inmail':
    case 'action_archive_inmail':
      return handleArchiveInMail(event);
    case 'delete_inmail':
    case 'action_delete_inmail':
      return handleDeleteInMail(event);
    case 'star_inmail':
    case 'action_star_inmail':
      return handleStarInMail(event);
    default:
      return { handled: false, resultType: 'noop' };
  }
};

module.exports = {
  executeActionEvent,
};
