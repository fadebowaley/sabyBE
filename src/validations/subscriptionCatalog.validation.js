const Joi = require('joi');
const {
  SUBSCRIPTION_BILLING_PERIODS,
  SUBSCRIPTION_SUPPORTED_CURRENCIES,
  SUBSCRIPTION_SUPPORTED_PROVIDERS,
} = require('../services/subscriptionCatalog.service');

const subscriptionPlanId = Joi.string().trim().min(1);
const subscriptionAddonId = Joi.string()
  .trim()
  .min(1)
  .pattern(/^[a-z0-9][a-z0-9_-]*$/);
const subscriptionAddonIds = Joi.array()
  .items(subscriptionAddonId)
  .unique()
  .default([]);
const subscriptionBillingPeriod = Joi.string().valid(
  ...SUBSCRIPTION_BILLING_PERIODS
);
const subscriptionCurrency = Joi.string().valid(
  ...SUBSCRIPTION_SUPPORTED_CURRENCIES
);
const subscriptionProvider = Joi.string().valid(
  ...SUBSCRIPTION_SUPPORTED_PROVIDERS
);

const subscriptionCatalogUpdate = {
  body: Joi.object()
    .keys({
      plans: Joi.alternatives()
        .try(
          Joi.array().items(
            Joi.object({
              id: subscriptionPlanId.required(),
            }).unknown(true)
          ),
          Joi.object()
            .pattern(
              Joi.string(),
              Joi.object({
                id: subscriptionPlanId.optional(),
              }).unknown(true)
            )
        )
        .optional(),
      addons: Joi.alternatives()
        .try(
          Joi.array().items(
            Joi.object({
              id: subscriptionAddonId.required(),
            }).unknown(true)
          ),
          Joi.object()
            .pattern(
              Joi.string(),
              Joi.object({
                id: subscriptionAddonId.optional(),
              }).unknown(true)
            )
        )
        .optional(),
      meteredPricing: Joi.object().unknown(true).optional(),
      gatewayPolicy: Joi.object().unknown(true).optional(),
      vatRate: Joi.number().min(0).max(1).optional(),
      discounts: Joi.object().unknown(true).optional(),
      discountRules: Joi.array()
        .items(
          Joi.object({
            id: Joi.string().trim().allow('', null).optional(),
            label: Joi.string().trim().min(1).required(),
            enabled: Joi.boolean().optional(),
            mode: Joi.string().valid('percentage', 'fixed').default('percentage'),
            value: Joi.number().min(0).default(0),
            currency: Joi.string()
              .valid(...SUBSCRIPTION_SUPPORTED_CURRENCIES)
              .allow(null)
              .optional(),
            startsAt: Joi.date().allow(null).optional(),
            expiresAt: Joi.date().allow(null).optional(),
          }).unknown(true)
        )
        .optional(),
      credits: Joi.object().unknown(true).optional(),
      creditRules: Joi.array()
        .items(
          Joi.object({
            id: Joi.string().trim().allow('', null).optional(),
            label: Joi.string().trim().min(1).required(),
            enabled: Joi.boolean().optional(),
            mode: Joi.string().valid('percentage', 'fixed').default('fixed'),
            value: Joi.number().min(0).default(0),
            currency: Joi.string()
              .valid(...SUBSCRIPTION_SUPPORTED_CURRENCIES)
              .allow(null)
              .optional(),
            startsAt: Joi.date().allow(null).optional(),
            expiresAt: Joi.date().allow(null).optional(),
          }).unknown(true)
        )
        .optional(),
      manualValidation: Joi.object().unknown(true).optional(),
      promoCodes: Joi.array()
        .items(
          Joi.object({
            code: Joi.string().trim().min(1).required(),
            enabled: Joi.boolean().optional(),
            mode: Joi.string().valid('percentage', 'fixed').default('percentage'),
            value: Joi.number().min(0).default(0),
            currency: Joi.string()
              .valid(...SUBSCRIPTION_SUPPORTED_CURRENCIES)
              .allow(null)
              .optional(),
            startsAt: Joi.date().allow(null).optional(),
            expiresAt: Joi.date().allow(null).optional(),
            maxRedemptions: Joi.number().integer().min(0).allow(null).optional(),
          }).unknown(true)
        )
        .optional(),
      supportedCurrencies: Joi.array()
        .items(Joi.string().valid(...SUBSCRIPTION_SUPPORTED_CURRENCIES))
        .optional(),
      supportedProviders: Joi.array()
        .items(Joi.string().valid(...SUBSCRIPTION_SUPPORTED_PROVIDERS))
        .optional(),
      metadata: Joi.object().unknown(true).optional(),
    })
    .min(1),
};

module.exports = {
  SUBSCRIPTION_BILLING_PERIODS,
  SUBSCRIPTION_SUPPORTED_CURRENCIES,
  SUBSCRIPTION_SUPPORTED_PROVIDERS,
  subscriptionPlanId,
  subscriptionAddonId,
  subscriptionAddonIds,
  subscriptionBillingPeriod,
  subscriptionCurrency,
  subscriptionProvider,
  subscriptionCatalogUpdate,
};
