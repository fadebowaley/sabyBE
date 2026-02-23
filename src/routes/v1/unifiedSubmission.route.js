const express = require('express');
const auth = require('../../middlewares/auth');
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
  auth(),
  unifiedSubmissionController.getActivityLogs
);

router.get(
  '/activity-log/summary',
  unifiedSubmissionController.getActivityLogSummary
);

router.get(
  '/activity-log/enhanced',
  auth(),
  unifiedSubmissionController.getEnhancedActivityLogs
);

router.get(
  '/activity-log/recent',
  auth(),
  unifiedSubmissionController.getRecentActivityLogs
);

router.get(
  '/activity-log/user/:user_id',
  auth(),
  unifiedSubmissionController.getActivityLogsByUser
);

router.get(
  '/activity-log/action/:action',
  auth(),
  unifiedSubmissionController.getActivityLogsByAction
);

router.get(
  '/activity-log/job/:job_id',
  auth(),
  unifiedSubmissionController.getActivityLogsByJobId
);

router.patch(
  '/activity-log/:id',
  auth(),
  unifiedSubmissionController.updateActivityLogStatus
);

router.delete(
  '/activity-log/:id',
  auth(),
  unifiedSubmissionController.deleteActivityLog
);

router.post(
  '/activity-log/bulk-delete',
  auth(),
  unifiedSubmissionController.bulkDeleteActivityLogs
);

// Bulk delete by job IDs
router.post(
  '/bulk-delete-by-jobs',
  auth(),
  unifiedSubmissionController.bulkDeleteByJobIds
);

// Cleanup test data
router.delete(
  '/cleanup-test-data',
  auth(),
  unifiedSubmissionController.cleanupTestData
);

// Main submission endpoint
router
  .route('/')
  .post(
    auth(),
    validate(submissionValidation.submitData),
    unifiedSubmissionController.submitData
  )
  .get(auth(), unifiedSubmissionController.listSubmissions);

// Retry failed submission
router.post(
  '/:id/retry',
  auth(),
  validate(submissionValidation.retrySubmission),
  unifiedSubmissionController.retrySubmission
);

// Get, Update, Delete specific submission
router
  .route('/:id')
  .get(auth(), unifiedSubmissionController.getSubmission)
  .patch(
    auth(),
    validate(submissionValidation.updateSubmission),
    unifiedSubmissionController.updateSubmission
  )
  .delete(
    auth(),
    validate(submissionValidation.deleteSubmissionById),
    unifiedSubmissionController.deleteSubmission
  );

module.exports = router;
