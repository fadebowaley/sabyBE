/**
 * Trend Analysis Controller
 *
 * Controller for trend analysis and time-series functionality.
 * Handles HTTP requests for trend detection, seasonal patterns, and predictive insights.
 *
 * @module controllers/trendAnalysis
 */

const httpStatus = require('http-status');
const pick = require('lodash/pick');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const trendAnalysisService = require('../services/trendAnalysis.service');

/**
 * Get submissions timeline trends
 */
const getSubmissionsTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
    'trend_type',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getSubmissionsTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      trend_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        total_submissions: result.reduce((sum, row) => sum + (row.total_count || 0), 0),
        avg_trend_value: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.trend_value || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get compliance timeline trends
 */
const getComplianceTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getComplianceTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      compliance_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        avg_completeness: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_completeness || 0), 0) / result.length * 100) / 100
          : 0,
        avg_completion_rate: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.completion_rate || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get validation timeline trends
 */
const getValidationTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getValidationTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      validation_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        avg_success_rate: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.success_rate || 0), 0) / result.length * 100) / 100
          : 0,
        total_validations: result.reduce((sum, row) => sum + (row.total_validations || 0), 0),
      },
    },
  });
});

/**
 * Get seasonal patterns analysis
 */
const getSeasonalPatterns = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'years_back',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getSeasonalPatterns(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_months: result.length,
      filters_applied: filters,
      seasonal_analysis: {
        high_activity_months: result.filter(r => r.activity_level === 'high_activity').length,
        low_activity_months: result.filter(r => r.activity_level === 'low_activity').length,
        high_performance_months: result.filter(r => r.performance_level === 'high_performance').length,
        low_performance_months: result.filter(r => r.performance_level === 'low_performance').length,
        avg_submissions: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_submissions || 0), 0) / result.length * 100) / 100
          : 0,
        avg_compliance: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_compliance || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get growth metrics analysis
 */
const getGrowthMetrics = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'period_months',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getGrowthMetrics(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_months: result.length,
      filters_applied: filters,
      growth_analysis: {
        first_month: result[0]?.month || null,
        last_month: result[result.length - 1]?.month || null,
        avg_submission_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.submission_growth_rate !== null)
              .reduce((sum, row) => sum + (row.submission_growth_rate || 0), 0) / 
              result.filter(r => r.submission_growth_rate !== null).length * 100) / 100
          : 0,
        avg_node_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.node_growth_rate !== null)
              .reduce((sum, row) => sum + (row.node_growth_rate || 0), 0) / 
              result.filter(r => r.node_growth_rate !== null).length * 100) / 100
          : 0,
        avg_compliance_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.compliance_growth_rate !== null)
              .reduce((sum, row) => sum + (row.compliance_growth_rate || 0), 0) / 
              result.filter(r => r.compliance_growth_rate !== null).length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get predictive insights
 */
const getPredictiveInsights = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'forecast_months',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getPredictiveInsights(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      filters_applied: filters,
      insights_generated: new Date().toISOString(),
      forecast_quality: result.forecast_confidence || 'unknown',
      performance_assessment: result.performance_category || 'unknown',
    },
  });
});

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
/**
 * Trend Analysis Controller
 *
 * Controller for trend analysis and time-series functionality.
 * Handles HTTP requests for trend detection, seasonal patterns, and predictive insights.
 *
 * @module controllers/trendAnalysis
 */

const httpStatus = require('http-status');
const pick = require('lodash/pick');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const trendAnalysisService = require('../services/trendAnalysis.service');

/**
 * Get submissions timeline trends
 */
const getSubmissionsTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
    'trend_type',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getSubmissionsTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      trend_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        total_submissions: result.reduce((sum, row) => sum + (row.total_count || 0), 0),
        avg_trend_value: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.trend_value || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get compliance timeline trends
 */
const getComplianceTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getComplianceTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      compliance_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        avg_completeness: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_completeness || 0), 0) / result.length * 100) / 100
          : 0,
        avg_completion_rate: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.completion_rate || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get validation timeline trends
 */
const getValidationTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getValidationTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      validation_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        avg_success_rate: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.success_rate || 0), 0) / result.length * 100) / 100
          : 0,
        total_validations: result.reduce((sum, row) => sum + (row.total_validations || 0), 0),
      },
    },
  });
});

/**
 * Get seasonal patterns analysis
 */
const getSeasonalPatterns = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'years_back',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getSeasonalPatterns(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_months: result.length,
      filters_applied: filters,
      seasonal_analysis: {
        high_activity_months: result.filter(r => r.activity_level === 'high_activity').length,
        low_activity_months: result.filter(r => r.activity_level === 'low_activity').length,
        high_performance_months: result.filter(r => r.performance_level === 'high_performance').length,
        low_performance_months: result.filter(r => r.performance_level === 'low_performance').length,
        avg_submissions: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_submissions || 0), 0) / result.length * 100) / 100
          : 0,
        avg_compliance: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_compliance || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get growth metrics analysis
 */
const getGrowthMetrics = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'period_months',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getGrowthMetrics(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_months: result.length,
      filters_applied: filters,
      growth_analysis: {
        first_month: result[0]?.month || null,
        last_month: result[result.length - 1]?.month || null,
        avg_submission_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.submission_growth_rate !== null)
              .reduce((sum, row) => sum + (row.submission_growth_rate || 0), 0) / 
              result.filter(r => r.submission_growth_rate !== null).length * 100) / 100
          : 0,
        avg_node_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.node_growth_rate !== null)
              .reduce((sum, row) => sum + (row.node_growth_rate || 0), 0) / 
              result.filter(r => r.node_growth_rate !== null).length * 100) / 100
          : 0,
        avg_compliance_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.compliance_growth_rate !== null)
              .reduce((sum, row) => sum + (row.compliance_growth_rate || 0), 0) / 
              result.filter(r => r.compliance_growth_rate !== null).length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get predictive insights
 */
const getPredictiveInsights = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'forecast_months',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getPredictiveInsights(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      filters_applied: filters,
      insights_generated: new Date().toISOString(),
      forecast_quality: result.forecast_confidence || 'unknown',
      performance_assessment: result.performance_category || 'unknown',
    },
  });
});

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
/**
 * Trend Analysis Controller
 *
 * Controller for trend analysis and time-series functionality.
 * Handles HTTP requests for trend detection, seasonal patterns, and predictive insights.
 *
 * @module controllers/trendAnalysis
 */

const httpStatus = require('http-status');
const pick = require('lodash/pick');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const trendAnalysisService = require('../services/trendAnalysis.service');

/**
 * Get submissions timeline trends
 */
const getSubmissionsTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
    'trend_type',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getSubmissionsTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      trend_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        total_submissions: result.reduce((sum, row) => sum + (row.total_count || 0), 0),
        avg_trend_value: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.trend_value || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get compliance timeline trends
 */
const getComplianceTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getComplianceTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      compliance_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        avg_completeness: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_completeness || 0), 0) / result.length * 100) / 100
          : 0,
        avg_completion_rate: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.completion_rate || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get validation timeline trends
 */
const getValidationTimeline = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getValidationTimeline(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_periods: result.length,
      filters_applied: filters,
      validation_analysis: {
        first_period: result[0]?.period || null,
        last_period: result[result.length - 1]?.period || null,
        avg_success_rate: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.success_rate || 0), 0) / result.length * 100) / 100
          : 0,
        total_validations: result.reduce((sum, row) => sum + (row.total_validations || 0), 0),
      },
    },
  });
});

/**
 * Get seasonal patterns analysis
 */
const getSeasonalPatterns = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'years_back',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getSeasonalPatterns(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_months: result.length,
      filters_applied: filters,
      seasonal_analysis: {
        high_activity_months: result.filter(r => r.activity_level === 'high_activity').length,
        low_activity_months: result.filter(r => r.activity_level === 'low_activity').length,
        high_performance_months: result.filter(r => r.performance_level === 'high_performance').length,
        low_performance_months: result.filter(r => r.performance_level === 'low_performance').length,
        avg_submissions: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_submissions || 0), 0) / result.length * 100) / 100
          : 0,
        avg_compliance: result.length > 0 
          ? Math.round(result.reduce((sum, row) => sum + (row.avg_compliance || 0), 0) / result.length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get growth metrics analysis
 */
const getGrowthMetrics = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'period_months',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getGrowthMetrics(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      total_months: result.length,
      filters_applied: filters,
      growth_analysis: {
        first_month: result[0]?.month || null,
        last_month: result[result.length - 1]?.month || null,
        avg_submission_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.submission_growth_rate !== null)
              .reduce((sum, row) => sum + (row.submission_growth_rate || 0), 0) / 
              result.filter(r => r.submission_growth_rate !== null).length * 100) / 100
          : 0,
        avg_node_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.node_growth_rate !== null)
              .reduce((sum, row) => sum + (row.node_growth_rate || 0), 0) / 
              result.filter(r => r.node_growth_rate !== null).length * 100) / 100
          : 0,
        avg_compliance_growth: result.length > 0 
          ? Math.round(result
              .filter(r => r.compliance_growth_rate !== null)
              .reduce((sum, row) => sum + (row.compliance_growth_rate || 0), 0) / 
              result.filter(r => r.compliance_growth_rate !== null).length * 100) / 100
          : 0,
      },
    },
  });
});

/**
 * Get predictive insights
 */
const getPredictiveInsights = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'forecast_months',
  ]);

  // Set default tenant_id from auth if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  const result = await trendAnalysisService.getPredictiveInsights(filters);

  res.status(httpStatus.OK).json({
    success: true,
    data: result,
    meta: {
      filters_applied: filters,
      insights_generated: new Date().toISOString(),
      forecast_quality: result.forecast_confidence || 'unknown',
      performance_assessment: result.performance_category || 'unknown',
    },
  });
});

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
