const express = require('express');
const auth = require('../../middlewares/auth');
const requireAccess = require('../../middlewares/requireAccess')
const validate = require('../../middlewares/validate');
const submissionValidation = require('../../validations/submission.validation');
const submissionController = require('../../controllers/submission.controller');

const router = express.Router();

router.get('/activity-log', submissionController.getActivityLogs);
router.get('/activity-log/summary', submissionController.getActivityLogSummary);
router
  .route('/')
  .post(requireAccess('create:submission'), validate(submissionValidation.submitData), submissionController.submitData)
  .get(auth('view:submission'), submissionController.listSubmissions);

router.route('/:form_id').get(submissionController.getSubmissionById).delete(submissionController.deleteSubmission);

router.route('/:id/retry').post(submissionController.retrySubmission);

// Cleanup test data endpoint
router
  .route('/cleanup-test-data')
  .delete(auth(), validate(submissionValidation.cleanupTestData), submissionController.cleanupTestData);

module.exports = router;
