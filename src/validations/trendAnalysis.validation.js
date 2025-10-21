/**
 * Trend Analysis Validation
 *
 * Joi validation schemas for trend analysis endpoints.
 * Validates query parameters and request bodies for trend analysis functionality.
 *
 * @module validations/trendAnalysis
 */

const Joi = require('joi');

/**
 * Validation schema for getSubmissionsTimeline
 */
const getSubmissionsTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    trend_type: Joi.string().valid('count', 'compliance', 'approval_rate').default('count'),
  }),
};

/**
 * Validation schema for getComplianceTimeline
 */
const getComplianceTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day'),
  }),
};

/**
 * Validation schema for getValidationTimeline
 */
const getValidationTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day'),
  }),
};

/**
 * Validation schema for getSeasonalPatterns
 */
const getSeasonalPatterns = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    years_back: Joi.number().integer().min(1).max(10).default(2),
  }),
};

/**
 * Validation schema for getGrowthMetrics
 */
const getGrowthMetrics = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    period_months: Joi.number().integer().min(1).max(60).default(12),
  }),
};

/**
 * Validation schema for getPredictiveInsights
 */
const getPredictiveInsights = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    forecast_months: Joi.number().integer().min(1).max(12).default(3),
  }),
};

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
/**
 * Trend Analysis Validation
 *
 * Joi validation schemas for trend analysis endpoints.
 * Validates query parameters and request bodies for trend analysis functionality.
 *
 * @module validations/trendAnalysis
 */

const Joi = require('joi');

/**
 * Validation schema for getSubmissionsTimeline
 */
const getSubmissionsTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    trend_type: Joi.string().valid('count', 'compliance', 'approval_rate').default('count'),
  }),
};

/**
 * Validation schema for getComplianceTimeline
 */
const getComplianceTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day'),
  }),
};

/**
 * Validation schema for getValidationTimeline
 */
const getValidationTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day'),
  }),
};

/**
 * Validation schema for getSeasonalPatterns
 */
const getSeasonalPatterns = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    years_back: Joi.number().integer().min(1).max(10).default(2),
  }),
};

/**
 * Validation schema for getGrowthMetrics
 */
const getGrowthMetrics = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    period_months: Joi.number().integer().min(1).max(60).default(12),
  }),
};

/**
 * Validation schema for getPredictiveInsights
 */
const getPredictiveInsights = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    forecast_months: Joi.number().integer().min(1).max(12).default(3),
  }),
};

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
/**
 * Trend Analysis Validation
 *
 * Joi validation schemas for trend analysis endpoints.
 * Validates query parameters and request bodies for trend analysis functionality.
 *
 * @module validations/trendAnalysis
 */

const Joi = require('joi');

/**
 * Validation schema for getSubmissionsTimeline
 */
const getSubmissionsTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('hour', 'day', 'week', 'month').default('day'),
    trend_type: Joi.string().valid('count', 'compliance', 'approval_rate').default('count'),
  }),
};

/**
 * Validation schema for getComplianceTimeline
 */
const getComplianceTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day'),
  }),
};

/**
 * Validation schema for getValidationTimeline
 */
const getValidationTimeline = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day'),
  }),
};

/**
 * Validation schema for getSeasonalPatterns
 */
const getSeasonalPatterns = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    years_back: Joi.number().integer().min(1).max(10).default(2),
  }),
};

/**
 * Validation schema for getGrowthMetrics
 */
const getGrowthMetrics = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    period_months: Joi.number().integer().min(1).max(60).default(12),
  }),
};

/**
 * Validation schema for getPredictiveInsights
 */
const getPredictiveInsights = {
  query: Joi.object().keys({
    tenant_id: Joi.string().optional(),
    project_id: Joi.string().optional(),
    forecast_months: Joi.number().integer().min(1).max(12).default(3),
  }),
};

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
