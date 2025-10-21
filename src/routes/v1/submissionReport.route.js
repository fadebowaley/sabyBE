/**
 * Submission Report Routes
 *
 * API routes for submission reporting and data management.
 *
 * @module routes/v1/submissionReport
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const submissionReportValidation = require('../../validations/submissionReport.validation');
const submissionReportController = require('../../controllers/submissionReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    auth(),
    validate(submissionReportValidation.getSubmissions),
    submissionReportController.getSubmissions
  );

router
  .route('/stats')
  .get(
    auth(),
    validate(submissionReportValidation.getSubmissionStats),
    submissionReportController.getSubmissionStats
  );

router
  .route('/locked')
  .get(
    auth(),
    validate(submissionReportValidation.getLockedSubmissions),
    submissionReportController.getLockedSubmissions
  );

router
  .route('/compliance/:month')
  .get(
    auth(),
    validate(submissionReportValidation.getComplianceReport),
    submissionReportController.getComplianceReport
  );

router
  .route('/node/:nodeId')
  .get(
    auth(),
    validate(submissionReportValidation.getSubmissionsByNode),
    submissionReportController.getSubmissionsByNode
  );

router
  .route('/monthly/:month')
  .get(
    auth(),
    validate(submissionReportValidation.getMonthlyReport),
    submissionReportController.getMonthlyReport
  );

router
  .route('/incomplete/:month')
  .get(
    auth(),
    validate(submissionReportValidation.getIncompleteSubmissions),
    submissionReportController.getIncompleteSubmissions
  );

router
  .route('/:id')
  .get(
    auth(),
    validate(submissionReportValidation.getSubmissionById),
    submissionReportController.getSubmissionById
  )
  .patch(
    auth(),
    validate(submissionReportValidation.updateSubmission),
    submissionReportController.updateSubmission
  )
  .delete(
    auth(),
    validate(submissionReportValidation.deleteSubmission),
    submissionReportController.deleteSubmission
  );

// UPDATE OPERATIONS
router
  .route('/:id/status')
  .patch(
    auth(),
    validate(submissionReportValidation.updateSubmissionStatus),
    submissionReportController.updateSubmissionStatus
  );

router
  .route('/:id/lock')
  .post(
    auth(),
    validate(submissionReportValidation.lockSubmission),
    submissionReportController.lockSubmission
  );

router
  .route('/:id/unlock')
  .post(
    auth(),
    validate(submissionReportValidation.unlockSubmission),
    submissionReportController.unlockSubmission
  );

// DELETE OPERATIONS
router
  .route('/bulk-delete')
  .post(
    auth(),
    validate(submissionReportValidation.bulkDeleteSubmissions),
    submissionReportController.bulkDeleteSubmissions
  );

// BULK OPERATIONS (Phase 6)
router
  .route('/bulk-update-status')
  .post(auth(), submissionReportController.bulkUpdateStatus);

router
  .route('/bulk-lock')
  .post(auth(), submissionReportController.bulkLockUnlock);

router
  .route('/bulk-update-compliance')
  .post(auth(), submissionReportController.bulkUpdateCompliance);

router
  .route('/bulk-archive')
  .post(auth(), submissionReportController.bulkArchive);

router
  .route('/bulk-delete-advanced')
  .post(auth(), submissionReportController.bulkDeleteAdvanced);

router
  .route('/bulk-update-metadata')
  .post(auth(), submissionReportController.bulkUpdateMetadata);

module.exports = router;
