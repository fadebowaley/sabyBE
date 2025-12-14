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
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');

// Submissions Export Routes
router.get(
  '/submissions/csv',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportSubmissionsCSV
);
router.get(
  '/submissions/json',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportSubmissionsJSON
);

// Compliance Export Routes
router.get(
  '/compliance/csv',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportComplianceCSV
);
router.get(
  '/compliance/json',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportComplianceJSON
);

// Validation Export Routes
router.get(
  '/validations/csv',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportValidationsCSV
);
router.get(
  '/validations/json',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportValidationsJSON
);

// Notification Export Routes
router.get(
  '/notifications/csv',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportNotificationsCSV
);
router.get(
  '/notifications/json',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportNotificationsJSON
);

// Activity Log Export Routes
router.get(
  '/activity-logs/csv',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportActivityLogsCSV
);
router.get(
  '/activity-logs/json',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportActivityLogsJSON
);

// Combined Export Routes
router.get(
  '/combined/csv',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportCombinedCSV
);
router.get(
  '/combined/json',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.exportCombinedJSON
);

// Export Statistics
router.get(
  '/stats',
  hybridAuth(),
  requireAccess('export:read'),
  exportReportController.getExportStats
);

module.exports = router;
