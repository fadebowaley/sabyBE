/**
 * Submission Report Routes
 *
 * API routes for submission reporting and data management.
 *
 * @module routes/v1/submissionReport
 */

const express = require('express');
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');
const validate = require('../../middlewares/validate');
const submissionReportValidation = require('../../validations/submissionReport.validation');
const submissionReportController = require('../../controllers/submissionReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getSubmissions),
    submissionReportController.getSubmissions
  );

router
  .route('/stats')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getSubmissionStats),
    submissionReportController.getSubmissionStats
  );

router
  .route('/locked')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getLockedSubmissions),
    submissionReportController.getLockedSubmissions
  );

router
  .route('/compliance/:month')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getComplianceReport),
    submissionReportController.getComplianceReport
  );

router
  .route('/node/:nodeId')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getSubmissionsByNode),
    submissionReportController.getSubmissionsByNode
  );

router
  .route('/monthly/:month')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getMonthlyReport),
    submissionReportController.getMonthlyReport
  );

router
  .route('/incomplete/:month')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getIncompleteSubmissions),
    submissionReportController.getIncompleteSubmissions
  );

router
  .route('/:id')
  .get(
    hybridAuth(),
    requireAccess('submission:read'),
    validate(submissionReportValidation.getSubmissionById),
    submissionReportController.getSubmissionById
  )
  .patch(
    hybridAuth(),
    requireAccess('submission:update'),
    validate(submissionReportValidation.updateSubmission),
    submissionReportController.updateSubmission
  )
  .delete(
    hybridAuth(),
    requireAccess('submission:delete'),
    validate(submissionReportValidation.deleteSubmission),
    submissionReportController.deleteSubmission
  );

// UPDATE OPERATIONS
router
  .route('/:id/status')
  .patch(
    hybridAuth(),
    requireAccess('submission:update'),
    validate(submissionReportValidation.updateSubmissionStatus),
    submissionReportController.updateSubmissionStatus
  );

router
  .route('/:id/lock')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    validate(submissionReportValidation.lockSubmission),
    submissionReportController.lockSubmission
  );

router
  .route('/:id/unlock')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    validate(submissionReportValidation.unlockSubmission),
    submissionReportController.unlockSubmission
  );

// DELETE OPERATIONS
router
  .route('/bulk-delete')
  .post(
    hybridAuth(),
    requireAccess('submission:delete'),
    validate(submissionReportValidation.bulkDeleteSubmissions),
    submissionReportController.bulkDeleteSubmissions
  );

// BULK OPERATIONS (Phase 6)
router
  .route('/bulk-update-status')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    submissionReportController.bulkUpdateStatus
  );

router
  .route('/bulk-lock')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    submissionReportController.bulkLockUnlock
  );

router
  .route('/bulk-update-compliance')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    submissionReportController.bulkUpdateCompliance
  );

router
  .route('/bulk-archive')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    submissionReportController.bulkArchive
  );

router
  .route('/bulk-delete-advanced')
  .post(
    hybridAuth(),
    requireAccess('submission:delete'),
    submissionReportController.bulkDeleteAdvanced
  );

router
  .route('/bulk-update-metadata')
  .post(
    hybridAuth(),
    requireAccess('submission:update'),
    submissionReportController.bulkUpdateMetadata
  );

module.exports = router;
