const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {
  queueSubmission,
  getActivityLogs: getActivityLogsService,
  getSubmissionById,
  getActivityLogSummary: getActivityLogSummaryService,
} = require('../services/submission.service');
const { postgresPool } = require('../config/postgres');
const { emitActivityUpdate } = require('../config/socket');

/**
 * Enqueue submission data for async processing
 * @route POST /v1/submissions
 */
const submitData = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: (req.user && req.user.tenantId) || req.body.tenantId,
    userId: req.user ? req.user._id : undefined,
    source: req.body.source || 'unknown',
  };

  // Include all required fields for the worker
  const submissionPayload = pick(req.body, [
    'projectId',
    'project_name',
    'project_category',
    'formId',
    'nodeId',
    'userId',
    'payload',
    'source',
    'meta',
    'status',
  ]);
  const submissionBody = {
    ...submissionPayload,
    tenantId: userInfo.tenantId,
    userId: userInfo.userId || submissionPayload.userId, // prefer user from auth, fallback to body
    source: userInfo.source,
  };

  if (
    !submissionBody.projectId ||
    !submissionBody.payload ||
    !submissionBody.tenantId ||
    !submissionBody.formId
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  const result = await queueSubmission(submissionBody);

  // Log activity: queued
  const activityLog = {
    tenant_id: submissionBody.tenantId,
    project_id: submissionBody.projectId,
    project_name: submissionBody.project_name,
    project_category: submissionBody.project_category,
    form_id: submissionBody.formId,
    user_id: submissionBody.userId,
    action: 'queued',
    status: 'queued',
    job_id: result.jobId,
    message: 'Submission queued for processing',
    created_at: new Date(),
  };

  await postgresPool.query(
    `INSERT INTO submission_activity_log (tenant_id, project_id, project_name, project_category, form_id, user_id, action, status, job_id, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      activityLog.tenant_id,
      activityLog.project_id,
      activityLog.project_name,
      activityLog.project_category,
      activityLog.form_id,
      activityLog.user_id,
      activityLog.action,
      activityLog.status,
      activityLog.job_id,
      activityLog.message,
    ]
  );

  // Emit real-time update
  emitActivityUpdate(submissionBody.tenantId, activityLog);

  res.status(httpStatus.ACCEPTED).send({
    message: 'Submission received and queued for processing.',
    jobId: result.jobId,
    status: result.status,
  });
});

/**
 * List/query submissions by tenant ID, form_id, node_id, user_id
 * @route GET /v1/submit-api
 */
const listSubmissions = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'form_id',
    'node_id',
    'user_id',
    'status',
    'source',
  ]);
  const submissions = await listSubmissions(filters);
  res.send({ results: submissions });
});

/**
 * Get a specific submission by ID
 * @route GET /v1/submit-api/:id
 */
const getSubmissionByIdHandler = catchAsync(async (req, res) => {
  const { id } = req.params;
  const submission = await getSubmissionById(id);
  res.send(submission);
});

/**
 * Delete all submissions by form_id
 * @route DELETE /v1/submit-api/:form_id
 */
const deleteSubmission = catchAsync(async (req, res) => {
  const { form_id } = req.params;
  await deleteSubmissionService(form_id);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Retry a failed submission by ID
 * @route POST /v1/submit-api/:id/retry
 */
const retrySubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await retrySubmissionService(id);
  res.send(result);
});

/**
 * Get activity logs for a specific submission or tenant
 * @route GET /v1/submitData/activity-log
 */
const getActivityLogs = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenantId',
    'projectId',
    'formId',
    'userId',
    'status',
    'search',
    'limit',
    'offset',
  ]);
  if (filters.limit) filters.limit = parseInt(filters.limit, 10);
  if (filters.offset) filters.offset = parseInt(filters.offset, 10);
  console.log('[Backend] Activity log request:', filters);
  const { results, total } = await getActivityLogsService(filters);
  res.send({ results, total });
});

/**
 * Get a summary of unique jobs and their latest status counts
 * @route GET /v1/submitData/activity-log/summary
 */
const getActivityLogSummary = catchAsync(async (req, res) => {
  const summary = await getActivityLogSummaryService();
  res.send(summary);
});

module.exports = {
  submitData,
  listSubmissions,
  getSubmissionById: getSubmissionByIdHandler,
  deleteSubmission,
  retrySubmission,
  getActivityLogs,
  getActivityLogSummary, // <-- add this export
};
