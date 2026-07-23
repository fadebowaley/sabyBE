const {
  Subscription,
  TenantOnboarding,
  GlobalSettings,
  Nodes,
  User,
} = require('../models');
const { redisClient } = require('../config/redis');
const subscriptionEntitlementService = require('./subscriptionEntitlement.service');

const ACCESS_CACHE_TTL_SECONDS = 120;

const hasRedisClient = () => Boolean(redisClient && redisClient.status === 'ready');

const toPlainDate = (value) => {
  if (!value) return 'none';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'none' : date.toISOString();
};

const safeString = (value, fallback = '') =>
  String(value == null ? fallback : value).trim();

const normalizeClaimList = (value) =>
  Array.isArray(value)
    ? value
        .map((entry) => {
          if (typeof entry === 'string') return entry.trim();
          if (!entry || typeof entry !== 'object') return '';
          return safeString(entry.name || entry.id || entry._id || '');
        })
        .filter(Boolean)
    : [];

const normalizeAddOns = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const id = entry.trim();
        return id ? { id, name: null } : null;
      }
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const id = safeString(entry.id || entry._id);
      if (!id) return null;
      return {
        id,
        name: safeString(entry.name) || null,
      };
    })
    .filter(Boolean);
};

const resolveSubscriptionAccessState = (subscription) => {
  const rawStatus = safeString(subscription?.status).toLowerCase();
  const metadata =
    subscription?.metadata && typeof subscription.metadata === 'object'
      ? subscription.metadata
      : {};
  const cancelAtPeriodEnd = metadata.cancelAtPeriodEnd === true;
  const accessUntilRaw =
    metadata.accessUntil ||
    metadata.cancelAccessUntil ||
    subscription?.currentPeriodEnd ||
    subscription?.renewalAt ||
    null;
  const accessUntil = accessUntilRaw ? new Date(accessUntilRaw) : null;
  const cancellationExpired =
    cancelAtPeriodEnd &&
    accessUntil &&
    !Number.isNaN(accessUntil.getTime()) &&
    accessUntil.getTime() < Date.now();

  if (!rawStatus) {
    return {
      normalizedStatus: 'missing',
      isActive: false,
      requiresBillingAction: true,
    };
  }

  if (cancellationExpired) {
    return {
      normalizedStatus: 'expired',
      isActive: false,
      requiresBillingAction: true,
    };
  }

  if (rawStatus === 'active' || rawStatus === 'trialing') {
    return {
      normalizedStatus: rawStatus,
      isActive: true,
      requiresBillingAction: false,
    };
  }

  if (['pending', 'paused', 'past_due', 'cancelled', 'expired'].includes(rawStatus)) {
    return {
      normalizedStatus: rawStatus,
      isActive: false,
      requiresBillingAction: true,
    };
  }

  return {
    normalizedStatus: 'missing',
    isActive: false,
    requiresBillingAction: true,
  };
};

const getCacheKey = ({
  tenantId,
  userId,
  userFingerprint,
  userAt,
  onboardingAt,
  subscriptionAt,
}) =>
  [
    'studio:access:v1',
    `tenant:${safeString(tenantId)}`,
    `user:${safeString(userId)}`,
    `userRev:${safeString(userAt)}`,
    `tenantRev:${onboardingAt}`,
    `subscriptionRev:${subscriptionAt}`,
    `claimsRev:${userFingerprint}`,
  ].join(':');

const readCache = async (key) => {
  if (!hasRedisClient()) return null;
  try {
    const raw = await redisClient.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCache = async (key, value) => {
  if (!hasRedisClient()) return;
  try {
    await redisClient.setex(key, ACCESS_CACHE_TTL_SECONDS, JSON.stringify(value));
  } catch {
    // Cache failures must not block access resolution.
  }
};

const invalidateStudioAccessState = async ({
  tenantId = null,
  userId = null,
} = {}) => {
  if (!hasRedisClient()) return;

  const normalizedTenantId = safeString(tenantId);
  const normalizedUserId = safeString(userId);
  if (!normalizedTenantId) return;

  const pattern = normalizedUserId
    ? `studio:access:v1:tenant:${normalizedTenantId}:user:${normalizedUserId}:*`
    : `studio:access:v1:tenant:${normalizedTenantId}:*`;

  try {
    const stream = redisClient.scanStream({ match: pattern, count: 100 });
    const keys = new Set();

    await new Promise((resolve) => {
      stream.on('data', (chunk) => {
        chunk.forEach((key) => keys.add(key));
      });
      stream.on('end', resolve);
      stream.on('error', resolve);
    });

    if (keys.size > 0) {
      await redisClient.del(Array.from(keys));
    }
  } catch {
    // Best effort only.
  }
};

const resolveLegacyOnboardingState = async ({ tenantId, userId, user }) => {
  const isOwner = Boolean(user?.isOwner || user?.isSuper || user?.isSaby);
  if (!isOwner) {
    return {
      required: false,
      completed: true,
      reason: 'owner_only',
      profile: null,
      memberships: [],
      primaryWorkspace: null,
    };
  }

  const onboarding = await TenantOnboarding.findOne({ tenantId }).lean();
  const settings = await GlobalSettings.findOne({ tenantId }).lean();
  const rootNode = await Nodes.findOne({
    tenantId,
    parent: null,
    deletedAt: null,
  })
    .select('_id name level address city state country nodeStructures')
    .populate('level', 'name rank')
    .lean();

  let resolvedCompanyName = safeString(
    onboarding?.company?.name,
    safeString(settings?.organizationName)
  );
  const hasCompanyName =
    Boolean(resolvedCompanyName) && resolvedCompanyName !== 'Default Organization Name';
  const hasRootNode = Boolean(rootNode?._id);
  let completed = hasCompanyName && hasRootNode;

  if (!completed && hasRootNode && !hasCompanyName) {
    const [userCount, nodeCount] = await Promise.all([
      User.countDocuments({ tenantId, deletedAt: null }),
      Nodes.countDocuments({ tenantId, deletedAt: null }),
    ]);
    const hasLegacyConfiguredTenant = Number(userCount || 0) > 1 || Number(nodeCount || 0) > 1;
    if (hasLegacyConfiguredTenant) {
      completed = true;
      resolvedCompanyName = safeString(rootNode?.name, 'Organization');
    }
  }

  const activeWorkspaces = Array.isArray(onboarding?.workspaces)
    ? onboarding.workspaces.filter((workspace) => workspace?.isDeleted !== true)
    : [];
  const memberships = activeWorkspaces
    .map((workspace) => {
      const members = Array.isArray(workspace?.members) ? workspace.members : [];
      const member = members.find(
        (entry) =>
          safeString(entry?.userId) === safeString(userId) && entry?.status === 'active'
      );
      if (!member) return null;
      return {
        workspaceId: safeString(workspace.workspaceId),
        name: safeString(workspace.name),
        visibility: safeString(workspace.visibility, 'private'),
        role: safeString(member.role, 'viewer'),
        accessProfileId: safeString(member.accessProfileId, 'viewer'),
        isDefault: safeString(workspace.workspaceId) === 'ws_default',
      };
    })
    .filter(Boolean);

  const primaryWorkspace = memberships.find((entry) => entry?.isDefault) || memberships[0] || null;

  return {
    required: true,
    completed,
    reason: completed ? null : 'studio_setup_incomplete',
    profile: onboarding?.company
      ? {
          company: {
            name: resolvedCompanyName,
            email: safeString(onboarding?.company?.email || settings?.contactEmail || ''),
            phone: safeString(onboarding?.company?.phone || settings?.contactPhone || ''),
            organizationType: safeString(onboarding?.company?.organizationType || ''),
            industry: safeString(onboarding?.company?.industry || ''),
            size: safeString(onboarding?.company?.size || ''),
            timezone: safeString(onboarding?.company?.timezone || settings?.timezone || 'Africa/Lagos'),
            country: safeString(onboarding?.company?.country || ''),
            state: safeString(onboarding?.company?.state || ''),
            city: safeString(onboarding?.company?.city || ''),
            address: safeString(onboarding?.company?.address || ''),
            receivingAccounts: Array.isArray(settings?.receivingAccounts) ? settings.receivingAccounts : [],
          },
          owner: {
            phoneNumber: safeString(onboarding?.owner?.phoneNumber || ''),
            roleTitle: safeString(onboarding?.owner?.roleTitle || 'Owner'),
          },
          node: {
            rootNodeId: rootNode?._id ? String(rootNode._id) : '',
            rootNodeName: safeString(rootNode?.name || ''),
            rootLevelName: safeString(rootNode?.level?.name || ''),
            rootNodeAddress: safeString(rootNode?.address || ''),
            nodeStructures: Boolean(rootNode?.nodeStructures),
          },
        }
      : null,
    memberships,
    primaryWorkspace,
  };
};

const resolveSubscriptionRuntime = (subscriptionDoc) => {
  if (!subscriptionDoc) {
    return null;
  }

  const serialized = typeof subscriptionDoc.toJSON === 'function'
    ? subscriptionDoc.toJSON()
    : subscriptionDoc;
  const addOns = normalizeAddOns(serialized.addOns);
  const entitlements =
    subscriptionEntitlementService.buildEffectiveEntitlements({
      planId: serialized.planId,
      addonIds: addOns.map((addon) => addon.id),
      featureOverrides: serialized.featureOverrides || {},
    }) || serialized.entitlementsSnapshot || null;
  const usage = serialized.usageCounters?.system || serialized.usage || {};
  const usageAssessment = subscriptionEntitlementService.assessUsageAgainstEntitlements({
    entitlements,
    usage,
  });

  return {
    id: serialized.id || serialized._id || null,
    planId: serialized.planId || null,
    planName: serialized.planName || null,
    status: serialized.status || null,
    billingPeriod: serialized.billingPeriod || null,
    currency: serialized.currency || null,
    paymentProvider: serialized.paymentProvider || null,
    renewalAt: serialized.renewalAt || null,
    currentPeriodStart: serialized.currentPeriodStart || null,
    currentPeriodEnd: serialized.currentPeriodEnd || null,
    addOns,
    entitlements,
    usage,
    usageAssessment,
    accessState: resolveSubscriptionAccessState(serialized),
  };
};

const resolveStudioAccessState = async ({ tenantId, user }) => {
  const normalizedTenantId = safeString(tenantId);
  const normalizedUserId = safeString(user?.id || user?._id);

  if (!normalizedTenantId || !normalizedUserId) {
    return null;
  }

  const [userDoc, subscriptionDoc, onboardingDoc] = await Promise.all([
    User.findById(normalizedUserId).lean(),
    Subscription.findOne({ tenantId: normalizedTenantId }).sort({ updatedAt: -1 }),
    TenantOnboarding.findOne({ tenantId: normalizedTenantId }).lean(),
  ]);

  if (!userDoc) {
    return null;
  }

  const userFingerprint = [
    normalizeClaimList(userDoc?.roles).join(','),
    normalizeClaimList(userDoc?.permissions).join(','),
    Boolean(userDoc?.isOwner),
    Boolean(userDoc?.isAdmin),
    Boolean(userDoc?.isSuper),
    Boolean(userDoc?.isSaby),
  ].join('|');

  const cacheKey = getCacheKey({
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
    userFingerprint,
    userAt: toPlainDate(userDoc?.updatedAt),
    onboardingAt: toPlainDate(onboardingDoc?.updatedAt),
    subscriptionAt: toPlainDate(subscriptionDoc?.updatedAt),
  });

  const cached = await readCache(cacheKey);
  if (cached) {
    return cached;
  }

  const subscription = resolveSubscriptionRuntime(subscriptionDoc);
  const onboarding = await resolveLegacyOnboardingState({
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
    user: userDoc,
  });

  const resolvedRoles = normalizeClaimList(userDoc?.roles);
  const resolvedPermissions = normalizeClaimList(userDoc?.permissions);
  const accessState = subscription?.accessState || resolveSubscriptionAccessState(null);

  const studioAccess = {
    tenantId: normalizedTenantId,
    userId: normalizedUserId,
    resolvedAt: new Date().toISOString(),
    sessionStatus: 'authenticated',
    onboarding,
    subscription:
      subscription || {
        id: null,
        planId: null,
        planName: null,
        status: null,
        billingPeriod: null,
        currency: null,
        paymentProvider: null,
        renewalAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        addOns: [],
        entitlements: null,
        usage: null,
        usageAssessment: null,
        accessState,
      },
    permissions: resolvedPermissions,
    roles: resolvedRoles,
    flags: {
      bypassSubscriptionGate: Boolean(userDoc?.isSaby),
      canManageBilling: Boolean(userDoc?.isOwner || userDoc?.isSuper || userDoc?.isSaby),
      isWorkspaceTeamManager: Boolean(
        userDoc?.isOwner || userDoc?.isAdmin || userDoc?.isSuper || userDoc?.isSaby
      ),
    },
    canEnterStudio: Boolean(
      onboarding?.completed &&
        (accessState.isActive || Boolean(userDoc?.isSaby))
    ),
  };

  await writeCache(cacheKey, studioAccess);
  return studioAccess;
};

module.exports = {
  invalidateStudioAccessState,
  resolveStudioAccessState,
};
