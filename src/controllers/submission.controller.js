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

  // Log activity: queued (include node_id for per-node tracking)
  const activityLog = {
    tenant_id: submissionBody.tenantId,
    project_id: submissionBody.projectId,
    project_name: submissionBody.project_name,
    project_category: submissionBody.project_category,
    form_id: submissionBody.formId,
    node_id: submissionBody.nodeId ?? null,
    user_id: submissionBody.userId,
    action: 'queued',
    status: 'queued',
    job_id: result.jobId,
    message: 'Submission queued for processing',
    created_at: new Date(),
  };

  await postgresPool.query(
    `INSERT INTO submission_activity_log (tenant_id, project_id, project_name, project_category, form_id, node_id, user_id, action, status, job_id, message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      activityLog.tenant_id,
      activityLog.project_id,
      activityLog.project_name,
      activityLog.project_category,
      activityLog.form_id,
      activityLog.node_id,
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

/**
 * Clean up test submissions (for test bed simulator)
 * @route DELETE /v1/submissions/cleanup-test-data
 */
const cleanupTestData = catchAsync(async (req, res) => {
  const { tenantId, source, projectId } = req.body;

  // Validate required fields
  if (!tenantId || !source) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and source required');
  }

  // Security: Only allow cleanup of test data
  if (!source.startsWith('test-') && !source.startsWith('saby-simulator')) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Can only cleanup test data (source must start with test- or saby-simulator)'
    );
  }

  // Build where clauses
  const conditions = [];
  const values = [];
  let idx = 1;

  conditions.push(`tenant_id = $${idx++}`);
  values.push(tenantId);

  conditions.push(`source = $${idx++}`);
  values.push(source);

  if (projectId) {
    conditions.push(`project_id = $${idx++}`);
    values.push(projectId);
  }

  const whereClause = conditions.join(' AND ');

  // Delete from form_submissions
  const submissionsDeleted = await postgresPool.query(
    `DELETE FROM form_submissions WHERE ${whereClause} RETURNING id`,
    values
  );

  // Delete from activity log
  const activityDeleted = await postgresPool.query(
    `DELETE FROM submission_activity_log WHERE ${whereClause}`,
    values
  );

  // Delete from DLQ (if any test submissions ended up there)
  // Note: DLQ stores job_data as JSONB, so we need to query the source from within it
  const dlqQuery = `
    DELETE FROM dead_letter_queue 
    WHERE tenant_id = $1 
      AND job_data->>'source' = $2
      ${projectId ? 'AND project_id = $' + values.length : ''}
  `;
  const dlqDeleted = await postgresPool.query(
    dlqQuery,
    projectId ? values : [tenantId, source]
  );

  res.send({
    message: 'Test data cleaned successfully',
    deleted: {
      submissions: submissionsDeleted.rowCount,
      activityLogs: activityDeleted.rowCount,
      dlq: dlqDeleted.rowCount,
      total: submissionsDeleted.rowCount + activityDeleted.rowCount + dlqDeleted.rowCount,
    },
    filters: {
      tenantId,
      source,
      projectId: projectId || 'all',
    },
  });
});

module.exports = {
  submitData,
  listSubmissions,
  getSubmissionById: getSubmissionByIdHandler,
  deleteSubmission,
  retrySubmission,
  getActivityLogs,
  getActivityLogSummary,
  cleanupTestData,
};
