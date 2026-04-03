/**
 * Submission Report Service
 *
 * Orchestration layer for submission reporting and data management.
 * Provides high-level business logic for CRUD operations on submissions.
 *
 * Features:
 * - Advanced filtering and pagination
 * - Compliance reporting
 * - Data management (update, delete)
 * - Bulk operations
 * - Export capabilities
 *
 * @module services/submissionReport
 */

const httpStatus = require('http-status');
const SubmissionModel = require('../models/submission.model');
const ApiError = require('../utils/ApiError');
const { logActivity } = require('../utils/activityLogger');
const { postgresPool } = require('../config/postgres');

const DEFAULT_TABLE_LIMIT = 100;
const MAX_TABLE_LIMIT = 500;
const HIERARCHY_ORDERING_CACHE_MS = 60 * 1000;
const FIXED_COLUMN_LABELS = {
  node_name: 'Node Name',
  nodeid: 'NodeId',
  status: 'Status',
  submitted_at: 'Submitted At',
};
let hierarchyOrderingCapability = {
  checkedAt: 0,
  enabled: false,
};

const toSnakeCase = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const prettifyKey = (key = '') =>
  String(key)
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const unwrapValue = (value) => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : item))
      .join(', ');
  }
  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return value.value;
    }
    try {
      return JSON.stringify(value);
    } catch (_err) {
      return String(value);
    }
  }
  return value;
};

const isTruthyDebugFlag = (value) => {
  if (value === true) return true;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
};

const isHierarchyOrderingAvailable = async () => {
  const now = Date.now();
  if (
    now - hierarchyOrderingCapability.checkedAt <
    HIERARCHY_ORDERING_CACHE_MS
  ) {
    return hierarchyOrderingCapability.enabled;
  }

  const requiredColumns = [
    'tenant_id',
    'node_id',
    'node_reference',
    'lineage_refs',
  ];

  try {
    const result = await postgresPool.query(
      `
        SELECT COUNT(*)::int AS matched
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'node_dimension'
          AND column_name = ANY($1::text[])
      `,
      [requiredColumns]
    );
    const matched = Number(result.rows[0]?.matched || 0);
    hierarchyOrderingCapability = {
      checkedAt: now,
      enabled: matched === requiredColumns.length,
    };
  } catch (_error) {
    hierarchyOrderingCapability = {
      checkedAt: now,
      enabled: false,
    };
  }

  return hierarchyOrderingCapability.enabled;
};

const buildDynamicColumns = (catalogRows = [], submissionRows = []) => {
  const dynamicColumns = [];
  const usedKeys = new Set(['node_name', 'nodeid', 'status', 'submitted_at']);
  const sourceKeyToColumnKey = new Map([
    ['node_name', 'node_name'],
    ['node_id', 'nodeid'],
    ['node_reference', 'nodeid'],
    ['status', 'status'],
    ['created_at', 'submitted_at'],
    ['submitted_at', 'submitted_at'],
  ]);

  const register = (sourceKey, labelHint, preferredKey = null) => {
    if (!sourceKey) return;
    if (sourceKeyToColumnKey.has(sourceKey)) return;

    const label = labelHint || prettifyKey(sourceKey);
    let candidate =
      preferredKey || toSnakeCase(label) || toSnakeCase(sourceKey) || 'field';
    let suffix = 2;
    while (usedKeys.has(candidate)) {
      candidate = `${toSnakeCase(label) || 'field'}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(candidate);
    sourceKeyToColumnKey.set(sourceKey, candidate);
    dynamicColumns.push({ key: candidate, label, source_key: sourceKey });
  };

  catalogRows.forEach((row) => {
    register(row.field_key, row.field_label, toSnakeCase(row.field_key || ''));
  });

  submissionRows.forEach((row) => {
    const payload = row.data && typeof row.data === 'object' ? row.data : {};
    Object.keys(payload).forEach((key) => register(key, null));
  });

  const columns = [
    { key: 'node_name', label: FIXED_COLUMN_LABELS.node_name, pinned: true },
    { key: 'nodeid', label: FIXED_COLUMN_LABELS.nodeid, pinned: true },
    ...dynamicColumns,
    { key: 'status', label: FIXED_COLUMN_LABELS.status },
    { key: 'submitted_at', label: FIXED_COLUMN_LABELS.submitted_at },
  ];

  return { columns, sourceKeyToColumnKey };
};

/**
 * Get module report table in row/column format.
 * Columns are generated dynamically from form catalog + submission payload keys.
 * Rows are sourced directly from form_submissions for immediate availability.
 */
const getModuleReportTable = async (filters = {}) => {
  const {
    tenant_id,
    project_id,
    node_filter,
    search,
    debug,
    start_date,
    end_date,
    month,
    limit = DEFAULT_TABLE_LIMIT,
    offset = 0,
  } = filters;

  if (!tenant_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenant_id is required');
  }
  if (!project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'project_id is required');
  }
  const includeDebug = isTruthyDebugFlag(debug);

  const safeLimit = Math.min(
    Math.max(Number(limit) || DEFAULT_TABLE_LIMIT, 1),
    MAX_TABLE_LIMIT
  );
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const canUseHierarchyOrdering = await isHierarchyOrderingAvailable();

  const where = ['fs.tenant_id = $1', 'fs.project_id = $2'];
  const values = [tenant_id, project_id];
  let index = 3;

  if (node_filter) {
    where.push(`(fs.node_id = $${index} OR fs.node_reference = $${index})`);
    values.push(node_filter);
    index += 1;
  }
  if (month) {
    where.push(`fs.month = $${index}`);
    values.push(month);
    index += 1;
  }
  if (start_date) {
    where.push(`fs.created_at >= $${index}`);
    values.push(start_date);
    index += 1;
  }
  if (end_date) {
    where.push(`fs.created_at <= $${index}`);
    values.push(end_date);
    index += 1;
  }
  if (search && String(search).trim() !== '') {
    where.push(`(
      CAST(fs.id AS TEXT) ILIKE $${index}
      OR COALESCE(fs.node_name, '') ILIKE $${index}
      OR COALESCE(fs.node_reference, '') ILIKE $${index}
      OR COALESCE(fs.node_id, '') ILIKE $${index}
      OR COALESCE(fs.status, '') ILIKE $${index}
    )`);
    values.push(`%${String(search).trim()}%`);
    index += 1;
  }

  // Hide soft-deleted records from reporting table by default.
  where.push(`fs.status != 'deleted'`);

  const whereClause = `WHERE ${where.join(' AND ')}`;
  const hierarchyJoin = canUseHierarchyOrdering
    ? `
      LEFT JOIN LATERAL (
        SELECT
          nd.node_id,
          nd.node_reference,
          nd.lineage_refs
        FROM node_dimension nd
        WHERE nd.tenant_id = fs.tenant_id
          AND (
            (fs.node_id IS NOT NULL AND nd.node_id = fs.node_id)
            OR (
              fs.node_reference IS NOT NULL
              AND nd.node_reference = fs.node_reference
            )
          )
        ORDER BY
          CASE WHEN fs.node_id IS NOT NULL AND nd.node_id = fs.node_id THEN 0 ELSE 1 END,
          nd.updated_at DESC NULLS LAST
        LIMIT 1
      ) nd ON TRUE
    `
    : '';

  const orderByClause = canUseHierarchyOrdering
    ? `
      ORDER BY
        CASE WHEN nd.node_id IS NULL THEN 1 ELSE 0 END ASC,
        array_to_string(
          COALESCE(nd.lineage_refs, ARRAY[]::text[]) || COALESCE(nd.node_reference, fs.node_reference, fs.node_id, ''),
          '/'
        ) ASC,
        fs.created_at DESC
    `
    : 'ORDER BY fs.created_at DESC';

  const rowsQuery = `
    SELECT
      fs.id,
      fs.node_id,
      fs.node_reference,
      fs.node_name,
      fs.status,
      fs.data,
      fs.created_at
    FROM form_submissions fs
    ${hierarchyJoin}
    ${whereClause}
    ${orderByClause}
    LIMIT $${index} OFFSET $${index + 1}
  `;
  const rowsValues = [...values, safeLimit, safeOffset];
  const rowsResult = await postgresPool.query(rowsQuery, rowsValues);

  const countQuery = `SELECT COUNT(*)::bigint AS total FROM form_submissions fs ${whereClause}`;
  const countResult = await postgresPool.query(countQuery, values);
  const total = Number(countResult.rows[0]?.total || 0);

  const summaryQuery = `
    SELECT
      COUNT(*)::bigint AS total_rows,
      COUNT(DISTINCT COALESCE(node_reference, node_id))::bigint AS unique_nodes,
      MIN(created_at) AS first_submission_at,
      MAX(created_at) AS latest_submission_at,
      COUNT(*) FILTER (WHERE status = 'submitted')::bigint AS submitted_count,
      COUNT(*) FILTER (WHERE status = 'approved')::bigint AS approved_count,
      COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending_count,
      COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected_count,
      COUNT(*) FILTER (WHERE status = 'completed')::bigint AS completed_count,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_count
    FROM form_submissions fs
    ${whereClause}
  `;
  const summaryResult = await postgresPool.query(summaryQuery, values);
  const summaryRow = summaryResult.rows[0] || {};

  let catalogRows = [];
  try {
    const catalogQuery = `
      SELECT field_key, field_label
      FROM form_field_catalog
      WHERE tenant_id = $1
        AND project_id = $2
      ORDER BY field_label ASC, field_key ASC
    `;
    const catalogResult = await postgresPool.query(catalogQuery, [
      tenant_id,
      project_id,
    ]);
    catalogRows = catalogResult.rows || [];
  } catch (_catalogError) {
    // Fail-safe: reporting still works even when catalog entries are missing.
    catalogRows = [];
  }

  const { columns, sourceKeyToColumnKey } = buildDynamicColumns(
    catalogRows,
    rowsResult.rows
  );

  const rows = rowsResult.rows.map((row, rowIndex) => {
    const reportRow = {
      sn: safeOffset + rowIndex + 1,
      submission_id: row.id,
      nodeid: row.node_reference || row.node_id || null,
      node_name: row.node_name || null,
      status: row.status,
      submitted_at: row.created_at,
    };

    const payload = row.data && typeof row.data === 'object' ? row.data : {};
    Object.entries(payload).forEach(([sourceKey, rawValue]) => {
      const key = sourceKeyToColumnKey.get(sourceKey);
      if (key) {
        reportRow[key] = unwrapValue(rawValue);
      }
    });

    return reportRow;
  });

  const response = {
    total,
    limit: safeLimit,
    offset: safeOffset,
    display_order: columns.map((column) => column.key),
    summary: {
      total_rows: Number(summaryRow.total_rows || 0),
      unique_nodes: Number(summaryRow.unique_nodes || 0),
      first_submission_at: summaryRow.first_submission_at || null,
      latest_submission_at: summaryRow.latest_submission_at || null,
      submitted_count: Number(summaryRow.submitted_count || 0),
      approved_count: Number(summaryRow.approved_count || 0),
      pending_count: Number(summaryRow.pending_count || 0),
      rejected_count: Number(summaryRow.rejected_count || 0),
      completed_count: Number(summaryRow.completed_count || 0),
      failed_count: Number(summaryRow.failed_count || 0),
    },
    columns,
    rows,
  };
  if (includeDebug) {
    response.debug = {
      filters: {
        tenant_id,
        project_id,
        node_filter: node_filter || null,
        month: month || null,
        search: search || null,
        start_date: start_date || null,
        end_date: end_date || null,
        limit: safeLimit,
        offset: safeOffset,
      },
      catalog_count: catalogRows.length,
      catalog_rows: catalogRows,
      columns_count: columns.length,
      columns,
      display_order: response.display_order,
      hierarchy_ordering_enabled: canUseHierarchyOrdering,
      sample_input_row: rowsResult.rows[0] || null,
      sample_mapped_row: rows[0] || null,
    };
  }
  return response;
};

/**
 * Get submissions with advanced filtering
 * @param {Object} filters - Filter criteria
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated submissions
 */
const getSubmissions = async (filters, options = {}) => {
  try {
    const { limit = 50, offset = 0 } = options;

    const result = await SubmissionModel.getSubmissions({
      ...filters,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    return result;
  } catch (error) {
    console.error('❌ Error in getSubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions'
    );
  }
};

/**
 * Get submission by ID
 * @param {string} id - Submission ID
 * @returns {Promise<Object>} Submission
 */
const getSubmissionById = async (id) => {
  try {
    const submission = await SubmissionModel.getSubmissionById(id);

    if (!submission) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    return submission;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in getSubmissionById service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submission'
    );
  }
};

/**
 * Get submissions by date range
 * @param {string} tenant_id - Tenant ID
 * @param {string} start_date - Start date
 * @param {string} end_date - End date
 * @returns {Promise<Array>} Submissions
 */
const getSubmissionsByDateRange = async (tenant_id, start_date, end_date) => {
  try {
    return await SubmissionModel.getSubmissionsByDateRange(
      tenant_id,
      start_date,
      end_date
    );
  } catch (error) {
    console.error(
      '❌ Error in getSubmissionsByDateRange service:',
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions by date range'
    );
  }
};

/**
 * Get submissions by node
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} node_id - Node ID
 * @param {Object} options - Options (perm_only, limit)
 * @returns {Promise<Array>} Submissions
 */
const getSubmissionsByNode = async (
  tenant_id,
  project_id,
  node_id,
  options = {}
) => {
  try {
    return await SubmissionModel.getSubmissionsByNode(
      tenant_id,
      project_id,
      node_id,
      options
    );
  } catch (error) {
    console.error('❌ Error in getSubmissionsByNode service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions by node'
    );
  }
};

/**
 * Get monthly submissions for a project
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-01)
 * @returns {Promise<Array>} Submissions
 */
const getMonthlySubmissions = async (tenant_id, project_id, month) => {
  try {
    return await SubmissionModel.getMonthlySubmissions(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error('❌ Error in getMonthlySubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch monthly submissions'
    );
  }
};

/**
 * Get submissions by status
 * @param {string} tenant_id - Tenant ID
 * @param {string} status - Status
 * @returns {Promise<Array>} Submissions
 */
const getSubmissionsByStatus = async (tenant_id, status) => {
  try {
    return await SubmissionModel.getSubmissionsByStatus(tenant_id, status);
  } catch (error) {
    console.error('❌ Error in getSubmissionsByStatus service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submissions by status'
    );
  }
};

/**
 * Get locked submissions
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (optional)
 * @returns {Promise<Array>} Locked submissions
 */
const getLockedSubmissions = async (tenant_id, project_id, month = null) => {
  try {
    return await SubmissionModel.getLockedSubmissions(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error('❌ Error in getLockedSubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch locked submissions'
    );
  }
};

/**
 * Get compliance report for a project/month
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-01)
 * @returns {Promise<Object>} Compliance report
 */
const getComplianceReport = async (tenant_id, project_id, month) => {
  try {
    const report = await SubmissionModel.getComplianceReport(
      tenant_id,
      project_id,
      month
    );

    // Calculate additional metrics
    const totalNodes = parseInt(report.total_nodes, 10);
    const completeNodes = parseInt(report.complete_nodes, 10);
    const partialNodes = parseInt(report.partial_nodes, 10);
    const incompleteNodes = parseInt(report.incomplete_nodes, 10);

    return {
      ...report,
      total_nodes: totalNodes,
      complete_nodes: completeNodes,
      partial_nodes: partialNodes,
      incomplete_nodes: incompleteNodes,
      completion_rate:
        totalNodes > 0
          ? parseFloat(((completeNodes / totalNodes) * 100).toFixed(2))
          : 0,
      compliance_status:
        completeNodes === totalNodes
          ? 'complete'
          : completeNodes > 0
          ? 'partial'
          : 'incomplete',
    };
  } catch (error) {
    console.error('❌ Error in getComplianceReport service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch compliance report'
    );
  }
};

/**
 * Get incomplete submissions
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-01)
 * @returns {Promise<Array>} Incomplete submissions
 */
const getIncompleteSubmissions = async (tenant_id, project_id, month) => {
  try {
    return await SubmissionModel.getIncompleteSubmissions(
      tenant_id,
      project_id,
      month
    );
  } catch (error) {
    console.error(
      '❌ Error in getIncompleteSubmissions service:',
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch incomplete submissions'
    );
  }
};

/**
 * Get submission statistics
 * @param {string} tenant_id - Tenant ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Statistics
 */
const getSubmissionStats = async (tenant_id, filters = {}) => {
  try {
    const totalCount = await SubmissionModel.countSubmissions({
      tenant_id,
      ...filters,
    });

    const completedCount = await SubmissionModel.countSubmissions({
      tenant_id,
      status: 'completed',
      ...filters,
    });

    const pendingCount = await SubmissionModel.countSubmissions({
      tenant_id,
      status: 'pending',
      ...filters,
    });

    const failedCount = await SubmissionModel.countSubmissions({
      tenant_id,
      status: 'failed',
      ...filters,
    });

    return {
      total: totalCount,
      completed: completedCount,
      pending: pendingCount,
      failed: failedCount,
      completion_rate:
        totalCount > 0
          ? parseFloat(((completedCount / totalCount) * 100).toFixed(2))
          : 0,
    };
  } catch (error) {
    console.error('❌ Error in getSubmissionStats service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch submission statistics'
    );
  }
};

/**
 * Update submission
 * @param {string} id - Submission ID
 * @param {Object} updates - Fields to update
 * @param {string} user_id - User ID performing the update
 * @returns {Promise<Object>} Updated submission
 */
const updateSubmission = async (id, updates, user_id) => {
  try {
    // Check if submission exists
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    // Check if submission is locked
    if (existing.is_locked) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot update locked submission'
      );
    }

    // Perform update
    const updated = await SubmissionModel.updateSubmission(id, updates);

    // Log activity
    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'updated',
      status: 'success',
      message: 'Submission updated',
    });

    return updated;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in updateSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update submission'
    );
  }
};

/**
 * Update submission status
 * @param {string} id - Submission ID
 * @param {string} status - New status
 * @param {string} user_id - User ID performing the update
 * @returns {Promise<Object>} Updated submission
 */
const updateSubmissionStatus = async (id, status, user_id) => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    const updated = await SubmissionModel.updateSubmissionStatus(
      id,
      status,
      user_id
    );

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'status_updated',
      status: 'success',
      message: `Status updated to ${status}`,
    });

    return updated;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in updateSubmissionStatus service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to update submission status'
    );
  }
};

/**
 * Lock submission
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID performing the lock
 * @param {string} reason - Lock reason
 * @returns {Promise<Object>} Locked submission
 */
const lockSubmission = async (id, user_id, reason = 'manual_lock') => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (existing.is_locked) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Submission is already locked'
      );
    }

    const locked = await SubmissionModel.lockSubmission(id, user_id, reason);

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'locked',
      status: 'success',
      message: `Submission locked: ${reason}`,
    });

    return locked;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in lockSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to lock submission'
    );
  }
};

/**
 * Unlock submission
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID performing the unlock
 * @param {string} reason - Unlock reason
 * @returns {Promise<Object>} Unlocked submission
 */
const unlockSubmission = async (id, user_id, reason = 'manual_unlock') => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (!existing.is_locked) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Submission is not locked');
    }

    const unlocked = await SubmissionModel.unlockSubmission(
      id,
      user_id,
      reason
    );

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'unlocked',
      status: 'success',
      message: `Submission unlocked: ${reason}`,
    });

    return unlocked;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in unlockSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to unlock submission'
    );
  }
};

/**
 * Delete submission (soft delete)
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID performing the delete
 * @returns {Promise<Object>} Deleted submission
 */
const deleteSubmission = async (id, user_id) => {
  try {
    const existing = await SubmissionModel.getSubmissionById(id);
    if (!existing) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
    }

    if (existing.is_locked) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Cannot delete locked submission'
      );
    }

    const deleted = await SubmissionModel.softDeleteSubmission(id, user_id);

    await logActivity({
      tenant_id: existing.tenant_id,
      project_id: existing.project_id,
      project_name: existing.project_name,
      project_category: existing.project_category,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id,
      action: 'deleted',
      status: 'success',
      message: 'Submission deleted (soft)',
    });

    return deleted;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in deleteSubmission service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to delete submission'
    );
  }
};

/**
 * Bulk delete submissions
 * @param {Array<string>} ids - Submission IDs
 * @param {string} user_id - User ID performing the delete
 * @param {boolean} hard - Hard delete (permanent)
 * @returns {Promise<Object>} Delete result
 */
const bulkDeleteSubmissions = async (ids, user_id, hard = false) => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid submission IDs');
    }

    // Check for locked submissions
    const submissions = await Promise.all(
      ids.map((id) => SubmissionModel.getSubmissionById(id))
    );

    const lockedSubmissions = submissions.filter((s) => s && s.is_locked);
    if (lockedSubmissions.length > 0) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Cannot delete ${lockedSubmissions.length} locked submission(s)`
      );
    }

    const deleted = await SubmissionModel.bulkDeleteSubmissions(
      ids,
      user_id,
      hard
    );

    // Log activity for first submission (representative)
    if (submissions[0]) {
      await logActivity({
        tenant_id: submissions[0].tenant_id,
        project_id: submissions[0].project_id,
        project_name: submissions[0].project_name,
        project_category: submissions[0].project_category,
        form_id: submissions[0].form_id,
        node_id: submissions[0].node_id,
        user_id,
        action: 'bulk_deleted',
        status: 'success',
        message: `${deleted.length} submissions deleted (${
          hard ? 'hard' : 'soft'
        })`,
      });
    }

    return {
      deleted_count: deleted.length,
      type: hard ? 'hard' : 'soft',
      ids: deleted.map((s) => s.id),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('❌ Error in bulkDeleteSubmissions service:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to bulk delete submissions'
    );
  }
};

module.exports = {
  getSubmissions,
  getSubmissionById,
  getSubmissionsByDateRange,
  getSubmissionsByNode,
  getMonthlySubmissions,
  getSubmissionsByStatus,
  getLockedSubmissions,
  getComplianceReport,
  getIncompleteSubmissions,
  getSubmissionStats,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
  getModuleReportTable,
};
