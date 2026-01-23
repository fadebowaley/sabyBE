/**
 * PERM Notification Reports Validation
 *
 * Purpose: Request validation schemas for notification reporting
 * Author: Saby Backend Team
 * Date: 2025-10-20
 */

const Joi = require('joi');

const listNotifications = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    node_id: Joi.string(),
    month: Joi.date(),
    notification_type: Joi.string().valid(
      'incomplete_alert',
      'late_submission_warning',
      'completion_confirmation',
      'weekly_reminder',
      'month_end_summary'
    ),
    status: Joi.string().valid('pending', 'sent', 'failed', 'cancelled'),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent'),
    recipient_user_id: Joi.string(),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getNotificationById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getPendingNotifications = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
  }),
};

const getFailedNotifications = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    limit: Joi.number().integer().min(1).max(200).default(50),
  }),
};

const getNotificationHistory = {
  params: Joi.object().keys({
    node_id: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.date(),
  }),
};

const getNotificationsByType = {
  params: Joi.object().keys({
    type: Joi.string()
      .valid(
        'incomplete_alert',
        'late_submission_warning',
        'completion_confirmation',
        'weekly_reminder',
        'month_end_summary'
      )
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string(),
    project_id: Joi.string(),
    status: Joi.string().valid('pending', 'sent', 'failed', 'cancelled'),
    limit: Joi.number().integer().min(1).max(200).default(100),
  }),
};

const getNotificationStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    month: Joi.date(),
  }),
};

const retryNotification = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const cancelNotification = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().default('cancelled by user'),
  }),
};

const bulkRetryNotifications = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  }),
};

const deleteNotification = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const cleanupNotifications = {
  body: Joi.object().keys({
    days_old: Joi.number().integer().min(1).max(365).default(90),
    status: Joi.string().valid('sent', 'failed'),
  }),
};

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
