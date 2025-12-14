/**
 * PERM Submission Routes
 *
 * Defines routes for PERM submissions (upsert, get, lock, validate)
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const requireAccess = require('../../middlewares/requireAccess');
const permSubmissionController = require('../../controllers/permSubmission.controller');

const router = express.Router();

// Validate submission data (dry-run)
router.post(
  '/validate',
  auth('submission:create'),
  permSubmissionController.validateData
);

// Get compliance summary
router.get(
  '/compliance/summary',
  auth('compliance:read'),
  permSubmissionController.getComplianceSummary
);

// Submit PERM data (upsert with merge)
router.post(
  '/',
  requireAccess('submission:create'),
  permSubmissionController.submitData
);

// Get all submissions for a month
router.get(
  '/',
  auth('submission:read'),
  permSubmissionController.getSubmissions
);

// Lock submission
router.post(
  '/:id/lock',
  auth('submission:manage'),
  permSubmissionController.lockSubmission
);

// Unlock submission (admin only)
router.post(
  '/:id/unlock',
  auth('submission:manage'),
  permSubmissionController.unlockSubmission
);

// Delete submission (soft delete)
router.delete(
  '/:id',
  auth('submission:manage'),
  permSubmissionController.deleteSubmission
);

// Get submission by node and month
router.get(
  '/:nodeId/:month',
  auth('submission:read'),
  permSubmissionController.getSubmission
);

module.exports = router;
