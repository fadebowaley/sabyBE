/**
 * PERM Notification Service
 *
 * Purpose: Business logic for PERM notification queue management
 * Author: Saby Backend Team
 * Date: 2025-10-21
 *
 * Features:
 * - Create and queue notifications
 * - Retrieve notifications with filters
 * - Update notification status
 * - Retry failed notifications
 * - Cleanup old notifications
 */

const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Create a new notification
 * @param {Object} notificationData - Notification details
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (notificationData) => {
  const {
    tenant_id,
    project_id,
    node_id,
    month,
    notification_type,
    priority = 'normal',
    recipient_user_id,
    recipient_email,
    recipient_name,
    subject,
    message,
    html_message,
    data = {},
    scheduled_for,
    expires_at,
    created_by = 'system',
  } = notificationData;

  try {
    const query = `
      INSERT INTO notification_queue_perm (
        tenant_id, project_id, node_id, month,
        notification_type, priority,
        recipient_user_id, recipient_email, recipient_name,
        subject, message, html_message, data,
        scheduled_for, expires_at, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
      RETURNING *
    `;

    const values = [
      tenant_id,
      project_id,
      node_id,
      month,
      notification_type,
      priority,
      recipient_user_id,
      recipient_email,
      recipient_name,
      subject,
      message,
      html_message,
      JSON.stringify(data),
      scheduled_for || new Date(),
      expires_at,
      created_by,
    ];

    const result = await postgresPool.query(query, values);
    logger.info(`✅ Notification created: ${result.rows[0].id}`);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error creating notification:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create notification: ${error.message}`
    );
  }
};

/**
 * Get notification by ID
 * @param {string} id - Notification ID
 * @returns {Promise<Object|null>} Notification or null
 */
const getNotificationById = async (id) => {
  try {
    const query = `
      SELECT * FROM notification_queue_perm
      WHERE id = $1
    `;

    const result = await postgresPool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('❌ Error getting notification by ID:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get notification: ${error.message}`
    );
  }
};

/**
 * Get pending notifications for a tenant
 * @param {string} tenant_id - Tenant ID
 * @returns {Promise<Array>} Pending notifications
 */
const getPendingNotifications = async (tenant_id) => {
  try {
    const query = `
      SELECT * FROM notification_queue_perm
      WHERE tenant_id = $1
        AND status = 'pending'
        AND (scheduled_for IS NULL OR scheduled_for <= NOW())
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY priority DESC, scheduled_for ASC
      LIMIT 100
    `;

    const result = await postgresPool.query(query, [tenant_id]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting pending notifications:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get pending notifications: ${error.message}`
    );
  }
};

/**
 * Get failed notifications for a tenant
 * @param {string} tenant_id - Tenant ID
 * @param {number} limit - Maximum number of notifications to retrieve
 * @returns {Promise<Array>} Failed notifications
 */
const getFailedNotifications = async (tenant_id, limit = 50) => {
  try {
    const query = `
      SELECT * FROM notification_queue_perm
      WHERE tenant_id = $1
        AND status = 'failed'
        AND retry_count < max_retries
      ORDER BY priority DESC, next_retry_at ASC
      LIMIT $2
    `;

    const result = await postgresPool.query(query, [tenant_id, limit]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting failed notifications:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get failed notifications: ${error.message}`
    );
  }
};

/**
 * Get notification history for a node
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} node_id - Node ID
 * @param {string} month - Month filter (optional)
 * @returns {Promise<Array>} Notification history
 */
const getNotificationHistory = async (
  tenant_id,
  project_id,
  node_id,
  month = null
) => {
  try {
    let query = `
      SELECT * FROM notification_queue_perm
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id = $3
    `;

    const values = [tenant_id, project_id, node_id];

    if (month) {
      query += ` AND month = $4`;
      values.push(month);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting notification history:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get notification history: ${error.message}`
    );
  }
};

/**
 * Get notifications by type
 * @param {string} type - Notification type
 * @param {Object} filters - Additional filters
 * @returns {Promise<Array>} Notifications
 */
const getNotificationsByType = async (type, filters = {}) => {
  try {
    let query = `
      SELECT * FROM notification_queue_perm
      WHERE notification_type = $1
    `;

    const values = [type];
    let paramIndex = 2;

    if (filters.tenant_id) {
      query += ` AND tenant_id = $${paramIndex++}`;
      values.push(filters.tenant_id);
    }

    if (filters.project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      values.push(filters.project_id);
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(filters.status);
    }

    const limit = parseInt(filters.limit) || 50;
    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    values.push(limit);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting notifications by type:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get notifications by type: ${error.message}`
    );
  }
};

/**
 * Update notification status
 * @param {string} id - Notification ID
 * @param {string} status - New status (pending, processing, sent, failed, cancelled)
 * @param {string} reason - Optional reason for status change
 * @returns {Promise<Object>} Updated notification
 */
const updateNotificationStatus = async (id, status, reason = null) => {
  try {
    let query = `
      UPDATE notification_queue_perm
      SET status = $1, updated_at = NOW()
    `;

    const values = [status];
    let paramIndex = 2;

    if (status === 'sent') {
      query += `, sent_at = NOW()`;
    } else if (status === 'failed') {
      query += `, failed_at = NOW(), failed_reason = $${paramIndex++}, retry_count = retry_count + 1`;
      values.push(reason);

      // Set next retry time (exponential backoff)
      query += `, next_retry_at = NOW() + INTERVAL '${Math.pow(
        2,
        paramIndex - 2
      )} minutes'`;
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    values.push(id);

    const result = await postgresPool.query(query, values);

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
    }

    logger.info(`✅ Notification ${id} status updated to: ${status}`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('❌ Error updating notification status:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to update notification status: ${error.message}`
    );
  }
};

/**
 * Retry a failed notification
 * @param {string} id - Notification ID
 * @returns {Promise<Object>} Updated notification
 */
const retryNotification = async (id) => {
  try {
    const notification = await getNotificationById(id);

    if (!notification) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
    }

    if (notification.retry_count >= notification.max_retries) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Maximum retry attempts exceeded'
      );
    }

    const query = `
      UPDATE notification_queue_perm
      SET status = 'pending',
          next_retry_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await postgresPool.query(query, [id]);
    logger.info(`✅ Notification ${id} queued for retry`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('❌ Error retrying notification:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to retry notification: ${error.message}`
    );
  }
};

/**
 * Cancel a notification
 * @param {string} id - Notification ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Updated notification
 */
const cancelNotification = async (id, reason = null) => {
  try {
    const query = `
      UPDATE notification_queue_perm
      SET status = 'cancelled',
          failed_reason = $1,
          updated_at = NOW()
      WHERE id = $2 AND status IN ('pending', 'failed')
      RETURNING *
    `;

    const result = await postgresPool.query(query, [
      reason || 'Cancelled by user',
      id,
    ]);

    if (result.rows.length === 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Notification not found or cannot be cancelled'
      );
    }

    logger.info(`✅ Notification ${id} cancelled`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('❌ Error cancelling notification:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to cancel notification: ${error.message}`
    );
  }
};

/**
 * Bulk retry failed notifications
 * @param {Array<string>} ids - Array of notification IDs
 * @returns {Promise<Array>} Updated notifications
 */
const bulkRetryNotifications = async (ids) => {
  try {
    const query = `
      UPDATE notification_queue_perm
      SET status = 'pending',
          next_retry_at = NULL,
          updated_at = NOW()
      WHERE id = ANY($1)
        AND status = 'failed'
        AND retry_count < max_retries
      RETURNING *
    `;

    const result = await postgresPool.query(query, [ids]);
    logger.info(`✅ ${result.rows.length} notifications queued for retry`);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error bulk retrying notifications:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to bulk retry notifications: ${error.message}`
    );
  }
};

/**
 * Delete a notification
 * @param {string} id - Notification ID
 * @returns {Promise<Object>} Deleted notification
 */
const deleteNotification = async (id) => {
  try {
    const query = `
      DELETE FROM notification_queue_perm
      WHERE id = $1
      RETURNING *
    `;

    const result = await postgresPool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
    }

    logger.info(`✅ Notification ${id} deleted`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('❌ Error deleting notification:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to delete notification: ${error.message}`
    );
  }
};

/**
 * Delete sent notifications older than cutoff date
 * @param {Date} cutoffDate - Cutoff date
 * @returns {Promise<number>} Number of notifications deleted
 */
const deleteSentNotifications = async (cutoffDate) => {
  try {
    const query = `
      DELETE FROM notification_queue_perm
      WHERE status = 'sent'
        AND sent_at < $1
    `;

    const result = await postgresPool.query(query, [cutoffDate]);
    logger.info(`✅ Deleted ${result.rowCount} sent notifications`);
    return result.rowCount;
  } catch (error) {
    logger.error('❌ Error deleting sent notifications:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to delete sent notifications: ${error.message}`
    );
  }
};

/**
 * Delete failed notifications older than cutoff date
 * @param {Date} cutoffDate - Cutoff date
 * @returns {Promise<number>} Number of notifications deleted
 */
const deleteFailedNotifications = async (cutoffDate) => {
  try {
    const query = `
      DELETE FROM notification_queue_perm
      WHERE status = 'failed'
        AND retry_count >= max_retries
        AND failed_at < $1
    `;

    const result = await postgresPool.query(query, [cutoffDate]);
    logger.info(`✅ Deleted ${result.rowCount} failed notifications`);
    return result.rowCount;
  } catch (error) {
    logger.error('❌ Error deleting failed notifications:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to delete failed notifications: ${error.message}`
    );
  }
};

module.exports = {
  createNotification,
  getNotificationById,
  getPendingNotifications,
  getFailedNotifications,
  getNotificationHistory,
  getNotificationsByType,
  updateNotificationStatus,
  retryNotification,
  cancelNotification,
  bulkRetryNotifications,
  deleteNotification,
  deleteSentNotifications,
  deleteFailedNotifications,
};
