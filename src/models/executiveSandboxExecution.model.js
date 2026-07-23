const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const executiveSandboxExecutionSchema = new mongoose.Schema(
  {
    sandboxExecutionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    requestId: {
      type: String,
      default: null,
      index: true,
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
    artifactVersion: {
      type: Number,
      default: null,
    },
    runtime: {
      type: String,
      enum: ['python', 'sql', 'html', 'report'],
      required: true,
      index: true,
    },
    sandboxProvider: {
      type: String,
      default: 'disabled',
      trim: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'blocked', 'destroyed'],
      required: true,
      index: true,
    },
    codeFingerprint: {
      type: String,
      required: true,
      index: true,
    },
    codeBytes: {
      type: Number,
      required: true,
    },
    inputManifest: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    outputManifest: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    limits: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    validationResult: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    policySnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    errorCategory: {
      type: String,
      default: null,
      index: true,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    destroyedAt: {
      type: Date,
      default: null,
    },
    retentionExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

executiveSandboxExecutionSchema.index({
  tenantId: 1,
  requestId: 1,
  createdAt: -1,
});
executiveSandboxExecutionSchema.index({
  tenantId: 1,
  status: 1,
  createdAt: -1,
});

executiveSandboxExecutionSchema.plugin(toJSON);
executiveSandboxExecutionSchema.plugin(paginate);

const ExecutiveSandboxExecution = mongoose.model(
  'ExecutiveSandboxExecution',
  executiveSandboxExecutionSchema
);

module.exports = ExecutiveSandboxExecution;
