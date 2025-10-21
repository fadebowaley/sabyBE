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
  auth('view:compliance'),
  eventComplianceController.getSummary
);

// Get compliance dashboard
router.get(
  '/dashboard',
  auth('view:compliance'),
  eventComplianceController.getDashboard
);

// Recalculate compliance
router.post(
  '/recalculate/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.recalculate
);

// Lock submission
router.post(
  '/lock/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.lockSubmission
);

// Unlock submission (admin only)
router.post(
  '/unlock/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.unlockSubmission
);

// Get compliance report for a node
router.get(
  '/report/:nodeId/:month',
  auth('view:compliance'),
  eventComplianceController.getReport
);

// Get compliance history for a node
router.get(
  '/history/:nodeId',
  auth('view:compliance'),
  eventComplianceController.getHistory
);

// Get compliance tracking for a specific node/month
router.get(
  '/:nodeId/:month',
  auth('view:compliance'),
  eventComplianceController.getTracking
);

module.exports = router;

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
  auth('view:compliance'),
  eventComplianceController.getSummary
);

// Get compliance dashboard
router.get(
  '/dashboard',
  auth('view:compliance'),
  eventComplianceController.getDashboard
);

// Recalculate compliance
router.post(
  '/recalculate/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.recalculate
);

// Lock submission
router.post(
  '/lock/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.lockSubmission
);

// Unlock submission (admin only)
router.post(
  '/unlock/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.unlockSubmission
);

// Get compliance report for a node
router.get(
  '/report/:nodeId/:month',
  auth('view:compliance'),
  eventComplianceController.getReport
);

// Get compliance history for a node
router.get(
  '/history/:nodeId',
  auth('view:compliance'),
  eventComplianceController.getHistory
);

// Get compliance tracking for a specific node/month
router.get(
  '/:nodeId/:month',
  auth('view:compliance'),
  eventComplianceController.getTracking
);

module.exports = router;

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
  auth('view:compliance'),
  eventComplianceController.getSummary
);

// Get compliance dashboard
router.get(
  '/dashboard',
  auth('view:compliance'),
  eventComplianceController.getDashboard
);

// Recalculate compliance
router.post(
  '/recalculate/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.recalculate
);

// Lock submission
router.post(
  '/lock/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.lockSubmission
);

// Unlock submission (admin only)
router.post(
  '/unlock/:submissionId',
  auth('manage:compliance'),
  eventComplianceController.unlockSubmission
);

// Get compliance report for a node
router.get(
  '/report/:nodeId/:month',
  auth('view:compliance'),
  eventComplianceController.getReport
);

// Get compliance history for a node
router.get(
  '/history/:nodeId',
  auth('view:compliance'),
  eventComplianceController.getHistory
);

// Get compliance tracking for a specific node/month
router.get(
  '/:nodeId/:month',
  auth('view:compliance'),
  eventComplianceController.getTracking
);

module.exports = router;

