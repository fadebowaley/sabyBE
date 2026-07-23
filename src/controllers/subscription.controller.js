const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');
const { TenantOnboarding, User } = require('../models');
const { resolveStudioAccessState } = require('../services/studioAccess.service');
const {
  buildSubscriptionCharge,
  getSubscriptionAddonsForPlan,
  loadSubscriptionCatalog,
} = require('../services/subscriptionCatalog.service');

const getCurrentSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.getCurrentSubscription(
    req.user?.tenantId,
    { refreshUsage: true }
  );
  const tenantId = String(req.user?.tenantId || '').trim();
  const [onboarding, owner] = tenantId
    ? await Promise.all([
        TenantOnboarding.findOne({ tenantId }).select('company ownerUserId owner').lean(),
        User.findOne({ tenantId, isOwner: true })
          .select('firstname lastname email phoneNumber')
          .lean(),
      ])
    : [null, null];
  const ownerName = [owner?.firstname, owner?.lastname].filter(Boolean).join(' ').trim();
  const billingProfile = {
    name: onboarding?.company?.name || ownerName || null,
    email: onboarding?.company?.email || owner?.email || null,
    phone: onboarding?.company?.phone || owner?.phoneNumber || onboarding?.owner?.phoneNumber || null,
    address: onboarding?.company?.address || null,
    city: onboarding?.company?.city || null,
    state: onboarding?.company?.state || null,
    country: onboarding?.company?.country || null,
  };
  res.send({ subscription, billingProfile });
});

const cancelCurrentSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.cancelCurrentSubscriptionAtPeriodEnd(
    req.user?.tenantId,
    req.body || {},
    { userId: req.user?._id || req.user?.id || req.user?.userId || null }
  );
  res.send({ subscription });
});

const getStudioAccessState = catchAsync(async (req, res) => {
  const studioAccess = await resolveStudioAccessState({
    tenantId: req.user?.tenantId,
    user: req.user,
  });
  res.send({ studioAccess });
});

const previewSubscriptionChange = catchAsync(async (req, res) => {
  const { planId, addonIds, billingPeriod, currency } = req.body;
  await loadSubscriptionCatalog();
  const currentSubscription = await subscriptionService.getCurrentSubscription(
    req.user?.tenantId
  );

  const proposed = buildSubscriptionCharge({
    planId: planId || currentSubscription?.planId || 'starter',
    billingPeriod: billingPeriod || currentSubscription?.billingPeriod || 'monthly',
    currency: currency || currentSubscription?.currency || 'NGN',
    addonIds: addonIds || [],
  });

  const current = currentSubscription
    ? buildSubscriptionCharge({
        planId: currentSubscription.planId,
        billingPeriod: currentSubscription.billingPeriod,
        currency: currentSubscription.currency,
        addonIds: (currentSubscription.addOns || []).map((a) => a.id),
      })
    : null;

  const currentIds = new Set(
    (current?.selectedAddons || []).map((a) => a.id)
  );
  const proposedIds = new Set(
    (proposed?.selectedAddons || []).map((a) => a.id)
  );
  const added = (proposed?.selectedAddons || []).filter(
    (a) => !currentIds.has(a.id)
  );
  const removed = (current?.selectedAddons || []).filter(
    (a) => !proposedIds.has(a.id)
  );
  const availableAddons = getSubscriptionAddonsForPlan(
    planId || currentSubscription?.planId || 'starter'
  );

  res.send({
    current,
    proposed,
    added,
    removed,
    availableAddons,
    delta: (proposed?.total || 0) - (current?.total || 0),
  });
});

module.exports = {
  getCurrentSubscription,
  cancelCurrentSubscription,
  getStudioAccessState,
  previewSubscriptionChange,
};
