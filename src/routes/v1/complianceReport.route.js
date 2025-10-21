/**
 * Compliance Report Routes
 *
 * API routes for compliance reporting and management.
 *
 * @module routes/v1/complianceReport
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const complianceReportValidation = require('../../validations/complianceReport.validation');
const complianceReportController = require('../../controllers/complianceReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceTracking),
    complianceReportController.getComplianceTracking
  );

router
  .route('/trends')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceTrends),
    complianceReportController.getComplianceTrends
  );

router
  .route('/node/:nodeId')
  .get(
    auth(),
    validate(complianceReportValidation.getNodeCompliance),
    complianceReportController.getNodeCompliance
  );

router
  .route('/project/:projectId')
  .get(
    auth(),
    validate(complianceReportValidation.getProjectCompliance),
    complianceReportController.getProjectCompliance
  );

router
  .route('/weekly/:month')
  .get(
    auth(),
    validate(complianceReportValidation.getWeeklyProgress),
    complianceReportController.getWeeklyProgress
  );

router
  .route('/status/:status')
  .get(
    auth(),
    validate(complianceReportValidation.getNodesByStatus),
    complianceReportController.getNodesByStatus
  );

router
  .route('/:id')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceById),
    complianceReportController.getComplianceById
  )
  .patch(
    auth(),
    validate(complianceReportValidation.overrideCompliance),
    complianceReportController.overrideCompliance
  )
  .delete(
    auth(),
    validate(complianceReportValidation.deleteComplianceRecord),
    complianceReportController.deleteComplianceRecord
  );

// UPDATE OPERATIONS
router
  .route('/:id/mark-event')
  .post(
    auth(),
    validate(complianceReportValidation.markEventSubmitted),
    complianceReportController.markEventSubmitted
  );

router
  .route('/:id/reset')
  .post(
    auth(),
    validate(complianceReportValidation.resetCompliance),
    complianceReportController.resetCompliance
  );

module.exports = router;
/**
 * Compliance Report Routes
 *
 * API routes for compliance reporting and management.
 *
 * @module routes/v1/complianceReport
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const complianceReportValidation = require('../../validations/complianceReport.validation');
const complianceReportController = require('../../controllers/complianceReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceTracking),
    complianceReportController.getComplianceTracking
  );

router
  .route('/trends')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceTrends),
    complianceReportController.getComplianceTrends
  );

router
  .route('/node/:nodeId')
  .get(
    auth(),
    validate(complianceReportValidation.getNodeCompliance),
    complianceReportController.getNodeCompliance
  );

router
  .route('/project/:projectId')
  .get(
    auth(),
    validate(complianceReportValidation.getProjectCompliance),
    complianceReportController.getProjectCompliance
  );

router
  .route('/weekly/:month')
  .get(
    auth(),
    validate(complianceReportValidation.getWeeklyProgress),
    complianceReportController.getWeeklyProgress
  );

router
  .route('/status/:status')
  .get(
    auth(),
    validate(complianceReportValidation.getNodesByStatus),
    complianceReportController.getNodesByStatus
  );

router
  .route('/:id')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceById),
    complianceReportController.getComplianceById
  )
  .patch(
    auth(),
    validate(complianceReportValidation.overrideCompliance),
    complianceReportController.overrideCompliance
  )
  .delete(
    auth(),
    validate(complianceReportValidation.deleteComplianceRecord),
    complianceReportController.deleteComplianceRecord
  );

// UPDATE OPERATIONS
router
  .route('/:id/mark-event')
  .post(
    auth(),
    validate(complianceReportValidation.markEventSubmitted),
    complianceReportController.markEventSubmitted
  );

router
  .route('/:id/reset')
  .post(
    auth(),
    validate(complianceReportValidation.resetCompliance),
    complianceReportController.resetCompliance
  );

module.exports = router;
/**
 * Compliance Report Routes
 *
 * API routes for compliance reporting and management.
 *
 * @module routes/v1/complianceReport
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const complianceReportValidation = require('../../validations/complianceReport.validation');
const complianceReportController = require('../../controllers/complianceReport.controller');

const router = express.Router();

// READ OPERATIONS
router
  .route('/')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceTracking),
    complianceReportController.getComplianceTracking
  );

router
  .route('/trends')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceTrends),
    complianceReportController.getComplianceTrends
  );

router
  .route('/node/:nodeId')
  .get(
    auth(),
    validate(complianceReportValidation.getNodeCompliance),
    complianceReportController.getNodeCompliance
  );

router
  .route('/project/:projectId')
  .get(
    auth(),
    validate(complianceReportValidation.getProjectCompliance),
    complianceReportController.getProjectCompliance
  );

router
  .route('/weekly/:month')
  .get(
    auth(),
    validate(complianceReportValidation.getWeeklyProgress),
    complianceReportController.getWeeklyProgress
  );

router
  .route('/status/:status')
  .get(
    auth(),
    validate(complianceReportValidation.getNodesByStatus),
    complianceReportController.getNodesByStatus
  );

router
  .route('/:id')
  .get(
    auth(),
    validate(complianceReportValidation.getComplianceById),
    complianceReportController.getComplianceById
  )
  .patch(
    auth(),
    validate(complianceReportValidation.overrideCompliance),
    complianceReportController.overrideCompliance
  )
  .delete(
    auth(),
    validate(complianceReportValidation.deleteComplianceRecord),
    complianceReportController.deleteComplianceRecord
  );

// UPDATE OPERATIONS
router
  .route('/:id/mark-event')
  .post(
    auth(),
    validate(complianceReportValidation.markEventSubmitted),
    complianceReportController.markEventSubmitted
  );

router
  .route('/:id/reset')
  .post(
    auth(),
    validate(complianceReportValidation.resetCompliance),
    complianceReportController.resetCompliance
  );

module.exports = router;
