/**
 * Event Compliance Routes
 *
 * Defines routes for PERM compliance tracking and reporting
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const eventComplianceController = require('../../controllers/eventCompliance.controller');

const router = express.Router();

// Get compliance summary
router.get(
  '/summary',
  auth('compliance:read'),
  eventComplianceController.getSummary
);

// Get compliance dashboard
router.get(
  '/dashboard',
  auth('compliance:read'),
  eventComplianceController.getDashboard
);

// Recalculate compliance
router.post(
  '/recalculate/:submissionId',
  auth('compliance:manage'),
  eventComplianceController.recalculate
);

// Lock submission
router.post(
  '/lock/:submissionId',
  auth('compliance:manage'),
  eventComplianceController.lockSubmission
);

// Unlock submission (admin only)
router.post(
  '/unlock/:submissionId',
  auth('compliance:manage'),
  eventComplianceController.unlockSubmission
);

// Get compliance report for a node
router.get(
  '/report/:nodeId/:month',
  auth('compliance:read'),
  eventComplianceController.getReport
);

// Get compliance history for a node
router.get(
  '/history/:nodeId',
  auth('compliance:read'),
  eventComplianceController.getHistory
);

// Get compliance tracking for a specific node/month
router.get(
  '/:nodeId/:month',
  auth('compliance:read'),
  eventComplianceController.getTracking
);

module.exports = router;
