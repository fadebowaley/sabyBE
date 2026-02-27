const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getComplianceTable = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
    sortBy: Joi.string().valid('overallCompliance', 'userCompliance', 'nodeCompliance', 'createdAt', 'updatedAt').default('overallCompliance'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    nodeId: Joi.string().allow('', null),
    status: Joi.string().valid('compliant', 'non-compliant', 'partial').allow('', null),
    search: Joi.string().allow('', null),
  }),
};

const getComplianceSummary = {
  query: Joi.object().keys({}),
};

const getComplianceDates = {
  query: Joi.object().keys({
    projectId: Joi.string().required(),
    nodeId: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}(-\d{2})?$/)
      .required(),
  }),
};

const updateUserCompliance = {
  params: Joi.object().keys({
    userId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object().keys({
    profileUpdateCompliant: Joi.boolean().required(),
  }),
};

const updateNodeCompliance = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    profileUpdateCompliant: Joi.boolean().required(),
  }),
};

const getUserComplianceScore = {
  params: Joi.object().keys({
    userId: Joi.string().required().custom(objectId),
  }),
  query: Joi.object().keys({
    nodeId: Joi.string().allow('', null),
  }),
};

module.exports = {
  getComplianceTable,
  getComplianceSummary,
  getComplianceDates,
  updateUserCompliance,
  updateNodeCompliance,
  getUserComplianceScore,
};

