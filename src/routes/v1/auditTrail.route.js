const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const auditTrailValidation = require('../../validations/auditTrail.validation');
const auditTrailController = require('../../controllers/auditTrail.controller');

const router = express.Router();

router.get(
  '/',
  auth('view:audit-trail'),
  validate(auditTrailValidation.getAuditTrail),
  auditTrailController.getAuditTrail
);

router.get(
  '/export',
  auth('view:audit-trail'),
  validate(auditTrailValidation.getAuditTrail),
  auditTrailController.exportAuditTrail
);

module.exports = router;
