const Joi = require('joi');
const { objectId } = require('./custom.validation');
const subscriptionCatalogValidation = require('./subscriptionCatalog.validation');

const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
  'refunded',
];
const PURPOSES = ['subscription', 'collection', 'ai_tokens'];
const BENEFICIARY_TYPES = ['saby', 'tenant'];
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
  'full_credit',
  'credit_card',
  'debit_card',
  'paypal',
  'bank_transfer',
  'crypto',
];

const subscriptionCheckout = {
  body: Joi.object().keys({
    plan: subscriptionCatalogValidation.subscriptionPlanId.required(),
    billingPeriod: subscriptionCatalogValidation.subscriptionBillingPeriod.default('monthly'),
    period: subscriptionCatalogValidation.subscriptionBillingPeriod.optional(),
    currency: subscriptionCatalogValidation.subscriptionCurrency.default('NGN'),
    provider: subscriptionCatalogValidation.subscriptionProvider.default('paystack'),
    addOns: subscriptionCatalogValidation.subscriptionAddonIds,
    code: Joi.string().trim().allow('', null).optional(),
    promoCode: Joi.string().trim().allow('', null).optional(),
    returnUrl: Joi.string().uri().optional().allow('', null),
  }),
};

// Validation schema for creating a new payment
const createPayment = {
  body: Joi.object().keys({
    tenantId: Joi.string().optional(),
    userId: Joi.string().optional(),
    amount: Joi.number().min(0).required(),
    currency: Joi.string().valid(...PAYMENT_CURRENCIES).required(),
    status: Joi.string()
      .valid(...PAYMENT_STATUSES)
      .default('pending'),
    purpose: Joi.string()
      .valid(...PURPOSES)
      .required(),
    beneficiaryType: Joi.string()
      .valid(...BENEFICIARY_TYPES)
      .optional(),
    submissionId: Joi.string().optional().allow('', null),
    moduleId: Joi.string().optional().allow('', null),
    remittanceConfigId: Joi.when('purpose', {
      is: 'collection',
      then: Joi.string().required(),
      otherwise: Joi.string().optional().allow('', null),
    }),
    providerRef: Joi.string().optional().allow('', null),
    idempotencyKey: Joi.string().max(120).optional(),
    reference: Joi.string().required(),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS).required(),
    paymentDate: Joi.date().default(Date.now),
    total: Joi.number().min(0).required(),
    metadata: Joi.object().optional(),
    paymentDetails: Joi.object().optional(),
  }),
};

// Validation schema for querying payments
const queryPayments = {
  query: Joi.object().keys({
    tenantId: Joi.string(),
    userId: Joi.string(),
    status: Joi.string().valid(...PAYMENT_STATUSES),
    purpose: Joi.string().valid(...PURPOSES),
    beneficiaryType: Joi.string().valid(...BENEFICIARY_TYPES),
    reference: Joi.string(),
    submissionId: Joi.string(),
    moduleId: Joi.string(),
    remittanceConfigId: Joi.string(),
    providerRef: Joi.string(),
    idempotencyKey: Joi.string(),
    paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
    currency: Joi.string().valid(...PAYMENT_CURRENCIES),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    sortBy: Joi.string(),
  }),
};

// Validation schema for fetching a payment by ID
const getPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
};

// Validation schema for fetching a payment by reference
const getPaymentByReference = {
  params: Joi.object().keys({
    reference: Joi.string().required(),
  }),
};

// Validation schema for updating a payment
const updatePayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      amount: Joi.number(),
      currency: Joi.string().valid(...PAYMENT_CURRENCIES),
      status: Joi.string().valid(...PAYMENT_STATUSES),
      purpose: Joi.string().valid(...PURPOSES),
      beneficiaryType: Joi.string().valid(...BENEFICIARY_TYPES),
      submissionId: Joi.string().allow('', null),
      moduleId: Joi.string().allow('', null),
      remittanceConfigId: Joi.string().allow('', null),
      providerRef: Joi.string().allow('', null),
      reference: Joi.string(),
      paymentMethod: Joi.string().valid(...PAYMENT_METHODS),
      total: Joi.number(),
      metadata: Joi.object(),
    })
    .min(1),
};

// Validation schema for deleting a payment
const deletePayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
};

// Validation schema for fetching payments by status
const getPaymentsByStatus = {
  query: Joi.object().keys({
    status: Joi.string()
      .valid(...PAYMENT_STATUSES)
      .required(),
  }),
};

// Validation schema for fetching payments by user
const getPaymentsByUser = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

// Validation schema for processing a payment
const processPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      providerRef: Joi.string().allow('', null),
      paymentDetails: Joi.object().optional(),
      metadata: Joi.object().optional(),
    })
    .unknown(true),
};

// Validation schema for completing a payment
const completePayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      providerRef: Joi.string().allow('', null),
      completionDetails: Joi.object().optional(),
      metadata: Joi.object().optional(),
    })
    .unknown(true),
};

// Validation schema for canceling a payment
const cancelPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      reason: Joi.string().max(500).required(),
      metadata: Joi.object().optional(),
    })
    .unknown(true),
};

// Validation schema for refunding a payment
const refundPayment = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      reason: Joi.string().max(500).allow('', null),
      amount: Joi.number().positive().optional(),
      refundDetails: Joi.object().optional(),
      metadata: Joi.object().optional(),
    })
    .unknown(true),
};

// Validation schema for generating a payment receipt
const generatePaymentReceipt = {
  params: Joi.object().keys({
    paymentId: Joi.string().custom(objectId).required(),
  }),
};

const verifyReturn = {
  body: Joi.object().keys({
    provider: Joi.string().valid('flutterwave', 'paystack').required(),
    paymentReference: Joi.string().optional().allow('', null),
    reference: Joi.string().optional().allow('', null),
    tx_ref: Joi.string().optional().allow('', null),
    trxref: Joi.string().optional().allow('', null),
    payment_reference: Joi.string().optional().allow('', null),
    transactionId: Joi.string().optional().allow('', null),
    transaction_id: Joi.string().optional().allow('', null),
    id: Joi.string().optional().allow('', null),
  }).or('paymentReference', 'reference', 'tx_ref', 'trxref', 'payment_reference'),
};

module.exports = {
  subscriptionCheckout,
  createPayment,
  queryPayments,
  getPayment,
  getPaymentByReference,
  updatePayment,
  deletePayment,
  getPaymentsByStatus,
  getPaymentsByUser,
  processPayment,
  completePayment,
  cancelPayment,
  refundPayment,
  generatePaymentReceipt,
  verifyReturn,
};
