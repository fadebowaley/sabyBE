const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const { SubscriptionCatalog } = require('../models');

const SUBSCRIPTION_PLAN_IDS = ['starter', 'pro', 'business', 'enterprise'];
const SUBSCRIPTION_BILLING_PERIODS = ['monthly', 'annual'];
const SUBSCRIPTION_SUPPORTED_CURRENCIES = ['NGN', 'USD'];
const SUBSCRIPTION_SUPPORTED_PROVIDERS = ['paystack', 'flutterwave'];
const SUBSCRIPTION_ADDON_IDS = [
  'workflows_approvals',
  'payments_collection',
  'api_access',
];
const VAT_RATE = 0.075;

const SUBSCRIPTION_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams making the switch from spreadsheets.',
    pricing: {
      monthly: { USD: 9, NGN: 16500 },
      annual: { USD: 84, NGN: 158400 },
    },
    notes: 'For small teams',
    ctaLabel: 'Start now',
    contactSalesOnly: false,
    included: {
      forms: 1,
      nodes: 1,
      seats: 3,
      storageMb: 100,
      submissionsPerMonth: 500,
      apiRatePerHour: 100,
      auditRetentionDays: 7,
      reportFrequencies: ['monthly'],
      channels: ['web'],
      supportTier: 'Community',
    },
    featureHighlights: [
      'Data Studio, Data Hub, Reports & Storage (100 MB)',
      'Identity & Access (basic roles)',
      'Compliance Calendar (monthly)',
      'Portal-based ingestion (self-service)',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Best for replacing spreadsheets and manual reporting.',
    pricing: {
      monthly: { USD: 29, NGN: 31500 },
      annual: { USD: 288, NGN: 302400 },
    },
    notes: 'Growing teams',
    ctaLabel: 'Get started',
    contactSalesOnly: false,
    popular: true,
    included: {
      forms: 10,
      nodes: 3,
      seats: 10,
      storageMb: 2048,
      submissionsPerMonth: 5000,
      apiRatePerHour: 1000,
      auditRetentionDays: 30,
      reportFrequencies: ['monthly'],
      channels: ['web', 'api', 'embed'],
      supportTier: 'Email (48h)',
    },
    featureHighlights: [
      'Standard support (email 48h)',
      'All ingestion channels (web, API, embed)',
      '2 GB storage',
      '5,000 submissions/month',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    description: 'Most popular for accountability across multi-branch teams.',
    pricing: {
      monthly: { USD: 99, NGN: 89000 },
      annual: { USD: 948, NGN: 854400 },
    },
    notes: 'Multi-branch teams',
    ctaLabel: 'Get started',
    contactSalesOnly: false,
    included: {
      forms: 50,
      nodes: 15,
      seats: 50,
      storageMb: 20480,
      submissionsPerMonth: 50000,
      apiRatePerHour: 5000,
      auditRetentionDays: 90,
      reportFrequencies: ['monthly', 'weekly'],
      channels: ['web', 'api', 'embed', 'whatsapp', 'telegram'],
      supportTier: 'Email (24h) + Chat',
    },
    featureHighlights: [
      'Workflows & Approvals (up to 10)',
      'Communication Hub (email + WhatsApp + Telegram)',
      'Prebuilt operational reports',
      '20 GB storage, 50,000 submissions/mo',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Operations at scale with governance and custom delivery.',
    pricing: {
      monthly: { USD: 299, NGN: 350000 },
      annual: { USD: 2988, NGN: 3360000 },
    },
    notes: 'Custom pricing',
    ctaLabel: 'Contact sales',
    contactSalesOnly: true,
    included: {
      forms: 'unlimited',
      nodes: 'unlimited',
      seats: 'unlimited',
      storageMb: 'custom',
      submissionsPerMonth: 'unlimited',
      apiRatePerHour: 'custom',
      auditRetentionDays: 365,
      reportFrequencies: ['monthly', 'weekly', 'daily', 'custom'],
      channels: ['web', 'api', 'embed', 'whatsapp', 'telegram', 'custom'],
      supportTier: 'Dedicated SLA',
    },
    featureHighlights: [
      'Advanced workflows + automation rules',
      'All ingestion channels + custom integrations',
      'Audit & compliance controls (1 year retention)',
      'Unlimited storage',
      'Dedicated support SLA',
    ],
  },
};

const SUBSCRIPTION_ADDONS = {
  payments_collection: {
    id: 'payments_collection',
    name: 'Payment Collection',
    category: 'capability',
    pricing: {
      monthly: { USD: 35, NGN: 38500 },
      annual: { USD: 350, NGN: 385000 },
    },
    eligiblePlans: ['starter', 'pro', 'business'],
  },
  workflows_approvals: {
    id: 'workflows_approvals',
    name: 'Workflows & Approvals',
    category: 'capability',
    pricing: {
      monthly: { USD: 15, NGN: 16500 },
      annual: { USD: 150, NGN: 165000 },
    },
    eligiblePlans: ['starter', 'pro'],
  },
  api_access: {
    id: 'api_access',
    name: 'API Access',
    category: 'capability',
    pricing: {
      monthly: { USD: 20, NGN: 22000 },
      annual: { USD: 200, NGN: 220000 },
    },
    eligiblePlans: ['starter'],
  },
};

const SUBSCRIPTION_METERED_PRICING = {
  storage_overage: { unit: 'GB/month', pricing: { USD: 5, NGN: 7500 } },
  submission_pack: { unit: '1K submissions', pricing: { USD: 2, NGN: 3000 } },
  extra_seat_pro: { unit: 'seat/month', pricing: { USD: 5, NGN: 7500 } },
  extra_seat_business: { unit: 'seat/month', pricing: { USD: 8, NGN: 12000 } },
  extra_node_pro: { unit: 'node/month', pricing: { USD: 6, NGN: 9000 } },
  extra_node_business: { unit: 'node/month', pricing: { USD: 4, NGN: 6000 } },
  api_pack: { unit: '10K requests', pricing: { USD: 1, NGN: 1500 } },
  sms_pack: { unit: 'SMS', pricing: { USD: 0.04, NGN: 60 } },
  messaging_pack: { unit: '100 messages', pricing: { USD: 2, NGN: 3000 } },
};

const SUBSCRIPTION_GATEWAY_POLICY = {
  model: 'saby_managed_only',
  supportedProviders: SUBSCRIPTION_SUPPORTED_PROVIDERS,
  collectionFees: {
    starter: { type: 'percent', value: 2.5 },
    pro: { type: 'percent', value: 2.0 },
    business: { type: 'percent', value: 1.5 },
    enterprise: { type: 'custom', value: null },
  },
  settlementFees: {
    default: {
      type: 'blended',
      percent: 1.0,
      fixedUsd: 0.3,
      fixedNgn: 250,
    },
    enterprise: {
      type: 'custom',
      percent: null,
      fixedUsd: null,
      fixedNgn: null,
    },
  },
};

const DEFAULT_SUBSCRIPTION_CATALOG = {
  plans: SUBSCRIPTION_PLANS,
  addons: SUBSCRIPTION_ADDONS,
  meteredPricing: SUBSCRIPTION_METERED_PRICING,
  gatewayPolicy: SUBSCRIPTION_GATEWAY_POLICY,
  vatRate: VAT_RATE,
  exchangeRates: {
    usdToNgn: 1500,
    source: 'manual',
    updatedAt: null,
  },
  supportedCurrencies: SUBSCRIPTION_SUPPORTED_CURRENCIES,
  supportedProviders: SUBSCRIPTION_SUPPORTED_PROVIDERS,
  discounts: {
    enabled: false,
    mode: 'percentage',
    value: 0,
    label: 'Finance discount',
  },
  discountRules: [],
  credits: {
    enabled: false,
    amount: 0,
    label: 'Finance credit',
  },
  creditRules: [
    {
      id: 'credit_rule_100pct',
      label: 'Full credit',
      enabled: false,
      mode: 'percentage',
      value: 100,
      currency: null,
      startsAt: null,
      expiresAt: null,
    },
  ],
  manualValidation: {
    enabled: true,
    note: 'Manual payment review available for finance admins.',
  },
  promoCodes: [],
  // collectionFee for form payments only (subscriptions have no extra fee)
  collectionFee: {
    enabled: true,
    // For amounts < 500: flat fee only
    // For amounts >= 500: percentage + flat
    rate: 0.015,
    flat: 50,
    flatBelow500: 50,
    min: 50,
    max: 2000,
    freeBelow: 0,
  },
};

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

let activeSubscriptionCatalog = cloneValue(DEFAULT_SUBSCRIPTION_CATALOG);
let catalogLoaded = false;

const getActiveSubscriptionCatalog = () => activeSubscriptionCatalog;

const normalizeCatalogPlan = (plan = {}) => {
  const id = normalizePlanId(plan.id || plan.planId);
  const sourcePlan = SUBSCRIPTION_PLANS[id] || {};
  const pricing = {
    ...(cloneValue(sourcePlan.pricing || {})),
    ...(cloneValue(plan.pricing || {})),
  };
  pricing.monthly = {
    ...(pricing.monthly || {}),
    ...(Number.isFinite(Number(plan.monthlyUsd)) ? { USD: Number(plan.monthlyUsd) } : {}),
    ...(Number.isFinite(Number(plan.monthlyNgn)) ? { NGN: Number(plan.monthlyNgn) } : {}),
  };
  pricing.annual = {
    ...(pricing.annual || {}),
    ...(Number.isFinite(Number(plan.annualUsd)) ? { USD: Number(plan.annualUsd) } : {}),
    ...(Number.isFinite(Number(plan.annualNgn)) ? { NGN: Number(plan.annualNgn) } : {}),
  };
  const featureHighlights =
    Array.isArray(plan.features) && plan.features.length > 0
      ? plan.features
      : Array.isArray(plan.featureHighlights) && plan.featureHighlights.length > 0
        ? plan.featureHighlights
        : Array.isArray(sourcePlan.featureHighlights)
          ? sourcePlan.featureHighlights
          : [];
  return {
    ...cloneValue(sourcePlan),
    ...cloneValue(plan),
    id,
    pricing,
    monthlyUsd: Number(pricing.monthly?.USD || 0),
    annualUsd: Number(pricing.annual?.USD || 0),
    monthlyNgn: Number(pricing.monthly?.NGN || 0),
    annualNgn: Number(pricing.annual?.NGN || 0),
    included: {
      ...(cloneValue(sourcePlan.included || {})),
      ...(cloneValue(plan.included || {})),
    },
    features: featureHighlights,
    featureHighlights,
  };
};

const normalizeCatalogAddon = (addon = {}) => {
  const id = String(addon.id || '').trim().toLowerCase();
  if (!id) return null;
  const sourceAddon = SUBSCRIPTION_ADDONS[id] || {};
  const pricing = {
    ...(cloneValue(sourceAddon.pricing || {})),
    ...(cloneValue(addon.pricing || {})),
  };
  pricing.monthly = {
    ...(pricing.monthly || {}),
    ...(Number.isFinite(Number(addon.monthlyUsd)) ? { USD: Number(addon.monthlyUsd) } : {}),
    ...(Number.isFinite(Number(addon.monthlyNgn)) ? { NGN: Number(addon.monthlyNgn) } : {}),
  };
  pricing.annual = {
    ...(pricing.annual || {}),
    ...(Number.isFinite(Number(addon.annualUsd)) ? { USD: Number(addon.annualUsd) } : {}),
    ...(Number.isFinite(Number(addon.annualNgn)) ? { NGN: Number(addon.annualNgn) } : {}),
  };
  return {
    ...cloneValue(sourceAddon),
    ...cloneValue(addon),
    id,
    eligiblePlans: Array.isArray(addon.eligiblePlans)
      ? addon.eligiblePlans.map((entry) => normalizePlanId(entry))
      : Array.isArray(sourceAddon.eligiblePlans)
        ? sourceAddon.eligiblePlans
        : [],
    pricing,
    monthlyUsd: Number(pricing.monthly?.USD || 0),
    annualUsd: Number(pricing.annual?.USD || 0),
    monthlyNgn: Number(pricing.monthly?.NGN || 0),
    annualNgn: Number(pricing.annual?.NGN || 0),
  };
};

const normalizePromoCode = (promo = {}) => {
  const code = String(promo.code || '').trim().toUpperCase();
  if (!code) return null;
  return {
    code,
    enabled: promo.enabled !== false,
    mode: String(promo.mode || 'percentage').trim().toLowerCase() === 'fixed'
      ? 'fixed'
      : 'percentage',
    value: Number.isFinite(Number(promo.value)) ? Number(promo.value) : 0,
    currency: promo.currency ? normalizeCurrency(promo.currency) : null,
    startsAt: promo.startsAt || null,
    expiresAt: promo.expiresAt || null,
    maxRedemptions:
      promo.maxRedemptions == null || promo.maxRedemptions === ''
        ? null
        : Math.max(0, Number(promo.maxRedemptions || 0)),
  };
};

const normalizeAdjustmentRule = (rule = {}, fallback = {}) => {
  const id = String(rule.id || fallback.id || `${Date.now()}`).trim();
  const code = String(rule.code || rule.label || '').trim().toUpperCase() || null;
  const label = String(rule.label || fallback.label || 'Adjustment').trim();
  return {
    id,
    code,
    label,
    enabled: rule.enabled !== false,
    mode: String(rule.mode || fallback.mode || 'fixed').trim().toLowerCase() === 'percentage'
      ? 'percentage'
      : 'fixed',
    value: Number.isFinite(Number(rule.value ?? rule.amount))
      ? Number(rule.value ?? rule.amount)
      : Number(fallback.value || fallback.amount || 0),
    currency: rule.currency ? normalizeCurrency(rule.currency) : null,
    startsAt: rule.startsAt || null,
    expiresAt: rule.expiresAt || null,
  };
};

const normalizeSubscriptionCatalog = (catalog = {}) => {
  const source = catalog && typeof catalog === 'object' ? catalog : {};
  const plansSource = source.plans || {};
  const addonsSource = source.addons || {};
  const meteredSource = source.meteredPricing || {};
  const gatewayPolicySource = source.gatewayPolicy || {};

  const normalizedPlans = Array.isArray(plansSource)
    ? plansSource
    : Object.values(plansSource);
  const normalizedAddons = Array.isArray(addonsSource)
    ? addonsSource
    : Object.values(addonsSource);

  return {
    plans: normalizedPlans
      .map((plan) => normalizeCatalogPlan(plan))
      .filter(Boolean)
      .reduce((acc, plan) => {
        acc[plan.id] = plan;
        return acc;
      }, {}),
    addons: normalizedAddons
      .map((addon) => normalizeCatalogAddon(addon))
      .filter(Boolean)
      .reduce((acc, addon) => {
        acc[addon.id] = addon;
        return acc;
      }, {}),
    meteredPricing:
      meteredSource && typeof meteredSource === 'object'
        ? cloneValue(meteredSource)
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.meteredPricing),
    gatewayPolicy:
      gatewayPolicySource && typeof gatewayPolicySource === 'object'
        ? cloneValue({
            ...DEFAULT_SUBSCRIPTION_CATALOG.gatewayPolicy,
            ...gatewayPolicySource,
          })
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.gatewayPolicy),
    vatRate: Number.isFinite(Number(source.vatRate))
      ? Number(source.vatRate)
      : DEFAULT_SUBSCRIPTION_CATALOG.vatRate,
    exchangeRates:
      source.exchangeRates && typeof source.exchangeRates === 'object'
        ? {
            ...cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.exchangeRates),
            ...cloneValue(source.exchangeRates),
            usdToNgn: Number.isFinite(Number(source.exchangeRates.usdToNgn))
              ? Number(source.exchangeRates.usdToNgn)
              : DEFAULT_SUBSCRIPTION_CATALOG.exchangeRates.usdToNgn,
            source: String(source.exchangeRates.source || 'manual').trim() || 'manual',
          }
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.exchangeRates),
    supportedCurrencies: Array.isArray(source.supportedCurrencies) &&
      source.supportedCurrencies.length > 0
      ? source.supportedCurrencies.map((currency) => normalizeCurrency(currency))
      : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.supportedCurrencies),
    supportedProviders: Array.isArray(source.supportedProviders) &&
      source.supportedProviders.length > 0
      ? source.supportedProviders.map((provider) => normalizeProvider(provider))
      : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.supportedProviders),
    discounts:
      source.discounts && typeof source.discounts === 'object'
        ? {
            ...cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.discounts),
            ...cloneValue(source.discounts),
          }
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.discounts),
    discountRules: Array.isArray(source.discountRules)
      ? source.discountRules
          .map((rule) => normalizeAdjustmentRule(rule, { label: 'Finance discount', mode: 'percentage' }))
          .filter(Boolean)
      : [],
    credits:
      source.credits && typeof source.credits === 'object'
        ? {
            ...cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.credits),
            ...cloneValue(source.credits),
          }
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.credits),
    creditRules: Array.isArray(source.creditRules)
      ? source.creditRules
          .map((rule) => normalizeAdjustmentRule(rule, { label: 'Finance credit', mode: 'fixed' }))
          .filter(Boolean)
      : [],
    manualValidation:
      source.manualValidation && typeof source.manualValidation === 'object'
        ? {
            ...cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.manualValidation),
            ...cloneValue(source.manualValidation),
          }
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.manualValidation),
    promoCodes: Array.isArray(source.promoCodes)
      ? source.promoCodes.map((promo) => normalizePromoCode(promo)).filter(Boolean)
      : [],
    // collectionFee for form payments only (subscriptions have no extra fee)
    collectionFee:
      source.collectionFee && typeof source.collectionFee === 'object'
        ? {
            enabled: source.collectionFee.enabled !== false,
            rate: Number.isFinite(Number(source.collectionFee.rate))
              ? Number(source.collectionFee.rate)
              : DEFAULT_SUBSCRIPTION_CATALOG.collectionFee.rate,
            flat: Number.isFinite(Number(source.collectionFee.flat))
              ? Number(source.collectionFee.flat)
              : DEFAULT_SUBSCRIPTION_CATALOG.collectionFee.flat,
            flatBelow500: Number.isFinite(Number(source.collectionFee.flatBelow500))
              ? Number(source.collectionFee.flatBelow500)
              : DEFAULT_SUBSCRIPTION_CATALOG.collectionFee.flatBelow500,
            min: Number.isFinite(Number(source.collectionFee.min))
              ? Number(source.collectionFee.min)
              : DEFAULT_SUBSCRIPTION_CATALOG.collectionFee.min,
            max: Number.isFinite(Number(source.collectionFee.max))
              ? Number(source.collectionFee.max)
              : DEFAULT_SUBSCRIPTION_CATALOG.collectionFee.max,
            freeBelow: Number.isFinite(Number(source.collectionFee.freeBelow))
              ? Number(source.collectionFee.freeBelow)
              : DEFAULT_SUBSCRIPTION_CATALOG.collectionFee.freeBelow,
          }
        : cloneValue(DEFAULT_SUBSCRIPTION_CATALOG.collectionFee),
  };
};

const readCatalogDocument = async () => {
  const doc = await SubscriptionCatalog.findOne({ catalogKey: 'global' }).lean();
  return doc?.catalog && typeof doc.catalog === 'object' ? doc.catalog : null;
};

const loadSubscriptionCatalog = async ({ forceRefresh = false } = {}) => {
  if (catalogLoaded && !forceRefresh) {
    return activeSubscriptionCatalog;
  }

  try {
    const catalog = await readCatalogDocument();
    activeSubscriptionCatalog = normalizeSubscriptionCatalog(
      catalog || DEFAULT_SUBSCRIPTION_CATALOG
    );
  } catch {
    activeSubscriptionCatalog = normalizeSubscriptionCatalog(
      DEFAULT_SUBSCRIPTION_CATALOG
    );
  }

  catalogLoaded = true;
  return activeSubscriptionCatalog;
};

const upsertSubscriptionCatalog = async (catalogBody = {}, actor = {}) => {
  const merged = normalizeSubscriptionCatalog({
    ...activeSubscriptionCatalog,
    ...catalogBody,
  });
  const catalog = await SubscriptionCatalog.findOneAndUpdate(
    { catalogKey: 'global' },
    {
      $set: {
        catalogKey: 'global',
        catalog: merged,
        updatedBy:
          String(actor?.userId || actor?.id || actor?.sub || '').trim() || null,
        metadata: {
          ...(catalogBody.metadata && typeof catalogBody.metadata === 'object'
            ? catalogBody.metadata
            : {}),
          updatedAt: new Date().toISOString(),
        },
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  activeSubscriptionCatalog = normalizeSubscriptionCatalog(catalog.catalog || merged);
  catalogLoaded = true;
  return activeSubscriptionCatalog;
};

const normalizePlanId = (value) => String(value || 'starter').trim().toLowerCase();
const normalizeBillingPeriod = (value) =>
  String(value || '').trim().toLowerCase() === 'annual' ? 'annual' : 'monthly';
const normalizeCurrency = (value) => {
  const normalized = String(value || 'NGN').trim().toUpperCase();
  const supportedCurrencies = getActiveSubscriptionCatalog().supportedCurrencies || SUBSCRIPTION_SUPPORTED_CURRENCIES;
  return supportedCurrencies.includes(normalized) ? normalized : 'NGN';
};
const normalizeProvider = (value) => {
  const normalized = String(value || 'paystack').trim().toLowerCase();
  const supportedProviders = getActiveSubscriptionCatalog().supportedProviders || SUBSCRIPTION_SUPPORTED_PROVIDERS;
  return supportedProviders.includes(normalized) ? normalized : 'paystack';
};
const normalizeAddonIds = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );
};

const roundAmount = (amount, currency) => {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) return 0;
  if (String(currency || '').toUpperCase() === 'NGN') {
    return Math.round(numeric);
  }
  return Math.round(numeric * 100) / 100;
};

/**
 * Compute the Saby platform collection fee for a form payment amount.
 * Only applies to purpose === 'collection' (form payments).
 * Subscriptions do NOT use this fee.
 * 
 * Fee structure:
 * - Amount < 500: flatBelow500 (fixed fee)
 * - Amount >= 500: clamp(amount * rate + flat, min, max)
 * Returns 0 when disabled.
 * @param {number} amount
 * @param {object} [config] - optional override (defaults to active catalog collectionFee)
 */
const computeCollectionFee = (amount, config = null) => {
  const feeConfig = config || getActiveSubscriptionCatalog().collectionFee || {};
  if (feeConfig.enabled === false) return 0;

  const numericAmount = Math.max(0, Number(amount || 0));
  if (!numericAmount) return 0;

  const freeBelow = Number(feeConfig.freeBelow || 0);
  if (freeBelow > 0 && numericAmount < freeBelow) return 0;

  // Amount < 500: flat fee only
  if (numericAmount < 500) {
    const flatBelow500 = Number(feeConfig.flatBelow500 || feeConfig.flat || 0);
    return Math.round(flatBelow500 * 100) / 100;
  }

  // Amount >= 500: percentage + flat
  const rate = Number(feeConfig.rate || 0);
  const flat = Number(feeConfig.flat || 0);
  const min = Number(feeConfig.min || 0);
  const max = Number(feeConfig.max || 0);

  const raw = numericAmount * rate + flat;
  let fee = raw;
  if (min > 0) fee = Math.max(fee, min);
  if (max > 0) fee = Math.min(fee, max);

  return Math.round(fee * 100) / 100;
};

// Deprecated alias for backward compatibility
const computeServiceFee = computeCollectionFee;

const getSubscriptionPlan = (planId) =>
  getActiveSubscriptionCatalog().plans[normalizePlanId(planId)] || null;
const getSubscriptionAddon = (addonId) =>
  getActiveSubscriptionCatalog().addons[
    String(addonId || '').trim().toLowerCase()
  ] || null;

const getSubscriptionAddonsForPlan = (planId) => {
  const normalizedPlanId = normalizePlanId(planId);
  return Object.values(getActiveSubscriptionCatalog().addons).filter((addon) =>
    addon.eligiblePlans.includes(normalizedPlanId)
  );
};

const resolveSelectedSubscriptionAddons = ({ planId, addonIds = [] }) => {
  const normalizedPlanId = normalizePlanId(planId);
  const normalizedAddonIds = normalizeAddonIds(addonIds);
  const resolved = normalizedAddonIds.map((addonId) => {
    const addon = getSubscriptionAddon(addonId);
    if (!addon) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported subscription add-on: ${addonId}`);
    }
    if (!addon.eligiblePlans.includes(normalizedPlanId)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${addon.name} is not available for the selected plan.`
      );
    }
    return addon;
  });

  return resolved;
};

const buildSubscriptionCharge = ({
  planId,
  billingPeriod,
  currency,
  addonIds = [],
  promoCode = null,
}) => {
  const plan = getSubscriptionPlan(planId);
  if (!plan) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported subscription plan.');
  }

  const normalizedBillingPeriod = normalizeBillingPeriod(billingPeriod);
  const normalizedCurrency = normalizeCurrency(currency);
  const selectedAddons = resolveSelectedSubscriptionAddons({
    planId: plan.id,
    addonIds,
  });

  const planSubtotal = roundAmount(
    plan.pricing?.[normalizedBillingPeriod]?.[normalizedCurrency] || 0,
    normalizedCurrency
  );
  const addonsSubtotal = roundAmount(
    selectedAddons.reduce(
      (sum, addon) =>
        sum + Number(addon.pricing?.[normalizedBillingPeriod]?.[normalizedCurrency] || 0),
      0
    ),
    normalizedCurrency
  );
  const subtotal = roundAmount(planSubtotal + addonsSubtotal, normalizedCurrency);
  const catalog = getActiveSubscriptionCatalog();
  const discountConfig = catalog.discounts || DEFAULT_SUBSCRIPTION_CATALOG.discounts;
  const now = new Date();
  const isRuleActive = (rule) => {
    if (!rule || rule.enabled === false) return false;
    if (rule.currency && normalizeCurrency(rule.currency) !== normalizedCurrency) return false;
    if (rule.startsAt && new Date(rule.startsAt) > now) return false;
    if (rule.expiresAt && new Date(rule.expiresAt) < now) return false;
    return true;
  };
  const adjustmentAmount = (rule, baseAmount) =>
    roundAmount(
      rule.mode === 'percentage'
        ? (baseAmount * Number(rule.value || 0)) / 100
        : Number(rule.value || 0),
      normalizedCurrency
    );
  const automaticDiscounts = [];
  const normalizedPromoCode = String(promoCode || '').trim().toUpperCase();
  let appliedPromo = null;
  let resolvedType = null;

  if (normalizedPromoCode) {
    const matchCode = (entry, normalized) =>
      String(entry.code || entry.label || entry.id || '').trim().toUpperCase() === normalized;

    let resolvedRule = null;

    const discountRule = (catalog.discountRules || []).find((entry) =>
      matchCode(entry, normalizedPromoCode)
    );
    if (discountRule && isRuleActive(discountRule)) {
      resolvedType = 'discount';
      resolvedRule = discountRule;
    } else {
      const promo = (catalog.promoCodes || []).find((entry) =>
        matchCode(entry, normalizedPromoCode)
      );
      if (
        promo &&
        isRuleActive(promo) &&
        (promo.maxRedemptions == null || Number(promo.maxRedemptions) > 0)
      ) {
        resolvedType = 'promo';
        resolvedRule = promo;
      } else {
        const creditRule = (catalog.creditRules || []).find((entry) =>
          matchCode(entry, normalizedPromoCode)
        );
        if (creditRule && isRuleActive(creditRule)) {
          resolvedType = 'credit';
          resolvedRule = creditRule;
        }
      }
    }

    if (!resolvedRule) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Code is invalid or unavailable.');
    }

    if (resolvedType === 'discount' || resolvedType === 'promo') {
      automaticDiscounts.push({
        ...resolvedRule,
        amount: adjustmentAmount(resolvedRule, subtotal),
      });
    }

    if (resolvedType === 'promo') {
      appliedPromo = {
        ...resolvedRule,
        amount: adjustmentAmount(resolvedRule, subtotal),
      };
    }
  }
  const discountAmount = roundAmount(
    automaticDiscounts.reduce((sum, rule) => sum + Number(rule.amount || 0), 0),
    normalizedCurrency
  );
  const taxableBase = roundAmount(Math.max(0, subtotal - discountAmount), normalizedCurrency);
  const tax = roundAmount(taxableBase * Number(catalog.vatRate || VAT_RATE), normalizedCurrency);
  const legacyCredit = catalog.credits || DEFAULT_SUBSCRIPTION_CATALOG.credits;
  const appliedCredits = [];
  if (resolvedType === 'credit' && normalizedPromoCode) {
    const creditRule = (catalog.creditRules || []).find((entry) =>
      String(entry.code || entry.id || '').trim().toUpperCase() === normalizedPromoCode
    );
    if (creditRule && isRuleActive(creditRule)) {
      appliedCredits.push({
        ...creditRule,
        amount: adjustmentAmount(creditRule, taxableBase + tax),
      });
    }
  }
  const creditAmount = roundAmount(
    appliedCredits.reduce((sum, rule) => sum + Number(rule.amount || 0), 0),
    normalizedCurrency
  );
  const total = roundAmount(Math.max(0, taxableBase + tax - creditAmount), normalizedCurrency);

  return {
    plan,
    selectedAddons,
    billingPeriod: normalizedBillingPeriod,
    currency: normalizedCurrency,
    planSubtotal,
    addonsSubtotal,
    subtotal,
    taxableBase,
    discount: {
      enabled: Boolean(discountConfig.enabled),
      mode: String(discountConfig.mode || 'percentage'),
      value: Number(discountConfig.value || 0),
      label: String(discountConfig.label || 'Finance discount'),
      amount: discountAmount,
      appliedRules: automaticDiscounts,
    },
    credits: {
      enabled: appliedCredits.length > 0,
      amount: creditAmount,
      appliedRules: appliedCredits,
    },
    promo: appliedPromo,
    tax,
    total,
    vatRate: Number(catalog.vatRate || VAT_RATE),
    lineItems: [
      {
        id: plan.id,
        type: 'plan',
        label: `${plan.name} subscription`,
        amount: planSubtotal,
      },
      ...selectedAddons.map((addon) => ({
        id: addon.id,
        type: 'addon',
        label: addon.name,
        amount: roundAmount(
          addon.pricing?.[normalizedBillingPeriod]?.[normalizedCurrency] || 0,
          normalizedCurrency
        ),
      })),
    ],
  };
};

module.exports = {
  DEFAULT_SUBSCRIPTION_CATALOG,
  SUBSCRIPTION_PLAN_IDS,
  SUBSCRIPTION_BILLING_PERIODS,
  SUBSCRIPTION_SUPPORTED_CURRENCIES,
  SUBSCRIPTION_SUPPORTED_PROVIDERS,
  SUBSCRIPTION_ADDON_IDS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_ADDONS,
  SUBSCRIPTION_METERED_PRICING,
  SUBSCRIPTION_GATEWAY_POLICY,
  VAT_RATE,
  normalizePlanId,
  normalizeBillingPeriod,
  normalizeCurrency,
  normalizeProvider,
  normalizeAddonIds,
  roundAmount,
  loadSubscriptionCatalog,
  upsertSubscriptionCatalog,
  getActiveSubscriptionCatalog,
  getSubscriptionPlan,
  getSubscriptionAddon,
  getSubscriptionAddonsForPlan,
  resolveSelectedSubscriptionAddons,
  buildSubscriptionCharge,
  computeCollectionFee,
  computeServiceFee, // deprecated alias
};
