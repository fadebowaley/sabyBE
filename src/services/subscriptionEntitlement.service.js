const {
  getSubscriptionPlan,
  resolveSelectedSubscriptionAddons,
  normalizePlanId,
} = require('./subscriptionCatalog.service');

const unique = (values = []) => Array.from(new Set(values.filter(Boolean)));

const ADDON_EFFECTS = {
  payments_collection: {
    capabilities: {
      paymentsCollection: true,
      settlement: true,
    },
  },
  workflows_approvals: {
    capabilities: {
      workflowsApprovals: true,
    },
  },
  api_access: {
    channels: ['api'],
    capabilities: {
      apiAccess: true,
    },
  },
};

const buildPlanCapabilities = (plan) => {
  const normalizedPlanId = normalizePlanId(plan?.id);
  const channels = Array.isArray(plan?.included?.channels) ? plan.included.channels : [];
  const reportFrequencies = Array.isArray(plan?.included?.reportFrequencies)
    ? plan.included.reportFrequencies
    : [];

  return {
    apiAccess: channels.includes('api'),
    embed: channels.includes('embed'),
    whatsapp: channels.includes('whatsapp'),
    telegram: channels.includes('telegram'),
    customChannel: channels.includes('custom'),
    monthlyReporting: reportFrequencies.includes('monthly'),
    weeklyReporting: reportFrequencies.includes('weekly'),
    dailyReporting: reportFrequencies.includes('daily'),
    customReporting: reportFrequencies.includes('custom'),
    workflowsApprovals: ['business', 'enterprise'].includes(normalizedPlanId),
    advancedExports: ['business', 'enterprise'].includes(normalizedPlanId),
    paymentsCollection: normalizedPlanId === 'enterprise',
    settlement: normalizedPlanId === 'enterprise',
  };
};

const buildEffectiveEntitlements = ({
  planId,
  addonIds = [],
  featureOverrides = {},
}) => {
  const plan = getSubscriptionPlan(planId);
  if (!plan) {
    return null;
  }

  const selectedAddons = resolveSelectedSubscriptionAddons({
    planId: plan.id,
    addonIds,
  });

  const channels = unique(plan.included?.channels || []);
  const reportFrequencies = unique(plan.included?.reportFrequencies || []);
  const capabilities = buildPlanCapabilities(plan);

  selectedAddons.forEach((addon) => {
    const effect = ADDON_EFFECTS[addon.id];
    if (!effect) {
      return;
    }

    if (Array.isArray(effect.channels)) {
      channels.push(...effect.channels);
    }

    if (Array.isArray(effect.reportFrequencies)) {
      reportFrequencies.push(...effect.reportFrequencies);
    }

    if (effect.capabilities) {
      Object.assign(capabilities, effect.capabilities);
    }
  });

  const mergedCapabilities = {
    ...capabilities,
    ...(featureOverrides.capabilities || {}),
  };

  return {
    planId: plan.id,
    planName: plan.name,
    supportTier: plan.included?.supportTier || null,
    limits: {
      forms: plan.included?.forms ?? null,
      nodes: plan.included?.nodes ?? null,
      seats: plan.included?.seats ?? null,
      storageMb: plan.included?.storageMb ?? null,
      submissionsPerMonth: plan.included?.submissionsPerMonth ?? null,
      apiRatePerHour: plan.included?.apiRatePerHour ?? null,
      auditRetentionDays: plan.included?.auditRetentionDays ?? null,
      ...(featureOverrides.limits || {}),
    },
    channels: unique(channels),
    reportFrequencies: unique(reportFrequencies),
    capabilities: mergedCapabilities,
    addOns: selectedAddons.map((addon) => ({
      id: addon.id,
      name: addon.name,
      category: addon.category,
    })),
  };
};

const assessUsageAgainstEntitlements = ({ entitlements, usage = {} }) => {
  const limits = entitlements?.limits || {};
  const usageView = {
    forms: Number(usage.forms || 0),
    nodes: Number(usage.nodes || 0),
    seats: Number(usage.seats || 0),
    storageMb: Number(usage.storageMb || 0),
    submissionsCurrentPeriod: Number(usage.submissionsCurrentPeriod || 0),
    apiCallsCurrentHour: Number(usage.apiCallsCurrentHour || 0),
  };

  const matrix = {
    forms: {
      used: usageView.forms,
      limit: limits.forms ?? null,
    },
    nodes: {
      used: usageView.nodes,
      limit: limits.nodes ?? null,
    },
    seats: {
      used: usageView.seats,
      limit: limits.seats ?? null,
    },
    storageMb: {
      used: usageView.storageMb,
      limit: limits.storageMb ?? null,
    },
    submissionsCurrentPeriod: {
      used: usageView.submissionsCurrentPeriod,
      limit: limits.submissionsPerMonth ?? null,
    },
    apiCallsCurrentHour: {
      used: usageView.apiCallsCurrentHour,
      limit: limits.apiRatePerHour ?? null,
    },
  };

  Object.values(matrix).forEach((entry) => {
    entry.unlimited =
      entry.limit === 'unlimited' || entry.limit === 'custom' || entry.limit == null;
    entry.remaining = entry.unlimited ? null : Math.max(0, Number(entry.limit) - entry.used);
    entry.exceeded = entry.unlimited ? false : entry.used > Number(entry.limit);
  });

  return {
    ...matrix,
    hasExceededAnyLimit: Object.values(matrix).some((entry) => entry.exceeded),
  };
};

module.exports = {
  buildEffectiveEntitlements,
  assessUsageAgainstEntitlements,
};
