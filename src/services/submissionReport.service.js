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
};
