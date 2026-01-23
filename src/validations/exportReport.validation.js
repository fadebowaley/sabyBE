/**
 * Export Report Validation
 *
 * Joi validation schemas for export report requests.
 * Ensures data integrity and proper request formatting for export endpoints.
 *
 * @module validations/exportReport
 */

const Joi = require('joi');

const exportSubmissionsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  status: Joi.string().valid('pending', 'submitted', 'approved', 'rejected', 'archived'),
  month: Joi.date(),
  year: Joi.number().integer().min(2020).max(2030),
  node_id: Joi.string(),
  user_id: Joi.string(),
  perm_enabled: Joi.boolean(),
  limit: Joi.number().integer().min(1).max(10000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
};

const exportComplianceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  node_id: Joi.string(),
  month: Joi.date(),
  year: Joi.number().integer().min(2020).max(2030),
  compliance_status: Joi.string().valid('complete', 'partial', 'incomplete'),
  limit: Joi.number().integer().min(1).max(10000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
};

const exportValidationsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  submission_id: Joi.string().uuid(),
  validation_type: Joi.string(),
  status: Joi.string().valid('passed', 'failed', 'pending', 'resolved'),
  limit: Joi.number().integer().min(1).max(10000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
};

const exportNotificationsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  notification_type: Joi.string(),
  status: Joi.string().valid('pending', 'sent', 'failed', 'cancelled'),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
  limit: Joi.number().integer().min(1).max(10000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
};

const exportActivityLogsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  user_id: Joi.string(),
  action: Joi.string(),
  status: Joi.string().valid('queued', 'in_progress', 'success', 'failed', 'retried'),
  limit: Joi.number().integer().min(1).max(10000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
};

const exportCombinedQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  limit: Joi.number().integer().min(1).max(10000).default(1000),
  offset: Joi.number().integer().min(0).default(0),
};

const exportStatsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
};

module.exports = {
  exportSubmissionsQuery,
  exportComplianceQuery,
  exportValidationsQuery,
  exportNotificationsQuery,
  exportActivityLogsQuery,
  exportCombinedQuery,
  exportStatsQuery,
};
