const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { paymentService } = require('../services');
const copilotActionService = require('../services/copilotAction.service');
const paymentWebhookService = require('../services/paymentWebhook.service');

const getRequestTenantId = (req) => req.user?.tenantId || req.query.tenantId;
const getActorUserId = (req) =>
  req.user?._id || req.user?.id || req.user?.userId || null;

// Create a new payment
const createPayment = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId || req.body.tenantId;
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const userId = req.body.userId || getActorUserId(req);
  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const beneficiaryType =
    req.body.beneficiaryType ||
    (req.body.purpose === 'collection' ? 'tenant' : 'saby');

  const createPayload = {
    ...req.body,
    tenantId,
    userId,
    beneficiaryType,
    idempotencyKey:
      req.get('Idempotency-Key') ||
      req.get('idempotency-key') ||
      req.body.idempotencyKey,
  };

  if (
    createPayload.purpose === 'collection' &&
    !createPayload.submissionId &&
    !createPayload.moduleId
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'collection payments require submissionId or moduleId'
    );
  }

  if (
    createPayload.purpose === 'collection' &&
    !createPayload.remittanceConfigId
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'collection payments require remittanceConfigId'
    );
  }

  const { payment, created } = await paymentService.createOrGetPayment(
    createPayload
  );

  if (created) {
    await copilotActionService.recordExistingAction({
      tenantId,
      actorUserId: getActorUserId(req),
      actionType: 'create_payment',
      entityType: 'payment',
      entityId: String(payment._id || payment.id || ''),
      payload: {
        source: 'payment.controller.createPayment',
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.reference,
        idempotencyKey: createPayload.idempotencyKey || null,
      },
      source: 'existing-service',
      priority: 7,
    });
  }
  res.status(created ? httpStatus.CREATED : httpStatus.OK).send(payment);
});

// Get payment by ID
const getPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentById(
    req.params.paymentId,
    getRequestTenantId(req)
  );
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  res.send(payment);
});

// Get payment by reference
const getPaymentByReference = catchAsync(async (req, res) => {
  const payment = await paymentService.getPaymentByReference(
    req.params.reference,
    getRequestTenantId(req)
  );
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  res.send(payment);
});

// Update payment by ID
const updatePayment = catchAsync(async (req, res) => {
  const updatedPayment = await paymentService.updatePaymentById(
    req.params.paymentId,
    req.body,
    getRequestTenantId(req)
  );
  res.send(updatedPayment);
});

// Delete payment by ID
const deletePayment = catchAsync(async (req, res) => {
  await paymentService.deletePaymentById(
    req.params.paymentId,
    getRequestTenantId(req)
  );
  res.status(httpStatus.NO_CONTENT).send();
});

// Query payments with filters and pagination
const queryPayments = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    'tenantId',
    'userId',
    'status',
    'purpose',
    'beneficiaryType',
    'reference',
    'submissionId',
    'moduleId',
    'paymentMethod',
    'currency',
    'providerRef',
    'amount',
  ]);
  if (req.user?.tenantId) {
    filter.tenantId = req.user.tenantId;
  }
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await paymentService.queryPayments(
    filter,
    options,
    getRequestTenantId(req)
  );
  res.send(result);
});

// Get payments by status
const getPaymentsByStatus = catchAsync(async (req, res) => {
  const payments = await paymentService.getPaymentsByStatus(
    req.query.status,
    getRequestTenantId(req)
  );
  res.send(payments);
});

// Get payments by user
const getPaymentsByUser = catchAsync(async (req, res) => {
  const payments = await paymentService.getPaymentsByUser(
    req.params.userId,
    getRequestTenantId(req)
  );
  res.send(payments);
});

// Process a payment
const processPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.processPayment(
    req.params.paymentId,
    req.body,
    getRequestTenantId(req)
  );
  await copilotActionService.recordExistingAction({
    tenantId: getRequestTenantId(req) || payment.tenantId,
    actorUserId: getActorUserId(req),
    actionType: 'process_payment',
    entityType: 'payment',
    entityId: String(payment._id || payment.id || req.params.paymentId),
    payload: {
      source: 'payment.controller.processPayment',
      reference: payment.reference || null,
    },
    source: 'existing-service',
    priority: 7,
  });
  res.send(payment);
});

// Complete a payment
const completePayment = catchAsync(async (req, res) => {
  const payment = await paymentService.completePayment(
    req.params.paymentId,
    req.body,
    getRequestTenantId(req)
  );
  await copilotActionService.recordExistingAction({
    tenantId: getRequestTenantId(req) || payment.tenantId,
    actorUserId: getActorUserId(req),
    actionType: 'complete_payment',
    entityType: 'payment',
    entityId: String(payment._id || payment.id || req.params.paymentId),
    payload: {
      source: 'payment.controller.completePayment',
      reference: payment.reference || null,
    },
    source: 'existing-service',
    priority: 8,
  });
  res.send(payment);
});

// Cancel a payment
const cancelPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.cancelPayment(
    req.params.paymentId,
    req.body?.reason,
    getRequestTenantId(req)
  );
  await copilotActionService.recordExistingAction({
    tenantId: getRequestTenantId(req) || payment.tenantId,
    actorUserId: getActorUserId(req),
    actionType: 'cancel_payment',
    entityType: 'payment',
    entityId: String(payment._id || payment.id || req.params.paymentId),
    payload: {
      source: 'payment.controller.cancelPayment',
      reference: payment.reference || null,
      reason: req.body?.reason || null,
    },
    source: 'existing-service',
    priority: 8,
  });
  res.send(payment);
});

// Refund a payment
const refundPayment = catchAsync(async (req, res) => {
  const payment = await paymentService.refundPayment(
    req.params.paymentId,
    req.body,
    getRequestTenantId(req)
  );
  await copilotActionService.recordExistingAction({
    tenantId: getRequestTenantId(req) || payment.tenantId,
    actorUserId: getActorUserId(req),
    actionType: 'refund_payment',
    entityType: 'payment',
    entityId: String(payment._id || payment.id || req.params.paymentId),
    payload: {
      source: 'payment.controller.refundPayment',
      reference: payment.reference || null,
    },
    source: 'existing-service',
    priority: 8,
  });
  res.send(payment);
});

// Generate payment receipt
const generatePaymentReceipt = catchAsync(async (req, res) => {
  const receipt = await paymentService.generatePaymentReceipt(
    req.params.paymentId,
    getRequestTenantId(req)
  );
  res.send(receipt);
});

// Payment provider webhook (signature-verified, replay-safe)
const paymentWebhook = catchAsync(async (req, res) => {
  const result = await paymentWebhookService.processWebhookEvent(req);

  const actionTypeByStatus = {
    processing: 'process_payment',
    completed: 'complete_payment',
    cancelled: 'cancel_payment',
    refunded: 'refund_payment',
  };

  if (
    result?.processed &&
    result?.status &&
    actionTypeByStatus[result.status]
  ) {
    await copilotActionService.recordExistingAction({
      tenantId: req.body?.tenantId || null,
      actorUserId: null,
      actionType: actionTypeByStatus[result.status],
      entityType: 'payment',
      entityId: result.paymentId,
      payload: {
        source: 'payment.controller.paymentWebhook',
        paymentReference: result.paymentReference,
        provider: req.get('x-payment-provider') || req.body?.provider || null,
      },
      source: 'existing-service',
      priority: 8,
    });
  }

  res.status(httpStatus.OK).send({
    received: true,
    duplicate: !!result?.duplicate,
    processed: !!result?.processed,
    ignored: !!result?.ignored,
  });
});

module.exports = {
  createPayment,
  getPayment,
  getPaymentByReference,
  updatePayment,
  deletePayment,
  queryPayments,
  getPaymentsByStatus,
  getPaymentsByUser,
  processPayment,
  completePayment,
  cancelPayment,
  refundPayment,
  generatePaymentReceipt,
  paymentWebhook,
};
