const httpStatus = require('http-status');
const { Subscription, TenantOnboarding, User } = require('../models');
const ApiError = require('../utils/ApiError');
const subscriptionEntitlementService = require('./subscriptionEntitlement.service');
const subscriptionUsageService = require('./subscriptionUsage.service');
const { invalidateStudioAccessState } = require('./studioAccess.service');
const {
  buildSubscriptionCharge,
  getSubscriptionPlan,
  loadSubscriptionCatalog,
  normalizeAddonIds,
  normalizeBillingPeriod,
  normalizeCurrency,
  normalizeProvider,
} = require('./subscriptionCatalog.service');

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const asDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addPeriod = (date, billingPeriod) => {
  const base = asDate(date) || new Date();
  const next = new Date(base);
  if (billingPeriod === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
    return next;
  }
  next.setMonth(next.getMonth() + 1);
  return next;
};

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
      const id = String(entry.id || '').trim();
      if (!id) {
        return null;
      }
      const name = String(entry.name || '').trim() || null;
      return { id, name };
    })
    .filter(Boolean);
};

const buildAddonIds = (addOns = []) =>
  normalizeAddOns(addOns)
    .map((addon) => addon.id)
    .filter(Boolean);

const ADMIN_SUBSCRIPTION_STATUSES = [
  'pending',
  'trialing',
  'active',
  'paused',
  'past_due',
  'cancelled',
  'expired',
];

const ACCESS_ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'];

const getCancellationMetadata = (subscription = {}) => {
  const metadata = asObject(subscription.metadata);
  const cancelAtPeriodEnd = metadata.cancelAtPeriodEnd === true;
  const accessUntil =
    asDate(metadata.accessUntil) ||
    asDate(metadata.cancelAccessUntil) ||
    asDate(subscription.currentPeriodEnd);
  return { cancelAtPeriodEnd, accessUntil };
};

const isSubscriptionAccessActive = (subscription = {}) => {
  const normalizedStatus = String(subscription.status || '').trim().toLowerCase();
  if (!ACCESS_ACTIVE_SUBSCRIPTION_STATUSES.includes(normalizedStatus)) {
    return false;
  }
  const { cancelAtPeriodEnd, accessUntil } = getCancellationMetadata(subscription);
  if (!cancelAtPeriodEnd) {
    return true;
  }
  return accessUntil ? accessUntil.getTime() >= Date.now() : true;
};

const hydrateSubscriptionRuntime = async (subscription, { refreshUsage = false } = {}) => {
  if (!subscription) {
    return null;
  }

  await loadSubscriptionCatalog();
  const addonIds = buildAddonIds(subscription.addOns);
  const entitlements =
    subscriptionEntitlementService.buildEffectiveEntitlements({
      planId: subscription.planId,
      addonIds,
      featureOverrides: asObject(subscription.featureOverrides),
    }) || asObject(subscription.entitlementsSnapshot);

  const usage = refreshUsage
    ? await subscriptionUsageService.refreshUsageSnapshot(subscription.tenantId)
    : asObject(subscription.usageCounters?.system);

  const usageAssessment =
    subscriptionEntitlementService.assessUsageAgainstEntitlements({
      entitlements,
      usage,
    });
  const serialized = subscription.toJSON();

  return {
    ...serialized,
    usageCounters: {
      ...(serialized.usageCounters || {}),
      system: usage,
    },
    entitlements,
    usage,
    usageAssessment,
  };
};

const activateSubscriptionFromPayment = async (payment, context = {}) => {
  if (!payment) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Payment is required to activate subscription.'
    );
  }
  if (payment.purpose !== 'subscription') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only subscription payments can activate subscriptions.'
    );
  }
  if (payment.status !== 'completed') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Subscription payment must be completed before activation.'
    );
  }

  const metadata = asObject(payment.metadata);
  const completionDetails = asObject(payment.completionDetails);
  const paymentDetails = asObject(payment.paymentDetails);
  const invoiceSnapshot = asObject(metadata.invoiceSnapshot);
  const providerVerification = asObject(metadata.providerVerification);
  const billingPeriod =
    String(metadata.billingPeriod || 'monthly').trim().toLowerCase() ===
    'annual'
      ? 'annual'
      : 'monthly';
  const effectiveStartedAt =
    asDate(payment.completedAt) ||
    asDate(payment.updatedAt) ||
    asDate(payment.createdAt) ||
    new Date();
  const currentPeriodStart = effectiveStartedAt;
  const currentPeriodEnd = addPeriod(effectiveStartedAt, billingPeriod);
  const addOns = normalizeAddOns(metadata.addOns);

  const providerMetadata = {
    provider:
      providerVerification.provider ||
      completionDetails.provider ||
      paymentDetails.provider ||
      payment.paymentMethod ||
      null,
    providerRef: payment.providerRef || providerVerification.providerRef || null,
    checkout: asObject(metadata.checkout),
    verification: providerVerification,
    completion: completionDetails,
  };

  const pricingSnapshot = {
    amount: Number(payment.amount ?? payment.total ?? 0),
    total: Number(payment.total ?? payment.amount ?? 0),
    currency: String(payment.currency || metadata.currency || 'NGN').toUpperCase(),
    planSubtotal: Number(metadata.planSubtotal ?? 0),
    addOnsSubtotal: Number(metadata.addOnsSubtotal ?? 0),
    subtotal: Number(metadata.subtotal ?? 0),
    taxableBase: Number(metadata.taxableBase ?? 0),
    discount: Number(metadata.discount ?? 0),
    credits: Number(metadata.credits ?? 0),
    promoAmount: Number(metadata.promoAmount ?? 0),
    tax: Number(metadata.tax ?? 0),
    vatRate: Number(metadata.vatRate ?? 0),
    adjustments: Array.isArray(metadata.adjustments)
      ? metadata.adjustments
      : Array.isArray(invoiceSnapshot.adjustments)
        ? invoiceSnapshot.adjustments
        : [],
    checkoutMode: metadata.checkoutMode || null,
    lineItems: Array.isArray(invoiceSnapshot.lineItems)
      ? invoiceSnapshot.lineItems
      : [],
    invoiceSnapshot,
  };

  const update = {
    tenantId: String(payment.tenantId),
    userId: payment.userId ? String(payment.userId) : null,
    planId: String(metadata.planId || '').trim() || 'starter',
    planName: String(metadata.planName || '').trim() || null,
    status: 'active',
    billingPeriod,
    currency: pricingSnapshot.currency,
    addOns,
    pricingSnapshot,
    paymentProvider: providerMetadata.provider,
    paymentReference: payment.reference || null,
    paymentId: payment._id
      ? String(payment._id)
      : payment.id
        ? String(payment.id)
        : null,
    startedAt: effectiveStartedAt,
    lastPaymentAt: effectiveStartedAt,
    currentPeriodStart,
    currentPeriodEnd,
    renewalAt: currentPeriodEnd,
    providerMetadata,
    entitlementsSnapshot:
      subscriptionEntitlementService.buildEffectiveEntitlements({
        planId: String(metadata.planId || '').trim() || 'starter',
        addonIds: addOns.map((addon) => addon.id),
        featureOverrides: {},
      }) || {},
    metadata: {
      source: context.source || 'payment-completion',
      sourceRef: context.sourceRef || null,
      checkoutReturnUrl: metadata.checkoutReturnUrl || null,
      gatewayPolicy: metadata.gatewayPolicy || null,
      activatedAt: effectiveStartedAt.toISOString(),
    },
  };

  const subscription = await Subscription.findOneAndUpdate(
    { tenantId: String(payment.tenantId) },
    {
      $set: update,
      $setOnInsert: {
        featureOverrides: {},
        usageCounters: {},
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  await subscriptionUsageService.refreshUsageSnapshot(subscription.tenantId);
  await invalidateStudioAccessState({
    tenantId: subscription.tenantId,
    userId: subscription.userId,
  });
  return Subscription.findById(subscription._id);
};

const getCurrentSubscription = async (tenantId, options = {}) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) {
    return null;
  }
  await loadSubscriptionCatalog();
  const subscription = await Subscription.findOne({ tenantId: normalizedTenantId }).sort({
    updatedAt: -1,
  });
  return hydrateSubscriptionRuntime(subscription, options);
};

const cancelCurrentSubscriptionAtPeriodEnd = async (
  tenantId,
  { reason = null } = {},
  actor = {}
) => {
  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }

  const subscription = await Subscription.findOne({ tenantId: normalizedTenantId });
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found.');
  }

  const normalizedStatus = String(subscription.status || '').trim().toLowerCase();
  if (!ACCESS_ACTIVE_SUBSCRIPTION_STATUSES.includes(normalizedStatus)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only active or trialing subscriptions can be cancelled at period end.'
    );
  }

  const accessUntil = asDate(subscription.currentPeriodEnd) || asDate(subscription.renewalAt) || new Date();
  subscription.metadata = {
    ...asObject(subscription.metadata),
    cancelAtPeriodEnd: true,
    cancelledAt: new Date().toISOString(),
    cancelReason: reason || null,
    accessUntil: accessUntil.toISOString(),
    adminActorId: actor.userId || null,
  };
  await subscription.save();

  return afterAdminSubscriptionMutation(subscription);
};

const refreshSubscriptionUsage = async (tenantId) =>
  subscriptionUsageService.refreshUsageSnapshot(tenantId);

const buildSubscriptionAdminUpdate = async (payload = {}, existing = null) => {
  await loadSubscriptionCatalog();
  const planId = String(payload.planId || existing?.planId || 'starter')
    .trim()
    .toLowerCase();
  const plan = getSubscriptionPlan(planId);
  if (!plan) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported subscription plan.');
  }

  const billingPeriod = normalizeBillingPeriod(
    payload.billingPeriod || existing?.billingPeriod || 'monthly'
  );
  const currency = normalizeCurrency(payload.currency || existing?.currency || 'NGN');
  const addonIds =
    payload.addOnIds !== undefined
      ? normalizeAddonIds(payload.addOnIds)
      : buildAddonIds(existing?.addOns || []);
  const pricing = buildSubscriptionCharge({
    planId,
    billingPeriod,
    currency,
    addonIds,
  });
  const now = new Date();
  const currentPeriodStart =
    asDate(payload.currentPeriodStart) ||
    asDate(existing?.currentPeriodStart) ||
    now;
  const currentPeriodEnd =
    asDate(payload.currentPeriodEnd) ||
    asDate(payload.renewalAt) ||
    asDate(existing?.currentPeriodEnd) ||
    addPeriod(currentPeriodStart, billingPeriod);
  const status = String(payload.status || existing?.status || 'pending')
    .trim()
    .toLowerCase();

  if (!ADMIN_SUBSCRIPTION_STATUSES.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported subscription status.');
  }

  return {
    planId,
    planName: plan.name || null,
    status,
    billingPeriod,
    currency,
    addOns: pricing.selectedAddons.map((addon) => ({
      id: addon.id,
      name: addon.name || null,
    })),
    pricingSnapshot: {
      amount: pricing.taxableBase,
      total: pricing.total,
      currency: pricing.currency,
      planSubtotal: pricing.planSubtotal,
      addOnsSubtotal: pricing.addonsSubtotal,
      subtotal: pricing.subtotal,
      taxableBase: pricing.taxableBase,
      discount: pricing.discount,
      tax: pricing.tax,
      vatRate: pricing.vatRate,
      lineItems: pricing.lineItems,
    },
    entitlementsSnapshot:
      subscriptionEntitlementService.buildEffectiveEntitlements({
        planId,
        addonIds,
        featureOverrides: asObject(payload.featureOverrides || existing?.featureOverrides),
      }) || {},
    featureOverrides: asObject(payload.featureOverrides || existing?.featureOverrides),
    paymentProvider:
      payload.paymentProvider !== undefined
        ? normalizeProvider(payload.paymentProvider)
        : existing?.paymentProvider || null,
    paymentReference:
      payload.paymentReference !== undefined
        ? String(payload.paymentReference || '').trim() || null
        : existing?.paymentReference || null,
    paymentId:
      payload.paymentId !== undefined
        ? String(payload.paymentId || '').trim() || null
        : existing?.paymentId || null,
    startedAt: asDate(payload.startedAt) || asDate(existing?.startedAt) || now,
    currentPeriodStart,
    currentPeriodEnd,
    renewalAt: currentPeriodEnd,
    lastPaymentAt: asDate(payload.lastPaymentAt) || asDate(existing?.lastPaymentAt),
    metadata: {
      ...asObject(existing?.metadata),
      ...asObject(payload.metadata),
      ...(payload.notes ? { adminNotes: String(payload.notes) } : {}),
      adminUpdatedAt: now.toISOString(),
    },
  };
};

const afterAdminSubscriptionMutation = async (subscription) => {
  await subscriptionUsageService.refreshUsageSnapshot(subscription.tenantId);
  await invalidateStudioAccessState({
    tenantId: subscription.tenantId,
    userId: subscription.userId,
  });
  return getCurrentSubscription(subscription.tenantId, { refreshUsage: true });
};

const buildTenantProfile = (tenantId, profile, owner) => {
  const ownerName = [owner?.firstname, owner?.lastname].filter(Boolean).join(' ').trim();
  return {
    name: profile?.company?.name || ownerName || tenantId,
    email: profile?.company?.email || owner?.email || null,
    phone: profile?.company?.phone || owner?.phoneNumber || profile?.owner?.phoneNumber || null,
  };
};

const listAdminSubscriptions = async (filter = {}, options = {}) => {
  const status = String(filter.status || '').trim().toLowerCase();
  const planId = String(filter.planId || '').trim().toLowerCase();
  const tenantFilter = String(filter.tenantId || '').trim();
  const limit = Math.max(1, Number(options.limit || 25));
  const page = Math.max(1, Number(options.page || 1));

  const [profiles, owners, subscriptions] = await Promise.all([
    TenantOnboarding.find(tenantFilter ? { tenantId: tenantFilter } : {})
      .select('tenantId company ownerUserId owner updatedAt createdAt')
      .sort({ updatedAt: -1 })
      .lean(),
    User.find({
      ...(tenantFilter ? { tenantId: tenantFilter } : { tenantId: { $exists: true, $ne: null } }),
      isOwner: true,
    })
      .select('tenantId firstname lastname email phoneNumber updatedAt createdAt')
      .lean(),
    Subscription.find(tenantFilter ? { tenantId: tenantFilter } : {})
      .sort({ updatedAt: -1 })
      .lean(),
  ]);

  const profileByTenant = new Map(profiles.map((profile) => [String(profile.tenantId), profile]));
  const ownerByTenant = new Map(owners.map((owner) => [String(owner.tenantId), owner]));
  const subscriptionByTenant = new Map(
    subscriptions.map((subscription) => [String(subscription.tenantId), subscription])
  );
  const tenantIds = Array.from(
    new Set([
      ...profiles.map((profile) => String(profile.tenantId || '').trim()),
      ...owners.map((owner) => String(owner.tenantId || '').trim()),
      ...subscriptions.map((subscription) => String(subscription.tenantId || '').trim()),
    ])
  ).filter(Boolean);

  const allRows = tenantIds
    .map((tenantId) => {
      const subscription = subscriptionByTenant.get(tenantId);
      const plain = subscription || {};
    const profile = profileByTenant.get(tenantId);
    const owner = ownerByTenant.get(tenantId);
    return {
      ...plain,
        id: plain.id || plain._id || `tenant:${tenantId}`,
        _id: plain._id || `tenant:${tenantId}`,
        tenantId,
        planId: plain.planId || null,
        planName: plain.planName || null,
        status: subscription ? plain.status : 'unsubscribed',
        billingPeriod: plain.billingPeriod || null,
        currency: plain.currency || null,
        addOns: Array.isArray(plain.addOns) ? plain.addOns : [],
        hasSubscription: Boolean(subscription),
        updatedAt: plain.updatedAt || profile?.updatedAt || owner?.updatedAt || null,
      tenantProfile: {
          ...buildTenantProfile(tenantId, profile, owner),
      },
    };
    })
    .filter((row) => {
      if (status && row.status !== status) return false;
      if (planId && String(row.planId || '').toLowerCase() !== planId) return false;
      return true;
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  const totalResults = allRows.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / limit));
  const start = (page - 1) * limit;
  return {
    results: allRows.slice(start, start + limit),
    page,
    limit,
    totalPages,
    totalResults,
  };
};

const createOrReplaceTenantSubscription = async (payload = {}, actor = {}) => {
  const tenantId = String(payload.tenantId || '').trim();
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }
  const existing = await Subscription.findOne({ tenantId });
  const update = await buildSubscriptionAdminUpdate(payload, existing);
  const subscription = await Subscription.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        ...update,
        tenantId,
        userId: payload.userId ? String(payload.userId) : existing?.userId || null,
        providerMetadata: {
          ...asObject(existing?.providerMetadata),
          adminActorId: actor.userId || null,
        },
      },
      $setOnInsert: {
        usageCounters: {},
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return afterAdminSubscriptionMutation(subscription);
};

const getAdminSubscriptionById = async (subscriptionId) => {
  const subscription = await Subscription.findById(subscriptionId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Subscription not found.');
  }
  return subscription;
};

const updateAdminSubscription = async (subscriptionId, payload = {}, actor = {}) => {
  const subscription = await getAdminSubscriptionById(subscriptionId);
  const update = await buildSubscriptionAdminUpdate(payload, subscription);
  Object.assign(subscription, {
    ...update,
    userId: payload.userId ? String(payload.userId) : subscription.userId,
    providerMetadata: {
      ...asObject(subscription.providerMetadata),
      adminActorId: actor.userId || null,
    },
  });
  await subscription.save();
  return afterAdminSubscriptionMutation(subscription);
};

const updateAdminSubscriptionStatus = async (
  subscriptionId,
  { status, reason = null } = {},
  actor = {}
) => {
  const subscription = await getAdminSubscriptionById(subscriptionId);
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!ADMIN_SUBSCRIPTION_STATUSES.includes(normalizedStatus)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported subscription status.');
  }
  subscription.status = normalizedStatus;
  subscription.metadata = {
    ...asObject(subscription.metadata),
    statusReason: reason || null,
    adminActorId: actor.userId || null,
    statusUpdatedAt: new Date().toISOString(),
  };
  await subscription.save();
  return afterAdminSubscriptionMutation(subscription);
};

const startOrExtendTrial = async (
  subscriptionId,
  { trialEndsAt, trialDays, notes } = {},
  actor = {}
) => {
  const subscription = await getAdminSubscriptionById(subscriptionId);
  const start = asDate(subscription.currentPeriodStart) || new Date();
  const end = asDate(trialEndsAt) || new Date();
  if (!trialEndsAt) {
    end.setDate(end.getDate() + Math.max(1, Number(trialDays || 14)));
  }
  subscription.status = 'trialing';
  subscription.currentPeriodStart = start;
  subscription.currentPeriodEnd = end;
  subscription.renewalAt = end;
  subscription.metadata = {
    ...asObject(subscription.metadata),
    trialStartedAt: start.toISOString(),
    trialEndsAt: end.toISOString(),
    trialNotes: notes || null,
    adminActorId: actor.userId || null,
  };
  await subscription.save();
  return afterAdminSubscriptionMutation(subscription);
};

const createAdminPaymentOrSubscription = async (payload = {}, actor = {}) => {
  if (String(payload.actionType || '').trim() === 'payment') {
    const paymentService = require('./payment.service');
    const pricing = buildSubscriptionCharge({
      planId: payload.planId || 'starter',
      billingPeriod: payload.billingPeriod || 'monthly',
      currency: payload.currency || 'NGN',
      addonIds: payload.addOnIds || [],
    });
    const reference =
      String(payload.reference || '').trim() ||
      `ADM-SUB-${Date.now().toString(36).toUpperCase()}`;
    const { payment } = await paymentService.createOrGetPayment({
      tenantId: String(payload.tenantId || '').trim(),
      userId: String(payload.userId || actor.userId || 'saby-admin'),
      amount: Number(payload.amountOverride || pricing.taxableBase || pricing.total),
      total: Number(payload.amountOverride || pricing.total),
      currency: pricing.currency,
      status:
        String(payload.status || '').trim().toLowerCase() === 'completed'
          ? 'processing'
          : String(payload.status || 'pending').trim().toLowerCase(),
      purpose: 'subscription',
      beneficiaryType: 'saby',
      reference,
      paymentMethod: normalizeProvider(payload.provider || 'paystack'),
      metadata: {
        planId: pricing.plan.id,
        planName: pricing.plan.name,
        billingPeriod: pricing.billingPeriod,
        currency: pricing.currency,
        addOns: pricing.selectedAddons.map((addon) => ({
          id: addon.id,
          name: addon.name,
        })),
        planSubtotal: pricing.planSubtotal,
        addOnsSubtotal: pricing.addonsSubtotal,
        subtotal: pricing.subtotal,
        taxableBase: pricing.taxableBase,
        discount: pricing.discount,
        tax: pricing.tax,
        vatRate: pricing.vatRate,
        invoiceSnapshot: {
          lineItems: pricing.lineItems,
          total: pricing.total,
        },
        adminNotes: payload.notes || null,
      },
    });
    if (String(payload.status || '').trim().toLowerCase() === 'completed') {
      const completedPayment = await paymentService.completePayment(
        payment.id,
        {
          providerRef: payload.providerRef || reference,
          completionDetails: { source: 'saby-admin' },
        },
        null,
        {
          userId: actor.userId,
          source: 'saby-admin',
          dedupeKey: `admin-complete:${payment.id}`,
        }
      );
      const subscription = await activateSubscriptionFromPayment(completedPayment, {
        source: 'saby-admin-payment',
        sourceRef: completedPayment.reference,
      });
      return { payment: completedPayment, subscription };
    }
    return { payment, subscription: null };
  }

  const subscription = await createOrReplaceTenantSubscription(payload, actor);
  return { payment: null, subscription };
};

const LIMIT_LABELS = {
  forms: 'form',
  nodes: 'node',
  seats: 'seat',
  storageMb: 'storage',
  submissionsCurrentPeriod: 'submission',
  apiCallsCurrentHour: 'API call',
};

const checkSubscriptionLimit = async ({
  tenantId,
  limitKey,
  nextUsage = null,
}) => {
  const subscription = await getCurrentSubscription(tenantId, { refreshUsage: true });
  if (!subscription) {
    return {
      allowed: false,
      reason: 'missing_subscription',
      subscription: null,
    };
  }

  const usageEntry = subscription.usageAssessment?.[limitKey];
  if (!usageEntry) {
    return {
      allowed: true,
      reason: null,
      subscription,
    };
  }

  const candidateUsed =
    nextUsage == null ? Number(usageEntry.used || 0) : Number(nextUsage || 0);
  const exceeds =
    usageEntry.unlimited === true
      ? false
      : candidateUsed > Number(usageEntry.limit || 0);

  return {
    allowed: !exceeds,
    reason: exceeds ? `${limitKey}_limit_exceeded` : null,
    subscription,
    limit: usageEntry.limit,
    used: candidateUsed,
  };
};

const assertSubscriptionLimit = async ({
  tenantId,
  limitKey,
  delta = 1,
  nextUsage = null,
  message = null,
  details = null,
}) => {
  const subscription = await getCurrentSubscription(tenantId, { refreshUsage: true });
  if (!subscription) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'An active workspace subscription is required for this action.'
    );
  }

  if (!isSubscriptionAccessActive(subscription)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'An active or trialing workspace subscription is required for this action.'
    );
  }

  const usageEntry = subscription.usageAssessment?.[limitKey];
  if (!usageEntry) {
    return subscription;
  }

  const candidateUsed =
    nextUsage == null
      ? Number(usageEntry.used || 0) + Number(delta || 0)
      : Number(nextUsage || 0);
  const exceeds =
    usageEntry.unlimited === true
      ? false
      : candidateUsed > Number(usageEntry.limit || 0);

  if (exceeds) {
    const label = LIMIT_LABELS[limitKey] || 'resource';
    const defaultDetails = {
      code: `${String(limitKey || 'resource').toUpperCase()}_LIMIT_REACHED`,
      limitKey,
      limit: usageEntry.limit,
      used: candidateUsed,
    };
    throw new ApiError(
      httpStatus.FORBIDDEN,
      message ||
        `Your current workspace subscription has reached its ${label} limit. Upgrade billing to continue.`,
      true,
      '',
      details ? { ...defaultDetails, ...details } : defaultDetails
    );
  }

  return subscription;
};

module.exports = {
  activateSubscriptionFromPayment,
  getCurrentSubscription,
  cancelCurrentSubscriptionAtPeriodEnd,
  refreshSubscriptionUsage,
  checkSubscriptionLimit,
  assertSubscriptionLimit,
  listAdminSubscriptions,
  createOrReplaceTenantSubscription,
  createAdminPaymentOrSubscription,
  updateAdminSubscription,
  updateAdminSubscriptionStatus,
  startOrExtendTrial,
};
