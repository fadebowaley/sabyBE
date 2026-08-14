const Joi = require('joi');

const getPaymentFlow = {
  query: Joi.object().keys({
    tenantId: Joi.string().max(128),
    userId: Joi.string().max(128),
    provider: Joi.string().valid('flutterwave', 'paystack', 'sabypay', '9psb', 'premium'),
    paymentStatus: Joi.string().valid('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'),
    fundingStatus: Joi.string().valid('unconfirmed', 'provider_verified', 'provider_settled', 'funded', 'blocked_guardrail'),
    reconciliationStatus: Joi.string().valid('clean', 'stuck_recovered', 'pending_remittance'),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    search: Joi.string().max(256),
    sortBy: Joi.string().valid('payment_created_at', 'amount', 'payment_status', 'provider', 'updated_at').default('payment_created_at'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};

module.exports = { getPaymentFlow };
