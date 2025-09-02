const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createApiKey = {
  body: Joi.object().keys({
    label: Joi.string().required().min(1).max(100).trim(),
    environment: Joi.string().required().valid('production', 'development', 'staging'),
    scope: Joi.string().required().min(1).max(50).trim(),
    permissions: Joi.array().items(Joi.string()).default(['read']),
    rateLimit: Joi.number().integer().min(1).max(10000).default(1000),
    expires: Joi.date().min('now').optional(),
  }),
};

const getApiKeys = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    environment: Joi.string().valid('production', 'development', 'staging'),
    isActive: Joi.boolean(),
    scope: Joi.string(),
    sortBy: Joi.string(),
  }),
};

const getApiKey = {
  params: Joi.object().keys({
    keyId: Joi.string().custom(objectId).required(),
  }),
};

const updateApiKey = {
  params: Joi.object().keys({
    keyId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      label: Joi.string().min(1).max(100).trim(),
      isActive: Joi.boolean(),
      permissions: Joi.array().items(Joi.string()),
      scope: Joi.string().min(1).max(50).trim(),
      rateLimit: Joi.number().integer().min(1).max(10000),
      expires: Joi.date().min('now').allow(null),
    })
    .min(1), // At least one field must be provided
};

const deleteApiKey = {
  params: Joi.object().keys({
    keyId: Joi.string().custom(objectId).required(),
  }),
};

const getApiKeyAnalytics = {
  params: Joi.object().keys({
    keyId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date().min(Joi.ref('startDate')),
    granularity: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
  }),
};

const regenerateApiKey = {
  params: Joi.object().keys({
    keyId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createApiKey,
  getApiKeys,
  getApiKey,
  updateApiKey,
  deleteApiKey,
  getApiKeyAnalytics,
  regenerateApiKey,
};
