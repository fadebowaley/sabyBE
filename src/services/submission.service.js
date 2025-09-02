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
  if (!submissionBody || typeof submissionBody !== 'object' || !submissionBody.tenantId) {
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

    logger.info(`📥 Submission enqueued - Job ID: ${job.id} | Tenant: ${submissionBody.tenantId}`);
    return { jobId: job.id, status: 'queued' };
  } catch (error) {
    logger.error('❌ Submission queue failed:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Submission queue failed');
  }
};

/**
 * List/query submissions by tenant ID (and optional filters)
 */
const listSubmissions = async (filters = {}) => {
  // Accept form_id, node_id, user_id in filters
  return SubmissionModel.getFilteredSubmissions(filters);
};

/**
 * Get a specific submission by ID
 */
const getSubmissionById = async (id) => {
  const submission = await SubmissionModel.getSubmissionById(id);
  if (!submission) throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  return submission;
};

/**
 * Delete a submission by ID
 */
const deleteSubmission = async (form_id) => {
  // Delete all submissions for a given form_id
  const deleted = await SubmissionModel.deleteSubmission(form_id);
  if (!deleted || deleted.length === 0) throw new ApiError(httpStatus.NOT_FOUND, 'No submissions found for this form_id');
  return deleted;
};

/**
 * Retry a failed submission by ID
 */
const retrySubmission = async (id) => {
  const submission = await SubmissionModel.getSubmissionById(id);
  if (!submission) throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  if (submission.status !== 'failed') throw new ApiError(httpStatus.BAD_REQUEST, 'Submission is not failed');
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
  const { tenantId, projectId, formId, userId, status, startDate, endDate, search, limit = 50, offset = 0 } = filters;
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
    where.push(`status = $${idx++}`);
    values.push(status);
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
  // Paginated query
  const sql = `SELECT * FROM submission_activity_log ${whereClause} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
  values.push(limit, offset);
  const { rows } = await postgresPool.query(sql, values);

  // Total count query (no limit/offset)
  const countSql = `SELECT COUNT(*) FROM submission_activity_log ${whereClause}`;
  const { rows: countRows } = await postgresPool.query(countSql, values.slice(0, idx - 2));
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
  const summary = { total_jobs: 0, success: 0, failed: 0, queued: 0, in_progress: 0, rejected: 0 };
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

module.exports = {
  queueSubmission,
  listSubmissions,
  getSubmissionById,
  deleteSubmission,
  retrySubmission,
  getActivityLogs,
  getActivityLogSummary,
};
