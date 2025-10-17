const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getPendingApprovals = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    tenant: Joi.string(),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled'),
    category: Joi.string().valid(
      'web',
      'api',
      'mobile',
      'internal',
      'external',
      'partner',
      'system'
    ),
    sortBy: Joi.string(),
  }),
};

const getApprovals = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled'),
    tenant: Joi.string(),
    category: Joi.string(),
    sortBy: Joi.string(),
  }),
};

const approveApiKey = {
  params: Joi.object().keys({
    approvalId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    notes: Joi.string().allow('').optional(),
  }),
};

const rejectApiKey = {
  params: Joi.object().keys({
    approvalId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().required().min(10).max(500),
  }),
};

const getProductionKeys = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    category: Joi.string(),
    tenant: Joi.string(),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
  }),
};

module.exports = {
  getPendingApprovals,
  getApprovals,
  approveApiKey,
  rejectApiKey,
  getProductionKeys,
};
