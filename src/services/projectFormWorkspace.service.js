const httpStatus = require('http-status');
const { nanoid } = require('nanoid');
const { TenantOnboarding, User, ProjectForm } = require('../models');
const ApiError = require('../utils/ApiError');

const WORKSPACE_ROLE_OWNER = 'owner';
const WORKSPACE_ROLE_EDITOR = 'editor';
const WORKSPACE_ROLE_VIEWER = 'viewer';
const WORKSPACE_STATUS_ACTIVE = 'active';
const DEFAULT_WORKSPACE_NAME = 'My workspace';
const DEFAULT_WORKSPACE_ID = 'ws_default';
const LEGACY_DEFAULT_WORKSPACE_ID = 'default';

const DEFAULT_ACCESS_ROLES = [
  WORKSPACE_ROLE_OWNER,
  WORKSPACE_ROLE_EDITOR,
  WORKSPACE_ROLE_VIEWER,
];
const WRITE_ACCESS_ROLES = [WORKSPACE_ROLE_OWNER, WORKSPACE_ROLE_EDITOR];
const WORKSPACE_VISIBILITY_PRIVATE = 'private';
const WORKSPACE_VISIBILITY_PUBLIC = 'public';
const ALLOWED_WORKSPACE_VISIBILITIES = [
  WORKSPACE_VISIBILITY_PRIVATE,
  WORKSPACE_VISIBILITY_PUBLIC,
];

const normalizeString = (value, fallback = '') =>
  String(value == null ? fallback : value).trim();

const asStringId = (value) => (value ? String(value) : '');

const isDuplicateKeyError = (error) =>
  Boolean(error && (error.code === 11000 || /duplicate key/i.test(error.message || '')));

const getTenantOwnerUser = async ({ tenantId, preferredUserId = null }) => {
  const normalizedTenantId = normalizeString(tenantId);
  if (!normalizedTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  if (preferredUserId) {
    const preferred = await User.findOne({
      _id: preferredUserId,
      tenantId: normalizedTenantId,
      deletedAt: null,
    });
    if (preferred) {
      return preferred;
    }
  }

  const owner = await User.findOne({
    tenantId: normalizedTenantId,
    deletedAt: null,
    $or: [{ isOwner: true }, { isSuper: true }],
  }).sort({ isOwner: -1, createdAt: 1 });

  if (owner) {
    return owner;
  }

  const fallbackUser = await User.findOne({
    tenantId: normalizedTenantId,
    deletedAt: null,
  }).sort({ createdAt: 1 });

  if (!fallbackUser) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No active users were found for this tenant'
    );
  }

  return fallbackUser;
};

const createDefaultWorkspace = ({ ownerUserId }) => ({
  workspaceId: DEFAULT_WORKSPACE_ID,
  name: DEFAULT_WORKSPACE_NAME,
  visibility: 'private',
  createdBy: ownerUserId,
  isDeleted: false,
  deletedAt: null,
  members: [
    {
      userId: ownerUserId,
      role: WORKSPACE_ROLE_OWNER,
      status: WORKSPACE_STATUS_ACTIVE,
    },
  ],
});

const getOrCreateTenantOnboarding = async ({ tenantId, preferredUserId = null }) => {
  const normalizedTenantId = normalizeString(tenantId);
  if (!normalizedTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  let onboarding = await TenantOnboarding.findOne({ tenantId: normalizedTenantId });
  if (onboarding) {
    return onboarding;
  }

  const ownerUser = await getTenantOwnerUser({
    tenantId: normalizedTenantId,
    preferredUserId,
  });

  try {
    onboarding = await TenantOnboarding.create({
      tenantId: normalizedTenantId,
      ownerUserId: ownerUser._id,
      company: {
        name: '',
        email: ownerUser.email || '',
        phone: ownerUser.phoneNumber || '',
        organizationType: '',
      },
      owner: {
        roleTitle: ownerUser.isOwner ? 'Owner' : 'Administrator',
        phoneNumber: ownerUser.phoneNumber || '',
      },
      node: {
        rootNodeName: '',
        rootLevelName: '',
        rootNodeAddress: '',
        nodeStructures: false,
      },
      draftProgress: {
        currentIndex: 0,
        phase: 'question',
        skipped: {},
        lastSavedAt: new Date(),
      },
      workspaces: [createDefaultWorkspace({ ownerUserId: ownerUser._id })],
      completedAt: null,
      version: 1,
    });
    return onboarding;
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const existing = await TenantOnboarding.findOne({ tenantId: normalizedTenantId });
    if (!existing) {
      throw error;
    }
    return existing;
  }
};

const findActiveWorkspace = (onboarding, workspaceId) => {
  const targetWorkspaceId = normalizeString(workspaceId);
  if (!targetWorkspaceId) return null;
  return (onboarding.workspaces || []).find(
    (workspace) =>
      workspace.workspaceId === targetWorkspaceId && workspace.isDeleted !== true
  );
};

const findActiveMember = (workspace, userId) => {
  const targetUserId = asStringId(userId);
  if (!workspace || !targetUserId) return null;

  return (workspace.members || []).find(
    (member) =>
      asStringId(member.userId) === targetUserId &&
      member.status === WORKSPACE_STATUS_ACTIVE
  );
};

const ensureTenantWorkspaces = async ({ tenantId, actorUserId = null }) => {
  const onboarding = await getOrCreateTenantOnboarding({
    tenantId,
    preferredUserId: actorUserId,
  });

  const ownerUser = await getTenantOwnerUser({
    tenantId,
    preferredUserId: onboarding.ownerUserId || actorUserId,
  });

  if (!Array.isArray(onboarding.workspaces)) {
    onboarding.workspaces = [];
  }

  let changed = false;
  let defaultWorkspace = findActiveWorkspace(onboarding, DEFAULT_WORKSPACE_ID);

  if (!defaultWorkspace) {
    defaultWorkspace = createDefaultWorkspace({ ownerUserId: ownerUser._id });
    onboarding.workspaces.push(defaultWorkspace);
    changed = true;
  }

  if (!Array.isArray(defaultWorkspace.members)) {
    defaultWorkspace.members = [];
    changed = true;
  }

  const ownerMembership = findActiveMember(defaultWorkspace, ownerUser._id);
  if (!ownerMembership) {
    defaultWorkspace.members.push({
      userId: ownerUser._id,
      role: WORKSPACE_ROLE_OWNER,
      status: WORKSPACE_STATUS_ACTIVE,
    });
    changed = true;
  } else if (ownerMembership.role !== WORKSPACE_ROLE_OWNER) {
    ownerMembership.role = WORKSPACE_ROLE_OWNER;
    ownerMembership.status = WORKSPACE_STATUS_ACTIVE;
    changed = true;
  }

  if (actorUserId && !findActiveMember(defaultWorkspace, actorUserId)) {
    defaultWorkspace.members.push({
      userId: actorUserId,
      role: WORKSPACE_ROLE_EDITOR,
      status: WORKSPACE_STATUS_ACTIVE,
    });
    changed = true;
  }

  if (changed) {
    onboarding.markModified('workspaces');
    await onboarding.save();
  }

  return {
    onboarding,
    defaultWorkspace,
    ownerUser,
  };
};

const backfillFormsToDefaultWorkspace = async ({ tenantId, workspaceId }) => {
  const normalizedTenantId = normalizeString(tenantId);
  const normalizedWorkspaceId = normalizeString(workspaceId);

  if (!normalizedTenantId || !normalizedWorkspaceId) return { matched: 0, modified: 0 };

  const result = await ProjectForm.updateMany(
    {
      tenantId: normalizedTenantId,
      deletedAt: null,
      $or: [
        { workspaceId: { $exists: false } },
        { workspaceId: null },
        { workspaceId: '' },
        { workspaceId: LEGACY_DEFAULT_WORKSPACE_ID },
      ],
    },
    {
      $set: {
        workspaceId: normalizedWorkspaceId,
      },
    }
  );

  return {
    matched: Number(result?.matchedCount || 0),
    modified: Number(result?.modifiedCount || 0),
  };
};

const assertWorkspaceAccess = async ({
  tenantId,
  workspaceId,
  userId,
  allowedRoles = DEFAULT_ACCESS_ROLES,
}) => {
  const { onboarding } = await ensureTenantWorkspaces({ tenantId, actorUserId: userId });
  const workspace = findActiveWorkspace(onboarding, workspaceId || DEFAULT_WORKSPACE_ID);

  if (!workspace) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found');
  }

  const member = findActiveMember(workspace, userId);
  if (!member) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have access to this workspace'
    );
  }

  if (!allowedRoles.includes(member.role)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Your role does not permit this workspace action'
    );
  }

  return {
    onboarding,
    workspace,
    member,
  };
};

const resolveWorkspaceForFormWrite = async ({ tenantId, actorUserId, workspaceId }) => {
  const { defaultWorkspace } = await ensureTenantWorkspaces({ tenantId, actorUserId });
  await backfillFormsToDefaultWorkspace({
    tenantId,
    workspaceId: defaultWorkspace.workspaceId,
  });

  const requestedWorkspaceId = normalizeString(workspaceId);
  if (!requestedWorkspaceId) {
    return defaultWorkspace.workspaceId;
  }

  await assertWorkspaceAccess({
    tenantId,
    workspaceId: requestedWorkspaceId,
    userId: actorUserId,
    allowedRoles: WRITE_ACCESS_ROLES,
  });

  return requestedWorkspaceId;
};

const listWorkspaces = async ({ tenantId, userId }) => {
  const { onboarding, defaultWorkspace } = await ensureTenantWorkspaces({
    tenantId,
    actorUserId: userId,
  });

  await backfillFormsToDefaultWorkspace({
    tenantId,
    workspaceId: defaultWorkspace.workspaceId,
  });

  const workspaces = (onboarding.workspaces || []).filter(
    (workspace) => workspace.isDeleted !== true
  );

  const accessible = workspaces
    .map((workspace) => {
      const member = findActiveMember(workspace, userId);
      if (!member) return null;
      return { workspace, member };
    })
    .filter(Boolean);

  const workspaceIds = accessible.map(({ workspace }) => workspace.workspaceId);
  const counts = workspaceIds.length
    ? await ProjectForm.aggregate([
        {
          $match: {
            tenantId: normalizeString(tenantId),
            deletedAt: null,
            workspaceId: { $in: workspaceIds },
          },
        },
        {
          $group: {
            _id: '$workspaceId',
            total: { $sum: 1 },
          },
        },
      ])
    : [];

  const countMap = counts.reduce((acc, entry) => {
    acc[String(entry._id)] = Number(entry.total || 0);
    return acc;
  }, {});

  const items = accessible.map(({ workspace, member }) => ({
    workspaceId: workspace.workspaceId,
    name: workspace.name,
    visibility: workspace.visibility || 'private',
    createdBy: workspace.createdBy,
    role: member.role,
    memberCount: (workspace.members || []).filter(
      (entry) => entry.status === WORKSPACE_STATUS_ACTIVE
    ).length,
    formCount: countMap[workspace.workspaceId] || 0,
    isDefault: workspace.workspaceId === DEFAULT_WORKSPACE_ID,
  }));

  items.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    tenantId,
    defaultWorkspaceId: defaultWorkspace.workspaceId,
    workspaces: items,
  };
};

const createWorkspace = async ({ tenantId, actorUserId, name, visibility }) => {
  const { onboarding } = await ensureTenantWorkspaces({ tenantId, actorUserId });
  const trimmedName = normalizeString(name, 'Untitled workspace');
  const normalizedVisibility = normalizeWorkspaceVisibility(visibility);

  const duplicate = (onboarding.workspaces || []).find(
    (workspace) =>
      workspace.isDeleted !== true &&
      normalizeString(workspace.name).toLowerCase() === trimmedName.toLowerCase()
  );

  if (duplicate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Workspace name already exists');
  }

  let workspaceId = `ws_${nanoid(8).toLowerCase()}`;
  while ((onboarding.workspaces || []).some((workspace) => workspace.workspaceId === workspaceId)) {
    workspaceId = `ws_${nanoid(8).toLowerCase()}`;
  }

  const workspace = {
    workspaceId,
    name: trimmedName,
    visibility: normalizedVisibility,
    createdBy: actorUserId,
    isDeleted: false,
    deletedAt: null,
    members: [
      {
        userId: actorUserId,
        role: WORKSPACE_ROLE_OWNER,
        status: WORKSPACE_STATUS_ACTIVE,
      },
    ],
  };

  onboarding.workspaces.push(workspace);
  onboarding.markModified('workspaces');
  await onboarding.save();

  return workspace;
};

const renameWorkspace = async ({
  tenantId,
  actorUserId,
  workspaceId,
  name,
  visibility,
}) => {
  const { onboarding, workspace } = await assertWorkspaceAccess({
    tenantId,
    workspaceId,
    userId: actorUserId,
    allowedRoles: [WORKSPACE_ROLE_OWNER],
  });

  const trimmedName = normalizeString(name);
  if (!trimmedName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Workspace name is required');
  }

  const duplicate = (onboarding.workspaces || []).find(
    (entry) =>
      entry.isDeleted !== true &&
      entry.workspaceId !== workspace.workspaceId &&
      normalizeString(entry.name).toLowerCase() === trimmedName.toLowerCase()
  );

  if (duplicate) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Workspace name already exists');
  }

  workspace.name = trimmedName;
  if (visibility !== undefined) {
    workspace.visibility = normalizeWorkspaceVisibility(
      visibility,
      workspace.visibility || WORKSPACE_VISIBILITY_PRIVATE
    );
  }
  onboarding.markModified('workspaces');
  await onboarding.save();

  return workspace;
};

const resolveTenantUser = async ({ tenantId, userId = null, email = null }) => {
  if (userId) {
    const user = await User.findOne({
      _id: userId,
      tenantId,
      deletedAt: null,
    });
    if (user) return user;
  }

  const normalizedEmail = normalizeString(email).toLowerCase();
  if (normalizedEmail) {
    const user = await User.findOne({
      tenantId,
      email: normalizedEmail,
      deletedAt: null,
    });
    if (user) return user;
  }

  throw new ApiError(httpStatus.NOT_FOUND, 'Tenant user not found');
};

const addWorkspaceMember = async ({
  tenantId,
  actorUserId,
  workspaceId,
  role,
  userId,
  email,
}) => {
  const normalizedRole = normalizeString(role, WORKSPACE_ROLE_VIEWER).toLowerCase();
  if (![WORKSPACE_ROLE_OWNER, WORKSPACE_ROLE_EDITOR, WORKSPACE_ROLE_VIEWER].includes(normalizedRole)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid workspace role');
  }

  const { onboarding, workspace } = await assertWorkspaceAccess({
    tenantId,
    workspaceId,
    userId: actorUserId,
    allowedRoles: [WORKSPACE_ROLE_OWNER],
  });

  const targetUser = await resolveTenantUser({ tenantId, userId, email });
  const existingMember = findActiveMember(workspace, targetUser._id);

  if (existingMember) {
    existingMember.role = normalizedRole;
    existingMember.status = WORKSPACE_STATUS_ACTIVE;
  } else {
    const inactiveMember = (workspace.members || []).find(
      (member) => asStringId(member.userId) === asStringId(targetUser._id)
    );

    if (inactiveMember) {
      inactiveMember.role = normalizedRole;
      inactiveMember.status = WORKSPACE_STATUS_ACTIVE;
    } else {
      workspace.members.push({
        userId: targetUser._id,
        role: normalizedRole,
        status: WORKSPACE_STATUS_ACTIVE,
      });
    }
  }

  onboarding.markModified('workspaces');
  await onboarding.save();

  return {
    workspace,
    member: {
      userId: targetUser._id,
      email: targetUser.email,
      firstname: targetUser.firstname,
      lastname: targetUser.lastname,
      role: normalizedRole,
      status: WORKSPACE_STATUS_ACTIVE,
    },
  };
};

const removeWorkspaceMember = async ({ tenantId, actorUserId, workspaceId, userId }) => {
  const { onboarding, workspace } = await assertWorkspaceAccess({
    tenantId,
    workspaceId,
    userId: actorUserId,
    allowedRoles: [WORKSPACE_ROLE_OWNER],
  });

  const targetUserId = normalizeString(userId);
  if (!targetUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  if (asStringId(actorUserId) === targetUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Use leave endpoint to remove yourself');
  }

  const targetMember = findActiveMember(workspace, targetUserId);
  if (!targetMember) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace member not found');
  }

  if (targetMember.role === WORKSPACE_ROLE_OWNER) {
    const otherOwners = (workspace.members || []).filter(
      (entry) =>
        entry.status === WORKSPACE_STATUS_ACTIVE &&
        entry.role === WORKSPACE_ROLE_OWNER &&
        asStringId(entry.userId) !== targetUserId
    );
    if (otherOwners.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Workspace must have at least one active owner'
      );
    }
  }

  workspace.members = (workspace.members || []).filter(
    (entry) => asStringId(entry.userId) !== targetUserId
  );

  onboarding.markModified('workspaces');
  await onboarding.save();

  return workspace;
};

const leaveWorkspace = async ({ tenantId, actorUserId, workspaceId }) => {
  const { onboarding, workspace } = await assertWorkspaceAccess({
    tenantId,
    workspaceId,
    userId: actorUserId,
    allowedRoles: DEFAULT_ACCESS_ROLES,
  });

  if (workspace.workspaceId === DEFAULT_WORKSPACE_ID) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'You cannot leave the default workspace'
    );
  }

  const actorMembership = findActiveMember(workspace, actorUserId);
  if (!actorMembership) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace membership not found');
  }

  if (actorMembership.role === WORKSPACE_ROLE_OWNER) {
    const otherOwners = (workspace.members || []).filter(
      (entry) =>
        entry.status === WORKSPACE_STATUS_ACTIVE &&
        entry.role === WORKSPACE_ROLE_OWNER &&
        asStringId(entry.userId) !== asStringId(actorUserId)
    );

    if (otherOwners.length === 0) {
      const tenantOwner = await getTenantOwnerUser({
        tenantId,
        preferredUserId: onboarding.ownerUserId,
      });

      if (asStringId(tenantOwner._id) === asStringId(actorUserId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Assign another workspace owner before leaving this workspace'
        );
      }

      const tenantOwnerMember = findActiveMember(workspace, tenantOwner._id);
      if (tenantOwnerMember) {
        tenantOwnerMember.role = WORKSPACE_ROLE_OWNER;
      } else {
        workspace.members.push({
          userId: tenantOwner._id,
          role: WORKSPACE_ROLE_OWNER,
          status: WORKSPACE_STATUS_ACTIVE,
        });
      }
    }
  }

  workspace.members = (workspace.members || []).filter(
    (entry) => asStringId(entry.userId) !== asStringId(actorUserId)
  );

  onboarding.markModified('workspaces');
  await onboarding.save();

  return workspace;
};

const deleteWorkspace = async ({ tenantId, actorUserId, workspaceId }) => {
  const { onboarding, workspace } = await assertWorkspaceAccess({
    tenantId,
    workspaceId,
    userId: actorUserId,
    allowedRoles: [WORKSPACE_ROLE_OWNER],
  });

  if (workspace.workspaceId === DEFAULT_WORKSPACE_ID) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Default workspace cannot be deleted'
    );
  }

  workspace.isDeleted = true;
  workspace.deletedAt = new Date();

  onboarding.markModified('workspaces');
  await onboarding.save();

  const now = new Date();
  const archiveResult = await ProjectForm.updateMany(
    {
      tenantId,
      workspaceId: workspace.workspaceId,
      deletedAt: null,
    },
    {
      $set: {
        status: 'archived',
        archivedAt: now,
        'identity.status': 'archived',
        'metadata.lastModified': now,
      },
    }
  );

  return {
    workspaceId: workspace.workspaceId,
    archivedForms: Number(archiveResult?.modifiedCount || 0),
  };
};

const getAccessibleWorkspaceIds = async ({ tenantId, userId }) => {
  const listing = await listWorkspaces({ tenantId, userId });
  return listing.workspaces.map((entry) => entry.workspaceId);
};

module.exports = {
  DEFAULT_WORKSPACE_ID,
  LEGACY_DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_NAME,
  WORKSPACE_ROLE_OWNER,
  WORKSPACE_ROLE_EDITOR,
  WORKSPACE_ROLE_VIEWER,
  WORKSPACE_STATUS_ACTIVE,
  ensureTenantWorkspaces,
  backfillFormsToDefaultWorkspace,
  assertWorkspaceAccess,
  resolveWorkspaceForFormWrite,
  listWorkspaces,
  createWorkspace,
  renameWorkspace,
  addWorkspaceMember,
  removeWorkspaceMember,
  leaveWorkspace,
  deleteWorkspace,
  getAccessibleWorkspaceIds,
};
const normalizeWorkspaceVisibility = (value, fallback = WORKSPACE_VISIBILITY_PRIVATE) => {
  const normalized = normalizeString(value, fallback).toLowerCase();
  if (!ALLOWED_WORKSPACE_VISIBILITIES.includes(normalized)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid workspace visibility');
  }
  return normalized;
};
