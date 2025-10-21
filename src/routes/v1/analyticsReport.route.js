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
const auth = require('../../middlewares/auth');

// Submission Analytics Routes
router.get('/submissions/summary', auth(), analyticsReportController.getSubmissionSummary);
router.get('/submissions/by-status', auth(), analyticsReportController.getSubmissionsByStatus);
router.get('/submissions/by-month', auth(), analyticsReportController.getSubmissionsByMonth);

// Compliance Analytics Routes
router.get('/compliance/rates', auth(), analyticsReportController.getComplianceRates);
router.get('/compliance/by-node', auth(), analyticsReportController.getComplianceByNode);

// Validation Analytics Routes
router.get('/validations/failures', auth(), analyticsReportController.getValidationFailures);

// Notification Analytics Routes
router.get('/notifications/delivery', auth(), analyticsReportController.getNotificationDelivery);

// Activity Analytics Routes
router.get('/activity/trends', auth(), analyticsReportController.getActivityTrends);

// Performance Analytics Routes
router.get('/performance/top-nodes', auth(), analyticsReportController.getTopPerformingNodes);

// Quality Analytics Routes
router.get('/quality/metrics', auth(), analyticsReportController.getDataQualityMetrics);

// Dashboard Overview
router.get('/dashboard/overview', auth(), analyticsReportController.getDashboardOverview);

module.exports = router;
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
const auth = require('../../middlewares/auth');

// Submission Analytics Routes
router.get('/submissions/summary', auth(), analyticsReportController.getSubmissionSummary);
router.get('/submissions/by-status', auth(), analyticsReportController.getSubmissionsByStatus);
router.get('/submissions/by-month', auth(), analyticsReportController.getSubmissionsByMonth);

// Compliance Analytics Routes
router.get('/compliance/rates', auth(), analyticsReportController.getComplianceRates);
router.get('/compliance/by-node', auth(), analyticsReportController.getComplianceByNode);

// Validation Analytics Routes
router.get('/validations/failures', auth(), analyticsReportController.getValidationFailures);

// Notification Analytics Routes
router.get('/notifications/delivery', auth(), analyticsReportController.getNotificationDelivery);

// Activity Analytics Routes
router.get('/activity/trends', auth(), analyticsReportController.getActivityTrends);

// Performance Analytics Routes
router.get('/performance/top-nodes', auth(), analyticsReportController.getTopPerformingNodes);

// Quality Analytics Routes
router.get('/quality/metrics', auth(), analyticsReportController.getDataQualityMetrics);

// Dashboard Overview
router.get('/dashboard/overview', auth(), analyticsReportController.getDashboardOverview);

module.exports = router;
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
const auth = require('../../middlewares/auth');

// Submission Analytics Routes
router.get('/submissions/summary', auth(), analyticsReportController.getSubmissionSummary);
router.get('/submissions/by-status', auth(), analyticsReportController.getSubmissionsByStatus);
router.get('/submissions/by-month', auth(), analyticsReportController.getSubmissionsByMonth);

// Compliance Analytics Routes
router.get('/compliance/rates', auth(), analyticsReportController.getComplianceRates);
router.get('/compliance/by-node', auth(), analyticsReportController.getComplianceByNode);

// Validation Analytics Routes
router.get('/validations/failures', auth(), analyticsReportController.getValidationFailures);

// Notification Analytics Routes
router.get('/notifications/delivery', auth(), analyticsReportController.getNotificationDelivery);

// Activity Analytics Routes
router.get('/activity/trends', auth(), analyticsReportController.getActivityTrends);

// Performance Analytics Routes
router.get('/performance/top-nodes', auth(), analyticsReportController.getTopPerformingNodes);

// Quality Analytics Routes
router.get('/quality/metrics', auth(), analyticsReportController.getDataQualityMetrics);

// Dashboard Overview
router.get('/dashboard/overview', auth(), analyticsReportController.getDashboardOverview);

module.exports = router;
