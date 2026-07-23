const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'refunded',
];

const PAYMENT_CURRENCIES = [
  'NGN',
  'USD',
  'EUR',
  'GBP',
  'INR',
  'AUD',
  'CAD',
  'SGD',
  'CHF',
  'MYR',
  'JPY',
  'CNY',
  'GHS',
  'KES',
  'ZAR',
  'AED',
  'SAR',
  'XOF',
  'XAF',
  'BRL',
  'MXN',
  'TRY',
];

const PAYMENT_METHODS = [
  'paystack',
  'flutterwave',
  '9psb',
  'premium',
  'sabypay',
  'trialling',
  'credit_card',
  'debit_card',
  'paypal',
  'bank_transfer',
  'crypto',
];

const paymentSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      enum: PAYMENT_CURRENCIES,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    purpose: {
      type: String,
      enum: ['subscription', 'collection'], //subscription for saby
      required: true,
      index: true,
    },
    beneficiaryType: {
      type: String,
      enum: ['saby', 'tenant'],
      required: true,
      index: true,
    },
    submissionId: {
      type: String,
      index: true,
    },
    moduleId: {
      type: String,
      index: true,
    },
    remittanceConfigId: {
      type: String,
    },
    providerRef: {
      type: String,
      index: true,
    },
    idempotencyKey: {
      type: String,
      index: true,
    },
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    total: {
      type: Number,
      required: true,
    },
    paymentDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    completionDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    refundDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    processedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    refundedAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
    },
    failureReason: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

paymentSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: 'string' },
    },
  }
);

paymentSchema.index({ tenantId: 1, status: 1, purpose: 1, createdAt: -1 });
paymentSchema.index({ tenantId: 1, submissionId: 1 });
paymentSchema.index({ tenantId: 1, moduleId: 1 });

// add plugin that converts mongoose to json
paymentSchema.plugin(toJSON);
paymentSchema.plugin(paginate);

/**
 * Create a new payment entry
 * @param {Object} body - The payment data object
 * @returns {Promise<Payment>}
 */
paymentSchema.statics.createPayment = async function (body) {
  const payment = new this(body);
  await payment.save();
  return payment;
};

/**
 * Get payment by reference
 * @param {String} reference - The payment reference
 * @returns {Promise<Payment>}
 */
paymentSchema.statics.getPaymentByReference = async function (reference) {
  return this.findOne({ reference });
};

/**
 * Update payment status
 * @param {String} reference - The payment reference
 * @param {String} status - The new status
 * @returns {Promise<Payment>}
 */
paymentSchema.statics.updatePaymentStatus = async function (reference, status) {
  const payment = await this.findOne({ reference });
  if (payment) {
    payment.status = status;
    await payment.save();
  }
  return payment;
};

/**
 * @typedef Payment
 */
const Payment = mongoose.model('Payment', paymentSchema);
Payment.PAYMENT_STATUSES = PAYMENT_STATUSES;
Payment.PAYMENT_METHODS = PAYMENT_METHODS;

module.exports = Payment;
