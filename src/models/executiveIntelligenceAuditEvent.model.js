const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const executiveIntelligenceAuditEventSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      index: true,
      default: null,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      default: null,
      index: true,
    },
    component: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['started', 'completed', 'failed', 'blocked', 'warning'],
      required: true,
      index: true,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    inputReferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    outputReferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    artifactVersion: {
      type: Number,
      default: null,
    },
    modelIdentifier: {
      type: String,
      default: null,
    },
    tokenUsage: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    errorCategory: {
      type: String,
      default: null,
    },
    policyDecision: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

executiveIntelligenceAuditEventSchema.index({
  tenantId: 1,
  createdAt: -1,
});
executiveIntelligenceAuditEventSchema.index({
  tenantId: 1,
  requestId: 1,
  createdAt: -1,
});

executiveIntelligenceAuditEventSchema.plugin(toJSON);
executiveIntelligenceAuditEventSchema.plugin(paginate);

const ExecutiveIntelligenceAuditEvent = mongoose.model(
  'ExecutiveIntelligenceAuditEvent',
  executiveIntelligenceAuditEventSchema
);

module.exports = ExecutiveIntelligenceAuditEvent;
