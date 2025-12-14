const httpStatus = require('http-status');
const crypto = require('crypto');
const { ApiKey } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Query for API keys with tenant filtering
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryApiKeys = async (filter, options) => {
  const apiKeys = await ApiKey.paginate(filter, options);
  return apiKeys;
};

/**
 * Get API keys by tenant ID
 * @param {ObjectId} tenantId
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getApiKeysByTenant = async (tenantId, filter = {}, options = {}) => {
  const combinedFilter = { tenant: tenantId, ...filter };
  return queryApiKeys(combinedFilter, options);
};

/**
 * Get API key by id and tenant
 * @param {ObjectId} id
 * @param {ObjectId} tenantId
 * @returns {Promise<ApiKey>}
 */
const getApiKeyById = async (id, tenantId) => {
  console.log(
    '[getApiKeyById] Looking up ApiKey by _id:',
    id,
    'tenant:',
    tenantId
  );
  const apiKey = await ApiKey.findOne({ _id: id, tenant: tenantId });
  if (!apiKey) {
    throw new ApiError(httpStatus.NOT_FOUND, 'API key not found');
  }
  return apiKey;
};

/**
 * Get API key by hashed key
 * Note: Does not filter by isActive - allows finding keys for approval status checking
 * @param {string} hashedKey
 * @returns {Promise<ApiKey>}
 */
const getApiKeyByHash = async (hashedKey) => {
  console.log('[getApiKeyByHash] Looking up ApiKey by hashedKey:', hashedKey);
  const apiKey = await ApiKey.findOne({ hashedKey });
  console.log('[getApiKeyByHash] Query result:', {
    found: !!apiKey,
    id: apiKey?._id,
    label: apiKey?.label,
    environment: apiKey?.environment,
    isActive: apiKey?.isActive,
    approvalStatus: apiKey?.approvalStatus,
    tenant: apiKey?.tenant,
  });
  return apiKey;
};

/**
 * Verify API key and update usage
 * @param {string} rawKey
 * @returns {Promise<ApiKey>}
 */
const verifyApiKey = async (rawKey) => {
  console.log('[verifyApiKey] ===== Starting API key verification =====');
  console.log(
    '[verifyApiKey] Raw key received:',
    rawKey ? `${rawKey.substring(0, 10)}...` : 'null'
  );

  if (!rawKey) {
    console.log('[verifyApiKey] ❌ No API key provided');
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key is required');
  }

  // Extract the key from the authorization header if it's in Bearer format
  const key = rawKey.startsWith('Bearer ') ? rawKey.substring(7) : rawKey;
  console.log(
    '[verifyApiKey] Extracted key (first 15 chars):',
    key.substring(0, 15)
  );

  // Only accept keys that start with sk_
  if (!key.startsWith('sk_')) {
    console.log('[verifyApiKey] ❌ API key does not start with sk_');
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key must start with sk_');
  }

  // Hash the provided key (with prefix)
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');

  // Find the API key
  console.log('[verifyApiKey] Verifying API key with hash:', hashedKey);
  const apiKey = await getApiKeyByHash(hashedKey);
  console.log('[verifyApiKey] Database lookup result:', {
    found: !!apiKey,
    id: apiKey?._id,
    label: apiKey?.label,
  });

  if (!apiKey) {
    console.log('[verifyApiKey] ❌ API key not found in database');
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid API key');
  }

  console.log('[verifyApiKey] ✅ API key found. Checking status:', {
    id: apiKey._id,
    label: apiKey.label,
    environment: apiKey.environment,
    isActive: apiKey.isActive,
    approvalStatus: apiKey.approvalStatus,
    expires: apiKey.expires,
    usageCount: apiKey.usageCount,
    rateLimit: apiKey.rateLimit,
  });

  // Check if key is expired
  if (apiKey.expires && new Date() > apiKey.expires) {
    console.log(
      '[verifyApiKey] ❌ API key has expired. Expires:',
      apiKey.expires
    );
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key has expired');
  }
  console.log('[verifyApiKey] ✅ Expiration check passed');

  // For production keys: Check approval status FIRST (before checking isActive)
  // This allows us to return proper approval status errors for pending/rejected keys
  if (apiKey.environment === 'production') {
    console.log(
      '[verifyApiKey] 🔍 Production key detected. Checking approval status...'
    );
    console.log('[verifyApiKey] Approval status:', apiKey.approvalStatus);
    console.log(
      '[verifyApiKey] Is production ready:',
      apiKey.isProductionReady
    );

    if (apiKey.approvalStatus !== 'approved') {
      const statusMessage =
        apiKey.approvalStatus === 'pending'
          ? 'This production API key is pending approval. Please wait for SabyUser approval before using it.'
          : apiKey.approvalStatus === 'rejected'
          ? `This production API key was rejected. Reason: ${
              apiKey.rejectionReason || 'No reason provided'
            }`
          : 'This production API key is not approved for use.';

      console.log('[verifyApiKey] ❌ Production key not approved:', {
        status: apiKey.approvalStatus,
        message: statusMessage,
      });
      throw new ApiError(httpStatus.FORBIDDEN, statusMessage);
    }
    console.log('[verifyApiKey] ✅ Approval status check passed');

    // Ensure production key is production-ready
    if (!apiKey.isProductionReady) {
      console.log('[verifyApiKey] ❌ Production key not ready');
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'This production API key is not ready for use. Please contact support.'
      );
    }
    console.log('[verifyApiKey] ✅ Production readiness check passed');
  } else {
    console.log(
      '[verifyApiKey] 🔍 Staging key detected. Skipping approval check.'
    );
  }

  // Check if key is active (after approval check, so pending keys get proper error)
  console.log('[verifyApiKey] 🔍 Checking if key is active:', apiKey.isActive);
  if (!apiKey.isActive) {
    console.log('[verifyApiKey] ❌ API key is inactive');
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key is inactive');
  }
  console.log('[verifyApiKey] ✅ Active status check passed');

  // For staging keys: Check usage limit BEFORE incrementing
  // We check if the NEXT call would exceed the limit (usageCount + 1 > limit)
  // This ensures exactly 100 calls are allowed (0-99 increment to 1-100, then 101st call is blocked)
  if (apiKey.environment === 'staging') {
    const stagingLimit = apiKey.stagingUsageLimit || 50; // Default limit
    console.log('[verifyApiKey] 🔍 Checking staging usage limit:', {
      currentUsage: apiKey.usageCount,
      limit: stagingLimit,
      nextUsage: apiKey.usageCount + 1,
    });
    // Check if adding 1 would exceed the limit
    if (apiKey.usageCount + 1 > stagingLimit) {
      console.log('[verifyApiKey] ❌ Staging usage limit reached');
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Staging API key usage limit reached (${stagingLimit} calls). Please request a production API key for continued access. Your production key request will be reviewed and approved by SabyUser.`
      );
    }
    console.log('[verifyApiKey] ✅ Staging usage limit check passed');
  }

  // Update last used timestamp and usage count
  // Note: For staging keys, this increment happens AFTER the limit check
  // So if usageCount is 99, it will increment to 100, and the next call will be blocked
  console.log('[verifyApiKey] 📝 Updating usage for key _id:', apiKey._id);
  console.log('[verifyApiKey] Current usage count:', apiKey.usageCount);
  const updateResult = await ApiKey.findByIdAndUpdate(
    apiKey._id,
    {
      lastUsedAt: new Date(),
      $inc: { usageCount: 1 },
    },
    { new: true } // Return updated document
  );

  // Update the apiKey object with new usageCount for accurate tracking
  if (updateResult) {
    apiKey.usageCount = updateResult.usageCount;
    console.log(
      '[verifyApiKey] ✅ Usage updated. New count:',
      apiKey.usageCount
    );
  }

  console.log('[verifyApiKey] ✅✅✅ API key verification SUCCESSFUL ✅✅✅');
  console.log('[verifyApiKey] Final key details:', {
    id: apiKey._id,
    label: apiKey.label,
    environment: apiKey.environment,
    usageCount: apiKey.usageCount,
    lastUsedAt: updateResult?.lastUsedAt,
  });
  console.log('[verifyApiKey] ===== Verification complete =====');

  return apiKey;
};

/**
 * Create an API key
 * @param {Object} apiKeyBody
 * @param {ObjectId} tenantId
 * @param {ObjectId} userId
 * @param {Object} user
 * @returns {Promise<{apiKey: ApiKey, rawKey: string}>}
 */
const createApiKey = async (apiKeyBody, tenantId, userId, user) => {
  const category = apiKeyBody.category || apiKeyBody.scope || 'web';

  // Validate category access
  const apiKeyApprovalService = require('./apiKeyApproval.service');
  if (!apiKeyApprovalService.canCreateCategory(user, category)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `Only SabyUser can create ${category} API keys`
    );
  }

  // Generate API key
  const { rawKey, keyDoc } = await ApiKey.generateKey({
    tenantId,
    label: apiKeyBody.label,
    environment: apiKeyBody.environment,
    permissions: apiKeyBody.permissions || ['read'],
    category,
    scope: apiKeyBody.scope, // Deprecated
    rateLimit: apiKeyBody.rateLimit || 1000,
    expires: apiKeyBody.expires,
    createdBy: userId,
  });

  // If production, create approval request
  if (apiKeyBody.environment === 'production') {
    await apiKeyApprovalService.createApprovalRequest(keyDoc, userId, tenantId);
  }

  return { apiKey: keyDoc, rawKey };
};

/**
 * Update API key by id
 * @param {ObjectId} apiKeyId
 * @param {Object} updateBody
 * @param {ObjectId} tenantId
 * @returns {Promise<ApiKey>}
 */
const updateApiKeyById = async (apiKeyId, updateBody, tenantId) => {
  const apiKey = await getApiKeyById(apiKeyId, tenantId);

  // Don't allow updating tenant or hashedKey
  const allowedUpdates = [
    'label',
    'isActive',
    'permissions',
    'scope',
    'rateLimit',
    'expires',
  ];
  const updates = {};

  allowedUpdates.forEach((field) => {
    if (updateBody[field] !== undefined) {
      updates[field] = updateBody[field];
    }
  });

  Object.assign(apiKey, updates);
  await apiKey.save();
  return apiKey;
};

/**
 * Delete API key by id
 * @param {ObjectId} apiKeyId
 * @param {ObjectId} tenantId
 * @returns {Promise<ApiKey>}
 */
const deleteApiKeyById = async (apiKeyId, tenantId) => {
  const apiKey = await getApiKeyById(apiKeyId, tenantId);
  await apiKey.remove();
  return apiKey;
};

/**
 * Regenerate API key
 * @param {ObjectId} apiKeyId
 * @param {ObjectId} tenantId
 * @returns {Promise<{apiKey: ApiKey, rawKey: string}>}
 */
const regenerateApiKey = async (apiKeyId, tenantId) => {
  const existingKey = await getApiKeyById(apiKeyId, tenantId);

  // Determine prefix based on environment
  let prefix = 'sk_staging_';
  if (existingKey.environment === 'production') {
    prefix = 'sk_live_';
  } else {
    // Default to staging
    prefix = 'sk_staging_';
  }

  // Generate new key with proper prefix (64 hex chars after prefix)
  const rawKey = prefix + crypto.randomBytes(32).toString('hex');
  const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

  // Update the existing key with new hash
  existingKey.hashedKey = hashedKey;
  existingKey.usageCount = 0; // Reset usage count
  existingKey.lastUsedAt = null; // Reset last used

  await existingKey.save();

  return { apiKey: existingKey, rawKey };
};

/**
 * Get API key analytics
 * @param {ObjectId} apiKeyId
 * @param {ObjectId} tenantId
 * @param {Object} options - Analytics options
 * @returns {Promise<Object>}
 */
const getApiKeyAnalytics = async (apiKeyId, tenantId, options = {}) => {
  const apiKey = await getApiKeyById(apiKeyId, tenantId);

  const {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    endDate = new Date(),
    granularity = 'day',
  } = options;

  // For now, return basic analytics from the API key model
  // In a real implementation, you would aggregate from a usage logs collection
  const analytics = {
    totalRequests: apiKey.usageCount || 0,
    successfulRequests: Math.floor((apiKey.usageCount || 0) * 0.95), // 95% success rate simulation
    failedRequests: Math.floor((apiKey.usageCount || 0) * 0.05),
    averageResponseTime: 145.5,
    rateLimit: apiKey.rateLimit,
    currentPeriodUsage: apiKey.usageCount || 0,
    lastUsed: apiKey.lastUsedAt,
    requestsOverTime: [
      // This would typically come from a logs collection
      {
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
      {
        timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
      {
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
      {
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
      {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
      {
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        count: Math.floor(Math.random() * 100),
      },
    ],
    topEndpoints: [
      {
        endpoint: '/api/v1/users',
        count: Math.floor((apiKey.usageCount || 0) * 0.3),
      },
      {
        endpoint: '/api/v1/projects',
        count: Math.floor((apiKey.usageCount || 0) * 0.25),
      },
      {
        endpoint: '/api/v1/forms',
        count: Math.floor((apiKey.usageCount || 0) * 0.2),
      },
      {
        endpoint: '/api/v1/analytics',
        count: Math.floor((apiKey.usageCount || 0) * 0.15),
      },
      {
        endpoint: '/api/v1/auth',
        count: Math.floor((apiKey.usageCount || 0) * 0.1),
      },
    ],
    permissions: apiKey.permissions,
    scope: apiKey.scope,
    environment: apiKey.environment,
    createdAt: apiKey.createdAt,
    expiresAt: apiKey.expires,
  };

  return analytics;
};

/**
 * Check rate limit for API key
 * @param {ObjectId} apiKeyId
 * @param {number} currentUsage
 * @returns {Promise<boolean>}
 */
const checkRateLimit = async (apiKeyId, currentUsage) => {
  const apiKey = await ApiKey.findById(apiKeyId);
  if (!apiKey) {
    return false;
  }

  // Simple rate limiting check
  // In a real implementation, you would use Redis or similar for sliding window rate limiting
  return currentUsage < apiKey.rateLimit;
};

/**
 * Deactivate expired API keys
 * @returns {Promise<number>} Number of keys deactivated
 */
const deactivateExpiredKeys = async () => {
  const result = await ApiKey.updateMany(
    {
      expires: { $lt: new Date() },
      isActive: true,
    },
    {
      isActive: false,
    }
  );

  return result.modifiedCount;
};

/**
 * Auto-generate web API keys on user registration
 * @param {string} tenantId
 * @param {ObjectId} userId
 * @returns {Promise<{staging: object, production: object}>}
 */
const autoGenerateWebApiKeys = async (tenantId, userId) => {
  const apiKeyApprovalService = require('./apiKeyApproval.service');

  // 1. Create Staging Web API Key (Active immediately)
  const stagingKey = await ApiKey.generateKey({
    tenantId,
    label: 'Web Staging Key (Auto-generated)',
    environment: 'staging',
    category: 'web',
    permissions: ['read', 'write'],
    rateLimit: 1000,
    createdBy: userId,
  });

  // Staging key is auto-approved and active
  stagingKey.keyDoc.approvalStatus = 'auto-approved';
  stagingKey.keyDoc.isActive = true;
  await stagingKey.keyDoc.save();

  // 2. Create Production Web API Key (Pending Approval)
  const productionKey = await ApiKey.generateKey({
    tenantId,
    label: 'Web Production Key (Pending Approval)',
    environment: 'production',
    category: 'web',
    permissions: ['read'],
    rateLimit: 500,
    createdBy: userId,
  });

  // Production key stays pending with isActive=false
  // Create approval request
  await apiKeyApprovalService.createApprovalRequest(
    productionKey.keyDoc,
    userId,
    tenantId
  );

  return {
    staging: stagingKey,
    production: productionKey,
  };
};

module.exports = {
  queryApiKeys,
  getApiKeysByTenant,
  getApiKeyById,
  getApiKeyByHash,
  verifyApiKey,
  createApiKey,
  updateApiKeyById,
  deleteApiKeyById,
  regenerateApiKey,
  getApiKeyAnalytics,
  checkRateLimit,
  deactivateExpiredKeys,
  autoGenerateWebApiKeys,
};
