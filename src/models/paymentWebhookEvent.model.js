const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const paymentWebhookEventSchema = mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      default: 'unknown',
      index: true,
    },
    eventId: {
      type: String,
      index: true,
    },
    signature: {
      type: String,
      required: true,
    },
    signatureTimestamp: {
      type: Number,
      required: true,
      index: true,
    },
    replayKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    payloadHash: {
      type: String,
      required: true,
      index: true,
    },
    paymentReference: {
      type: String,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      index: true,
    },
    webhookStatus: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'failed'],
      default: 'received',
      index: true,
    },
    failureReason: {
      type: String,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

paymentWebhookEventSchema.index(
  { provider: 1, eventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      eventId: { $type: 'string' },
    },
  }
);

paymentWebhookEventSchema.plugin(toJSON);
paymentWebhookEventSchema.plugin(paginate);

const PaymentWebhookEvent = mongoose.model(
  'PaymentWebhookEvent',
  paymentWebhookEventSchema
);

module.exports = PaymentWebhookEvent;
