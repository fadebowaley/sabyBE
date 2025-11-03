const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const {
  queueSubmission,
  getActivityLogs: getActivityLogsService,
  getActivityLogSummary: getActivityLogSummaryService,
  listSubmissions: listSubmissionsService,
} = require('../services/submission.service');
const { logActivity } = require('../utils/activityLogger');
const SubmissionModel = require('../models/submission.model');
const ActivityLogModel = require('../models/activityLog.model');
const dynamicFormSchemaService = require('../ingestion/whatsapp/services/dynamicFormSchema.service');
const dynamicValidationService = require('../ingestion/whatsapp/services/dynamicValidation.service');
const ProjectForm = require('../models/projectForm.model');
const { eventCalendarService } = require('../services');

/**
 * Universal submission endpoint - handles ALL submission types
 * Automatically detects PERM vs regular submissions
 * @route POST /v1/submissions
 */
const submitData = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: (req.user && req.user.tenantId) || req.body.tenantId,
    userId: req.user ? req.user._id : undefined,
    source: req.body.source || 'api',
  };

  // Extract all fields (regular + PERM)
  const submissionBody = pick(req.body, [
    'tenantId',
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
    'month', // PERM field
    'year', // PERM field
    'perm_enabled', // PERM field
  ]);

  // Merge with user info
  submissionBody.tenantId = userInfo.tenantId;
  submissionBody.userId = userInfo.userId || submissionBody.userId;
  submissionBody.source = submissionBody.source || userInfo.source;

  // Validate required fields
  if (
    !submissionBody.tenantId ||
    !submissionBody.projectId ||
    !submissionBody.formId ||
    !submissionBody.payload
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenantId, projectId, formId, payload'
    );
  }

  // ✨ NEW: Fetch form to check PERM settings
  const form = await ProjectForm.findOne({
    projectId: submissionBody.projectId,
  }).select('permSettings formId projectId');

  if (!form) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Form not found');
  }

  // Auto-detect PERM submission (now also checks form settings)
  const isPERM =
    form.permSettings?.enabled ||
    submissionBody.perm_enabled ||
    submissionBody.month ||
    (submissionBody.payload && submissionBody.payload.month);

  if (isPERM) {
    submissionBody.perm_enabled = true; // Ensure flag is set

    // ✨ NEW: Validate based on form's PERM settings
    if (form.permSettings?.requireNodeId && !submissionBody.nodeId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'nodeId is required for this PERM-enabled form'
      );
    }

    if (form.permSettings?.requireMonth && !submissionBody.month) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'month is required for this PERM-enabled form'
      );
    }

    // ✨ NEW: Check if calendar is required
    if (form.permSettings?.calendarRequired && submissionBody.month) {
      try {
        const calendar = await eventCalendarService.getCalendar(
          submissionBody.tenantId,
          submissionBody.projectId,
          submissionBody.month
        );

        if (!calendar || calendar.length === 0) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'Calendar template must be created before submissions. Please contact your administrator.'
          );
        }
      } catch (error) {
        // If calendar check fails, log warning but don't fail submission
        // (calendar might be optional for some tracking modes)
        if (error.statusCode === httpStatus.BAD_REQUEST) {
          throw error;
        }
        // Log other errors but continue
        // eslint-disable-next-line no-console
        console.warn('Calendar check warning:', error.message);
      }
    }

    // Legacy validation (keep for backward compatibility)
    if (!submissionBody.nodeId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'nodeId is required for PERM submissions'
      );
    }

    if (!submissionBody.month) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'month is required for PERM submissions'
      );
    }
  }

  // Queue submission (worker handles routing)
  const result = await queueSubmission(submissionBody);

  // Log activity
  await logActivity({
    tenant_id: submissionBody.tenantId,
    project_id: submissionBody.projectId,
    project_name: submissionBody.project_name,
    project_category: submissionBody.project_category,
    form_id: submissionBody.formId,
    node_id: submissionBody.nodeId,
    user_id: submissionBody.userId,
    action: 'queued',
    status: 'queued',
    job_id: result.jobId,
    message: isPERM
      ? `PERM submission queued for ${submissionBody.month}`
      : 'Submission queued for processing',
  });

  // Return unified response
  res.status(httpStatus.ACCEPTED).send({
    success: true,
    message: 'Submission queued for processing',
    jobId: result.jobId,
    status: result.status,
    type: isPERM ? 'perm' : 'regular',
    ...(isPERM && {
      month: submissionBody.month,
      nodeId: submissionBody.nodeId,
    }),
  });
});

/**
 * Retry a failed submission
 * @route POST /v1/submissions/:id/retry
 */
const retrySubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const submission = await SubmissionModel.getSubmissionById(id);

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  if (submission.status !== 'failed') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only failed submissions can be retried'
    );
  }

  // Re-queue with all original data
  const submissionBody = {
    tenantId: submission.tenant_id,
    projectId: submission.project_id,
    project_name: submission.project_name,
    project_category: submission.project_category,
    formId: submission.form_id,
    nodeId: submission.node_id,
    userId: submission.user_id,
    payload: submission.data,
    source: submission.source,
    perm_enabled: submission.perm_enabled,
    month: submission.month,
    year: submission.year,
  };

  const result = await queueSubmission(submissionBody);

  // Log retry activity
  await logActivity({
    tenant_id: submission.tenant_id,
    project_id: submission.project_id,
    project_name: submission.project_name,
    project_category: submission.project_category,
    form_id: submission.form_id,
    node_id: submission.node_id,
    user_id: submission.user_id,
    action: 'retried',
    status: 'queued',
    job_id: result.jobId,
    message: `Retrying failed submission ${id}`,
  });

  res.send({
    success: true,
    message: 'Submission retried successfully',
    jobId: result.jobId,
    retriedSubmissionId: id,
  });
});

/**
 * Get activity logs with filtering
 * @route GET /v1/submissions/activity-log
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

  const { results, total } = await getActivityLogsService(filters);

  res.send({
    success: true,
    results,
    total,
    limit: filters.limit || 50,
    offset: filters.offset || 0,
  });
});

/**
 * Get activity log summary
 * @route GET /v1/submissions/activity-log/summary
 */
const getActivityLogSummary = catchAsync(async (req, res) => {
  const summary = await getActivityLogSummaryService();

  res.send({
    success: true,
    summary,
  });
});

/**
 * List submissions with filtering
 * @route GET /v1/submissions
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
    'perm_enabled',
    'month',
  ]);

  // 🔧 FIX: Auto-add tenant_id from authenticated user if not provided
  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
    logger.info(
      `[listSubmissions] Auto-added tenant_id from user: ${req.user.tenantId}`
    );
  }

  logger.info(`[listSubmissions] Fetching submissions with filters:`, {
    filters,
    user_tenantId: req.user?.tenantId,
    has_user: !!req.user,
  });

  const submissions = await listSubmissionsService(filters);

  logger.info(`[listSubmissions] Returning ${submissions.length} submissions`);

  res.send({
    success: true,
    results: submissions,
    count: submissions.length,
  });
});

/**
 * Get submission by ID
 * @route GET /v1/submissions/:id
 */
const getSubmission = catchAsync(async (req, res) => {
  const { id } = req.params;
  const submission = await SubmissionModel.getSubmissionById(id);

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  res.send({
    success: true,
    submission,
  });
});

/**
 * Get activity logs by user
 * @route GET /v1/submissions/activity-log/user/:user_id
 */
const getActivityLogsByUser = catchAsync(async (req, res) => {
  const { user_id } = req.params;
  const { tenant_id, limit, offset } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const logs = await ActivityLogModel.getActivityLogsByUser(
    user_id,
    tenant_id,
    parseInt(limit, 10) || 100,
    parseInt(offset, 10) || 0
  );

  const count = await ActivityLogModel.getActivityLogsCount({
    tenant_id,
    user_id,
  });

  res.send({
    success: true,
    data: logs,
    count,
    total: count,
  });
});

/**
 * Get activity logs by action
 * @route GET /v1/submissions/activity-log/action/:action
 */
const getActivityLogsByAction = catchAsync(async (req, res) => {
  const { action } = req.params;
  const { tenant_id, limit, offset } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const logs = await ActivityLogModel.getActivityLogsByAction(
    action,
    tenant_id,
    parseInt(limit, 10) || 100,
    parseInt(offset, 10) || 0
  );

  const count = await ActivityLogModel.getActivityLogsCount({
    tenant_id,
    action,
  });

  res.send({
    success: true,
    data: logs,
    count,
    total: count,
  });
});

/**
 * Get activity logs by job ID
 * @route GET /v1/submissions/activity-log/job/:job_id
 */
const getActivityLogsByJobId = catchAsync(async (req, res) => {
  const { job_id } = req.params;

  const logs = await ActivityLogModel.getActivityLogsByJobId(job_id);

  res.send({
    success: true,
    data: logs,
    count: logs.length,
  });
});

/**
 * Get recent activity logs
 * @route GET /v1/submissions/activity-log/recent
 */
const getRecentActivityLogs = catchAsync(async (req, res) => {
  const { tenant_id, limit } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const logs = await ActivityLogModel.getRecentActivityLogs(
    tenant_id,
    parseInt(limit, 10) || 50
  );

  res.send({
    success: true,
    data: logs,
    count: logs.length,
  });
});

/**
 * Update activity log status
 * @route PATCH /v1/submissions/activity-log/:id
 */
const updateActivityLogStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, message } = req.body;

  if (!status) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'status is required',
    });
  }

  const log = await ActivityLogModel.updateActivityLogStatus(
    id,
    status,
    message
  );

  if (!log) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Activity log not found',
    });
  }

  res.send({
    success: true,
    message: 'Activity log updated',
    data: log,
  });
});

/**
 * Delete activity log
 * @route DELETE /v1/submissions/activity-log/:id
 */
const deleteActivityLog = catchAsync(async (req, res) => {
  const { id } = req.params;

  const log = await ActivityLogModel.deleteActivityLog(id);

  if (!log) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Activity log not found',
    });
  }

  res.send({
    success: true,
    message: 'Activity log deleted',
    data: log,
  });
});

/**
 * Bulk delete activity logs
 * @route POST /v1/submissions/activity-log/bulk-delete
 */
const bulkDeleteActivityLogs = catchAsync(async (req, res) => {
  const filters = pick(req.body, [
    'tenant_id',
    'project_id',
    'older_than_days',
    'status',
  ]);

  if (!filters.tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const deletedCount = await ActivityLogModel.bulkDeleteActivityLogs(filters);

  res.send({
    success: true,
    message: `Deleted ${deletedCount} activity logs`,
    deleted: deletedCount,
  });
});

/**
 * Update submission
 */
const updateSubmission = catchAsync(async (req, res) => {
  const submission = await SubmissionModel.updateSubmissionById(
    req.params.id,
    req.body
  );
  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }
  res.send(submission);
});

/**
 * Delete submission
 */
const deleteSubmission = catchAsync(async (req, res) => {
  await SubmissionModel.deleteSubmissionById(req.params.id);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  submitData,
  retrySubmission,
  getActivityLogs,
  getActivityLogSummary,
  listSubmissions,
  getSubmission,
  updateSubmission,
  deleteSubmission,
  // Enhanced activity log endpoints
  getActivityLogsByUser,
  getActivityLogsByAction,
  getActivityLogsByJobId,
  getRecentActivityLogs,
  updateActivityLogStatus,
  deleteActivityLog,
  bulkDeleteActivityLogs,
};
