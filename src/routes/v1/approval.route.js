const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const approvalController = require('../../controllers/approval.controller');
const approvalValidation = require('../../validations/approval.validation');
const requireSubscriptionCapability = require('../../middlewares/requireSubscriptionCapability');

const router = express.Router();

router.get(
  '/queue',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.getApprovalQueue),
  approvalController.getApprovalQueue
);

router.post(
  '/bulk/approve',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.bulkApproveApprovals),
  approvalController.bulkApproveApprovals
);

router.post(
  '/bulk/reject',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.bulkRejectApprovals),
  approvalController.bulkRejectApprovals
);

router.post(
  '/:approvalId/approve',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.approveApproval),
  approvalController.approveApproval
);

router.post(
  '/:approvalId/reject',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.rejectApproval),
  approvalController.rejectApproval
);

router.post(
  '/:approvalId/request-changes',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.requestChangesApproval),
  approvalController.requestChangesApproval
);

router.post(
  '/:approvalId/escalate',
  auth(),
  requireSubscriptionCapability('workflowsApprovals'),
  validate(approvalValidation.escalateApproval),
  approvalController.escalateApproval
);

module.exports = router;
