/**
 * Compliance Report Validation Schemas
 *
 * @module validations/complianceReport
 */

const Joi = require('joi');

const getComplianceTracking = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    node_id: Joi.string().uuid(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getComplianceById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getComplianceTrends = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    start_date: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    end_date: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getNodeCompliance = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    limit: Joi.number().integer().min(1).max(50).default(12),
  }),
};

const getProjectCompliance = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
};

const getWeeklyProgress = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    node_id: Joi.string().required(),
  }),
};

const getNodesByStatus = {
  params: Joi.object().keys({
    status: Joi.string().valid('complete', 'partial', 'incomplete').required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const overrideCompliance = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    percentage: Joi.number().min(0).max(100).required(),
    reason: Joi.string().max(500),
  }),
};

const markEventSubmitted = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    event_key: Joi.string().required(),
  }),
};

const resetCompliance = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const deleteComplianceRecord = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getComplianceTracking,
  getComplianceById,
  getComplianceTrends,
  getNodeCompliance,
  getProjectCompliance,
  getWeeklyProgress,
  getNodesByStatus,
  overrideCompliance,
  markEventSubmitted,
  resetCompliance,
  deleteComplianceRecord,
};

 *
 * @module validations/complianceReport
 */

const Joi = require('joi');

const getComplianceTracking = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    node_id: Joi.string().uuid(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getComplianceById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getComplianceTrends = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    start_date: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    end_date: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getNodeCompliance = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    limit: Joi.number().integer().min(1).max(50).default(12),
  }),
};

const getProjectCompliance = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
};

const getWeeklyProgress = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    node_id: Joi.string().required(),
  }),
};

const getNodesByStatus = {
  params: Joi.object().keys({
    status: Joi.string().valid('complete', 'partial', 'incomplete').required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const overrideCompliance = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    percentage: Joi.number().min(0).max(100).required(),
    reason: Joi.string().max(500),
  }),
};

const markEventSubmitted = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    event_key: Joi.string().required(),
  }),
};

const resetCompliance = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const deleteComplianceRecord = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getComplianceTracking,
  getComplianceById,
  getComplianceTrends,
  getNodeCompliance,
  getProjectCompliance,
  getWeeklyProgress,
  getNodesByStatus,
  overrideCompliance,
  markEventSubmitted,
  resetCompliance,
  deleteComplianceRecord,
};

 *
 * @module validations/complianceReport
 */

const Joi = require('joi');

const getComplianceTracking = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    node_id: Joi.string().uuid(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getComplianceById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getComplianceTrends = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    start_date: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    end_date: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getNodeCompliance = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    limit: Joi.number().integer().min(1).max(50).default(12),
  }),
};

const getProjectCompliance = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
};

const getWeeklyProgress = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    node_id: Joi.string().required(),
  }),
};

const getNodesByStatus = {
  params: Joi.object().keys({
    status: Joi.string().valid('complete', 'partial', 'incomplete').required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const overrideCompliance = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    percentage: Joi.number().min(0).max(100).required(),
    reason: Joi.string().max(500),
  }),
};

const markEventSubmitted = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    event_key: Joi.string().required(),
  }),
};

const resetCompliance = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const deleteComplianceRecord = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getComplianceTracking,
  getComplianceById,
  getComplianceTrends,
  getNodeCompliance,
  getProjectCompliance,
  getWeeklyProgress,
  getNodesByStatus,
  overrideCompliance,
  markEventSubmitted,
  resetCompliance,
  deleteComplianceRecord,
};
