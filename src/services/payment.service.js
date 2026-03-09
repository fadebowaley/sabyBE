const httpStatus = require('http-status');
const { Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const paymentRemittanceService = require('./paymentRemittance.service');
const paymentEventService = require('./paymentEvent.service');

const ALLOWED_STATUS_TRANSITIONS = {
  pending: ['processing', 'failed', 'cancelled'],
  processing: ['completed', 'failed', 'cancelled'],
  completed: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};

const buildScopedFilter = (baseFilter = {}, tenantId) => {
  if (!tenantId) {
    return { ...baseFilter };
  }
  return { ...baseFilter, tenantId };
};

const assertStatusTransition = (payment, nextStatus) => {
  if (!nextStatus || payment.status === nextStatus) {
    return;
  }

  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[payment.status] || [];
  if (!allowedTransitions.includes(nextStatus)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid payment status transition: ${payment.status} -> ${nextStatus}`
    );
  }
};

const applyStatusTimestamps = (payment, status) => {
  const now = new Date();
  if (status === 'processing') {
    payment.processedAt = now;
  }
  if (status === 'completed') {
    payment.completedAt = now;
  }
  if (status === 'cancelled') {
    payment.cancelledAt = now;
  }
  if (status === 'refunded') {
    payment.refundedAt = now;
  }
  if (status === 'failed') {
    payment.failedAt = now;
  }
};

const validatePaymentAmounts = (paymentBody) => {
  if (
    typeof paymentBody.amount === 'number' &&
    typeof paymentBody.total === 'number' &&
    paymentBody.total < paymentBody.amount
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'total amount cannot be less than amount'
    );
  }
};

/**
 * Create a new payment
 * @param {Object} paymentBody
 * @returns {Promise<Payment>}
 */
const createPayment = async (paymentBody) => {
  validatePaymentAmounts(paymentBody);
  try {
    const payment = await Payment.create(paymentBody);
    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'created',
      fromStatus: null,
      toStatus: payment.status,
      userId: payment.userId,
      source: 'api',
      dedupeKey: `payment-created:${payment.id}`,
      metadata: {
        purpose: payment.purpose,
        beneficiaryType: payment.beneficiaryType,
        amount: payment.amount,
        total: payment.total,
        currency: payment.currency,
      },
    });
    return payment;
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.reference) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Payment with this reference already exists'
      );
    }
    if (error?.code === 11000 && error?.keyPattern?.idempotencyKey) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Duplicate idempotency key for this tenant'
      );
    }
    throw error;
  }
};

/**
 * Create payment with idempotency support
 * @param {Object} paymentBody
 * @returns {Promise<{payment: Payment, created: boolean}>}
 */
const createOrGetPayment = async (paymentBody) => {
  validatePaymentAmounts(paymentBody);
  const { tenantId, idempotencyKey } = paymentBody;

  if (tenantId && idempotencyKey) {
    const existingPayment = await Payment.findOne({ tenantId, idempotencyKey });
    if (existingPayment) {
      return { payment: existingPayment, created: false };
    }
  }

  const payment = await createPayment(paymentBody);
  return { payment, created: true };
};

/**
 * Get payment by id
 * @param {ObjectId} id
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const getPaymentById = async (id, tenantId) => {
  const payment = await Payment.findOne(
    buildScopedFilter({ _id: id }, tenantId)
  );
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  return payment;
};

/**
 * Get payment by reference
 * @param {string} reference
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const getPaymentByReference = async (reference, tenantId) => {
  const payment = await Payment.findOne(
    buildScopedFilter({ reference }, tenantId)
  );
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  return payment;
};

/**
 * Update payment by id
 * @param {ObjectId} paymentId
 * @param {Object} updateBody
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const updatePaymentById = async (
  paymentId,
  updateBody,
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  const previousStatus = payment.status;
  if (updateBody.status) {
    assertStatusTransition(payment, updateBody.status);
    applyStatusTimestamps(payment, updateBody.status);
  }

  const nextAmount =
    typeof updateBody.amount === 'number' ? updateBody.amount : payment.amount;
  const nextTotal =
    typeof updateBody.total === 'number' ? updateBody.total : payment.total;
  if (
    typeof nextAmount === 'number' &&
    typeof nextTotal === 'number' &&
    nextTotal < nextAmount
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'total amount cannot be less than amount'
    );
  }

  Object.assign(payment, updateBody);
  await payment.save();

  if (updateBody.status && updateBody.status !== previousStatus) {
    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'status_changed',
      fromStatus: previousStatus,
      toStatus: payment.status,
      userId: context.userId || payment.userId,
      source: context.source || 'api',
      sourceRef: context.sourceRef || null,
      dedupeKey:
        context.dedupeKey ||
        `status-change:${payment.id}:${previousStatus}->${payment.status}:${Date.now()}`,
      metadata: {
        reason:
          updateBody.failureReason ||
          updateBody.cancellationReason ||
          context.reason ||
          null,
      },
    });
  }

  return payment;
};

/**
 * Delete payment by id
 * @param {ObjectId} paymentId
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const deletePaymentById = async (paymentId, tenantId) => {
  const payment = await getPaymentById(paymentId, tenantId);
  await payment.remove();
  return payment;
};

/**
 * Query for payments
 * @param {Object} filter - Mongoose filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [tenantId]
 * @returns {Promise<QueryResult>}
 */
const queryPayments = async (filter, options, tenantId) =>
  Payment.paginate(buildScopedFilter(filter, tenantId), options);

/**
 * Get payments by status
 * @param {string} status - Payment status
 * @param {string} [tenantId]
 * @returns {Promise<Array<Payment>>}
 */
const getPaymentsByStatus = async (status, tenantId) =>
  Payment.find(buildScopedFilter({ status }, tenantId));

/**
 * Get payments by user
 * @param {string} userId
 * @param {string} [tenantId]
 * @returns {Promise<Array<Payment>>}
 */
const getPaymentsByUser = async (userId, tenantId) =>
  Payment.find(buildScopedFilter({ userId }, tenantId));

/**
 * Process payment
 * @param {ObjectId} paymentId
 * @param {Object} paymentDetails
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const processPayment = async (
  paymentId,
  paymentDetails = {},
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'processing');
  const previousStatus = payment.status;

  payment.status = 'processing';
  applyStatusTimestamps(payment, 'processing');
  payment.paymentDetails = {
    ...payment.paymentDetails,
    ...(paymentDetails.paymentDetails || paymentDetails),
  };
  if (paymentDetails.providerRef) {
    payment.providerRef = paymentDetails.providerRef;
  }
  if (paymentDetails.metadata) {
    payment.metadata = { ...payment.metadata, ...paymentDetails.metadata };
  }

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'processing_started',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey:
      context.dedupeKey || `processing-started:${payment.id}:${payment.status}`,
    metadata: {
      providerRef: payment.providerRef || null,
    },
  });
  return payment;
};

/**
 * Complete payment
 * @param {ObjectId} paymentId
 * @param {Object} completionDetails
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const completePayment = async (
  paymentId,
  completionDetails = {},
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'completed');
  const previousStatus = payment.status;

  payment.status = 'completed';
  applyStatusTimestamps(payment, 'completed');
  payment.completionDetails = {
    ...payment.completionDetails,
    ...(completionDetails.completionDetails || completionDetails),
  };
  if (completionDetails.providerRef) {
    payment.providerRef = completionDetails.providerRef;
  }
  if (completionDetails.metadata) {
    payment.metadata = { ...payment.metadata, ...completionDetails.metadata };
  }

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'completed',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey: context.dedupeKey || `payment-completed:${payment.id}`,
    metadata: {
      providerRef: payment.providerRef || null,
    },
  });

  try {
    await paymentRemittanceService.enqueueIfEligible(payment, {
      trigger: 'payment.service.completePayment',
    });
  } catch (error) {
    logger.error(
      `[Payment Remittance] Failed to queue remittance for payment ${payment.reference}: ${error.message}`
    );
  }

  return payment;
};

/**
 * Cancel payment
 * @param {ObjectId} paymentId
 * @param {string} reason
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const cancelPayment = async (paymentId, reason, tenantId, context = {}) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'cancelled');
  const previousStatus = payment.status;

  payment.status = 'cancelled';
  applyStatusTimestamps(payment, 'cancelled');
  payment.cancellationReason = reason;

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'cancelled',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey: context.dedupeKey || `payment-cancelled:${payment.id}`,
    metadata: {
      reason: reason || null,
    },
  });
  return payment;
};

/**
 * Refund payment
 * @param {ObjectId} paymentId
 * @param {Object} refundDetails
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const refundPayment = async (
  paymentId,
  refundDetails = {},
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'refunded');
  const previousStatus = payment.status;

  if (
    typeof refundDetails.amount === 'number' &&
    Number(refundDetails.amount) !== Number(payment.total)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Partial refunds are not supported in this flow; refund amount must match total'
    );
  }

  payment.status = 'refunded';
  applyStatusTimestamps(payment, 'refunded');
  payment.refundDetails = {
    ...payment.refundDetails,
    ...(refundDetails.refundDetails || refundDetails),
  };
  if (refundDetails.reason) {
    payment.refundDetails.reason = refundDetails.reason;
  }
  if (refundDetails.amount) {
    payment.refundDetails.amount = refundDetails.amount;
  }
  if (refundDetails.metadata) {
    payment.metadata = { ...payment.metadata, ...refundDetails.metadata };
  }

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'refunded',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey: context.dedupeKey || `payment-refunded:${payment.id}`,
    metadata: {
      reason: payment.refundDetails?.reason || null,
      amount: payment.refundDetails?.amount || null,
    },
  });
  return payment;
};

/**
 * Generate payment receipt
 * @param {ObjectId} paymentId
 * @param {string} [tenantId]
 * @returns {Promise<string>} - Receipt URL or content
 */
const generatePaymentReceipt = async (paymentId, tenantId) => {
  const payment = await getPaymentById(paymentId, tenantId);

  // This would typically generate a PDF or other document
  // For now, we'll just return a placeholder
  return `Receipt for payment ${payment.reference}`;
};

module.exports = {
  createPayment,
  createOrGetPayment,
  getPaymentById,
  getPaymentByReference,
  updatePaymentById,
  deletePaymentById,
  queryPayments,
  getPaymentsByStatus,
  getPaymentsByUser,
  processPayment,
  completePayment,
  cancelPayment,
  refundPayment,
  generatePaymentReceipt,
};
