/**
 * Analytics Report Routes
 *
 * API routes for analytics and aggregation functionality.
 * Provides data insights, metrics, and statistical analysis for all reporting data.
 *
 * @module routes/v1/analyticsReport
 */

const express = require('express');
const router = express.Router();
const analyticsReportController = require('../../controllers/analyticsReport.controller');
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');

// Submission Analytics Routes
router.get(
  '/submissions/summary',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getSubmissionSummary
);
router.get(
  '/submissions/by-status',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getSubmissionsByStatus
);
router.get(
  '/submissions/by-month',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getSubmissionsByMonth
);

// Compliance Analytics Routes
router.get(
  '/compliance/rates',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getComplianceRates
);
router.get(
  '/compliance/by-node',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getComplianceByNode
);

// Validation Analytics Routes
router.get(
  '/validations/failures',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getValidationFailures
);

// Notification Analytics Routes
router.get(
  '/notifications/delivery',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getNotificationDelivery
);

// Activity Analytics Routes
router.get(
  '/activity/trends',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getActivityTrends
);

// Performance Analytics Routes
router.get(
  '/performance/top-nodes',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getTopPerformingNodes
);

// Quality Analytics Routes
router.get(
  '/quality/metrics',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getDataQualityMetrics
);

// Dashboard Overview
router.get(
  '/dashboard/overview',
  hybridAuth(),
  requireAccess('analytics:read'),
  analyticsReportController.getDashboardOverview
);

module.exports = router;
