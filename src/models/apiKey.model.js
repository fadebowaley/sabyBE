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
    scope: {
      type: String, // e.g., 'mobile', 'api', 'crm'
      enum: ['api', 'mobile', 'web', 'internal', 'external', 'partner', 'system'],
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
  scope = 'api',
  rateLimit = 1000,
  expires,
}) {
  let prefix = 'sk_';
  if (environment === 'production') {
    prefix = 'sk_live_';
  } else {
    prefix = 'sk_test_';
  }
  const rawKey = prefix + require('crypto').randomBytes(32).toString('hex');
  const hashedKey = require('crypto')
    .createHash('sha256')
    .update(rawKey)
    .digest('hex');

  const keyDoc = await this.create({
    tenant: tenantId,
    label,
    environment,
    permissions,
    scope,
    rateLimit,
    expires,
    hashedKey,
  });

  return { rawKey, keyDoc };
};



const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;
