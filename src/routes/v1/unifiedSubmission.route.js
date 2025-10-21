const express = require('express');
const requireAccess = require('../../middlewares/requireAccess');
const validate = require('../../middlewares/validate');
const submissionValidation = require('../../validations/submission.validation');
const unifiedSubmissionController = require('../../controllers/unifiedSubmission.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Submissions
 *   description: Universal submission endpoint for all channels (API, WhatsApp, Telegram, Email, IoT, Agents)
 */

// Activity logs (no auth required for summary, auth for detailed logs)
router.get(
  '/activity-log',
  requireAccess('view:submission'),
  unifiedSubmissionController.getActivityLogs
);

router.get(
  '/activity-log/summary',
  unifiedSubmissionController.getActivityLogSummary
);

router.get(
  '/activity-log/recent',
  requireAccess('view:submission'),
  unifiedSubmissionController.getRecentActivityLogs
);

router.get(
  '/activity-log/user/:user_id',
  requireAccess('view:submission'),
  unifiedSubmissionController.getActivityLogsByUser
);

router.get(
  '/activity-log/action/:action',
  requireAccess('view:submission'),
  unifiedSubmissionController.getActivityLogsByAction
);

router.get(
  '/activity-log/job/:job_id',
  requireAccess('view:submission'),
  unifiedSubmissionController.getActivityLogsByJobId
);

router.patch(
  '/activity-log/:id',
  requireAccess('update:submission'),
  unifiedSubmissionController.updateActivityLogStatus
);

router.delete(
  '/activity-log/:id',
  requireAccess('delete:submission'),
  unifiedSubmissionController.deleteActivityLog
);

router.post(
  '/activity-log/bulk-delete',
  requireAccess('delete:submission'),
  unifiedSubmissionController.bulkDeleteActivityLogs
);

// Main submission endpoint
router
  .route('/')
  .post(
    requireAccess('create:submission'),
    validate(submissionValidation.submitData),
    unifiedSubmissionController.submitData
  )
  .get(
    requireAccess('view:submission'),
    unifiedSubmissionController.listSubmissions
  );

// Retry failed submission
router.post(
  '/:id/retry',
  requireAccess('create:submission'),
  unifiedSubmissionController.retrySubmission
);

// Get specific submission
router.get(
  '/:id',
  requireAccess('view:submission'),
  unifiedSubmissionController.getSubmission
);

module.exports = router;