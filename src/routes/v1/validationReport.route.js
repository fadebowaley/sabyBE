/**
 * Validation Report Routes
 *
 * API routes for validation reporting and management.
 *
 * @module routes/v1/validationReport
 */

const express = require('express');
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');
const validate = require('../../middlewares/validate');
const validationReportValidation = require('../../validations/validationReport.validation');
const validationReportController = require('../../controllers/validationReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    hybridAuth(),
    requireAccess('validation:read'),
    validate(validationReportValidation.getValidations),
    validationReportController.getValidations
  );

router
  .route('/stats')
  .get(
    hybridAuth(),
    requireAccess('validation:read'),
    validate(validationReportValidation.getValidationStats),
    validationReportController.getValidationStats
  );

router
  .route('/failed')
  .get(
    hybridAuth(),
    requireAccess('validation:read'),
    validate(validationReportValidation.getFailedValidations),
    validationReportController.getFailedValidations
  );

router
  .route('/errors')
  .get(
    hybridAuth(),
    requireAccess('validation:read'),
    validate(validationReportValidation.getValidationErrors),
    validationReportController.getValidationErrors
  );

router
  .route('/submission/:id')
  .get(
    hybridAuth(),
    requireAccess('validation:read'),
    validate(validationReportValidation.getValidationsBySubmission),
    validationReportController.getValidationsBySubmission
  );

router
  .route('/:id')
  .get(
    hybridAuth(),
    requireAccess('validation:read'),
    validate(validationReportValidation.getValidationById),
    validationReportController.getValidationById
  )
  .delete(
    hybridAuth(),
    requireAccess('validation:delete'),
    validate(validationReportValidation.deleteValidation),
    validationReportController.deleteValidation
  );

// UPDATE OPERATIONS
router
  .route('/:id/resolve')
  .patch(
    hybridAuth(),
    requireAccess('validation:update'),
    validate(validationReportValidation.resolveValidation),
    validationReportController.resolveValidation
  );

router
  .route('/bulk-resolve')
  .post(
    hybridAuth(),
    requireAccess('validation:update'),
    validate(validationReportValidation.bulkResolveValidations),
    validationReportController.bulkResolveValidations
  );

module.exports = router;
