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

const getCustomerName = (user = {}) =>
  [user.firstname || user.firstName, user.lastname || user.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() ||
  user.name ||
  user.fullName ||
  null;

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
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Subscription amount is not configured.'
    );
  }

  const paymentReference = buildSubscriptionReference();
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
      discount: pricing.discount,
      tax: pricing.tax,
      vatRate: pricing.vatRate,
      credits: pricing.credits,
      promo: pricing.promo,
      promoCode,
      code: promoCode,
      gatewayPolicy: SUBSCRIPTION_GATEWAY_POLICY.model,
      checkoutTitle: 'Saby Subscription',
      checkoutDescription: `${plan.name} subscription`,
      checkoutReturnUrl: payload.returnUrl || null,
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
    invoiceSnapshot: {
      currency,
      subtotal: pricing.subtotal,
      taxableBase: pricing.taxableBase,
      discount: pricing.discount,
      credits: pricing.credits,
      promo: pricing.promo,
      tax: {
        enabled: pricing.tax > 0,
        label: 'VAT',
        rate: pricing.vatRate,
        amount: pricing.tax,
      },
      total: amount,
      lineItems: pricing.lineItems.map((lineItem) => ({
        id: lineItem.id,
        label: lineItem.label,
        quantity: 1,
        amount: lineItem.amount,
      })),
    },
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
      pricing: {
        planSubtotal: pricing.planSubtotal,
        addOnsSubtotal: pricing.addonsSubtotal,
        subtotal: pricing.subtotal,
        taxableBase: pricing.taxableBase,
        discount: pricing.discount,
        credits: pricing.credits,
        promo: pricing.promo,
        tax: pricing.tax,
        total: pricing.total,
        vatRate: pricing.vatRate,
        lineItems: pricing.lineItems,
      },
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
    pricing: {
      planSubtotal: pricing.planSubtotal,
      addOnsSubtotal: pricing.addonsSubtotal,
      subtotal: pricing.subtotal,
      taxableBase: pricing.taxableBase,
      discount: pricing.discount,
      credits: pricing.credits,
      promo: pricing.promo,
      tax: pricing.tax,
      total: pricing.total,
      vatRate: pricing.vatRate,
      lineItems: pricing.lineItems,
    },
    addOns: pricing.selectedAddons,
  };
};

module.exports = {
  initializeSubscriptionCheckout,
  SUBSCRIPTION_PLANS,
};
