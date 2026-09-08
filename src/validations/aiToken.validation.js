const Joi = require('joi');

const initializeCheckout = {
  body: Joi.object().keys({
    packId: Joi.string().valid('starter', 'growth', 'power').required(),
    currency: Joi.string().valid('NGN', 'USD').default('NGN'),
    provider: Joi.string()
      .valid('flutterwave', 'paystack')
      .default('flutterwave'),
    returnUrl: Joi.string().uri().allow('', null).optional(),
  }),
};

const allocateTokens = {
  body: Joi.object().keys({
    targetTenantId: Joi.string().trim().required(),
    tokens: Joi.number().integer().min(0).default(0),
    isUnlimited: Joi.boolean().default(false),
    reason: Joi.string()
      .trim()
      .allow('', null)
      .default('Admin manual allocation'),
  }),
};

const listQuotas = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
    search: Joi.string().trim().allow('', null),
  }),
};

module.exports = {
  initializeCheckout,
  allocateTokens,
  listQuotas,
};
