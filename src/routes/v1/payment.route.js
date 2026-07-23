const express = require('express');
const auth = require('../../middlewares/auth');
const requirePaymentCollectionCapability = require('../../middlewares/requirePaymentCollectionCapability');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const paymentController = require('../../controllers/payment.controller');

const router = express.Router();

// Webhook endpoint for payment providers (signature verified)
router.route('/webhook').post(paymentController.paymentWebhook);

router
  .route('/verify-return')
  .post(
    auth(),
    validate(paymentValidation.verifyReturn),
    paymentController.verifyPaymentReturn
  );

router
  .route('/subscription-checkout')
  .post(
    auth(),
    validate(paymentValidation.subscriptionCheckout),
    paymentController.initializeSubscriptionCheckout
  );

// Route for creating a new payment
router
  .route('/')
  .post(
    auth('payment:create'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.createPayment),
    paymentController.createPayment
  )
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.queryPayments),
    paymentController.queryPayments
  );

// Route for fetching payments by status
router
  .route('/status')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability(),
    validate(paymentValidation.getPaymentsByStatus),
    paymentController.getPaymentsByStatus
  );

// Route for fetching a payment by reference
router
  .route('/reference/:reference/billing-document')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.getPaymentByReference),
    paymentController.generatePaymentBillingDocumentByReference
  );

router
  .route('/reference/:reference/invoice')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.getPaymentByReference),
    paymentController.generatePaymentInvoiceByReference
  );

router
  .route('/reference/:reference/receipt')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.getPaymentByReference),
    paymentController.generatePaymentReceiptByReference
  );

router
  .route('/reference/:reference')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.getPaymentByReference),
    paymentController.getPaymentByReference
  );

// Route for fetching payments by user
router
  .route('/user/:userId')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability(),
    validate(paymentValidation.getPaymentsByUser),
    paymentController.getPaymentsByUser
  );

// Route for processing a payment
router
  .route('/:paymentId/process')
  .patch(
    auth('payment:update'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.processPayment),
    paymentController.processPayment
  );

// Route for completing a payment
router
  .route('/:paymentId/complete')
  .patch(
    auth('payment:update'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.completePayment),
    paymentController.completePayment
  );

// Route for canceling a payment
router
  .route('/:paymentId/cancel')
  .patch(
    auth('payment:update'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.cancelPayment),
    paymentController.cancelPayment
  );

// Route for refunding a payment
router
  .route('/:paymentId/refund')
  .patch(
    auth('payment:update'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.refundPayment),
    paymentController.refundPayment
  );

// Route for generating a payment receipt
router
  .route('/:paymentId/billing-document')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.generatePaymentReceipt),
    paymentController.generatePaymentBillingDocument
  );

router
  .route('/:paymentId/invoice')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.generatePaymentReceipt),
    paymentController.generatePaymentInvoice
  );

router
  .route('/:paymentId/receipt')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.generatePaymentReceipt),
    paymentController.generatePaymentReceipt
  );

// Route for fetching a payment by ID
router
  .route('/:paymentId')
  .get(
    auth('payment:read'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.getPayment),
    paymentController.getPayment
  )
  .patch(
    auth('payment:update'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.updatePayment),
    paymentController.updatePayment
  )
  .delete(
    auth('payment:delete'),
    requirePaymentCollectionCapability({ allowSubscription: true }),
    validate(paymentValidation.deletePayment),
    paymentController.deletePayment
  );

module.exports = router;
