const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getNodeBaseline = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
};

const recomputeNodeBaseline = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
};

const getNodeInsights = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
    type: Joi.string().valid('demographic', 'geographic', 'facility', 'operational', 'custom'),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};

const getNetworkInsights = {
  query: Joi.object().keys({
    priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
    type: Joi.string().valid('demographic', 'geographic', 'facility', 'operational', 'custom'),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};

const getBaselineSummary = {
  query: Joi.object().keys({
    nodeId: Joi.string(),
  }),
};

module.exports = {
  getNodeBaseline,
  recomputeNodeBaseline,
  getNodeInsights,
  getNetworkInsights,
  getBaselineSummary,
};
