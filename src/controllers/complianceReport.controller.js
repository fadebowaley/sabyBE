/**
 * Compliance Report Controller
 *
 * HTTP endpoints for compliance reporting and management.
 *
 * @module controllers/complianceReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const eventComplianceService = require('../services/eventCompliance.service');
const pick = require('../utils/pick');

/**
 * GET /v1/compliance-reports
 * Get compliance tracking records with filters
 */
const getComplianceTracking = catchAsync(async (req, res) => {
  const { tenant_id, project_id, node_id, month } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const records = await eventComplianceService.getComplianceTracking(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance tracking retrieved successfully',
    data: records,
    count: records.length,
  });
});

/**
 * GET /v1/compliance-reports/:id
 * Get compliance by ID
 */
const getComplianceById = catchAsync(async (req, res) => {
  const compliance = await eventComplianceService.getComplianceById(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance record retrieved successfully',
    data: compliance,
  });
});

/**
 * GET /v1/compliance-reports/trends
 * Get compliance trends for a project
 */
const getComplianceTrends = catchAsync(async (req, res) => {
  const { tenant_id, project_id, start_date, end_date } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const trends = await eventComplianceService.getComplianceTrends(
    tenant_id,
    project_id,
    { start_date, end_date }
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance trends retrieved successfully',
    data: trends,
    count: trends.length,
  });
});

/**
 * GET /v1/compliance-reports/node/:nodeId
 * Get compliance history for a node
 */
const getNodeCompliance = catchAsync(async (req, res) => {
  const { tenant_id, project_id, limit } = req.query;
  const { nodeId } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const history = await eventComplianceService.getComplianceHistory(
    tenant_id,
    project_id,
    nodeId,
    limit ? parseInt(limit, 10) : 12
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Node compliance history retrieved successfully',
    data: history,
    count: history.length,
  });
});

/**
 * GET /v1/compliance-reports/project/:projectId
 * Get project compliance summary
 */
const getProjectCompliance = catchAsync(async (req, res) => {
  const { tenant_id, month } = req.query;
  const { projectId } = req.params;

  if (!tenant_id || !month) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and month are required',
    });
  }

  const summary = await eventComplianceService.getComplianceSummary(
    tenant_id,
    projectId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Project compliance retrieved successfully',
    data: summary,
  });
});

/**
 * GET /v1/compliance-reports/weekly/:month
 * Get weekly progress for a node
 */
const getWeeklyProgress = catchAsync(async (req, res) => {
  const { tenant_id, project_id, node_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id || !node_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id, project_id, and node_id are required',
    });
  }

  const progress = await eventComplianceService.getWeeklyProgress(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Weekly progress retrieved successfully',
    data: progress,
  });
});

/**
 * GET /v1/compliance-reports/status/:status
 * Get nodes by compliance status
 */
const getNodesByStatus = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;
  const { status } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const nodes = await eventComplianceService.getNodesByComplianceStatus(
    tenant_id,
    project_id,
    status,
    month || null
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Nodes with ${status} compliance retrieved successfully`,
    data: nodes,
    count: nodes.length,
  });
});

/**
 * PATCH /v1/compliance-reports/:id
 * Override compliance (admin)
 */
const overrideCompliance = catchAsync(async (req, res) => {
  const { percentage, reason } = req.body;
  const user_id = req.user?.id || 'system';

  if (percentage === undefined) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'percentage is required',
    });
  }

  const updated = await eventComplianceService.overrideCompliance(
    req.params.id,
    percentage,
    user_id,
    reason || 'manual_override'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance overridden successfully',
    data: updated,
  });
});

/**
 * POST /v1/compliance-reports/:id/mark-event
 * Mark event as submitted
 */
const markEventSubmitted = catchAsync(async (req, res) => {
  const { event_key } = req.body;
  const user_id = req.user?.id || 'system';

  if (!event_key) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'event_key is required',
    });
  }

  const updated = await eventComplianceService.markEventSubmitted(
    req.params.id,
    event_key,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Event marked as submitted successfully',
    data: updated,
  });
});

/**
 * POST /v1/compliance-reports/:id/reset
 * Reset compliance for a node/month
 */
const resetCompliance = catchAsync(async (req, res) => {
  const user_id = req.user?.id || 'system';

  const reset = await eventComplianceService.resetCompliance(
    req.params.id,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance reset successfully',
    data: reset,
  });
});

/**
 * DELETE /v1/compliance-reports/:id
 * Delete compliance record
 */
const deleteComplianceRecord = catchAsync(async (req, res) => {
  const deleted = await eventComplianceService.deleteComplianceTracking(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance record deleted successfully',
    data: deleted,
  });
});

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
/**
 * Compliance Report Controller
 *
 * HTTP endpoints for compliance reporting and management.
 *
 * @module controllers/complianceReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const eventComplianceService = require('../services/eventCompliance.service');
const pick = require('../utils/pick');

/**
 * GET /v1/compliance-reports
 * Get compliance tracking records with filters
 */
const getComplianceTracking = catchAsync(async (req, res) => {
  const { tenant_id, project_id, node_id, month } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const records = await eventComplianceService.getComplianceTracking(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance tracking retrieved successfully',
    data: records,
    count: records.length,
  });
});

/**
 * GET /v1/compliance-reports/:id
 * Get compliance by ID
 */
const getComplianceById = catchAsync(async (req, res) => {
  const compliance = await eventComplianceService.getComplianceById(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance record retrieved successfully',
    data: compliance,
  });
});

/**
 * GET /v1/compliance-reports/trends
 * Get compliance trends for a project
 */
const getComplianceTrends = catchAsync(async (req, res) => {
  const { tenant_id, project_id, start_date, end_date } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const trends = await eventComplianceService.getComplianceTrends(
    tenant_id,
    project_id,
    { start_date, end_date }
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance trends retrieved successfully',
    data: trends,
    count: trends.length,
  });
});

/**
 * GET /v1/compliance-reports/node/:nodeId
 * Get compliance history for a node
 */
const getNodeCompliance = catchAsync(async (req, res) => {
  const { tenant_id, project_id, limit } = req.query;
  const { nodeId } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const history = await eventComplianceService.getComplianceHistory(
    tenant_id,
    project_id,
    nodeId,
    limit ? parseInt(limit, 10) : 12
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Node compliance history retrieved successfully',
    data: history,
    count: history.length,
  });
});

/**
 * GET /v1/compliance-reports/project/:projectId
 * Get project compliance summary
 */
const getProjectCompliance = catchAsync(async (req, res) => {
  const { tenant_id, month } = req.query;
  const { projectId } = req.params;

  if (!tenant_id || !month) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and month are required',
    });
  }

  const summary = await eventComplianceService.getComplianceSummary(
    tenant_id,
    projectId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Project compliance retrieved successfully',
    data: summary,
  });
});

/**
 * GET /v1/compliance-reports/weekly/:month
 * Get weekly progress for a node
 */
const getWeeklyProgress = catchAsync(async (req, res) => {
  const { tenant_id, project_id, node_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id || !node_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id, project_id, and node_id are required',
    });
  }

  const progress = await eventComplianceService.getWeeklyProgress(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Weekly progress retrieved successfully',
    data: progress,
  });
});

/**
 * GET /v1/compliance-reports/status/:status
 * Get nodes by compliance status
 */
const getNodesByStatus = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;
  const { status } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const nodes = await eventComplianceService.getNodesByComplianceStatus(
    tenant_id,
    project_id,
    status,
    month || null
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Nodes with ${status} compliance retrieved successfully`,
    data: nodes,
    count: nodes.length,
  });
});

/**
 * PATCH /v1/compliance-reports/:id
 * Override compliance (admin)
 */
const overrideCompliance = catchAsync(async (req, res) => {
  const { percentage, reason } = req.body;
  const user_id = req.user?.id || 'system';

  if (percentage === undefined) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'percentage is required',
    });
  }

  const updated = await eventComplianceService.overrideCompliance(
    req.params.id,
    percentage,
    user_id,
    reason || 'manual_override'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance overridden successfully',
    data: updated,
  });
});

/**
 * POST /v1/compliance-reports/:id/mark-event
 * Mark event as submitted
 */
const markEventSubmitted = catchAsync(async (req, res) => {
  const { event_key } = req.body;
  const user_id = req.user?.id || 'system';

  if (!event_key) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'event_key is required',
    });
  }

  const updated = await eventComplianceService.markEventSubmitted(
    req.params.id,
    event_key,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Event marked as submitted successfully',
    data: updated,
  });
});

/**
 * POST /v1/compliance-reports/:id/reset
 * Reset compliance for a node/month
 */
const resetCompliance = catchAsync(async (req, res) => {
  const user_id = req.user?.id || 'system';

  const reset = await eventComplianceService.resetCompliance(
    req.params.id,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance reset successfully',
    data: reset,
  });
});

/**
 * DELETE /v1/compliance-reports/:id
 * Delete compliance record
 */
const deleteComplianceRecord = catchAsync(async (req, res) => {
  const deleted = await eventComplianceService.deleteComplianceTracking(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance record deleted successfully',
    data: deleted,
  });
});

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
/**
 * Compliance Report Controller
 *
 * HTTP endpoints for compliance reporting and management.
 *
 * @module controllers/complianceReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const eventComplianceService = require('../services/eventCompliance.service');
const pick = require('../utils/pick');

/**
 * GET /v1/compliance-reports
 * Get compliance tracking records with filters
 */
const getComplianceTracking = catchAsync(async (req, res) => {
  const { tenant_id, project_id, node_id, month } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const records = await eventComplianceService.getComplianceTracking(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance tracking retrieved successfully',
    data: records,
    count: records.length,
  });
});

/**
 * GET /v1/compliance-reports/:id
 * Get compliance by ID
 */
const getComplianceById = catchAsync(async (req, res) => {
  const compliance = await eventComplianceService.getComplianceById(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance record retrieved successfully',
    data: compliance,
  });
});

/**
 * GET /v1/compliance-reports/trends
 * Get compliance trends for a project
 */
const getComplianceTrends = catchAsync(async (req, res) => {
  const { tenant_id, project_id, start_date, end_date } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const trends = await eventComplianceService.getComplianceTrends(
    tenant_id,
    project_id,
    { start_date, end_date }
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance trends retrieved successfully',
    data: trends,
    count: trends.length,
  });
});

/**
 * GET /v1/compliance-reports/node/:nodeId
 * Get compliance history for a node
 */
const getNodeCompliance = catchAsync(async (req, res) => {
  const { tenant_id, project_id, limit } = req.query;
  const { nodeId } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const history = await eventComplianceService.getComplianceHistory(
    tenant_id,
    project_id,
    nodeId,
    limit ? parseInt(limit, 10) : 12
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Node compliance history retrieved successfully',
    data: history,
    count: history.length,
  });
});

/**
 * GET /v1/compliance-reports/project/:projectId
 * Get project compliance summary
 */
const getProjectCompliance = catchAsync(async (req, res) => {
  const { tenant_id, month } = req.query;
  const { projectId } = req.params;

  if (!tenant_id || !month) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and month are required',
    });
  }

  const summary = await eventComplianceService.getComplianceSummary(
    tenant_id,
    projectId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Project compliance retrieved successfully',
    data: summary,
  });
});

/**
 * GET /v1/compliance-reports/weekly/:month
 * Get weekly progress for a node
 */
const getWeeklyProgress = catchAsync(async (req, res) => {
  const { tenant_id, project_id, node_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id || !node_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id, project_id, and node_id are required',
    });
  }

  const progress = await eventComplianceService.getWeeklyProgress(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Weekly progress retrieved successfully',
    data: progress,
  });
});

/**
 * GET /v1/compliance-reports/status/:status
 * Get nodes by compliance status
 */
const getNodesByStatus = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;
  const { status } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const nodes = await eventComplianceService.getNodesByComplianceStatus(
    tenant_id,
    project_id,
    status,
    month || null
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Nodes with ${status} compliance retrieved successfully`,
    data: nodes,
    count: nodes.length,
  });
});

/**
 * PATCH /v1/compliance-reports/:id
 * Override compliance (admin)
 */
const overrideCompliance = catchAsync(async (req, res) => {
  const { percentage, reason } = req.body;
  const user_id = req.user?.id || 'system';

  if (percentage === undefined) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'percentage is required',
    });
  }

  const updated = await eventComplianceService.overrideCompliance(
    req.params.id,
    percentage,
    user_id,
    reason || 'manual_override'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance overridden successfully',
    data: updated,
  });
});

/**
 * POST /v1/compliance-reports/:id/mark-event
 * Mark event as submitted
 */
const markEventSubmitted = catchAsync(async (req, res) => {
  const { event_key } = req.body;
  const user_id = req.user?.id || 'system';

  if (!event_key) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'event_key is required',
    });
  }

  const updated = await eventComplianceService.markEventSubmitted(
    req.params.id,
    event_key,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Event marked as submitted successfully',
    data: updated,
  });
});

/**
 * POST /v1/compliance-reports/:id/reset
 * Reset compliance for a node/month
 */
const resetCompliance = catchAsync(async (req, res) => {
  const user_id = req.user?.id || 'system';

  const reset = await eventComplianceService.resetCompliance(
    req.params.id,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance reset successfully',
    data: reset,
  });
});

/**
 * DELETE /v1/compliance-reports/:id
 * Delete compliance record
 */
const deleteComplianceRecord = catchAsync(async (req, res) => {
  const deleted = await eventComplianceService.deleteComplianceTracking(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance record deleted successfully',
    data: deleted,
  });
});

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
