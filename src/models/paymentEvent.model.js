const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const PAYMENT_EVENT_TYPES = [
  'created',
  'status_changed',
  'processing_started',
  'completed',
  'cancelled',
  'refunded',
  'failed',
  'reconciliation_marked_failed',
  'remittance_queued',
  'provider_checkout_initialized',
  'provider_webhook_received',
  'provider_verification_succeeded',
  'provider_verification_failed',
  'provider_settlement_confirmed',
  'settlement_queued',
  'settlement_awaiting_provider_settlement',
  'settlement_processing',
  'settlement_successful',
  'settlement_failed',
];

const paymentEventSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    paymentReference: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: PAYMENT_EVENT_TYPES,
      index: true,
    },
    fromStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    },
    toStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    },
    source: {
      type: String,
      default: 'api',
      index: true,
    },
    sourceRef: {
      type: String,
      index: true,
    },
    dedupeKey: {
      type: String,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  }
);

paymentEventSchema.index({ tenantId: 1, paymentReference: 1, createdAt: -1 });
paymentEventSchema.index(
  { tenantId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } },
  }
);

paymentEventSchema.plugin(toJSON);
paymentEventSchema.plugin(paginate);

const PaymentEvent = mongoose.model('PaymentEvent', paymentEventSchema);
PaymentEvent.PAYMENT_EVENT_TYPES = PAYMENT_EVENT_TYPES;

module.exports = PaymentEvent;
