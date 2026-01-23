const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const apiKeyApprovalSchema = mongoose.Schema(
  {
    apiKey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiKey',
      required: true,
      index: true,
    },
    tenant: {
      type: String,
      required: true,
      index: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
    requestDetails: {
      label: String,
      category: String,
      environment: String,
      permissions: [String],
      rateLimit: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Plugins
apiKeyApprovalSchema.plugin(toJSON);
apiKeyApprovalSchema.plugin(paginate);

// Indexes for performance
apiKeyApprovalSchema.index({ tenant: 1, status: 1 });
apiKeyApprovalSchema.index({ status: 1, createdAt: -1 });
apiKeyApprovalSchema.index({ apiKey: 1 });

/**
 * @typedef ApiKeyApproval
 */

const ApiKeyApproval = mongoose.model('ApiKeyApproval', apiKeyApprovalSchema);

module.exports = ApiKeyApproval;
