const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const paymentService = require('./payment.service');
const paymentProviderService = require('./paymentProvider.service');
const {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_GATEWAY_POLICY,
  normalizePlanId,
  normalizeBillingPeriod,
  normalizeCurrency,
  normalizeProvider,
  normalizeAddonIds,
  loadSubscriptionCatalog,
  buildSubscriptionCharge,
} = require('./subscriptionCatalog.service');

const getActorUserId = (user = {}) =>
  user._id || user.id || user.userId || user.sub || null;

const buildSubscriptionReference = () =>
  `SUB-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;

const buildCreditReference = () =>
  `CREDIT-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()}`;

const getCustomerName = (user = {}) =>
  [user.firstname || user.firstName, user.lastname || user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() ||
  user.name ||
  user.fullName ||
  null;

const serializePricing = (pricing) => ({
  planSubtotal: pricing.planSubtotal,
  addOnsSubtotal: pricing.addOnsSubtotal ?? pricing.addonsSubtotal,
  addonsSubtotal: pricing.addonsSubtotal,
  subtotal: pricing.subtotal,
  taxableBase: pricing.taxableBase,
  discount: pricing.discount,
  credits: pricing.credits,
  promo: pricing.promo,
  tax: pricing.tax,
  total: pricing.total,
  vatRate: pricing.vatRate,
  lineItems: pricing.lineItems,
});

const toAmount = (value) => {
  if (value && typeof value === 'object') {
    return toAmount(value.amount);
  }
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const firstAdjustmentCode = (value, fallback = null) => {
  if (!value || typeof value !== 'object') return fallback;
  const rules = Array.isArray(value.appliedRules) ? value.appliedRules : [];
  const rule = rules.find((entry) => entry && (entry.code || entry.id || entry.label));
  return (
    String(value.code || rule?.code || rule?.id || fallback || '')
      .trim()
      .toUpperCase() || null
  );
};

const buildPricingAdjustments = ({ pricing, promoCode }) => {
  const adjustments = [];
  const discountAmount = toAmount(pricing.discount);
  const creditAmount = toAmount(pricing.credits);
  const promoAmount = toAmount(pricing.promo);
  const hasPromo = promoAmount > 0;

  if (discountAmount > 0) {
    adjustments.push({
      type: hasPromo ? 'promo' : 'coupon',
      code: hasPromo
        ? firstAdjustmentCode(pricing.promo, promoCode)
        : firstAdjustmentCode(pricing.discount, promoCode),
      label: hasPromo ? 'Promo applied' : 'Coupon applied',
      amount: discountAmount,
    });
  }

  if (creditAmount > 0) {
    adjustments.push({
      type: 'credit',
      code: firstAdjustmentCode(pricing.credits, hasPromo ? null : promoCode),
      label: 'Credit applied',
      amount: creditAmount,
    });
  }

  return adjustments;
};

const buildInvoiceSnapshot = ({ pricing, currency, total, adjustments }) => ({
  currency,
  subtotal: pricing.subtotal,
  taxableBase: pricing.taxableBase,
  discount: toAmount(pricing.discount),
  credits: toAmount(pricing.credits),
  promo: toAmount(pricing.promo),
  adjustments,
  tax: {
    enabled: pricing.tax > 0,
    label: 'VAT',
    rate: pricing.vatRate,
    amount: pricing.tax,
  },
  total,
  lineItems: pricing.lineItems.map((lineItem) => ({
    id: lineItem.id,
    label: lineItem.label,
    quantity: 1,
    amount: lineItem.amount,
  })),
});

const createZeroAmountSubscriptionPayment = async ({
  tenantId,
  userId,
  pricing,
  promoCode,
  returnUrl,
}) => {
  const now = new Date();
  const paymentReference = buildCreditReference();
  const adjustments = buildPricingAdjustments({ pricing, promoCode });
  const invoiceSnapshot = buildInvoiceSnapshot({
    pricing,
    currency: pricing.currency,
    total: 0,
    adjustments,
  });
  const idempotencyKey = [
    'subscription-checkout-zero-total',
    tenantId,
    userId,
    pricing.plan.id,
    pricing.billingPeriod,
    pricing.currency,
    pricing.selectedAddons.map((addon) => addon.id).sort().join(','),
    promoCode || 'no-code',
    Date.now(),
  ].join(':');

  const { payment } = await paymentService.createOrGetPayment({
    tenantId: String(tenantId),
    userId: String(userId),
    amount: 0,
    total: 0,
    currency: pricing.currency,
    status: 'processing',
    purpose: 'subscription',
    beneficiaryType: 'saby',
    reference: paymentReference,
    providerRef: paymentReference,
    paymentMethod: 'full_credit',
    paymentDate: now,
    idempotencyKey,
    paymentDetails: {
      provider: 'full_credit',
      providerCharged: false,
    },
    metadata: {
      source: 'subscription-checkout-zero-total',
      checkoutMode: 'manual_zero_total',
      providerCharged: false,
      noProviderReason:
        'Covered fully by coupon, promo, credit, or subscription credit.',
      planId: pricing.plan.id,
      planName: pricing.plan.name,
      billingPeriod: pricing.billingPeriod,
      addOns: pricing.selectedAddons.map((addon) => ({
        id: addon.id,
        name: addon.name,
      })),
      planSubtotal: pricing.planSubtotal,
      addOnsSubtotal: pricing.addonsSubtotal,
      subtotal: pricing.subtotal,
      taxableBase: pricing.taxableBase,
      discount: toAmount(pricing.discount),
      discountDetails: pricing.discount,
      credits: toAmount(pricing.credits),
      creditDetails: pricing.credits,
      promo: pricing.promo,
      promoAmount: toAmount(pricing.promo),
      promoCode,
      code: promoCode,
      tax: pricing.tax,
      vatRate: pricing.vatRate,
      total: 0,
      amountPaid: 0,
      adjustments,
      gatewayPolicy: SUBSCRIPTION_GATEWAY_POLICY.model,
      checkoutTitle: 'Saby Subscription',
      checkoutDescription: `${pricing.plan.name} subscription`,
      checkoutReturnUrl: returnUrl || null,
      invoiceSnapshot,
    },
  });

  return paymentService.completePayment(
    payment.id,
    {
      providerRef: paymentReference,
      completionDetails: {
        provider: 'full_credit',
        providerCharged: false,
        source: 'subscription-checkout-zero-total',
      },
    },
    String(tenantId),
    {
      userId: String(userId),
      source: 'subscription-checkout-zero-total',
      dedupeKey: `subscription-zero-total-completed:${payment.id}`,
    }
  );
};

const initializeSubscriptionCheckout = async ({ user, payload = {} }) => {
  const tenantId = user?.tenantId;
  const userId = getActorUserId(user);
  if (!tenantId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'A tenant is required to start subscription checkout.'
    );
  }
  if (!userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'A user is required to start subscription checkout.'
    );
  }

  const planId = normalizePlanId(payload.plan);
  const billingPeriod = normalizeBillingPeriod(payload.billingPeriod || payload.period);
  const currency = normalizeCurrency(payload.currency);
  const provider = normalizeProvider(payload.provider);
  const addOnIds = normalizeAddonIds(payload.addOns);
  const promoCode = String(payload.code || payload.promoCode || '').trim().toUpperCase() || null;
  await loadSubscriptionCatalog();

  const pricing = buildSubscriptionCharge({
    planId,
    billingPeriod,
    currency,
    addonIds: addOnIds,
    promoCode,
  });
  const plan = pricing.plan;

  if (plan.contactSalesOnly) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Enterprise subscriptions are handled by sales. Contact sales to continue.'
    );
  }

  const amount = Number(pricing.total || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Subscription amount is not configured.'
    );
  }

  if (amount === 0) {
    const payment = await createZeroAmountSubscriptionPayment({
      tenantId,
      userId,
      pricing,
      promoCode,
      returnUrl: payload.returnUrl || null,
    });
    const subscriptionService = require('./subscription.service');
    const subscription = await subscriptionService.activateSubscriptionFromPayment(payment, {
      source: 'subscription-checkout-zero-total',
      sourceRef: payment.reference,
    });

    return {
      payment,
      subscription,
      checkout: {
        supported: true,
        mode: 'manual_zero_total',
        status: 'activated',
        message:
          'Subscription activated without payment because the checkout total is zero.',
      },
      plan: {
        id: plan.id,
        name: plan.name,
        billingPeriod,
        currency,
        amount,
      },
      pricing: serializePricing(pricing),
      addOns: pricing.selectedAddons,
    };
  }

  const paymentReference = buildSubscriptionReference();
  const adjustments = buildPricingAdjustments({ pricing, promoCode });
  const invoiceSnapshot = buildInvoiceSnapshot({
    pricing,
    currency,
    total: amount,
    adjustments,
  });
  const idempotencyKey = [
    'subscription-checkout',
    tenantId,
    userId,
    plan.id,
    billingPeriod,
    currency,
    provider,
    addOnIds.sort().join(','),
    promoCode || 'no-code',
    Date.now(),
  ].join(':');

  const { payment } = await paymentService.createOrGetPayment({
    tenantId,
    userId: String(userId),
    amount,
    total: amount,
    currency,
    status: 'pending',
    purpose: 'subscription',
    beneficiaryType: 'saby',
    reference: paymentReference,
    paymentMethod: provider,
    idempotencyKey,
    metadata: {
      source: 'subscription-checkout',
      planId: plan.id,
      planName: plan.name,
      billingPeriod,
      addOns: pricing.selectedAddons.map((addon) => ({
        id: addon.id,
        name: addon.name,
      })),
      planSubtotal: pricing.planSubtotal,
      addOnsSubtotal: pricing.addonsSubtotal,
      subtotal: pricing.subtotal,
      taxableBase: pricing.taxableBase,
      discount: toAmount(pricing.discount),
      discountDetails: pricing.discount,
      tax: pricing.tax,
      vatRate: pricing.vatRate,
      credits: toAmount(pricing.credits),
      creditDetails: pricing.credits,
      promo: pricing.promo,
      promoAmount: toAmount(pricing.promo),
      promoCode,
      code: promoCode,
      adjustments,
      gatewayPolicy: SUBSCRIPTION_GATEWAY_POLICY.model,
      checkoutTitle: 'Saby Subscription',
      checkoutDescription: `${plan.name} subscription`,
      checkoutReturnUrl: payload.returnUrl || null,
      invoiceSnapshot,
    },
  });

  const checkout = await paymentProviderService.initializeHostedCheckout({
    payment,
    paymentMethod: provider,
    customer: {
      email: user.email,
      fullName: getCustomerName(user),
      phone: user.phoneNumber || user.phone || null,
    },
    invoiceSnapshot,
    respondentContext: {
      returnUrl: payload.returnUrl || null,
    },
  });

  if (!checkout.supported || !checkout.authorizationUrl) {
    return {
      payment,
      checkout,
      plan: {
        id: plan.id,
        name: plan.name,
        billingPeriod,
        currency,
        amount,
      },
      pricing: serializePricing(pricing),
      addOns: pricing.selectedAddons,
    };
  }

  const updatedPayment = await paymentService.processPayment(
    payment.id,
    {
      providerRef: checkout.providerRef || null,
      paymentDetails: {
        checkout,
      },
      metadata: {
        checkout,
      },
    },
    tenantId,
    {
      userId: String(userId),
      source: 'subscription-checkout',
      dedupeKey: `subscription-checkout-processing:${payment.id}`,
    }
  );

  return {
    payment: updatedPayment,
    checkout,
    plan: {
      id: plan.id,
      name: plan.name,
      billingPeriod,
      currency,
      amount,
    },
    pricing: serializePricing(pricing),
    addOns: pricing.selectedAddons,
  };
};

module.exports = {
  initializeSubscriptionCheckout,
  SUBSCRIPTION_PLANS,
};
