/**
 * PERM Submission Controller
 *
 * Handles HTTP requests for PERM submissions (upsert, get, lock, validate)
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { permSubmissionService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Submit PERM data (upsert with merge)
 * @route POST /v1/perm/submissions
 * @access Private
 */
const submitData = catchAsync(async (req, res) => {
  const {
    tenant_id,
    project_id,
    node_id,
    month,
    year,
    data,
    user_id,
    form_id,
    project_name,
    project_category,
  } = req.body;

  if (!tenant_id || !project_id || !node_id || !month || !data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, node_id, month, data'
    );
  }

  const payload = {
    tenant_id,
    project_id,
    node_id,
    month,
    year: year || new Date(month).getFullYear(),
    data,
    user_id: user_id || req.user?.id,
    submitted_by: req.user?.id,
    submitted_at: new Date(),
    // Additional fields for form_submissions table
    form_id: form_id || project_id,
    project_name: project_name || 'PERM Project',
    project_category: project_category || 'perm',
    source: 'api',
  };

  const result = await permSubmissionService.submitPERMData(payload);

  res
    .status(result.action === 'created' ? httpStatus.CREATED : httpStatus.OK)
    .send({
      success: true,
      message:
        result.action === 'created'
          ? 'Submission created successfully'
          : 'Submission updated successfully',
      action: result.action,
      existed: result.existed,
      submission: result.submission,
      compliance: result.compliance,
      validation: result.validation,
    });
});

/**
 * Get submission by node and month
 * @route GET /v1/perm/submissions/:nodeId/:month
 * @access Private
 */
const getSubmission = catchAsync(async (req, res) => {
  const { nodeId, month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const result = await permSubmissionService.getPERMSubmission(
    tenant_id,
    project_id,
    nodeId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: result,
  });
});

/**
 * Get all submissions for a month
 * @route GET /v1/perm/submissions
 * @access Private
 */
const getSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const submissions = await permSubmissionService.getPERMSubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    count: submissions.length,
    data: submissions,
  });
});

/**
 * Lock submission (prevent further changes)
 * @route POST /v1/perm/submissions/:id/lock
 * @access Private (Admin/Owner)
 */
const lockSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user_id = req.user?.id;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await permSubmissionService.lockPERMSubmission(
    id,
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
 * Unlock submission (allow changes - admin only)
 * @route POST /v1/perm/submissions/:id/unlock
 * @access Private (Admin only)
 */
const unlockSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user_id = req.user?.id;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await permSubmissionService.unlockPERMSubmission(id, user_id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission unlocked successfully',
    data: result,
  });
});

/**
 * Validate submission data (dry-run, no save)
 * @route POST /v1/perm/submissions/validate
 * @access Private
 */
const validateData = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, data } = req.body;

  if (!tenant_id || !project_id || !month || !data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month, data'
    );
  }

  const result = await permSubmissionService.validatePERMSubmission({
    tenant_id,
    project_id,
    month,
    data,
  });

  res.status(httpStatus.OK).send({
    success: true,
    valid: result.isValid,
    errors: result.errors,
    warnings: result.warnings,
    message: result.isValid
      ? 'Validation passed'
      : `Validation failed with ${result.errors.length} error(s)`,
  });
});

/**
 * Get compliance summary for a project/month
 * @route GET /v1/perm/submissions/compliance/summary
 * @access Private
 */
const getComplianceSummary = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const summary = await permSubmissionService.getComplianceSummary(
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
 * Delete submission (soft delete)
 * @route DELETE /v1/perm/submissions/:id
 * @access Private (Admin/Owner)
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  // TODO: Implement soft delete in SubmissionModel
  throw new ApiError(
    httpStatus.NOT_IMPLEMENTED,
    'Delete functionality not yet implemented'
  );
});

module.exports = {
  submitData,
  getSubmission,
  getSubmissions,
  lockSubmission,
  unlockSubmission,
  validateData,
  getComplianceSummary,
  deleteSubmission,
};

 *
 * Handles HTTP requests for PERM submissions (upsert, get, lock, validate)
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { permSubmissionService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Submit PERM data (upsert with merge)
 * @route POST /v1/perm/submissions
 * @access Private
 */
const submitData = catchAsync(async (req, res) => {
  const {
    tenant_id,
    project_id,
    node_id,
    month,
    year,
    data,
    user_id,
    form_id,
    project_name,
    project_category,
  } = req.body;

  if (!tenant_id || !project_id || !node_id || !month || !data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, node_id, month, data'
    );
  }

  const payload = {
    tenant_id,
    project_id,
    node_id,
    month,
    year: year || new Date(month).getFullYear(),
    data,
    user_id: user_id || req.user?.id,
    submitted_by: req.user?.id,
    submitted_at: new Date(),
    // Additional fields for form_submissions table
    form_id: form_id || project_id,
    project_name: project_name || 'PERM Project',
    project_category: project_category || 'perm',
    source: 'api',
  };

  const result = await permSubmissionService.submitPERMData(payload);

  res
    .status(result.action === 'created' ? httpStatus.CREATED : httpStatus.OK)
    .send({
      success: true,
      message:
        result.action === 'created'
          ? 'Submission created successfully'
          : 'Submission updated successfully',
      action: result.action,
      existed: result.existed,
      submission: result.submission,
      compliance: result.compliance,
      validation: result.validation,
    });
});

/**
 * Get submission by node and month
 * @route GET /v1/perm/submissions/:nodeId/:month
 * @access Private
 */
const getSubmission = catchAsync(async (req, res) => {
  const { nodeId, month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const result = await permSubmissionService.getPERMSubmission(
    tenant_id,
    project_id,
    nodeId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: result,
  });
});

/**
 * Get all submissions for a month
 * @route GET /v1/perm/submissions
 * @access Private
 */
const getSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const submissions = await permSubmissionService.getPERMSubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    count: submissions.length,
    data: submissions,
  });
});

/**
 * Lock submission (prevent further changes)
 * @route POST /v1/perm/submissions/:id/lock
 * @access Private (Admin/Owner)
 */
const lockSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user_id = req.user?.id;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await permSubmissionService.lockPERMSubmission(
    id,
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
 * Unlock submission (allow changes - admin only)
 * @route POST /v1/perm/submissions/:id/unlock
 * @access Private (Admin only)
 */
const unlockSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user_id = req.user?.id;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await permSubmissionService.unlockPERMSubmission(id, user_id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission unlocked successfully',
    data: result,
  });
});

/**
 * Validate submission data (dry-run, no save)
 * @route POST /v1/perm/submissions/validate
 * @access Private
 */
const validateData = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, data } = req.body;

  if (!tenant_id || !project_id || !month || !data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month, data'
    );
  }

  const result = await permSubmissionService.validatePERMSubmission({
    tenant_id,
    project_id,
    month,
    data,
  });

  res.status(httpStatus.OK).send({
    success: true,
    valid: result.isValid,
    errors: result.errors,
    warnings: result.warnings,
    message: result.isValid
      ? 'Validation passed'
      : `Validation failed with ${result.errors.length} error(s)`,
  });
});

/**
 * Get compliance summary for a project/month
 * @route GET /v1/perm/submissions/compliance/summary
 * @access Private
 */
const getComplianceSummary = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const summary = await permSubmissionService.getComplianceSummary(
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
 * Delete submission (soft delete)
 * @route DELETE /v1/perm/submissions/:id
 * @access Private (Admin/Owner)
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  // TODO: Implement soft delete in SubmissionModel
  throw new ApiError(
    httpStatus.NOT_IMPLEMENTED,
    'Delete functionality not yet implemented'
  );
});

module.exports = {
  submitData,
  getSubmission,
  getSubmissions,
  lockSubmission,
  unlockSubmission,
  validateData,
  getComplianceSummary,
  deleteSubmission,
};

 *
 * Handles HTTP requests for PERM submissions (upsert, get, lock, validate)
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { permSubmissionService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Submit PERM data (upsert with merge)
 * @route POST /v1/perm/submissions
 * @access Private
 */
const submitData = catchAsync(async (req, res) => {
  const {
    tenant_id,
    project_id,
    node_id,
    month,
    year,
    data,
    user_id,
    form_id,
    project_name,
    project_category,
  } = req.body;

  if (!tenant_id || !project_id || !node_id || !month || !data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, node_id, month, data'
    );
  }

  const payload = {
    tenant_id,
    project_id,
    node_id,
    month,
    year: year || new Date(month).getFullYear(),
    data,
    user_id: user_id || req.user?.id,
    submitted_by: req.user?.id,
    submitted_at: new Date(),
    // Additional fields for form_submissions table
    form_id: form_id || project_id,
    project_name: project_name || 'PERM Project',
    project_category: project_category || 'perm',
    source: 'api',
  };

  const result = await permSubmissionService.submitPERMData(payload);

  res
    .status(result.action === 'created' ? httpStatus.CREATED : httpStatus.OK)
    .send({
      success: true,
      message:
        result.action === 'created'
          ? 'Submission created successfully'
          : 'Submission updated successfully',
      action: result.action,
      existed: result.existed,
      submission: result.submission,
      compliance: result.compliance,
      validation: result.validation,
    });
});

/**
 * Get submission by node and month
 * @route GET /v1/perm/submissions/:nodeId/:month
 * @access Private
 */
const getSubmission = catchAsync(async (req, res) => {
  const { nodeId, month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const result = await permSubmissionService.getPERMSubmission(
    tenant_id,
    project_id,
    nodeId,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: result,
  });
});

/**
 * Get all submissions for a month
 * @route GET /v1/perm/submissions
 * @access Private
 */
const getSubmissions = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const submissions = await permSubmissionService.getPERMSubmissions(
    tenant_id,
    project_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    count: submissions.length,
    data: submissions,
  });
});

/**
 * Lock submission (prevent further changes)
 * @route POST /v1/perm/submissions/:id/lock
 * @access Private (Admin/Owner)
 */
const lockSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const user_id = req.user?.id;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await permSubmissionService.lockPERMSubmission(
    id,
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
 * Unlock submission (allow changes - admin only)
 * @route POST /v1/perm/submissions/:id/unlock
 * @access Private (Admin only)
 */
const unlockSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user_id = req.user?.id;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  const result = await permSubmissionService.unlockPERMSubmission(id, user_id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Submission unlocked successfully',
    data: result,
  });
});

/**
 * Validate submission data (dry-run, no save)
 * @route POST /v1/perm/submissions/validate
 * @access Private
 */
const validateData = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, data } = req.body;

  if (!tenant_id || !project_id || !month || !data) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month, data'
    );
  }

  const result = await permSubmissionService.validatePERMSubmission({
    tenant_id,
    project_id,
    month,
    data,
  });

  res.status(httpStatus.OK).send({
    success: true,
    valid: result.isValid,
    errors: result.errors,
    warnings: result.warnings,
    message: result.isValid
      ? 'Validation passed'
      : `Validation failed with ${result.errors.length} error(s)`,
  });
});

/**
 * Get compliance summary for a project/month
 * @route GET /v1/perm/submissions/compliance/summary
 * @access Private
 */
const getComplianceSummary = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  const summary = await permSubmissionService.getComplianceSummary(
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
 * Delete submission (soft delete)
 * @route DELETE /v1/perm/submissions/:id
 * @access Private (Admin/Owner)
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission ID is required');
  }

  // TODO: Implement soft delete in SubmissionModel
  throw new ApiError(
    httpStatus.NOT_IMPLEMENTED,
    'Delete functionality not yet implemented'
  );
});

module.exports = {
  submitData,
  getSubmission,
  getSubmissions,
  lockSubmission,
  unlockSubmission,
  validateData,
  getComplianceSummary,
  deleteSubmission,
};
