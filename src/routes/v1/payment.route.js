const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const paymentController = require('../../controllers/payment.controller');

const router = express.Router();

// Webhook endpoint for payment providers (signature verified)
router.route('/webhook').post(paymentController.paymentWebhook);

// Route for creating a new payment
router
  .route('/')
  .post(
    auth('payment:create'),
    validate(paymentValidation.createPayment),
    paymentController.createPayment
  )
  .get(
    auth('payment:read'),
    validate(paymentValidation.queryPayments),
    paymentController.queryPayments
  );

// Route for fetching payments by status
router
  .route('/status')
  .get(
    auth('payment:read'),
    validate(paymentValidation.getPaymentsByStatus),
    paymentController.getPaymentsByStatus
  );

// Route for fetching a payment by reference
router
  .route('/reference/:reference')
  .get(
    auth('payment:read'),
    validate(paymentValidation.getPaymentByReference),
    paymentController.getPaymentByReference
  );

// Route for fetching payments by user
router
  .route('/user/:userId')
  .get(
    auth('payment:read'),
    validate(paymentValidation.getPaymentsByUser),
    paymentController.getPaymentsByUser
  );

// Route for processing a payment
router
  .route('/:paymentId/process')
  .patch(
    auth('payment:update'),
    validate(paymentValidation.processPayment),
    paymentController.processPayment
  );

// Route for completing a payment
router
  .route('/:paymentId/complete')
  .patch(
    auth('payment:update'),
    validate(paymentValidation.completePayment),
    paymentController.completePayment
  );

// Route for canceling a payment
router
  .route('/:paymentId/cancel')
  .patch(
    auth('payment:update'),
    validate(paymentValidation.cancelPayment),
    paymentController.cancelPayment
  );

// Route for refunding a payment
router
  .route('/:paymentId/refund')
  .patch(
    auth('payment:update'),
    validate(paymentValidation.refundPayment),
    paymentController.refundPayment
  );

// Route for generating a payment receipt
router
  .route('/:paymentId/receipt')
  .get(
    auth('payment:read'),
    validate(paymentValidation.generatePaymentReceipt),
    paymentController.generatePaymentReceipt
  );

// Route for fetching a payment by ID
router
  .route('/:paymentId')
  .get(
    auth('payment:read'),
    validate(paymentValidation.getPayment),
    paymentController.getPayment
  )
  .patch(
    auth('payment:update'),
    validate(paymentValidation.updatePayment),
    paymentController.updatePayment
  )
  .delete(
    auth('payment:delete'),
    validate(paymentValidation.deletePayment),
    paymentController.deletePayment
  );

module.exports = router;
