const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createApiKey = {
  body: Joi.object().keys({
    label: Joi.string().required().min(1).max(100).trim(),
    environment: Joi.string().required().valid('production', 'staging'),
    category: Joi.string()
      .valid(
        'web',
        'api',
        'mobile',
        'internal',
        'external',
        'partner',
        'system'
      )
      .default('web'),
    scope: Joi.string().min(1).max(50).trim(), // Deprecated, use category
    permissions: Joi.array().items(Joi.string()).default(['read']),
    rateLimit: Joi.number().integer().min(1).max(10000).default(1000),
    expires: Joi.date().min('now').optional(),
  }),
};

const getApiKeys = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    environment: Joi.string().valid('production', 'staging'),
    isActive: Joi.boolean(),
    category: Joi.string().valid(
      'web',
      'api',
      'mobile',
      'internal',
      'external',
      'partner',
      'system'
    ),
    approvalStatus: Joi.string().valid(
      'pending',
      'approved',
      'rejected',
      'auto-approved'
    ),
    scope: Joi.string(), // Deprecated
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
      category: Joi.string().valid(
        'web',
        'api',
        'mobile',
        'internal',
        'external',
        'partner',
        'system'
      ),
      scope: Joi.string().min(1).max(50).trim(), // Deprecated
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
    granularity: Joi.string()
      .valid('hour', 'day', 'week', 'month')
      .default('day'),
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
