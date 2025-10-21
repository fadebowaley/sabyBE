const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const apiKeySchema = mongoose.Schema(
  {
    // Raw key is never stored – only hashed
    hashedKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
    },
    tenant: {
      type: String,
      required: true,
    },
    environment: {
      type: String,
      enum: ['production', 'development', 'staging'],
      default: 'development',
    },
    permissions: {
      type: [String], // e.g., ['read', 'write', 'delete']
      default: ['read'],
    },
    category: {
      type: String,
      enum: [
        'web',
        'api',
        'mobile',
        'internal',
        'external',
        'partner',
        'system',
      ],
      default: 'web',
    },
    scope: {
      type: String, // DEPRECATED: Use category instead
      enum: [
        'api',
        'mobile',
        'web',
        'internal',
        'external',
        'partner',
        'system',
      ],
      default: 'api',
    },
    expires: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsedAt: {
      type: Date,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    rateLimit: {
      type: Number, // requests per minute
      default: 1000,
    },
    metadata: {
      ipAddress: { type: String },
      userAgent: { type: String },
    },
    // NEW FIELDS FOR APPROVAL WORKFLOW
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'auto-approved'],
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
    rejectionReason: {
      type: String,
      default: null,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isProductionReady: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Add plugin to convert mongoose to JSON
apiKeySchema.plugin(toJSON);
apiKeySchema.plugin(paginate);

/**
 * @typedef ApiKey
 */

// models/apiKey.model.js
apiKeySchema.statics.generateKey = async function ({
  tenantId,
  label,
  environment = 'production',
  permissions = ['read'],
  category = 'web',
  scope, // Deprecated
  rateLimit = 1000,
  expires,
  createdBy,
}) {
  let prefix = 'sk_';
  if (environment === 'production') {
    prefix = 'sk_live_';
  } else if (environment === 'staging') {
    prefix = 'sk_staging_';
  } else {
    prefix = 'sk_test_';
  }

  // Generate 64-character key (industry standard: prefix + 64 hex chars)
  const rawKey = prefix + require('crypto').randomBytes(32).toString('hex');
  const hashedKey = require('crypto')
    .createHash('sha256')
    .update(rawKey)
    .digest('hex');

  // Auto-approve non-production keys
  const approvalStatus =
    environment === 'production' ? 'pending' : 'auto-approved';
  const isActive = environment !== 'production'; // Auto-activate non-prod keys

  const keyDoc = await this.create({
    tenant: tenantId,
    label,
    environment,
    permissions,
    category: category || scope || 'web',
    scope: scope || category || 'web', // Backward compatibility
    rateLimit,
    expires,
    hashedKey,
    createdBy,
    requestedBy: createdBy,
    approvalStatus,
    isActive,
    isProductionReady: false,
  });

  return { rawKey, keyDoc };
};

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;
