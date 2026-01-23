const mongoose = require('mongoose');
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
  getEnhancedActivityLogs: getEnhancedActivityLogsService,
} = require('../services/submission.service');
const { logActivity } = require('../utils/activityLogger');
const SubmissionModel = require('../models/submission.model');
const ActivityLogModel = require('../models/activityLog.model');
const ProjectForm = require('../models/projectForm.model');
const { eventCalendarService } = require('../services');
const Nodes = require('../models/node.model');
const { postgresPool } = require('../config/postgres');

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

  // Extract all fields (regular + PERM + Submitter Blueprint)
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
    // Submitter Blueprint
    'user_name',
    'user_email',
    'user_phone',
    'node_name',
    'node_reference',
    'form_reference',
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

  // Log activity with submitter blueprint
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
    source: submissionBody.source,
    // Submitter Blueprint (from submission payload)
    user_name: submissionBody.user_name,
    user_email: submissionBody.user_email,
    user_phone: submissionBody.user_phone,
    node_name: submissionBody.node_name,
    node_reference: submissionBody.node_reference,
    form_reference: submissionBody.form_reference,
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


function formatFieldLabel(key = '') {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildStructuredPayload(rawStructured) {
  if (!rawStructured || typeof rawStructured !== 'object') {
    return { fields: [], flat: {} };
  }

  const entries = Object.entries(rawStructured).map(([key, detail]) => {
    const base = {
      key,
      label: formatFieldLabel(key),
      type: Array.isArray(detail) ? 'array' : typeof detail,
      value: detail,
      elementId: null,
      meta: {},
    };

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      const {
        value,
        label,
        type,
        elementId,
        step,
        options,
        description,
        ...rest
      } = detail;

      base.label = label || base.label;
      base.type = type || base.type;
      base.value = value !== undefined ? value : detail;
      base.elementId = elementId || null;
      base.meta = {
        step: typeof step === 'number' ? step : undefined,
        options,
        description,
        raw: detail,
        ...rest,
      };
    }

    return base;
  });

  entries.sort((a, b) => {
    const stepA = a.meta?.step ?? Number.MAX_SAFE_INTEGER;
    const stepB = b.meta?.step ?? Number.MAX_SAFE_INTEGER;
    if (stepA === stepB) {
      return a.label.localeCompare(b.label);
    }
    return stepA - stepB;
  });

  const flat = entries.reduce((acc, entry) => {
    acc[entry.key] = entry.value;
    return acc;
  }, {});

  return { fields: entries, flat };
}

async function resolveNodeMetadata(submissions = []) {
  const nodeIds = submissions
    .map((submission) => submission.node_id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  if (nodeIds.length === 0) {
    return new Map();
  }
  const uniqueIds = [...new Set(nodeIds)];
  const visited = new Set();
  const nodeMap = new Map();
  const queue = uniqueIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const pendingSet = new Set(queue);

  while (queue.length) {
    const batchIds = queue.splice(0, 50);
    const objectIds = batchIds.map((id) => new mongoose.Types.ObjectId(id));
    // eslint-disable-next-line no-await-in-loop
    const documents = await Nodes.find({ _id: { $in: objectIds } })
      .populate('level', 'name')
      .populate('structure', 'name')
      .lean({ virtuals: false });

    documents.forEach((doc) => {
      const docId = doc._id.toString();
      if (!nodeMap.has(docId)) {
        nodeMap.set(docId, doc);
      }
    });

    documents.forEach((doc) => {
      const identity = Array.isArray(doc.identity) ? doc.identity : [];
      identity.forEach((parent) => {
        const parentId = parent.toString();
        if (
          mongoose.Types.ObjectId.isValid(parentId) &&
          !visited.has(parentId) &&
          !nodeMap.has(parentId) &&
          !pendingSet.has(parentId)
        ) {
          queue.push(parentId);
          pendingSet.add(parentId);
        }
      });
    });

    batchIds.forEach((id) => {
      visited.add(id);
      pendingSet.delete(id);
    });
  }

  return nodeMap;
}

function buildNodeHierarchyPayload(nodeDoc, nodeMap) {
  if (!nodeDoc) {
    return null;
  }

  const hierarchyEntries = nodeDoc.hierarchy || {};
  const chainIds = [
    ...(Array.isArray(nodeDoc.identity)
      ? nodeDoc.identity.map((id) => id.toString())
      : []),
    nodeDoc._id.toString(),
  ];

  const breadcrumbs = chainIds
    .map((id) => {
      const doc = nodeMap.get(id);
      if (!doc) {
        return null;
      }
      return {
        id: doc._id.toString(),
        nodeId: doc.nodeId,
        name: doc.name,
        level: doc.level && doc.level.name ? doc.level.name : null,
      };
    })
    .filter(Boolean);

  const hierarchyLabels = Object.entries(hierarchyEntries).reduce(
    (acc, [levelKey, value]) => {
      const key = value?.toString ? value.toString() : String(value);
      const doc = nodeMap.get(key);
      if (doc) {
        acc[levelKey] = {
          id: doc._id.toString(),
          nodeId: doc.nodeId,
          name: doc.name,
          level: doc.level && doc.level.name ? doc.level.name : null,
        };
      }
      return acc;
    },
    {}
  );

  return {
    id: nodeDoc._id.toString(),
    nodeId: nodeDoc.nodeId,
    name: nodeDoc.name,
    level: nodeDoc.level && nodeDoc.level.name ? nodeDoc.level.name : null,
    structure:
      nodeDoc.structure && nodeDoc.structure.name
        ? nodeDoc.structure.name
        : null,
    isMain: !!nodeDoc.isMain,
    path: nodeDoc.path,
    hierarchy: hierarchyEntries,
    hierarchyLabels,
    breadcrumbs,
  };
}

function decorateSubmissionWithStructuredData(submission, nodeMap) {
  const structuredSource =
    submission?.data?.structured || submission?.payload?.structured || null;
  let { fields, flat } = buildStructuredPayload(structuredSource);

  if (
    fields.length === 0 &&
    submission?.data &&
    typeof submission.data === 'object'
  ) {
    const fallback = { ...submission.data };
    delete fallback.structured;
    const payload = buildStructuredPayload(fallback);
    if (payload.fields.length) {
      fields = payload.fields;
      flat = payload.flat;
    }
  }

  const nodeDoc = submission.node_id ? nodeMap.get(submission.node_id) : null;

  return {
    ...submission,
    structured_fields: fields,
    structured_flat: flat,
    node_hierarchy: buildNodeHierarchyPayload(nodeDoc, nodeMap),
  };
}

function buildSubmissionSummary(submissions = []) {
  const numericTotals = {};
  const booleanBreakdown = {};
  let latestTimestamp = null;

  submissions.forEach((submission) => {
    const flat = submission.structured_flat || {};
    Object.entries(flat).forEach(([key, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        numericTotals[key] = (numericTotals[key] || 0) + value;
      } else if (typeof value === 'boolean') {
        if (!booleanBreakdown[key]) {
          booleanBreakdown[key] = { true: 0, false: 0 };
        }
        booleanBreakdown[key][value ? 'true' : 'false'] += 1;
      }
    });

    const createdAt = submission.created_at || submission.createdAt;
    if (createdAt) {
      const timestamp = new Date(createdAt);
      if (!Number.isNaN(timestamp.getTime())) {
        if (!latestTimestamp || timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
        }
      }
    }
  });

  return {
    total_submissions: submissions.length,
    numeric_totals: numericTotals,
    boolean_breakdown: booleanBreakdown,
    latest_submission_at: latestTimestamp
      ? latestTimestamp.toISOString()
      : null,
  };
}
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

  // Debug: Log first result to see what fields we're returning
  if (results.length > 0) {
    logger.debug('[ActivityLogs] Returning sample activity log payload', {
      sample: results[0],
      total,
    });
  }

  // Set cache-control headers to prevent browser caching
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });

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
 * Get enhanced activity logs with user names, node codes, and form references
 * @route GET /v1/submissions/activity-log/enhanced
 */
const getEnhancedActivityLogs = catchAsync(async (req, res) => {
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

  const { results, total } = await getEnhancedActivityLogsService(filters);

  res.send({
    success: true,
    results,
    total,
    limit: filters.limit || 50,
    offset: filters.offset || 0,
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
    'start_date',
    'end_date',
    'search',
    'limit',
    'offset',
    'include_payload',
  ]);

  if (!filters.tenant_id && req.user?.tenantId) {
    filters.tenant_id = req.user.tenantId;
  }

  if (filters.limit) {
    filters.limit = parseInt(filters.limit, 10);
  }
  if (filters.offset) {
    filters.offset = parseInt(filters.offset, 10);
  }

  logger.info('[listSubmissions] Fetching submissions', {
    filters,
    userTenant: req.user?.tenantId,
  });

  const submissions = await listSubmissionsService(filters);

  logger.info(`[listSubmissions] Retrieved ${submissions.length} submissions`);

  const nodeMetadata = await resolveNodeMetadata(submissions);
  const enrichedSubmissions = submissions.map((submission) =>
    decorateSubmissionWithStructuredData(submission, nodeMetadata)
  );
  const summary = buildSubmissionSummary(enrichedSubmissions);

  res.send({
    success: true,
    results: enrichedSubmissions,
    count: enrichedSubmissions.length,
    summary,
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

/**
 * Bulk delete submissions and activity logs by job IDs
 * @route POST /v1/submissions/bulk-delete-by-jobs
 */
const bulkDeleteByJobIds = catchAsync(async (req, res) => {
  const { jobIds } = req.body;

  if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Job IDs array is required');
  }

  // Delete from form_submissions
  const submissionsResult = await postgresPool.query(
    'DELETE FROM form_submissions WHERE job_id = ANY($1) RETURNING id',
    [jobIds]
  );

  // Delete from activity logs
  const logsResult = await postgresPool.query(
    'DELETE FROM submission_activity_log WHERE job_id = ANY($1) RETURNING id',
    [jobIds]
  );

  logger.info(
    `🗑️ Bulk delete: ${submissionsResult.rowCount} submissions, ${logsResult.rowCount} activity logs`
  );

  res.send({
    success: true,
    deleted: {
      submissions: submissionsResult.rowCount,
      activityLogs: logsResult.rowCount,
    },
  });
});

/**
 * Clean up test data (for test bed simulator)
 * @route DELETE /v1/submissions/cleanup-test-data
 */
const cleanupTestData = catchAsync(async (req, res) => {
  const {
    tenantId,
    source,
    projectId,
    deleteFormData = true,
    deleteCalendar = false,
  } = req.body;

  if (!tenantId || !source) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and source required');
  }

  if (!source.startsWith('test-') && !source.startsWith('saby-simulator')) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Can only cleanup test data (source must start with test- or saby-simulator)'
    );
  }

  const deletedCounts = { submissions: 0, activityLogs: 0, calendars: 0 };

  const conditions = [];
  const values = [];
  let idx = 1;

  conditions.push(`tenant_id = $${idx}`);
  values.push(tenantId);
  idx += 1;

  conditions.push(`source = $${idx}`);
  values.push(source);
  idx += 1;

  if (projectId) {
    conditions.push(`project_id = $${idx}`);
    values.push(projectId);
    idx += 1;
  }

  const whereClause = conditions.join(' AND ');

  // Delete form submissions
  if (deleteFormData) {
    const submissionsResult = await postgresPool.query(
      `DELETE FROM form_submissions WHERE ${whereClause} RETURNING id`,
      values
    );
    deletedCounts.submissions = submissionsResult.rowCount;
  }

  // Delete activity logs
  const logsResult = await postgresPool.query(
    `DELETE FROM submission_activity_log WHERE ${whereClause} RETURNING id`,
    values
  );
  deletedCounts.activityLogs = logsResult.rowCount;

  // Delete calendars if requested
  if (deleteCalendar && projectId) {
    const calResult = await postgresPool.query(
      'DELETE FROM event_calendar WHERE project_id = $1 RETURNING id',
      [projectId]
    );
    deletedCounts.calendars = calResult.rowCount;
  }

  logger.info(`🗑️ Test data cleanup: ${JSON.stringify(deletedCounts)}`);

  res.send({
    success: true,
    message: 'Test data cleaned successfully',
    deleted: deletedCounts,
  });
});



module.exports = {
  submitData,
  retrySubmission,
  getActivityLogs,
  getActivityLogSummary,
  getEnhancedActivityLogs,
  listSubmissions,
  getSubmission,
  updateSubmission,
  deleteSubmission,
  bulkDeleteByJobIds,
  cleanupTestData,
  // Enhanced activity log endpoints
  getActivityLogsByUser,
  getActivityLogsByAction,
  getActivityLogsByJobId,
  getRecentActivityLogs,
  updateActivityLogStatus,
  deleteActivityLog,
  bulkDeleteActivityLogs,
};
