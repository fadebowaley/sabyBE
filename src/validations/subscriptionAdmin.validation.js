const Joi = require('joi');
const { objectId } = require('./custom.validation');
const subscriptionCatalogValidation = require('./subscriptionCatalog.validation');

const subscriptionStatuses = [
  'pending',
  'trialing',
  'active',
  'paused',
  'past_due',
  'cancelled',
  'expired',
];
const paymentStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'];

const adminSubscriptionBody = Joi.object({
  tenantId: Joi.string().trim().min(1),
  userId: Joi.string().allow('', null),
  actionType: Joi.string().valid('subscription', 'payment').default('subscription'),
  planId: subscriptionCatalogValidation.subscriptionPlanId.default('starter'),
  billingPeriod: subscriptionCatalogValidation.subscriptionBillingPeriod.default('monthly'),
  currency: subscriptionCatalogValidation.subscriptionCurrency.default('NGN'),
  addOnIds: subscriptionCatalogValidation.subscriptionAddonIds,
  status: Joi.string().valid(...subscriptionStatuses, ...paymentStatuses).default('pending'),
  provider: subscriptionCatalogValidation.subscriptionProvider.default('paystack'),
  paymentProvider: subscriptionCatalogValidation.subscriptionProvider.optional().allow('', null),
  reference: Joi.string().allow('', null),
  providerRef: Joi.string().allow('', null),
  paymentReference: Joi.string().allow('', null),
  paymentId: Joi.string().allow('', null),
  amountOverride: Joi.number().min(0).optional(),
  currentPeriodStart: Joi.date().allow(null).optional(),
  currentPeriodEnd: Joi.date().allow(null).optional(),
  renewalAt: Joi.date().allow(null).optional(),
  startedAt: Joi.date().allow(null).optional(),
  lastPaymentAt: Joi.date().allow(null).optional(),
  notes: Joi.string().allow('', null),
  metadata: Joi.object().unknown(true).optional(),
  featureOverrides: Joi.object().unknown(true).optional(),
});

const listAdminSubscriptions = {
  query: Joi.object({
    tenantId: Joi.string().trim().allow('', null),
    status: Joi.string().valid(...subscriptionStatuses, 'unsubscribed').allow('', null),
    planId: Joi.string().trim().allow('', null),
    limit: Joi.number().integer().min(1).max(100).default(25),
    page: Joi.number().integer().min(1).default(1),
    sortBy: Joi.string().default('updatedAt:desc'),
  }),
};

const createAdminSubscription = {
  body: adminSubscriptionBody.keys({
    tenantId: Joi.string().trim().min(1).required(),
  }),
};

const updateAdminSubscription = {
  params: Joi.object({
    subscriptionId: Joi.string().custom(objectId).required(),
  }),
  body: adminSubscriptionBody.min(1),
};

const updateAdminSubscriptionStatus = {
  params: Joi.object({
    subscriptionId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    status: Joi.string().valid(...subscriptionStatuses).required(),
    reason: Joi.string().allow('', null),
  }),
};

const startOrExtendTrial = {
  params: Joi.object({
    subscriptionId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object({
    trialEndsAt: Joi.date().allow(null).optional(),
    trialDays: Joi.number().integer().min(1).max(730).optional(),
    notes: Joi.string().allow('', null),
  }),
};

module.exports = {
  subscriptionStatuses,
  listAdminSubscriptions,
  createAdminSubscription,
  updateAdminSubscription,
  updateAdminSubscriptionStatus,
  startOrExtendTrial,
};
