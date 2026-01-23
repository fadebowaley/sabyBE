/**
 * PERM Notification Reports Controller
 *
 * Purpose: HTTP endpoints for notification reporting and management
 * Author: Saby Backend Team
 * Date: 2025-10-20
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { postgresPool } = require('../config/postgres');
const permNotificationService = require('../services/permNotification.service');

/**
 * List notifications with filters
 * GET /v1/notification-reports
 */
const listNotifications = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'node_id',
    'month',
    'notification_type',
    'status',
    'priority',
    'recipient_user_id',
    'limit',
    'offset',
  ]);

  let query = `
    SELECT * FROM notification_queue_perm
    WHERE 1=1
  `;

  const values = [];
  let paramIndex = 1;

  if (filters.tenant_id) {
    query += ` AND tenant_id = $${paramIndex++}`;
    values.push(filters.tenant_id);
  }
  if (filters.project_id) {
    query += ` AND project_id = $${paramIndex++}`;
    values.push(filters.project_id);
  }
  if (filters.node_id) {
    query += ` AND node_id = $${paramIndex++}`;
    values.push(filters.node_id);
  }
  if (filters.month) {
    query += ` AND month = $${paramIndex++}`;
    values.push(filters.month);
  }
  if (filters.notification_type) {
    query += ` AND notification_type = $${paramIndex++}`;
    values.push(filters.notification_type);
  }
  if (filters.status) {
    query += ` AND status = $${paramIndex++}`;
    values.push(filters.status);
  }
  if (filters.priority) {
    query += ` AND priority = $${paramIndex++}`;
    values.push(filters.priority);
  }
  if (filters.recipient_user_id) {
    query += ` AND recipient_user_id = $${paramIndex++}`;
    values.push(filters.recipient_user_id);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
  const countResult = await postgresPool.query(countQuery, values);
  const total = parseInt(countResult.rows[0].count);

  // Pagination
  query += ` ORDER BY created_at DESC`;

  const limit = parseInt(filters.limit) || 50;
  const offset = parseInt(filters.offset) || 0;

  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  values.push(limit, offset);

  const result = await postgresPool.query(query, values);

  res.status(httpStatus.OK).send({
    success: true,
    data: result.rows,
    pagination: {
      total,
      limit,
      offset,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get notification by ID
 * GET /v1/notification-reports/:id
 */
const getNotificationById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const notification = await permNotificationService.getNotificationById(id);

  if (!notification) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Notification not found',
    });
  }

  res.status(httpStatus.OK).send({
    success: true,
    data: notification,
  });
});

/**
 * Get pending notifications
 * GET /v1/notification-reports/pending
 */
const getPendingNotifications = catchAsync(async (req, res) => {
  const { tenant_id } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const notifications = await permNotificationService.getPendingNotifications(
    tenant_id
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: notifications,
    count: notifications.length,
  });
});

/**
 * Get failed notifications
 * GET /v1/notification-reports/failed
 */
const getFailedNotifications = catchAsync(async (req, res) => {
  const { tenant_id, limit } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  const notifications = await permNotificationService.getFailedNotifications(
    tenant_id,
    parseInt(limit) || 50
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: notifications,
    count: notifications.length,
  });
});

/**
 * Get notification history for a node
 * GET /v1/notification-reports/history/:node_id
 */
const getNotificationHistory = catchAsync(async (req, res) => {
  const { node_id } = req.params;
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id and project_id are required',
    });
  }

  const notifications = await permNotificationService.getNotificationHistory(
    tenant_id,
    project_id,
    node_id,
    month
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: notifications,
    count: notifications.length,
  });
});

/**
 * Get notifications by type
 * GET /v1/notification-reports/by-type/:type
 */
const getNotificationsByType = catchAsync(async (req, res) => {
  const { type } = req.params;
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'status',
    'limit',
  ]);

  const notifications = await permNotificationService.getNotificationsByType(
    type,
    filters
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: notifications,
    count: notifications.length,
  });
});

/**
 * Get notification statistics
 * GET /v1/notification-reports/stats
 */
const getNotificationStats = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'tenant_id is required',
    });
  }

  let query = `
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'sent') as sent,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
      COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_priority,
      COUNT(*) FILTER (WHERE notification_type = 'incomplete_alert') as incomplete_alerts,
      COUNT(*) FILTER (WHERE notification_type = 'late_submission_warning') as late_warnings,
      COUNT(*) FILTER (WHERE notification_type = 'completion_confirmation') as completions,
      COUNT(*) FILTER (WHERE notification_type = 'weekly_reminder') as weekly_reminders,
      COUNT(*) FILTER (WHERE notification_type = 'month_end_summary') as month_summaries
    FROM notification_queue_perm
    WHERE tenant_id = $1
  `;

  const values = [tenant_id];
  let paramIndex = 2;

  if (project_id) {
    query += ` AND project_id = $${paramIndex++}`;
    values.push(project_id);
  }
  if (month) {
    query += ` AND month = $${paramIndex}`;
    values.push(month);
  }

  const result = await postgresPool.query(query, values);

  res.status(httpStatus.OK).send({
    success: true,
    data: result.rows[0],
  });
});

/**
 * Retry a failed notification
 * POST /v1/notification-reports/:id/retry
 */
const retryNotification = catchAsync(async (req, res) => {
  const { id } = req.params;

  const notification = await permNotificationService.retryNotification(id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notification queued for retry',
    data: notification,
  });
});

/**
 * Cancel a pending notification
 * POST /v1/notification-reports/:id/cancel
 */
const cancelNotification = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const notification = await permNotificationService.cancelNotification(
    id,
    reason
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notification cancelled',
    data: notification,
  });
});

/**
 * Bulk retry failed notifications
 * POST /v1/notification-reports/bulk-retry
 */
const bulkRetryNotifications = catchAsync(async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(httpStatus.BAD_REQUEST).send({
      success: false,
      message: 'ids array is required',
    });
  }

  const notifications = await permNotificationService.bulkRetryNotifications(
    ids
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: `${notifications.length} notifications queued for retry`,
    data: notifications,
  });
});

/**
 * Delete notification
 * DELETE /v1/notification-reports/:id
 */
const deleteNotification = catchAsync(async (req, res) => {
  const { id } = req.params;

  const notification = await permNotificationService.deleteNotification(id);

  if (!notification) {
    return res.status(httpStatus.NOT_FOUND).send({
      success: false,
      message: 'Notification not found',
    });
  }

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Notification deleted',
    data: notification,
  });
});

/**
 * Cleanup old notifications
 * POST /v1/notification-reports/cleanup
 */
const cleanupNotifications = catchAsync(async (req, res) => {
  const { days_old = 90, status } = req.body;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days_old);

  let deletedCount = 0;

  if (!status || status === 'sent') {
    const sentCount = await permNotificationService.deleteSentNotifications(
      cutoffDate
    );
    deletedCount += sentCount;
  }

  if (!status || status === 'failed') {
    const failedCount = await permNotificationService.deleteFailedNotifications(
      cutoffDate
    );
    deletedCount += failedCount;
  }

  res.status(httpStatus.OK).send({
    success: true,
    message: `Deleted ${deletedCount} old notifications`,
    deleted: deletedCount,
    cutoff_date: cutoffDate,
  });
});

module.exports = {
  listNotifications,
  getNotificationById,
  getPendingNotifications,
  getFailedNotifications,
  getNotificationHistory,
  getNotificationsByType,
  getNotificationStats,
  retryNotification,
  cancelNotification,
  bulkRetryNotifications,
  deleteNotification,
  cleanupNotifications,
};
