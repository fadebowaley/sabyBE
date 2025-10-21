/**
 * Export Report Routes
 *
 * API routes for data export functionality.
 * Supports CSV, JSON, and Excel export formats for all reporting data.
 *
 * @module routes/v1/exportReport
 */

const express = require('express');
const router = express.Router();
const exportReportController = require('../../controllers/exportReport.controller');
const auth = require('../../middlewares/auth');

// Submissions Export Routes
router.get('/submissions/csv', auth(), exportReportController.exportSubmissionsCSV);
router.get('/submissions/json', auth(), exportReportController.exportSubmissionsJSON);

// Compliance Export Routes
router.get('/compliance/csv', auth(), exportReportController.exportComplianceCSV);
router.get('/compliance/json', auth(), exportReportController.exportComplianceJSON);

// Validation Export Routes
router.get('/validations/csv', auth(), exportReportController.exportValidationsCSV);
router.get('/validations/json', auth(), exportReportController.exportValidationsJSON);

// Notification Export Routes
router.get('/notifications/csv', auth(), exportReportController.exportNotificationsCSV);
router.get('/notifications/json', auth(), exportReportController.exportNotificationsJSON);

// Activity Log Export Routes
router.get('/activity-logs/csv', auth(), exportReportController.exportActivityLogsCSV);
router.get('/activity-logs/json', auth(), exportReportController.exportActivityLogsJSON);

// Combined Export Routes
router.get('/combined/csv', auth(), exportReportController.exportCombinedCSV);
router.get('/combined/json', auth(), exportReportController.exportCombinedJSON);

// Export Statistics
router.get('/stats', auth(), exportReportController.getExportStats);

module.exports = router;
