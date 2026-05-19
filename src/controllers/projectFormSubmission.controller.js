const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { projectFormSubmissionService, projectFormService } = require('../services');

/**
 * Create a new form submission
 */
const createSubmission = catchAsync(async (req, res) => {
  const { projectId, submissionData, submittedAt, metadata } = req.body;

  if (!projectId || !submissionData) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: projectId and submissionData'
    );
  }

  console.log('📝 [Form Submission Controller] Received submission:', {
    projectId,
    dataKeys: Object.keys(submissionData),
    submittedAt,
    hasMetadata: !!metadata,
  });

  // Extract tenant ID from the project
  const submission = await projectFormSubmissionService.createSubmission(
    {
      submissionData,
      submittedAt,
      metadata,
    },
    projectId,
    req.user?.tenantId || null, // May be null for anonymous submissions
    req.user?._id || null // May be null for anonymous submissions
  );

  res.status(httpStatus.CREATED).send({
    message: 'Form submitted successfully',
    submission,
    submissionId: submission.submissionId,
  });
});

/**
 * Create a new public form submission by canonical reference
 */
const createSubmissionByReference = catchAsync(async (req, res) => {
  const { reference } = req.params;
  const { submissionData, submittedAt, metadata } = req.body;

  if (!submissionData) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required field: submissionData'
    );
  }

  const resolved = await projectFormService.getPublicProjectFormByReference(
    reference
  );

  const requireToken = String(process.env.PUBLIC_FORM_REQUIRE_TOKEN || 'false')
    .toLowerCase() === 'true';
  if (requireToken) {
    const incomingToken =
      req.get('x-form-access-token') || req.query?.accessToken || null;
    const configuredToken = resolved?.projectForm?.publicAccessToken || null;

    if (!configuredToken || !incomingToken || incomingToken !== configuredToken) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid form access token');
    }
  }

  const submission = await projectFormSubmissionService.createSubmission(
    {
      submissionData,
      submittedAt,
      metadata,
    },
    resolved.projectForm.projectId,
    resolved.projectForm.tenantId,
    null
  );

  res.status(httpStatus.CREATED).send({
    message: 'Form submitted successfully',
    submission,
    submissionId: submission.submissionId,
    formReference: resolved.projectForm.formReference || null,
  });
});

/**
 * Get all submissions (with filtering)
 */
const getSubmissions = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    'projectId',
    'status',
    'submittedBy',
    'submittedAt',
  ]);

  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);

  // Apply tenant filter if user is authenticated
  if (req.user?.tenantId) {
    filter.tenantId = req.user.tenantId;
  }

  const result = await projectFormSubmissionService.querySubmissions(
    filter,
    options
  );

  res.send(result);
});

/**
 * Get submissions by project ID
 */
const getSubmissionsByProject = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const filter = pick(req.query, ['status', 'submittedBy', 'submittedAt']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);

  const result = await projectFormSubmissionService.getSubmissionsByProject(
    projectId,
    filter,
    options
  );

  res.send(result);
});

/**
 * Get submissions by tenant
 */

const getSubmissionsByTenant = catchAsync(async (req, res) => {
  const { tenantId } = req.params;

  const userTenantId = req.user?.tenantId;

  const canCrossTenant =
    req.user?.isSuper === true || req.user?.isSaby === true;

  if (!canCrossTenant && userTenantId !== tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,

      'Cannot access form submissions for another tenant'
    );
  }

  const filter = pick(req.query, [
    'projectId',
    'status',
    'submittedBy',
    'submittedAt',
  ]);

  const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
  console.log('We have hit the project submission stuffs . . . ')
  const result = await projectFormSubmissionService.getSubmissionsByTenant(
    tenantId,
    filter,
    options
  );

  console.log('Getting the result',result);

  res.send(result);
});




const getSubmissionBySubmissionId = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const options = pick(req.query, ['populate']);

  const submission =
    await projectFormSubmissionService.getSubmissionBySubmissionId(
      submissionId,
      options
    );

  res.send(submission);
});



/**
 * Get a submission by ID
 */
const getSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const options = pick(req.query, ['populate']);

  const submission = await projectFormSubmissionService.getSubmissionById(
    submissionId,
    options
  );

  res.send(submission);
});

/**
 * Update submission status
 */
const updateSubmissionStatus = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const { status, notes } = req.body;

  const submission = await projectFormSubmissionService.updateSubmissionStatus(
    submissionId,
    status,
    req.user._id,
    notes
  );

  res.send({
    message: 'Submission status updated successfully',
    submission,
  });
});

/**
 * Update submission payload and/or status
 */
const updateSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;
  const submission = await projectFormSubmissionService.updateSubmissionById(
    submissionId,
    req.body,
    req.user?._id || null
  );

  res.send({
    message: 'Submission updated successfully',
    submission,
  });
});

/**
 * Delete a submission (soft delete)
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const { submissionId } = req.params;

  await projectFormSubmissionService.deleteSubmissionById(submissionId);

  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Export submissions
 */
const exportSubmissions = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { format = 'csv' } = req.query;

  const result = await projectFormSubmissionService.exportSubmissions(
    projectId,
    format,
    req.user._id
  );

  res.send({
    message: 'Export completed successfully',
    downloadUrl: result.downloadUrl,
    format: result.format,
  });
});

/**
 * Get submission statistics
 */
const getSubmissionStats = catchAsync(async (req, res) => {
  const { projectId } = req.params;

  const stats = await projectFormSubmissionService.getSubmissionStats(
    projectId
  );

  res.send(stats);
});

module.exports = {
  createSubmission,
  createSubmissionByReference,
  getSubmissions,
  getSubmissionsByProject,
  getSubmissionsByTenant,
  getSubmission,
  updateSubmission,
  updateSubmissionStatus,
  deleteSubmission,
  exportSubmissions,
  getSubmissionStats,
  getSubmissionBySubmissionId,
};
