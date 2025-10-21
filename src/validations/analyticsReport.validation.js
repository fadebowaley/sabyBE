/**
 * Analytics Report Validation
 *
 * Joi validation schemas for analytics report requests.
 * Ensures data integrity and proper request formatting for analytics endpoints.
 *
 * @module validations/analyticsReport
 */

const Joi = require('joi');

const analyticsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  group_by: Joi.string().valid('hour', 'day', 'week', 'month', 'year').default('month'),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  year: Joi.number().integer().min(2020).max(2030),
};

const submissionSummaryQuery = {
  ...analyticsQuery,
  group_by: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
};

const submissionStatusQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const submissionMonthQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  year: Joi.number().integer().min(2020).max(2030).default(new Date().getFullYear()),
};

const complianceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
};

const validationQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
};

const notificationQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const activityQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  group_by: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
};

const performanceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(20),
};

const qualityQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const dashboardQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

module.exports = {
  analyticsQuery,
  submissionSummaryQuery,
  submissionStatusQuery,
  submissionMonthQuery,
  complianceQuery,
  validationQuery,
  notificationQuery,
  activityQuery,
  performanceQuery,
  qualityQuery,
  dashboardQuery,
};
/**
 * Analytics Report Validation
 *
 * Joi validation schemas for analytics report requests.
 * Ensures data integrity and proper request formatting for analytics endpoints.
 *
 * @module validations/analyticsReport
 */

const Joi = require('joi');

const analyticsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  group_by: Joi.string().valid('hour', 'day', 'week', 'month', 'year').default('month'),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  year: Joi.number().integer().min(2020).max(2030),
};

const submissionSummaryQuery = {
  ...analyticsQuery,
  group_by: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
};

const submissionStatusQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const submissionMonthQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  year: Joi.number().integer().min(2020).max(2030).default(new Date().getFullYear()),
};

const complianceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
};

const validationQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
};

const notificationQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const activityQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  group_by: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
};

const performanceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(20),
};

const qualityQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const dashboardQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

module.exports = {
  analyticsQuery,
  submissionSummaryQuery,
  submissionStatusQuery,
  submissionMonthQuery,
  complianceQuery,
  validationQuery,
  notificationQuery,
  activityQuery,
  performanceQuery,
  qualityQuery,
  dashboardQuery,
};
/**
 * Analytics Report Validation
 *
 * Joi validation schemas for analytics report requests.
 * Ensures data integrity and proper request formatting for analytics endpoints.
 *
 * @module validations/analyticsReport
 */

const Joi = require('joi');

const analyticsQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  group_by: Joi.string().valid('hour', 'day', 'week', 'month', 'year').default('month'),
  limit: Joi.number().integer().min(1).max(1000).default(50),
  year: Joi.number().integer().min(2020).max(2030),
};

const submissionSummaryQuery = {
  ...analyticsQuery,
  group_by: Joi.string().valid('day', 'week', 'month', 'year').default('month'),
};

const submissionStatusQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const submissionMonthQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  year: Joi.number().integer().min(2020).max(2030).default(new Date().getFullYear()),
};

const complianceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
};

const validationQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(50),
};

const notificationQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const activityQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  group_by: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
};

const performanceQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
  limit: Joi.number().integer().min(1).max(1000).default(20),
};

const qualityQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

const dashboardQuery = {
  tenant_id: Joi.string(),
  project_id: Joi.string(),
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso(),
};

module.exports = {
  analyticsQuery,
  submissionSummaryQuery,
  submissionStatusQuery,
  submissionMonthQuery,
  complianceQuery,
  validationQuery,
  notificationQuery,
  activityQuery,
  performanceQuery,
  qualityQuery,
  dashboardQuery,
};
