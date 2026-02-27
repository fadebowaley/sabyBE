const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const complianceValidation = require('../../validations/compliance.validation');
const complianceController = require('../../controllers/compliance.controller');

const router = express.Router();

// Get unified compliance table
router.get(
  '/table',
  auth(),
  validate(complianceValidation.getComplianceTable),
  complianceController.getComplianceTable
);

// Get compliance summary
router.get(
  '/summary',
  auth(),
  complianceController.getComplianceSummary
);

// Get compliance dates with quota/status for calendar UI
router.get(
  '/dates',
  auth(),
  validate(complianceValidation.getComplianceDates),
  complianceController.getComplianceDates
);

// Update user compliance
router.patch(
  '/user/:userId',
  auth(),
  validate(complianceValidation.updateUserCompliance),
  complianceController.updateUserCompliance
);

// Update node compliance
router.patch(
  '/node/:nodeId',
  auth(),
  validate(complianceValidation.updateNodeCompliance),
  complianceController.updateNodeCompliance
);

// Get user compliance score
router.get(
  '/user/:userId/score',
  auth(),
  validate(complianceValidation.getUserComplianceScore),
  complianceController.getUserComplianceScore
);

module.exports = router;

