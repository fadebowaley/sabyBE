const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { submissionQueue } = require('../middlewares/queues');
const SubmissionModel = require('../models/submission.model');
const { postgresPool } = require('../config/postgres');

/**
 * Enqueue a new submission for async processing
 * @param {Object} submissionBody
 * @returns {Promise<{ jobId: string, status: string }>}
 */
const queueSubmission = async (submissionBody) => {
  if (
    !submissionBody ||
    typeof submissionBody !== 'object' ||
    !submissionBody.tenantId
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid submission payload');
  }

  // Accept form_id, node_id, user_id in submissionBody
  try {
    const job = await submissionQueue.add('submit:data', submissionBody, {
      jobId: `${submissionBody.tenantId}-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
    });

    logger.info(
      `📥 Submission enqueued - Job ID: ${job.id} | Tenant: ${submissionBody.tenantId}`
    );
    return { jobId: job.id, status: 'queued' };
  } catch (error) {
    logger.error('❌ Submission queue failed:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Submission queue failed'
    );
  }
};

/**
 * List/query submissions by tenant ID (and optional filters)
 */
const listSubmissions = async (filters = {}) =>
  // Accept form_id, node_id, user_id in filters
  SubmissionModel.getFilteredSubmissions(filters);
/**
 * Get a specific submission by ID
 */
const getSubmissionById = async (id) => {
  const submission = await SubmissionModel.getSubmissionById(id);
  if (!submission)
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  return submission;
};

/**
 * Delete a submission by ID
 */
const deleteSubmission = async (form_id) => {
  // Delete all submissions for a given form_id
  const deleted = await SubmissionModel.deleteSubmission(form_id);
  if (!deleted || deleted.length === 0)
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No submissions found for this form_id'
    );
  return deleted;
};

/**
 * Retry a failed submission by ID
 */
const retrySubmission = async (id) => {
  const submission = await SubmissionModel.getSubmissionById(id);
  if (!submission)
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  if (submission.status !== 'failed')
    throw new ApiError(httpStatus.BAD_REQUEST, 'Submission is not failed');
  // Re-queue the submission for processing, including form_id, node_id, user_id
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
  };
  const result = await queueSubmission(submissionBody);
  return { ...result, retriedSubmissionId: id };
};

/**
 * Fetch activity logs with optional filters and pagination
 * @param {Object} filters - { tenantId, projectId, formId, userId, limit, offset }
 * @returns {Promise<{results: Array, total: number}>}
 */
const getActivityLogs = async (filters = {}) => {
  const {
    tenantId,
    projectId,
    formId,
    userId,
    status,
    startDate,
    endDate,
    search,
    limit = 50,
    offset = 0,
  } = filters;
  const where = [];
  const values = [];
  let idx = 1;
  if (tenantId) {
    where.push(`tenant_id = $${idx++}`);
    values.push(tenantId);
  }
  if (projectId) {
    where.push(`project_id = $${idx++}`);
    values.push(projectId);
  }
  if (formId) {
    where.push(`form_id = $${idx++}`);
    values.push(formId);
  }
  if (userId) {
    where.push(`user_id = $${idx++}`);
    values.push(userId);
  }
  if (status) {
    // If status is explicitly set (including 'rejected'), show that status
    where.push(`status = $${idx++}`);
    values.push(status);
    // If status is 'rejected', also match action='rejected' for consistency
    if (status === 'rejected') {
      where.push(`action = $${idx++}`);
      values.push('rejected');
    }
  } else {
    // By default, exclude rejected entries - only show actual data submissions
    // This allows users to see queued, processing, success, failed entries
    where.push(`status != $${idx++}`);
    values.push('rejected');
    where.push(`action != $${idx++}`);
    values.push('rejected');
  }
  if (startDate) {
    where.push(`created_at >= $${idx++}`);
    values.push(startDate);
  }
  if (endDate) {
    where.push(`created_at <= $${idx++}`);
    values.push(endDate);
  }
  if (search) {
    where.push(`(job_id ILIKE $${idx} OR user_id ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // Paginated query - select all columns that exist in both local and remote databases
  const sql = `
    SELECT 
      id, tenant_id, project_id, project_name, project_category,
      form_id, node_id, user_id, action, status, job_id, message,
      created_at, source,
      user_name, user_email, user_phone,
      node_reference, node_name,
      form_reference
    FROM submission_activity_log 
    ${whereClause} 
    ORDER BY created_at DESC 
    LIMIT $${idx++} OFFSET $${idx}
  `;
  values.push(limit, offset);

  let rows;
  try {
    const result = await postgresPool.query(sql, values);
    rows = result.rows;
  } catch (error) {
    logger.error('[getActivityLogs] Database query error:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch activity logs'
    );
  }

  // Total count query (no limit/offset) - use same filters
  const countSql = `SELECT COUNT(*) FROM submission_activity_log ${whereClause}`;
  // For count query, we need to exclude limit and offset from values (last 2 values)
  const countValues = values.slice(0, -2);

  let countRows;
  try {
    const result = await postgresPool.query(countSql, countValues);
    countRows = result.rows;
  } catch (error) {
    logger.error('[getActivityLogs] Count query error:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to count activity logs'
    );
  }
  const total = parseInt(countRows[0].count, 10);

  return { results: rows, total };
};

/**
 * Get a summary of unique jobs and their latest status counts
 * @returns {Promise<{total_jobs: number, success: number, failed: number, queued: number, in_progress: number, rejected: number}>}
 */
const getActivityLogSummary = async () => {
  // Get the latest status for each job_id using a window function
  const sql = `
    SELECT job_id, status
    FROM (
      SELECT job_id, status,
             ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at DESC) as rn
      FROM submission_activity_log
    ) t
    WHERE rn = 1
  `;
  const { rows } = await postgresPool.query(sql);
  const summary = {
    total_jobs: 0,
    success: 0,
    failed: 0,
    queued: 0,
    in_progress: 0,
    rejected: 0,
  };
  summary.total_jobs = rows.length;
  for (const row of rows) {
    if (row.status === 'success') summary.success++;
    else if (row.status === 'failed') summary.failed++;
    else if (row.status === 'queued') summary.queued++;
    else if (row.status === 'in progress') summary.in_progress++;
    else if (row.status === 'rejected') summary.rejected++;
  }
  return summary;
};

/**
 * Get enhanced activity logs with user names, node codes, and form references
 * @param {Object} filters - Query filters
 * @returns {Promise<{results: Array, total: number}>}
 */
const getEnhancedActivityLogs = async (filters = {}) => {
  // 1. Get base activity logs
  const { results: logs, total } = await getActivityLogs(filters);
  
  if (logs.length === 0) {
    return { results: [], total: 0 };
  }
  
  // 2. Extract unique IDs (clean quotes from user_id if present)
  const userIds = [...new Set(logs.map(l => {
    if (!l.user_id) return null;
    // Remove quotes if present
    return l.user_id.replace(/^"|"$/g, '');
  }).filter(Boolean))];
  const nodeIds = [...new Set(logs.map(l => l.node_id).filter(Boolean))];
  const projectIds = [...new Set(logs.map(l => l.project_id).filter(Boolean))];
  
  console.log('🔍 [Enhanced Logs] User IDs to lookup:', userIds);
  console.log('🔍 [Enhanced Logs] Project IDs to lookup:', projectIds);
  console.log('🔍 [Enhanced Logs] Node IDs to lookup:', nodeIds);
  
  // 3. Fetch user data from MongoDB (using _id, not userId)
  const User = require('../models/user.model');
  const mongoose = require('mongoose');
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id userId firstname lastname email phoneNumber')
    .lean();
  console.log('👥 [Enhanced Logs] Found', users.length, 'users');
  const userMap = users.reduce((acc, u) => {
    // Map by _id (which is what's stored in activity log as user_id)
    const key = u._id.toString();
    acc[key] = {
      name: `${u.firstname} ${u.lastname}`.trim() || 'Unknown User',
      firstname: u.firstname,
      lastname: u.lastname,
      email: u.email,
      phone: u.phoneNumber,
      userId: u.userId,
    };
    return acc;
  }, {});
  console.log('👥 [Enhanced Logs] User map keys:', Object.keys(userMap));
  
  // 4. Fetch node data from MongoDB  
  let nodeMap = {};
  if (nodeIds.length > 0) {
    const Node = require('../models/node.model');
    const nodes = await Node.find({ _id: { $in: nodeIds } })
      .select('_id nodeId name city')
      .lean();
    console.log('🏢 [Enhanced Logs] Found', nodes.length, 'nodes');
    nodeMap = nodes.reduce((acc, n) => {
      // Map by _id (which is what's stored in activity log as node_id)
      const key = n._id.toString();
      acc[key] = {
        reference: n.nodeId,
        name: n.name,
        city: n.city,
      };
      return acc;
    }, {});
    console.log('🏢 [Enhanced Logs] Node map keys:', Object.keys(nodeMap));
  }
  
  // 5. Fetch form references from MongoDB
  const ProjectForm = require('../models/projectForm.model');
  const forms = await ProjectForm.find({ projectId: { $in: projectIds } })
    .select('projectId formReference')
    .lean();
  console.log('📝 [Enhanced Logs] Found', forms.length, 'forms');
  const formMap = forms.reduce((acc, f) => {
    acc[f.projectId] = f.formReference;
    return acc;
  }, {});
  console.log('📝 [Enhanced Logs] Form map:', formMap);
  
  // 6. Enhance logs with joined data
  const enhancedLogs = logs.map(log => {
    // Clean user_id for lookup (remove quotes if present)
    const cleanUserId = log.user_id ? log.user_id.replace(/^"|"$/g, '') : null;
    
    return {
      ...log,
      // User data
      user_name: userMap[cleanUserId]?.name || 'Unknown User',
      user_firstname: userMap[cleanUserId]?.firstname,
      user_lastname: userMap[cleanUserId]?.lastname,
      user_email: userMap[cleanUserId]?.email,
      user_phone: userMap[cleanUserId]?.phone,
      // Node data
      node_reference: nodeMap[log.node_id]?.reference,
      node_name: nodeMap[log.node_id]?.name,
      node_city: nodeMap[log.node_id]?.city,
      // Form data
      form_reference: formMap[log.project_id],
    };
  });
  
  console.log('✅ [Enhanced Logs] Returning', enhancedLogs.length, 'enhanced logs');
  console.log('📊 [Enhanced Logs] Sample:', enhancedLogs[0]);
  
  return { results: enhancedLogs, total };
};

module.exports = {
  queueSubmission,
  listSubmissions,
  getSubmissionById,
  deleteSubmission,
  retrySubmission,
  getActivityLogs,
  getActivityLogSummary,
  getEnhancedActivityLogs,
};
