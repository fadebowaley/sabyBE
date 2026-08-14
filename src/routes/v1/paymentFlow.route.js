const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentFlowValidation = require('../../validations/paymentFlow.validation');
const paymentFlowController = require('../../controllers/paymentFlow.controller');

const router = express.Router();

router.get(
  '/',
  auth('view:payment-flow'),
  validate(paymentFlowValidation.getPaymentFlow),
  paymentFlowController.getPaymentFlow
);

router.get(
  '/export',
  auth('view:payment-flow'),
  validate(paymentFlowValidation.getPaymentFlow),
  paymentFlowController.exportPaymentFlow
);

module.exports = router;
