const express = require('express');
const validate = require('../../middlewares/validate');
const apiKeyApprovalValidation = require('../../validations/apiKeyApproval.validation');
const apiKeyApprovalController = require('../../controllers/apiKeyApproval.controller');
const requireAccess = require('../../middlewares/requireAccess');

const router = express.Router();

// Middleware to check if user is SabyUser
const requireSabyUser = () => {
  return (req, res, next) => {
    if (!req.user || !req.user.isSaby) {
      return res.status(403).json({
        code: 403,
        message: 'This action is restricted to SabyUser only',
      });
    }
    next();
  };
};

// SabyUser-only routes
router
  .route('/pending')
  .get(
    requireAccess({ jwtOnly: true }),
    requireSabyUser(),
    validate(apiKeyApprovalValidation.getPendingApprovals),
    apiKeyApprovalController.getPendingApprovals
  );

router
  .route('/')
  .get(
    requireAccess({ jwtOnly: true }),
    requireSabyUser(),
    validate(apiKeyApprovalValidation.getApprovals),
    apiKeyApprovalController.getApprovals
  );

router
  .route('/:approvalId/approve')
  .post(
    requireAccess({ jwtOnly: true }),
    requireSabyUser(),
    validate(apiKeyApprovalValidation.approveApiKey),
    apiKeyApprovalController.approveApiKey
  );

router
  .route('/:approvalId/reject')
  .post(
    requireAccess({ jwtOnly: true }),
    requireSabyUser(),
    validate(apiKeyApprovalValidation.rejectApiKey),
    apiKeyApprovalController.rejectApiKey
  );

// Production keys (Go Live table)
router
  .route('/production/live')
  .get(
    requireAccess({ jwtOnly: true }),
    validate(apiKeyApprovalValidation.getProductionKeys),
    apiKeyApprovalController.getProductionKeys
  );

module.exports = router;
