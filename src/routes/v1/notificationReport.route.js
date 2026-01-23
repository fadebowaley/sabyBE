/**
 * PERM Notification Reports Routes
 *
 * Purpose: API routes for notification reporting and management
 * Author: Saby Backend Team
 * Date: 2025-10-20
 */

const express = require('express');
const router = express.Router();
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const notificationReportController = require('../../controllers/notificationReport.controller');
const notificationReportValidation = require('../../validations/notificationReport.validation');

// Public routes (require auth only)
router
  .route('/')
  .get(
    auth(),
    validate(notificationReportValidation.listNotifications),
    notificationReportController.listNotifications
  );

router
  .route('/pending')
  .get(
    auth(),
    validate(notificationReportValidation.getPendingNotifications),
    notificationReportController.getPendingNotifications
  );

router
  .route('/failed')
  .get(
    auth(),
    validate(notificationReportValidation.getFailedNotifications),
    notificationReportController.getFailedNotifications
  );

router
  .route('/stats')
  .get(
    auth(),
    validate(notificationReportValidation.getNotificationStats),
    notificationReportController.getNotificationStats
  );

router
  .route('/history/:node_id')
  .get(
    auth(),
    validate(notificationReportValidation.getNotificationHistory),
    notificationReportController.getNotificationHistory
  );

router
  .route('/by-type/:type')
  .get(
    auth(),
    validate(notificationReportValidation.getNotificationsByType),
    notificationReportController.getNotificationsByType
  );

router
  .route('/bulk-retry')
  .post(
    auth(),
    validate(notificationReportValidation.bulkRetryNotifications),
    notificationReportController.bulkRetryNotifications
  );

router
  .route('/cleanup')
  .post(
    auth(),
    validate(notificationReportValidation.cleanupNotifications),
    notificationReportController.cleanupNotifications
  );

router
  .route('/:id')
  .get(
    auth(),
    validate(notificationReportValidation.getNotificationById),
    notificationReportController.getNotificationById
  )
  .delete(
    auth(),
    validate(notificationReportValidation.deleteNotification),
    notificationReportController.deleteNotification
  );

router
  .route('/:id/retry')
  .post(
    auth(),
    validate(notificationReportValidation.retryNotification),
    notificationReportController.retryNotification
  );

router
  .route('/:id/cancel')
  .post(
    auth(),
    validate(notificationReportValidation.cancelNotification),
    notificationReportController.cancelNotification
  );

module.exports = router;
