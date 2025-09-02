const httpStatus = require('http-status');
const { ApiKey } = require('../models');
const ApiError = require('../utils/ApiError');
const crypto = require('crypto');

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
  console.log('[getApiKeyById] Looking up ApiKey by _id:', id, 'tenant:', tenantId);
  const apiKey = await ApiKey.findOne({ _id: id, tenant: tenantId });
  if (!apiKey) {
    throw new ApiError(httpStatus.NOT_FOUND, 'API key not found');
  }
  return apiKey;
};

/**
 * Get API key by hashed key
 * @param {string} hashedKey
 * @returns {Promise<ApiKey>}
 */
const getApiKeyByHash = async (hashedKey) => {
  console.log('[getApiKeyByHash] Looking up ApiKey by hashedKey:', hashedKey);
  const apiKey = await ApiKey.findOne({ hashedKey, isActive: true });
  return apiKey;
};

/**
 * Verify API key and update usage
 * @param {string} rawKey
 * @returns {Promise<ApiKey>}
 */
const verifyApiKey = async (rawKey) => {
  if (!rawKey) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key is required');
  }

  // Extract the key from the authorization header if it's in Bearer format
  let key = rawKey.startsWith('Bearer ') ? rawKey.substring(7) : rawKey;

  // Only accept keys that start with sk_
  if (!key.startsWith('sk_')) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key must start with sk_');
  }

  // Hash the provided key (with prefix)
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');

  // Find the API key
  console.log('[verifyApiKey] Verifying API key with hash:', hashedKey);
  const apiKey = await getApiKeyByHash(hashedKey);
  console.log('[verifyApiKey] found the key', apiKey);

  if (!apiKey) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid API key');
  }

  // Check if key is expired
  if (apiKey.expires && new Date() > apiKey.expires) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'API key has expired');
  }

  // Update last used timestamp and usage count
  console.log('[verifyApiKey] Updating usage for key _id:', apiKey._id);
  await ApiKey.findByIdAndUpdate(apiKey._id, {
    lastUsedAt: new Date(),
    $inc: { usageCount: 1 },
  });

  return apiKey;
};;;

/**
 * Create an API key
 * @param {Object} apiKeyBody
 * @param {ObjectId} tenantId
 * @returns {Promise<{apiKey: ApiKey, rawKey: string}>}
 */
const createApiKey = async (apiKeyBody, tenantId) => {
  // Generate API key
  const { rawKey, keyDoc } = await ApiKey.generateKey({
    tenantId,
    label: apiKeyBody.label,
    environment: apiKeyBody.environment,
    permissions: apiKeyBody.permissions || ['read'],
    scope: apiKeyBody.scope || 'api',
    rateLimit: apiKeyBody.rateLimit || 1000,
    expires: apiKeyBody.expires,
  });

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
  const allowedUpdates = ['label', 'isActive', 'permissions', 'scope', 'rateLimit', 'expires'];
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

  // Generate new key
  const rawKey = crypto.randomBytes(32).toString('hex');
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
      { endpoint: '/api/v1/users', count: Math.floor((apiKey.usageCount || 0) * 0.3) },
      { endpoint: '/api/v1/projects', count: Math.floor((apiKey.usageCount || 0) * 0.25) },
      { endpoint: '/api/v1/forms', count: Math.floor((apiKey.usageCount || 0) * 0.2) },
      { endpoint: '/api/v1/analytics', count: Math.floor((apiKey.usageCount || 0) * 0.15) },
      { endpoint: '/api/v1/auth', count: Math.floor((apiKey.usageCount || 0) * 0.1) },
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
};
