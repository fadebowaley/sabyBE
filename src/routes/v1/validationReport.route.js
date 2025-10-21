/**
 * Validation Report Routes
 *
 * API routes for validation reporting and management.
 *
 * @module routes/v1/validationReport
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const validationReportValidation = require('../../validations/validationReport.validation');
const validationReportController = require('../../controllers/validationReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    auth(),
    validate(validationReportValidation.getValidations),
    validationReportController.getValidations
  );

router
  .route('/stats')
  .get(
    auth(),
    validate(validationReportValidation.getValidationStats),
    validationReportController.getValidationStats
  );

router
  .route('/failed')
  .get(
    auth(),
    validate(validationReportValidation.getFailedValidations),
    validationReportController.getFailedValidations
  );

router
  .route('/errors')
  .get(
    auth(),
    validate(validationReportValidation.getValidationErrors),
    validationReportController.getValidationErrors
  );

router
  .route('/submission/:id')
  .get(
    auth(),
    validate(validationReportValidation.getValidationsBySubmission),
    validationReportController.getValidationsBySubmission
  );

router
  .route('/:id')
  .get(
    auth(),
    validate(validationReportValidation.getValidationById),
    validationReportController.getValidationById
  )
  .delete(
    auth(),
    validate(validationReportValidation.deleteValidation),
    validationReportController.deleteValidation
  );

// UPDATE OPERATIONS
router
  .route('/:id/resolve')
  .patch(
    auth(),
    validate(validationReportValidation.resolveValidation),
    validationReportController.resolveValidation
  );

router
  .route('/bulk-resolve')
  .post(
    auth(),
    validate(validationReportValidation.bulkResolveValidations),
    validationReportController.bulkResolveValidations
  );

module.exports = router;
