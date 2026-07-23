const httpStatus = require('http-status');
const { TenantOnboarding } = require('../models');
const ApiError = require('../utils/ApiError');

const asStringId = (value) => (value ? String(value) : '');

const collectWorkspaceAccessUserIds = async ({ tenantId } = {}) => {
  const query = {};
  if (tenantId) query.tenantId = String(tenantId).trim();

  const onboardings = await TenantOnboarding.find(query).select('tenantId ownerUserId workspaces').lean();
  const userIds = new Set();
  const accessByUserId = new Map();

  const addAccess = (userId, access) => {
    const id = asStringId(userId);
    if (!id) return;
    userIds.add(id);
    const existing = accessByUserId.get(id) || {
      isTenantOwner: false,
      workspaces: [],
    };
    accessByUserId.set(id, {
      ...existing,
      isTenantOwner: existing.isTenantOwner || Boolean(access.isTenantOwner),
      tenantId: access.tenantId || existing.tenantId || null,
      workspaces: [...existing.workspaces, ...(access.workspaces || [])],
    });
  };

  onboardings.forEach((onboarding) => {
    const tenant = String(onboarding.tenantId || '');
    addAccess(onboarding.ownerUserId, { tenantId: tenant, isTenantOwner: true });

    (onboarding.workspaces || []).forEach((workspace) => {
      if (workspace?.isDeleted === true) return;
      (workspace.members || []).forEach((member) => {
        if (member?.status !== 'active') return;
        addAccess(member.userId, {
          tenantId: tenant,
          workspaces: [
            {
              workspaceId: workspace.workspaceId,
              workspaceName: workspace.name,
              role: member.role,
              accessProfileId: member.accessProfileId,
            },
          ],
        });
      });
    });
  });

  return { userIds, accessByUserId };
};

const getUserWorkspaceAccess = async (user) => {
  if (!user) return { hasAccess: false, reason: 'missing_user' };
  if (user.isSaby || user.isSuper || user.isOwner || user.isAdmin) {
    return { hasAccess: true, reason: 'privileged_role' };
  }

  const userId = asStringId(user._id || user.id);
  const tenantId = String(user.tenantId || '').trim();
  if (!userId || !tenantId) return { hasAccess: false, reason: 'missing_tenant' };

  const onboarding = await TenantOnboarding.findOne({ tenantId }).select('ownerUserId workspaces').lean();
  if (!onboarding) return { hasAccess: false, reason: 'no_workspace' };
  if (asStringId(onboarding.ownerUserId) === userId) {
    return { hasAccess: true, reason: 'tenant_owner' };
  }

  const activeMember = (onboarding.workspaces || []).some(
    (workspace) =>
      workspace?.isDeleted !== true &&
      (workspace.members || []).some(
        (member) => asStringId(member.userId) === userId && member.status === 'active'
      )
  );

  return activeMember
    ? { hasAccess: true, reason: 'workspace_member' }
    : { hasAccess: false, reason: 'submitter_only' };
};

const assertMainAppAccess = async (user) => {
  const access = await getUserWorkspaceAccess(user);
  if (!access.hasAccess) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'This email is registered for form submission only. Ask the workspace owner to invite you to Saby before signing in.'
    );
  }
  return access;
};

module.exports = {
  collectWorkspaceAccessUserIds,
  getUserWorkspaceAccess,
  assertMainAppAccess,
};
