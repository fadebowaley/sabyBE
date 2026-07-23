const crypto = require('crypto');
const httpStatus = require('http-status');
const config = require('../config/config');
const {
  Permission,
  Role,
  User,
  WorkspaceInvitation,
} = require('../models');
const ApiError = require('../utils/ApiError');
const projectFormWorkspaceService = require('./projectFormWorkspace.service');
const emailService = require('./email.service');
const subscriptionService = require('./subscription.service');
const { invalidateStudioAccessState } = require('./studioAccess.service');

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERMISSION_ACTIONS = new Set([
  'view',
  'read',
  'create',
  'update',
  'delete',
  'manage',
  'assign',
  'approve',
  'export',
  'import',
  'restore',
  'activate',
  'deactivate',
  'move',
  'permissions',
  'upload',
  'download',
  'share',
  'copy',
  'publish',
  'archive',
  'submit',
  'process',
  'complete',
  'cancel',
  'refund',
  'regenerate',
  'toggleStatus',
  'assignRole',
  'sendMessage',
  'forgotPassword',
  'resetPassword',
  'verify',
  'refresh',
  'send',
  'draft',
  'retry',
  'public',
  'private',
  'status',
  'auth',
  'all',
]);

const ACCESS_PROFILE_CONFIG = {
  workspace_owner: {
    workspaceRole: 'owner',
    bundleRoleName: 'Workspace Owner',
    label: 'Workspace Owner',
    permissionNames: [
      'view:project-form',
      'create:project-form',
      'update:project-form',
      'delete:project-form',
      'submission:read',
      'submission:update',
      'submission:delete',
      'report:read',
      'export:read',
      'analytics:read',
      'storage:read',
      'view:storage:file',
      'update:storage:file',
      'delete:storage:file',
      'share:storage:file',
      'view:storage:folder',
      'update:storage:folder',
      'delete:storage:folder',
      'share:storage:folder',
    ],
  },
  data_administrator: {
    workspaceRole: 'viewer',
    bundleRoleName: 'Workspace Data Administrator',
    label: 'Data Administrator',
    permissionNames: [
      'view:project-form',
      'submission:read',
      'submission:update',
      'submission:delete',
      'report:read',
      'export:read',
      'analytics:read',
      'storage:read',
      'view:storage:file',
      'update:storage:file',
      'view:storage:folder',
    ],
  },
  editor: {
    workspaceRole: 'editor',
    bundleRoleName: 'Workspace Editor',
    label: 'Editor',
    permissionNames: [
      'view:project-form',
      'create:project-form',
      'update:project-form',
      'submission:read',
      'storage:read',
      'view:storage:file',
      'view:storage:folder',
    ],
  },
  viewer: {
    workspaceRole: 'viewer',
    bundleRoleName: 'Workspace Viewer',
    label: 'Viewer',
    permissionNames: [
      'view:project-form',
      'submission:read',
      'storage:read',
      'view:storage:file',
      'view:storage:folder',
    ],
  },
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');
const generateToken = () => crypto.randomBytes(24).toString('hex');
const buildInviteUrl = (token) =>
  `${String(config.clientUrl || '').replace(/\/$/, '')}/workspace-invite/${token}`;
const isInvitationExpired = (invitation) =>
  !invitation?.expiresAt || invitation.expiresAt.getTime() <= Date.now();

const getAccessProfile = (profileId) => {
  const profile = ACCESS_PROFILE_CONFIG[String(profileId || '').trim()];
  if (!profile) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid access profile');
  }
  return profile;
};

const resolveAccessProfileIdFromMember = (member) => {
  const normalizedRole = String(member?.role || '').trim().toLowerCase();
  const explicit = String(member?.accessProfileId || '').trim().toLowerCase();

  if (normalizedRole === 'owner') return 'workspace_owner';
  if (normalizedRole === 'editor') return 'editor';
  if (normalizedRole === 'viewer') {
    return explicit === 'data_administrator' ? 'data_administrator' : 'viewer';
  }

  return explicit === 'data_administrator' ? 'data_administrator' : 'viewer';
};

const resolveWorkspaceForTenantAdmin = async ({ tenantId, actorUserId, workspaceId }) => {
  const { onboarding } = await projectFormWorkspaceService.ensureTenantWorkspaces({
    tenantId,
    actorUserId,
  });
  const workspace = projectFormWorkspaceService.findActiveWorkspace(
    onboarding,
    workspaceId
  );

  if (!workspace) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace not found');
  }

  return { onboarding, workspace };
};

const parsePermissionDefinition = (permissionName) => {
  const parts = String(permissionName || '')
    .trim()
    .toLowerCase()
    .split(':')
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if (PERMISSION_ACTIONS.has(parts[0])) {
    return {
      name: parts.join(':'),
      action: parts[0],
      resource: parts.slice(1).join(':') || 'workspace',
    };
  }

  const trailingAction = parts[parts.length - 1];
  if (PERMISSION_ACTIONS.has(trailingAction)) {
    return {
      name: parts.join(':'),
      action: trailingAction,
      resource: parts.slice(0, -1).join(':') || 'workspace',
    };
  }

  return {
    name: parts.join(':'),
    action: 'read',
    resource: parts.join(':'),
  };
};

const inferPermissionMethod = (action) => {
  switch (action) {
    case 'view':
    case 'read':
    case 'download':
    case 'status':
      return 'GET';
    case 'create':
    case 'submit':
    case 'upload':
    case 'import':
    case 'assign':
    case 'send':
    case 'draft':
    case 'process':
    case 'complete':
    case 'cancel':
    case 'refund':
    case 'refresh':
    case 'verify':
    case 'approve':
      return 'POST';
    case 'update':
    case 'manage':
    case 'activate':
    case 'deactivate':
    case 'move':
    case 'permissions':
    case 'publish':
    case 'archive':
    case 'restore':
    case 'regenerate':
    case 'toggleStatus':
    case 'assignRole':
    case 'private':
    case 'public':
    case 'share':
    case 'copy':
      return 'PATCH';
    case 'delete':
      return 'DELETE';
    default:
      return 'GET';
  }
};

const buildPermissionSeed = (permissionName) => {
  const parsed = parsePermissionDefinition(permissionName);
  if (!parsed) {
    return null;
  }

  const resourcePath = parsed.resource.replace(/:/g, '/');
  return {
    name: parsed.name,
    resource: parsed.resource,
    path: `/workspace-access/${resourcePath}`,
    action: parsed.action,
    method: inferPermissionMethod(parsed.action),
    description: `${parsed.action} permission for ${parsed.resource}`,
  };
};

const ensureWorkspacePermissions = async (permissionNames) => {
  const normalizedNames = Array.from(
    new Set(
      (Array.isArray(permissionNames) ? permissionNames : [])
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (normalizedNames.length === 0) {
    return [];
  }

  const existingPermissions = await Permission.find({
    name: { $in: normalizedNames },
  })
    .select('_id name')
    .lean()
    .exec();

  const existingNames = new Set(
    existingPermissions.map((permission) => String(permission.name || '').trim().toLowerCase())
  );

  const missingNames = normalizedNames.filter((name) => !existingNames.has(name));
  if (missingNames.length > 0) {
    const seeds = missingNames
      .map((name) => buildPermissionSeed(name))
      .filter(Boolean);

    if (seeds.length > 0) {
      await Permission.insertMany(seeds, { ordered: false });
    }
  }

  return Permission.find({
    name: { $in: normalizedNames },
  })
    .select('_id name')
    .lean()
    .exec();
};

const sanitizeInvitation = (invitation, workspace = null) => ({
  id: invitation.id || invitation._id,
  workspaceId: invitation.workspaceId,
  workspaceName: workspace?.name || null,
  email: invitation.email,
  firstname: invitation.firstname || '',
  lastname: invitation.lastname || '',
  phoneNumber: invitation.phoneNumber || null,
  accessProfileId: invitation.accessProfileId,
  workspaceRole: invitation.workspaceRole,
  bundleRoleName: invitation.bundleRoleName || null,
  status: invitation.status,
  invitedUserId: invitation.invitedUserId || null,
  acceptedBy: invitation.acceptedBy || null,
  acceptedAt: invitation.acceptedAt || null,
  expiresAt: invitation.expiresAt,
  lastSentAt: invitation.lastSentAt,
  resendCount: invitation.resendCount || 0,
  redirectPath: invitation.redirectPath || null,
  createdAt: invitation.createdAt,
  updatedAt: invitation.updatedAt,
});

const ensureBundleRoleAssignment = async ({
  tenantId,
  invitedByUserId,
  invitedUserId,
  accessProfileId,
}) => {
  const profile = getAccessProfile(accessProfileId);
  if (!profile.bundleRoleName) {
    return null;
  }

  const inviter = await User.findOne({
    _id: invitedByUserId,
    tenantId,
    deletedAt: null,
  });
  if (!inviter) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Inviting user was not found');
  }

  const permissions = await ensureWorkspacePermissions(profile.permissionNames);

  const permissionIds = permissions.map((permission) => permission._id);
  if (permissionIds.length !== profile.permissionNames.length) {
    const foundNames = new Set(permissions.map((permission) => permission.name));
    const missing = profile.permissionNames.filter((name) => !foundNames.has(name));
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Missing workspace permissions: ${missing.join(', ')}`
    );
  }

  let role = await Role.findOne({
    tenantId,
    name: profile.bundleRoleName,
  });

  if (!role) {
    role = await Role.create({
      tenantId,
      userId: inviter.userId,
      name: profile.bundleRoleName,
      description: `${profile.label} workspace access bundle`,
      permissions: permissionIds,
      isActive: true,
    });
  } else {
    role.permissions = permissionIds;
    role.isActive = true;
    await role.save();
  }

  const invitedUser = await User.findOne({
    _id: invitedUserId,
    tenantId,
    deletedAt: null,
  });
  if (!invitedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invited user was not found');
  }

  const roleId = String(role._id);
  const existingRoleIds = Array.isArray(invitedUser.roles)
    ? invitedUser.roles.map((entry) => String(entry))
    : [];
  if (!existingRoleIds.includes(roleId)) {
    invitedUser.roles = [...(invitedUser.roles || []), role._id];
    await invitedUser.save();
  }

  return role;
};

const syncWorkspaceAccessProfilesForUser = async ({
  tenantId,
  actorUserId,
  targetUserId,
}) => {
  const invitedUser = await User.findOne({
    _id: targetUserId,
    tenantId,
    deletedAt: null,
  });
  if (!invitedUser) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invited user was not found');
  }

  const { onboarding } = await projectFormWorkspaceService.ensureTenantWorkspaces({
    tenantId,
    actorUserId,
  });

  const desiredAccessProfileIds = new Set();

  (onboarding.workspaces || [])
    .filter((workspace) => workspace?.isDeleted !== true)
    .forEach((workspace) => {
      (workspace.members || [])
        .filter(
          (member) =>
            member?.status === projectFormWorkspaceService.WORKSPACE_STATUS_ACTIVE &&
            String(member?.userId || '') === String(targetUserId || '')
        )
        .forEach((member) => {
          desiredAccessProfileIds.add(resolveAccessProfileIdFromMember(member));
        });
    });

  for (const accessProfileId of desiredAccessProfileIds) {
    await ensureBundleRoleAssignment({
      tenantId,
      invitedByUserId: actorUserId,
      invitedUserId: targetUserId,
      accessProfileId,
    });
  }

  const workspaceBundleRoleNames = new Set(
    Object.values(ACCESS_PROFILE_CONFIG)
      .map((profile) => String(profile.bundleRoleName || '').trim())
      .filter(Boolean)
  );
  const desiredBundleRoleNames = new Set(
    Array.from(desiredAccessProfileIds)
      .map((profileId) => ACCESS_PROFILE_CONFIG[profileId]?.bundleRoleName)
      .map((roleName) => String(roleName || '').trim())
      .filter(Boolean)
  );

  const tenantWorkspaceRoles = await Role.find({
    tenantId,
    name: { $in: Array.from(workspaceBundleRoleNames) },
  })
    .select('_id name')
    .lean()
    .exec();

  const removableRoleIds = tenantWorkspaceRoles
    .filter((role) => !desiredBundleRoleNames.has(String(role.name || '').trim()))
    .map((role) => String(role._id));

  const nextRoles = Array.isArray(invitedUser.roles)
    ? invitedUser.roles.filter(
        (roleId) => !removableRoleIds.includes(String(roleId))
      )
    : [];

  if (
    nextRoles.length !== (Array.isArray(invitedUser.roles) ? invitedUser.roles.length : 0)
  ) {
    invitedUser.roles = nextRoles;
    await invitedUser.save();
  }

  await invalidateStudioAccessState({
    tenantId,
    userId: targetUserId,
  });

  return {
    accessProfileIds: Array.from(desiredAccessProfileIds),
    removedRoleIds: removableRoleIds,
  };
};

const createWorkspaceInvitation = async ({
  tenantId,
  actorUserId,
  workspaceId,
  email,
  firstname = '',
  lastname = '',
  phoneNumber = null,
  accessProfileId = 'viewer',
  redirectPath = null,
}) => {
  const profile = getAccessProfile(accessProfileId);
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invitation email is required');
  }

  const { workspace } = await resolveWorkspaceForTenantAdmin({
    tenantId,
    actorUserId,
    workspaceId,
  });

  const existingUser = await User.findOne({
    tenantId,
    email: normalizedEmail,
    deletedAt: null,
  });

  if (existingUser) {
    const existingMember = (workspace.members || []).find(
      (member) =>
        String(member.userId || '') === String(existingUser._id || '') &&
        member.status === projectFormWorkspaceService.WORKSPACE_STATUS_ACTIVE
    );

    if (existingMember) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'This user already belongs to the selected workspace'
      );
    }
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await WorkspaceInvitation.updateMany(
    {
      tenantId,
      workspaceId,
      email: normalizedEmail,
      status: 'pending',
    },
    {
      $set: {
        status: 'revoked',
      },
    }
  );

  const invitation = await WorkspaceInvitation.create({
    tenantId,
    workspaceId,
    email: normalizedEmail,
    firstname: String(firstname || '').trim(),
    lastname: String(lastname || '').trim(),
    phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
    accessProfileId,
    workspaceRole: profile.workspaceRole,
    bundleRoleName: profile.bundleRoleName,
    tokenHash,
    invitedBy: actorUserId,
    invitedUserId: existingUser?._id || null,
    expiresAt,
    lastSentAt: new Date(),
    redirectPath: redirectPath ? String(redirectPath).trim() : null,
  });

  await emailService.sendWorkspaceInvitationEmail({
    to: normalizedEmail,
    token,
    workspaceName: workspace.name,
    inviterName: null,
    accessProfileLabel: profile.label,
  });

  return {
    ...sanitizeInvitation(invitation, workspace),
    inviteUrl: buildInviteUrl(token),
  };
};

const listWorkspaceInvitations = async ({
  tenantId,
  actorUserId,
  workspaceId,
}) => {
  const { workspace } = await resolveWorkspaceForTenantAdmin({
    tenantId,
    actorUserId,
    workspaceId,
  });

  const invitations = await WorkspaceInvitation.find({
    tenantId,
    workspaceId,
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return invitations.map((invitation) => sanitizeInvitation(invitation, workspace));
};

const resendWorkspaceInvitation = async ({
  tenantId,
  actorUserId,
  workspaceId,
  invitationId,
}) => {
  const { workspace } = await resolveWorkspaceForTenantAdmin({
    tenantId,
    actorUserId,
    workspaceId,
  });

  const invitation = await WorkspaceInvitation.findOne({
    _id: invitationId,
    tenantId,
    workspaceId,
  });
  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace invitation not found');
  }
  if (invitation.status !== 'pending') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only pending invitations can be resent'
    );
  }

  const token = generateToken();
  invitation.tokenHash = hashToken(token);
  invitation.expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  invitation.lastSentAt = new Date();
  invitation.resendCount = Number(invitation.resendCount || 0) + 1;
  await invitation.save();

  const profile = getAccessProfile(invitation.accessProfileId);
  await emailService.sendWorkspaceInvitationEmail({
    to: invitation.email,
    token,
    workspaceName: workspace.name,
    inviterName: null,
    accessProfileLabel: profile.label,
  });

  return {
    ...sanitizeInvitation(invitation, workspace),
    inviteUrl: buildInviteUrl(token),
  };
};

const revokeWorkspaceInvitation = async ({
  tenantId,
  actorUserId,
  workspaceId,
  invitationId,
}) => {
  const { workspace } = await resolveWorkspaceForTenantAdmin({
    tenantId,
    actorUserId,
    workspaceId,
  });

  const invitation = await WorkspaceInvitation.findOne({
    _id: invitationId,
    tenantId,
    workspaceId,
  });
  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace invitation not found');
  }

  invitation.status = 'revoked';
  await invitation.save();
  return sanitizeInvitation(invitation, workspace);
};

const getWorkspaceInvitationByToken = async (token) => {
  const invitation = await WorkspaceInvitation.findOne({
    tokenHash: hashToken(token),
  })
    .lean()
    .exec();

  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace invitation not found');
  }

  const expired = isInvitationExpired(invitation);
  const workspaceListing = await projectFormWorkspaceService.listWorkspaces({
    tenantId: invitation.tenantId,
    userId: invitation.invitedBy,
  });
  const workspace = (workspaceListing.workspaces || []).find(
    (entry) => entry.workspaceId === invitation.workspaceId
  ) || null;

  return {
    ...sanitizeInvitation(invitation, workspace),
    isExpired: expired,
    canAccept: invitation.status === 'pending' && !expired,
    existingUser: Boolean(invitation.invitedUserId),
  };
};

const acceptWorkspaceInvitation = async ({
  token,
  firstname = '',
  lastname = '',
  password = '',
  phoneNumber = null,
}) => {
  const invitation = await WorkspaceInvitation.findOne({
    tokenHash: hashToken(token),
  });
  if (!invitation) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workspace invitation not found');
  }
  if (invitation.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Workspace invitation is no longer active');
  }
  if (isInvitationExpired(invitation)) {
    invitation.status = 'expired';
    await invitation.save();
    throw new ApiError(httpStatus.BAD_REQUEST, 'Workspace invitation has expired');
  }

  let user = null;
  if (invitation.invitedUserId) {
    user = await User.findOne({
      _id: invitation.invitedUserId,
      tenantId: invitation.tenantId,
      deletedAt: null,
    });
  }
  if (!user) {
    user = await User.findOne({
      tenantId: invitation.tenantId,
      email: invitation.email,
      deletedAt: null,
    });
  }

  if (!user) {
    if (!firstname || !lastname || !password) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'First name, last name, and password are required to accept this invitation'
      );
    }

    await subscriptionService.assertSubscriptionLimit({
      tenantId: invitation.tenantId,
      limitKey: 'seats',
      delta: 1,
      message:
        'This workspace subscription has reached its seat limit. Upgrade billing before accepting another new team member.',
    });

    user = await User.createUser({
      firstname: String(firstname).trim(),
      lastname: String(lastname).trim(),
      email: invitation.email,
      password: String(password),
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
      createdBy: invitation.invitedBy,
      isOwner: false,
      isSuper: false,
      isAdmin: false,
      isSaby: false,
      status: true,
      otpVerified: true,
      isEmailVerified: true,
      onboardingStatus: 'none',
      onboardingComplete: true,
      requiresOnboarding: false,
      onboardingCompletedAt: new Date(),
    });
  }

  await projectFormWorkspaceService.addWorkspaceMember({
    tenantId: invitation.tenantId,
    actorUserId: invitation.invitedBy,
    workspaceId: invitation.workspaceId,
    role: invitation.workspaceRole,
    accessProfileId: invitation.accessProfileId,
    userId: String(user._id),
  });

  await syncWorkspaceAccessProfilesForUser({
    tenantId: invitation.tenantId,
    actorUserId: invitation.invitedBy,
    targetUserId: user._id,
  });

  invitation.status = 'accepted';
  invitation.acceptedBy = user._id;
  invitation.acceptedAt = new Date();
  invitation.invitedUserId = user._id;
  await invitation.save();

  return {
    invitation: sanitizeInvitation(invitation),
    user: {
      id: user.id || user._id,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
    },
  };
};

const assignWorkspaceAccessProfileToUser = async ({
  tenantId,
  actorUserId,
  targetUserId,
}) =>
  syncWorkspaceAccessProfilesForUser({
    tenantId,
    actorUserId,
    targetUserId,
  });

module.exports = {
  ACCESS_PROFILE_CONFIG,
  assignWorkspaceAccessProfileToUser,
  syncWorkspaceAccessProfilesForUser,
  createWorkspaceInvitation,
  listWorkspaceInvitations,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  getWorkspaceInvitationByToken,
  acceptWorkspaceInvitation,
};
