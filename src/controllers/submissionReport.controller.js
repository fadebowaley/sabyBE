/**
 * Submission Report Controller
 *
 * HTTP endpoints for submission reporting and data management.
 * Handles request validation, authentication, and response formatting.
 *
 * @module controllers/submissionReport
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const submissionReportService = require('../services/submissionReport.service');
const SubmissionModel = require('../models/submission.model');
const pick = require('../utils/pick');

/**
 * GET /v1/submission-reports
 * Get submissions with advanced filtering and pagination
 */
const getSubmissions = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'form_id',
    'node_id',
    'user_id',
    'status',
    'source',
    'month',
    'year',
    'perm_enabled',
    'is_locked',
    'start_date',
    'end_date',
    'completeness_status',
  ]);

  const options = pick(req.query, ['limit', 'offset']);

  const result = await submissionReportService.getSubmissions(filters, options);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions retrieved successfully',
    data: result.results,
    pagination: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      pages: result.pages,
    },
  });
});

/**
 * GET /v1/submission-reports/:id
 * Get submission by ID
 */
const getSubmissionById = catchAsync(async (req, res) => {
  const submission = await submissionReportService.getSubmissionById(
    req.params.id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission retrieved successfully',
    data: submission,
  });
});

/**
 * GET /v1/submission-reports/compliance/:month
 * Get compliance report for a project/month
 */
const getComplianceReport = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const report = await submissionReportService.getComplianceReport(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Compliance report retrieved successfully',
    data: report,
  });
});

/**
 * GET /v1/submission-reports/node/:nodeId
 * Get submissions by node
 */
const getSubmissionsByNode = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { nodeId } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const options = pick(req.query, ['perm_only', 'limit']);

  const submissions = await submissionReportService.getSubmissionsByNode(
    tenant_id,
    project_id,
    nodeId,
    options
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
  });
});

/**
 * GET /v1/submission-reports/stats
 * Get submission statistics
 */
const getSubmissionStats = catchAsync(async (req, res) => {
  const { tenant_id } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const filters = pick(req.query, ['project_id', 'form_id', 'month', 'year']);

  const stats = await submissionReportService.getSubmissionStats(
    tenant_id,
    filters
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Statistics retrieved successfully',
    data: stats,
  });
});

/**
 * GET /v1/submission-reports/monthly/:month
 * Get monthly submissions for a project
 */
const getMonthlyReport = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const submissions = await submissionReportService.getMonthlySubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Monthly submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
    month,
  });
});

/**
 * GET /v1/submission-reports/incomplete/:month
 * Get incomplete submissions for a project/month
 */
const getIncompleteSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id } = req.query;
  const { month } = req.params;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const submissions = await submissionReportService.getIncompleteSubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Incomplete submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
  });
});

/**
 * GET /v1/submission-reports/locked
 * Get locked submissions
 */
const getLockedSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const submissions = await submissionReportService.getLockedSubmissions(
    tenant_id,
    project_id,
    month || null
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Locked submissions retrieved successfully',
    data: submissions,
    count: submissions.length,
  });
});

/**
 * PATCH /v1/submission-reports/:id
 * Update submission data
 */
const updateSubmission = catchAsync(async (req, res) => {
  const updates = pick(req.body, ['data', 'meta', 'status', 'event_date']);
  const user_id = req.user?.id || 'system';

  const updated = await submissionReportService.updateSubmission(
    req.params.id,
    updates,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission updated successfully',
    data: updated,
  });
});

/**
 * PATCH /v1/submission-reports/:id/status
 * Update submission status
 */
const updateSubmissionStatus = catchAsync(async (req, res) => {
  const { status } = req.body;
  const user_id = req.user?.id || 'system';

  if (!status) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'status is required',
    });
  }

  const updated = await submissionReportService.updateSubmissionStatus(
    req.params.id,
    status,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission status updated successfully',
    data: updated,
  });
});

/**
 * POST /v1/submission-reports/:id/lock
 * Lock a submission
 */
const lockSubmission = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const user_id = req.user?.id || 'system';

  const locked = await submissionReportService.lockSubmission(
    req.params.id,
    user_id,
    reason || 'manual_lock'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission locked successfully',
    data: locked,
  });
});

/**
 * POST /v1/submission-reports/:id/unlock
 * Unlock a submission
 */
const unlockSubmission = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const user_id = req.user?.id || 'system';

  const unlocked = await submissionReportService.unlockSubmission(
    req.params.id,
    user_id,
    reason || 'manual_unlock'
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission unlocked successfully',
    data: unlocked,
  });
});

/**
 * DELETE /v1/submission-reports/:id
 * Delete a submission (soft delete)
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const user_id = req.user?.id || 'system';

  const deleted = await submissionReportService.deleteSubmission(
    req.params.id,
    user_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission deleted successfully',
    data: deleted,
  });
});

/**
 * POST /v1/submission-reports/bulk-delete
 * Bulk delete submissions
 */
const bulkDeleteSubmissions = catchAsync(async (req, res) => {
  const { ids, hard } = req.body;
  const user_id = req.user?.id || 'system';

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'ids array is required',
    });
  }

  const result = await submissionReportService.bulkDeleteSubmissions(
    ids,
    user_id,
    hard || false
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `${result.deleted_count} submission(s) deleted successfully`,
    data: result,
  });
});

// =========================================================================
// BULK OPERATIONS (Phase 6)
// =========================================================================

/**
 * Bulk update submission status
 * POST /v1/submission-reports/bulk-update-status
 */
const bulkUpdateStatus = catchAsync(async (req, res) => {
  const { ids, status, updated_by } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'ids array is required');
  }

  if (!status) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'status is required');
  }

  const results = await SubmissionModel.bulk.bulkUpdateStatus(
    ids,
    status,
    updated_by
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Updated ${results.length} submissions`,
    data: results,
  });
});

/**
 * Bulk lock/unlock submissions
 * POST /v1/submission-reports/bulk-lock
 */
const bulkLockUnlock = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, is_locked, locked_by } = req.body;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'tenant_id, project_id, and month are required'
    );
  }

  const results = await SubmissionModel.bulk.bulkLockUnlock(
    tenant_id,
    project_id,
    month,
    is_locked !== false, // default to true
    locked_by
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `${is_locked ? 'Locked' : 'Unlocked'} ${
      results.length
    } submissions`,
    data: results,
  });
});

/**
 * Bulk update compliance
 * POST /v1/submission-reports/bulk-update-compliance
 */
const bulkUpdateCompliance = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, compliance_data } = req.body;

  if (!tenant_id || !project_id || !month || !compliance_data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'tenant_id, project_id, month, and compliance_data are required'
    );
  }

  if (!Array.isArray(compliance_data)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'compliance_data must be an array'
    );
  }

  const results = await SubmissionModel.bulk.bulkUpdateCompliance(
    tenant_id,
    project_id,
    month,
    compliance_data
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Updated compliance for ${results.length} nodes`,
    data: results,
  });
});

/**
 * Bulk archive old submissions
 * POST /v1/submission-reports/bulk-archive
 */
const bulkArchive = catchAsync(async (req, res) => {
  const { tenant_id, older_than_months = 12, project_ids = [] } = req.body;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }

  const results = await SubmissionModel.bulk.bulkArchive(
    tenant_id,
    older_than_months,
    project_ids
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `Archived ${results.length} submissions older than ${older_than_months} months`,
    data: results,
  });
});

/**
 * Bulk delete submissions (enhanced)
 * POST /v1/submission-reports/bulk-delete-advanced
 */
const bulkDeleteAdvanced = catchAsync(async (req, res) => {
  const { tenant_id, ...filters } = req.body;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }

  const result = await SubmissionModel.bulk.bulkDelete(tenant_id, filters);

  res.status(httpStatus.OK).send({
    success: true,
    message: `${result.hard_delete ? 'Permanently deleted' : 'Soft deleted'} ${
      result.deleted
    } submissions`,
    deleted: result.deleted,
    hard_delete: result.hard_delete,
  });
});

/**
 * Bulk update metadata
 * POST /v1/submission-reports/bulk-update-metadata
 */
const bulkUpdateMetadata = catchAsync(async (req, res) => {
  const { ids, metadata } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'ids array is required');
  }

  if (!metadata || typeof metadata !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'metadata object is required');
  }

  const results = await SubmissionModel.bulk.bulkUpdateMetadata(ids, metadata);

  res.status(httpStatus.OK).send({
    success: true,
    message: `Updated metadata for ${results.length} submissions`,
    data: results,
  });
});

module.exports = {
  getSubmissions,
  getSubmissionById,
  getComplianceReport,
  getSubmissionsByNode,
  getSubmissionStats,
  getMonthlyReport,
  getIncompleteSubmissions,
  getLockedSubmissions,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
  // Phase 6: Bulk Operations
  bulkUpdateStatus,
  bulkLockUnlock,
  bulkUpdateCompliance,
  bulkArchive,
  bulkDeleteAdvanced,
  bulkUpdateMetadata,
};
