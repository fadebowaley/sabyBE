/**
 * Analytics Report Controller
 *
 * HTTP endpoints for analytics and aggregation functionality.
 * Provides data insights, metrics, and statistical analysis for all reporting data.
 *
 * @module controllers/analyticsReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const analyticsReportService = require('../services/analyticsReport.service');
const pick = require('../utils/pick');

/**
 * GET /v1/analytics/submissions/summary
 * Get submission analytics summary with time-based aggregation
 */
const getSubmissionSummary = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  const data = await analyticsReportService.getSubmissionSummary(filters);

  logger.debug(
    `[AnalyticsController] Submission summary response: ${JSON.stringify({
      filters,
      periodsReturned: data.length,
      sample: data[0] || null,
    })}`
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission analytics summary retrieved successfully',
    data: {
      summary: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_periods: data.length,
    },
  });
});

/**
 * GET /v1/analytics/submissions/by-status
 * Get submissions breakdown by status
 */
const getSubmissionsByStatus = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
  ]);

  const data = await analyticsReportService.getSubmissionsByStatus(filters);

  logger.debug(
    `[AnalyticsController] Status breakdown response: ${JSON.stringify({
      filters,
      statusesReturned: data.length,
      sample: data[0] || null,
    })}`
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions by status breakdown retrieved successfully',
    data: {
      breakdown: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_statuses: data.length,
    },
  });
});

/**
 * GET /v1/analytics/submissions/by-month
 * Get submissions breakdown by month
 */
const getSubmissionsByMonth = catchAsync(async (req, res) => {
  const filters = pick(req.query, ['tenant_id', 'project_id', 'year']);

  const data = await analyticsReportService.getSubmissionsByMonth(filters);

  logger.debug(
    `[AnalyticsController] Monthly breakdown response: ${JSON.stringify({
      filters,
      monthsReturned: data.length,
      sample: data[0] || null,
    })}`
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions by month breakdown retrieved successfully',
    data: {
      monthly_breakdown: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      year: filters.year || new Date().getFullYear(),
    },
  });
});

/**
 * GET /v1/analytics/compliance/rates
 * Get compliance rates analytics
 */
const getComplianceRates = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
  ]);

  const data = await analyticsReportService.getComplianceRates(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance rates analytics retrieved successfully',
    data: {
      compliance_rates: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_projects: data.length,
    },
  });
});

/**
 * GET /v1/analytics/compliance/by-node
 * Get compliance analytics by node
 */
const getComplianceByNode = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'limit',
  ]);

  const data = await analyticsReportService.getComplianceByNode(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance by node analytics retrieved successfully',
    data: {
      node_compliance: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_nodes: data.length,
    },
  });
});

/**
 * GET /v1/analytics/validations/failures
 * Get validation failures analytics
 */
const getValidationFailures = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'limit',
  ]);

  const data = await analyticsReportService.getValidationFailures(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Validation failures analytics retrieved successfully',
    data: {
      validation_failures: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_failure_types: data.length,
    },
  });
});

/**
 * GET /v1/analytics/notifications/delivery
 * Get notification delivery analytics
 */
const getNotificationDelivery = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
  ]);

  const data = await analyticsReportService.getNotificationDelivery(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notification delivery analytics retrieved successfully',
    data: {
      delivery_metrics: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_notification_types: data.length,
    },
  });
});

/**
 * GET /v1/analytics/activity/trends
 * Get activity trends analytics
 */
const getActivityTrends = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'group_by',
  ]);

  const data = await analyticsReportService.getActivityTrends(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Activity trends analytics retrieved successfully',
    data: {
      activity_trends: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_trend_points: data.length,
    },
  });
});

/**
 * GET /v1/analytics/performance/top-nodes
 * Get top performing nodes
 */
const getTopPerformingNodes = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
    'limit',
  ]);

  const data = await analyticsReportService.getTopPerformingNodes(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Top performing nodes analytics retrieved successfully',
    data: {
      top_nodes: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
      total_nodes: data.length,
    },
  });
});

/**
 * GET /v1/analytics/quality/metrics
 * Get data quality metrics
 */
const getDataQualityMetrics = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
  ]);

  const data = await analyticsReportService.getDataQualityMetrics(filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Data quality metrics retrieved successfully',
    data: {
      quality_metrics: data,
      filters_applied: filters,
      generated_at: new Date().toISOString(),
    },
  });
});

/**
 * GET /v1/analytics/dashboard/overview
 * Get comprehensive dashboard overview
 */
const getDashboardOverview = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'start_date',
    'end_date',
  ]);

  // Get multiple analytics in parallel
  const [
    submissionSummary,
    submissionsByStatus,
    complianceRates,
    topNodes,
    qualityMetrics,
  ] = await Promise.all([
    analyticsReportService.getSubmissionSummary({
      ...filters,
      group_by: 'month',
    }),
    analyticsReportService.getSubmissionsByStatus(filters),
    analyticsReportService.getComplianceRates(filters),
    analyticsReportService.getTopPerformingNodes({ ...filters, limit: 10 }),
    analyticsReportService.getDataQualityMetrics(filters),
  ]);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Dashboard overview analytics retrieved successfully',
    data: {
      overview: {
        submission_summary: submissionSummary,
        status_breakdown: submissionsByStatus,
        compliance_rates: complianceRates,
        top_performing_nodes: topNodes,
        quality_metrics: qualityMetrics,
      },
      filters_applied: filters,
      generated_at: new Date().toISOString(),
    },
  });
});

module.exports = {
  getSubmissionSummary,
  getSubmissionsByStatus,
  getSubmissionsByMonth,
  getComplianceRates,
  getComplianceByNode,
  getValidationFailures,
  getNotificationDelivery,
  getActivityTrends,
  getTopPerformingNodes,
  getDataQualityMetrics,
  getDashboardOverview,
};
