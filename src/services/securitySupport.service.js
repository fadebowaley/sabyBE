const httpStatus = require('http-status');
const { User, TenantOnboarding } = require('../models');
const ApiError = require('../utils/ApiError');
const appAccessService = require('./appAccess.service');

const getSecurityState = (user) => {
  const customFields = user?.customFields && typeof user.customFields === 'object' ? user.customFields : {};
  const security = customFields.security && typeof customFields.security === 'object' ? customFields.security : {};
  const mfa = security.mfa && typeof security.mfa === 'object' ? security.mfa : {};
  const authenticator = mfa.authenticator && typeof mfa.authenticator === 'object' ? mfa.authenticator : {};
  const passkeys = Array.isArray(mfa.passkeys) ? mfa.passkeys : [];
  const supportAudit = Array.isArray(security.supportAudit) ? security.supportAudit : [];
  return { customFields, security, mfa, authenticator, passkeys, supportAudit };
};

const safeUserName = (user) =>
  [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || user.email || 'Unknown user';

const summarizeUserSecurity = (user, tenantProfiles = new Map(), accessByUserId = new Map()) => {
  const { authenticator, passkeys, mfa, supportAudit } = getSecurityState(user);
  const tenantProfile = tenantProfiles.get(String(user.tenantId || '')) || null;
  const access = accessByUserId.get(String(user._id || user.id)) || {};
  return {
    id: String(user._id || user.id),
    userId: user.userId || null,
    tenantId: user.tenantId || null,
    tenantName: tenantProfile?.company?.name || null,
    tenantEmail: tenantProfile?.company?.email || null,
    name: safeUserName(user),
    email: user.email,
    phoneNumber: user.phoneNumber || null,
    isOwner: Boolean(user.isOwner),
    isAdmin: Boolean(user.isAdmin),
    isSaby: Boolean(user.isSaby),
    access: {
      isTenantOwner: Boolean(access.isTenantOwner || user.isOwner),
      isWorkspaceMember: Boolean(access.workspaces?.length),
      workspaces: Array.isArray(access.workspaces) ? access.workspaces : [],
    },
    status: user.status,
    mfa: {
      enabled: Boolean(authenticator.enabled || passkeys.length > 0),
      authenticator: {
        enabled: Boolean(authenticator.enabled),
        verifiedAt: authenticator.verifiedAt || null,
        pending: Boolean(authenticator.pendingSecret && !authenticator.enabled),
      },
      passkeys: passkeys.map((passkey) => ({
        id: passkey.id || passkey.credentialId,
        credentialId: passkey.credentialId,
        authenticatorAttachment: passkey.authenticatorAttachment || null,
        transports: Array.isArray(passkey.transports) ? passkey.transports : [],
        createdAt: passkey.createdAt || null,
        lastUsedAt: passkey.lastUsedAt || null,
      })),
      passkeyCount: passkeys.length,
      pendingLoginChallenge: Boolean(mfa.loginChallenge?.token),
      pendingRegistrationChallenge: Boolean(mfa.passkeyChallenge?.challenge),
    },
    support: {
      lastAction: supportAudit.length ? supportAudit[supportAudit.length - 1] : null,
      auditCount: supportAudit.length,
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null,
  };
};

const buildUserQuery = ({ search, tenantId }) => {
  const query = { deletedAt: null };
  if (tenantId) query.tenantId = String(tenantId).trim();
  const normalizedSearch = String(search || '').trim();
  if (normalizedSearch) {
    const regex = new RegExp(normalizedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [
      { email: regex },
      { firstname: regex },
      { lastname: regex },
      { tenantId: regex },
      { userId: regex },
      { phoneNumber: regex },
    ];
  }
  return query;
};

const listSecuritySupportUsers = async (filters = {}) => {
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(100, Math.max(1, Number(filters.limit || 50)));
  const query = buildUserQuery(filters);
  const { userIds, accessByUserId } = await appAccessService.collectWorkspaceAccessUserIds({
    tenantId: filters.tenantId,
  });
  const allowedIds = [...userIds];
  const accessFilter = [
    ...(allowedIds.length ? [{ _id: { $in: allowedIds } }] : []),
    { isOwner: true },
    { isAdmin: true },
    { isSuper: true },
  ];
  query.$and = [...(query.$and || []), { $or: accessFilter }];

  const [users, total] = await Promise.all([
    User.find(query)
      .select('firstname lastname email phoneNumber tenantId userId isOwner isAdmin isSaby status customFields createdAt updatedAt')
      .sort({ tenantId: 1, email: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  const tenantIds = [...new Set(users.map((user) => String(user.tenantId || '')).filter(Boolean))];
  const tenants = tenantIds.length
    ? await TenantOnboarding.find({ tenantId: { $in: tenantIds } }).select('tenantId company')
    : [];
  const tenantProfiles = new Map(tenants.map((tenant) => [String(tenant.tenantId), tenant]));
  const results = users.map((user) => summarizeUserSecurity(user, tenantProfiles, accessByUserId));

  const tenantsSummary = results.reduce((acc, user) => {
    const key = user.tenantId || 'no-tenant';
    if (!acc[key]) {
      acc[key] = {
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        users: 0,
        mfaEnabledUsers: 0,
        passkeys: 0,
      };
    }
    acc[key].users += 1;
    if (user.mfa.enabled) acc[key].mfaEnabledUsers += 1;
    acc[key].passkeys += user.mfa.passkeyCount;
    return acc;
  }, {});

  return {
    results,
    tenants: Object.values(tenantsSummary),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const appendAudit = ({ supportAudit, action, reason, actor }) => [
  ...supportAudit.slice(-49),
  {
    action,
    reason,
    actorUserId: actor?.userId || null,
    actorEmail: actor?.email || null,
    createdAt: new Date().toISOString(),
  },
];

const performSecuritySupportAction = async ({ userId, action, passkeyId, reason, actor }) => {
  const normalizedReason = String(reason || '').trim();
  if (!normalizedReason) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A recovery/support reason is required.');
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  if (user.isSaby && String(user._id) !== String(actor?.userId || '')) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Saby staff MFA can only be changed by the account owner.');
  }

  const { customFields, security, mfa, authenticator, passkeys, supportAudit } = getSecurityState(user);
  let nextMfa = { ...mfa };

  if (action === 'disable-authenticator') {
    nextMfa.authenticator = {
      ...authenticator,
      enabled: false,
      disabledAt: new Date().toISOString(),
      disabledBySupport: true,
    };
  } else if (action === 'revoke-passkey') {
    if (!passkeyId) throw new ApiError(httpStatus.BAD_REQUEST, 'passkeyId is required.');
    const nextPasskeys = passkeys.filter(
      (passkey) => String(passkey.id || passkey.credentialId) !== String(passkeyId)
    );
    if (nextPasskeys.length === passkeys.length) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Passkey not found.');
    }
    nextMfa.passkeys = nextPasskeys;
  } else if (action === 'revoke-all-passkeys') {
    nextMfa.passkeys = [];
  } else if (action === 'reset-mfa') {
    nextMfa = {
      ...mfa,
      authenticator: {
        enabled: false,
        secret: null,
        pendingSecret: null,
        pendingAt: null,
        verifiedAt: null,
        resetAt: new Date().toISOString(),
        resetBySupport: true,
      },
      passkeys: [],
      passkeyChallenge: null,
      loginChallenge: null,
    };
  } else if (action === 'clear-pending-challenge') {
    nextMfa.loginChallenge = null;
    nextMfa.passkeyChallenge = null;
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported security support action.');
  }

  const nextCustomFields = {
    ...customFields,
    security: {
      ...security,
      mfa: nextMfa,
      supportAudit: appendAudit({ supportAudit, action, reason: normalizedReason, actor }),
    },
  };

  user.customFields = nextCustomFields;
  user.markModified('customFields');
  await user.save();

  return summarizeUserSecurity(user);
};

module.exports = {
  listSecuritySupportUsers,
  performSecuritySupportAction,
};
