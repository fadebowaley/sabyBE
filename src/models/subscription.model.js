const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const SUBSCRIPTION_STATUSES = [
  'pending',
  'trialing',
  'active',
  'paused',
  'past_due',
  'cancelled',
  'expired',
];

const BILLING_PERIODS = ['monthly', 'annual'];

const subscriptionAddonSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

const subscriptionSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      default: null,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    planName: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: 'pending',
      index: true,
    },
    billingPeriod: {
      type: String,
      enum: BILLING_PERIODS,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    addOns: {
      type: [subscriptionAddonSchema],
      default: [],
    },
    featureOverrides: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    usageCounters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    pricingSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    entitlementsSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    providerMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    paymentProvider: {
      type: String,
      default: null,
      trim: true,
    },
    paymentReference: {
      type: String,
      default: null,
      trim: true,
    },
    paymentId: {
      type: String,
      default: null,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    lastPaymentAt: {
      type: Date,
      default: null,
    },
    currentPeriodStart: {
      type: Date,
      default: null,
    },
    currentPeriodEnd: {
      type: Date,
      default: null,
    },
    renewalAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

subscriptionSchema.plugin(toJSON);
subscriptionSchema.plugin(paginate);

module.exports = mongoose.model('Subscription', subscriptionSchema);
