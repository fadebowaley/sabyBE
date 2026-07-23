const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const executiveSemanticMemorySchema = new mongoose.Schema(
  {
    memoryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['glossary_term', 'synonym', 'metric_alias', 'dataset_mapping', 'reporting_rule'],
      required: true,
      index: true,
    },
    term: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedTerm: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    definition: {
      type: String,
      default: null,
      trim: true,
    },
    aliases: {
      type: [String],
      default: [],
    },
    targetType: {
      type: String,
      enum: ['metric', 'dimension', 'field', 'project', 'form', 'dataset', 'node', 'level', 'structure', 'reporting_rule', 'general'],
      default: 'general',
      index: true,
    },
    targetRef: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    targetLabel: {
      type: String,
      default: null,
      trim: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    evidence: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    source: {
      type: String,
      enum: ['admin', 'user_correction', 'conversation', 'import', 'system_suggestion'],
      default: 'admin',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'archived'],
      default: 'pending',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    createdBy: {
      type: String,
      default: null,
      index: true,
    },
    reviewedBy: {
      type: String,
      default: null,
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      default: null,
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

executiveSemanticMemorySchema.index({ tenantId: 1, type: 1, approvalStatus: 1, createdAt: -1 });
executiveSemanticMemorySchema.index({ tenantId: 1, normalizedTerm: 1, targetType: 1, targetRef: 1 });

executiveSemanticMemorySchema.plugin(toJSON);
executiveSemanticMemorySchema.plugin(paginate);

const ExecutiveSemanticMemory = mongoose.model(
  'ExecutiveSemanticMemory',
  executiveSemanticMemorySchema
);

module.exports = ExecutiveSemanticMemory;
