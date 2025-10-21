/**
 * Event Compliance Controller
 *
 * Handles HTTP requests for PERM compliance tracking and reporting
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { eventComplianceService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Get compliance tracking for a specific node/month
 * @route GET /v1/event-compliance/:nodeId/:month
 * @access Private
 */
const getTracking = catchAsync(async (req, res) => {
  const { nodeId, month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const tracking = await eventComplianceService.getComplianceTracking(
    tenant_id,
    project_id,
    nodeId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: tracking,
  });
});

/**
 * Get compliance summary for a project/month
 * @route GET /v1/event-compliance/summary
 * @access Private
 */
const getSummary = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const summary = await eventComplianceService.getComplianceSummary(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: summary,
  });
});

/**
 * Get compliance dashboard data
 * @route GET /v1/event-compliance/dashboard
 * @access Private
 */
const getDashboard = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  // Get summary
  const summary = await eventComplianceService.getComplianceSummary(
    tenant_id,
    project_id,
    month
  );

  // Get breakdown by node
  const breakdown = await eventComplianceService.getComplianceBreakdownByNode(
    tenant_id,
    project_id,
    month
  );

  // Get overall compliance
  const overall = await eventComplianceService.getOverallCompliance(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: {
      summary,
      breakdown,
      overall,
      month,
      generated_at: new Date().toISOString(),
    },
  });
});

/**
 * Get compliance report for a node
 * @route GET /v1/event-compliance/report/:nodeId/:month
 * @access Private
 */
const getReport = catchAsync(async (req, res) => {
  const { nodeId, month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const report = await eventComplianceService.getComplianceReport(
    tenant_id,
    project_id,
    nodeId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: report,
  });
});

/**
 * Get compliance history for a node
 * @route GET /v1/event-compliance/history/:nodeId
 * @access Private
 */
const getHistory = catchAsync(async (req, res) => {
  const { nodeId } = req.params;
  const { tenant_id, project_id, limit } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const history = await eventComplianceService.getComplianceHistory(
    tenant_id,
    project_id,
    nodeId,
    limit ? parseInt(limit) : 12 // Default to 12 months
  );

  res.status(httpStatus.OK).send({
    success: true,
    count: history.length,
    data: history,
  });
});

/**
 * Recalculate compliance for a submission
 * @route POST /v1/event-compliance/recalculate/:submissionId
 * @access Private (Admin/Owner)
 */
const recalculate = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const { tenant_id, project_id, submission_data, calendar } = req.body;

  if (!submissionId || !tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: submissionId, tenant_id, project_id'
    );
  }

  // Get submission data and calendar if not provided
  // TODO: Implement getting submission and calendar from DB

  const result = await eventComplianceService.calculateAndUpdateCompliance(
    submissionId,
    submission_data,
    calendar
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance recalculated successfully',
    data: result,
  });
});

/**
 * Lock submission
 * @route POST /v1/event-compliance/lock/:submissionId
 * @access Private (Admin/Owner)
 */
const lockSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const { reason } = req.body;
  const user_id = req.user?.id;

  if (!submissionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await eventComplianceService.lockSubmission(
    submissionId,
    user_id,
    reason || 'manual_lock'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission locked successfully',
    data: result,
  });
});

/**
 * Unlock submission
 * @route POST /v1/event-compliance/unlock/:submissionId
 * @access Private (Admin only)
 */
const unlockSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const user_id = req.user?.id;

  if (!submissionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await eventComplianceService.unlockSubmission(
    submissionId,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission unlocked successfully',
    data: result,
  });
});

module.exports = {
  getTracking,
  getSummary,
  getDashboard,
  getReport,
  getHistory,
  recalculate,
  lockSubmission,
  unlockSubmission,
};
