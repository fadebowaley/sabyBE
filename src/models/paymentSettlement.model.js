const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const SETTLEMENT_STATUSES = [
  'pending',
  'queued',
  'processing',
  'successful',
  'failed',
  'reversed',
  'cancelled',
];

const DESTINATION_TYPES = [
  'tenant_global',
  'specific_node',
  'ancestor_level_node',
  'form_field',
];

const AVAILABILITY_STATUSES = [
  'unknown',
  'awaiting_provider_settlement',
  'available_for_payout',
  'transfer_processing',
  'settled',
  'failed',
];

const FUNDING_STATUSES = [
  'unconfirmed',
  'provider_verified',
  'provider_settled',
  'funded',
  'blocked_guardrail',
];

const paymentSettlementSchema = mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    paymentReference: { type: String, required: true, index: true },
    projectFormId: { type: String, index: true },
    submissionId: { type: String, index: true },
    provider: { type: String, required: true, index: true },
    currency: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    fee: { type: Number, default: 0 },
    serviceFee: { type: Number, default: 0 },
    serviceFeeRate: { type: Number, default: null },
    serviceFeeFlat: { type: Number, default: null },
    netAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: SETTLEMENT_STATUSES,
      default: 'pending',
      index: true,
    },
    availabilityStatus: {
      type: String,
      enum: AVAILABILITY_STATUSES,
      default: 'unknown',
      index: true,
    },
    availabilityCheckedAt: { type: Date },
    availableBalance: { type: Number },
    fundingStatus: {
      type: String,
      enum: FUNDING_STATUSES,
      default: 'unconfirmed',
      index: true,
    },
    providerSettlementId: { type: String, index: true },
    providerSettledAt: { type: Date },
    guardrailStatus: {
      type: String,
      enum: ['none', 'review_required', 'approved', 'rejected'],
      default: 'none',
      index: true,
    },
    guardrailReason: { type: String },
    sourceType: { type: String, default: 'saby_balance' },
    destinationType: {
      type: String,
      enum: DESTINATION_TYPES,
      required: true,
      index: true,
    },
    destinationNodeId: { type: String, index: true },
    destinationNodeReference: { type: String, index: true },
    destinationNodeName: { type: String },
    sourceNodeId: { type: String, index: true },
    sourceNodeReference: { type: String, index: true },
    sourceNodeName: { type: String },
    targetLevelId: { type: String, index: true },
    destinationAccount: { type: mongoose.Schema.Types.Mixed, default: {} },
    providerTransferId: { type: String, index: true },
    providerReference: { type: String, index: true },
    idempotencyKey: { type: String, required: true, index: true },
    attempts: { type: Number, default: 0 },
    failureReason: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

paymentSettlementSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  }
);
paymentSettlementSchema.index(
  { provider: 1, providerReference: 1 },
  {
    unique: true,
    partialFilterExpression: { providerReference: { $type: 'string' } },
  }
);
paymentSettlementSchema.index({
  tenantId: 1,
  paymentId: 1,
  destinationNodeId: 1,
  provider: 1,
});

paymentSettlementSchema.plugin(toJSON);
paymentSettlementSchema.plugin(paginate);

const PaymentSettlement = mongoose.model(
  'PaymentSettlement',
  paymentSettlementSchema
);

PaymentSettlement.SETTLEMENT_STATUSES = SETTLEMENT_STATUSES;
PaymentSettlement.DESTINATION_TYPES = DESTINATION_TYPES;
PaymentSettlement.AVAILABILITY_STATUSES = AVAILABILITY_STATUSES;
PaymentSettlement.FUNDING_STATUSES = FUNDING_STATUSES;

module.exports = PaymentSettlement;
