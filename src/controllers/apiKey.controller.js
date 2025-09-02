const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { apiKeyService } = require('../services');

/**
 * Get API keys for tenant
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.page - Page number
 * @param {string} req.query.limit - Number of items per page
 * @param {string} req.query.environment - Filter by environment
 * @param {string} req.query.isActive - Filter by active status
 * @param {string} req.query.scope - Filter by scope
 * @param {string} req.query.sortBy - Sort by field
 * @returns {Object} Paginated API keys
 * @example
 * GET /api-keys?page=1&limit=10&environment=production&isActive=true
 */
const getApiKeys = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;

  // Build filter from query parameters
  const filter = pick(req.query, ['environment', 'isActive', 'scope']);

  // Convert string 'true'/'false' to boolean for isActive
  if (filter.isActive !== undefined) {
    filter.isActive = filter.isActive === 'true';
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  // Set default sorting
  if (!options.sortBy) {
    options.sortBy = 'createdAt:desc';
  }

  const result = await apiKeyService.getApiKeysByTenant(tenantId, filter, options);

  // Hide the raw hashed keys in response
  const sanitizedResults = result.results.map((key) => {
    const keyObj = key.toObject();
    delete keyObj.hashedKey;

    // Add status based on expiration
    if (keyObj.expires && new Date() > keyObj.expires) {
      keyObj.status = 'expired';
    } else if (keyObj.isActive) {
      keyObj.status = 'active';
    } else {
      keyObj.status = 'inactive';
    }

    // Format dates for frontend
    keyObj.created = keyObj.createdAt;
    keyObj.lastUsed = keyObj.lastUsedAt ? getRelativeTime(keyObj.lastUsedAt) : 'Never';
    keyObj.expiresAt = keyObj.expires;

    // Add truncated key for display (first 12 chars + ...)
    if (keyObj.environment === 'production') {
      keyObj.key = 'sk_live_' + 'x'.repeat(16) + '...';
    } else {
      keyObj.key = 'sk_test_' + 'x'.repeat(20) + '...';
    }

    return keyObj;
  });

  res.send({
    ...result,
    results: sanitizedResults,
  });
});

/**
 * Create API key
 * @param {Object} req.body - API key data
 * @param {string} req.body.label - Label for the API key
 * @param {string} req.body.environment - Environment (production, development, staging)
 * @param {string} req.body.scope - Scope of the API key
 * @param {Array} req.body.permissions - Array of permissions
 * @param {number} req.body.rateLimit - Rate limit per minute
 * @param {Date} req.body.expires - Expiration date
 * @returns {Object} Created API key with raw key
 * @example
 * POST /api-keys
 * {
 *   "label": "Production API Key",
 *   "environment": "production",
 *   "scope": "api",
 *   "permissions": ["read", "write"],
 *   "rateLimit": 1000,
 *   "expires": "2024-12-31T23:59:59Z"
 * }
 */
const createApiKey = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { apiKey, rawKey } = await apiKeyService.createApiKey(req.body, tenantId);

  // Sanitize response
  const keyObj = apiKey.toObject();
  delete keyObj.hashedKey;

  // Add status and formatting
  keyObj.status = keyObj.isActive ? 'active' : 'inactive';
  keyObj.created = keyObj.createdAt;
  keyObj.lastUsed = 'Never';
  keyObj.id = keyObj._id; // Ensure id is always present

  res.status(httpStatus.CREATED).send({
    apiKey: keyObj,
    rawKey, // This is the only time the raw key is returned
  });
});

/**
 * Get API key by ID
 * @param {string} req.params.keyId - API key ID
 * @returns {Object} API key details
 * @example
 * GET /api-keys/60d5ec49f1b2c8b1f8e4e1a1
 */
const getApiKey = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;
  const apiKey = await apiKeyService.getApiKeyById(req.params.keyId, tenantId);
  const keyObj = apiKey.toObject();
  delete keyObj.hashedKey;

  // Add status and formatting
  if (keyObj.expires && new Date() > keyObj.expires) {
    keyObj.status = 'expired';
  } else if (keyObj.isActive) {
    keyObj.status = 'active';
  } else {
    keyObj.status = 'inactive';
  }

  keyObj.created = keyObj.createdAt;
  keyObj.lastUsed = keyObj.lastUsedAt ? getRelativeTime(keyObj.lastUsedAt) : 'Never';

  // Add truncated key for display
  if (keyObj.environment === 'production') {
    keyObj.key = 'sk_live_' + '●'.repeat(20) + '...';
  } else {
    keyObj.key = 'sk_test_' + '●'.repeat(20) + '...';
  }

  res.send(keyObj);
});

/**
 * Update API key
 * @param {string} req.params.keyId - API key ID
 * @param {Object} req.body - Update data
 * @returns {Object} Updated API key
 * @example
 * PATCH /api-keys/60d5ec49f1b2c8b1f8e4e1a1
 * {
 *   "label": "Updated API Key",
 *   "isActive": true,
 *   "rateLimit": 2000
 * }
 */
const updateApiKey = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;
  const apiKey = await apiKeyService.updateApiKeyById(req.params.keyId, req.body, tenantId);
  const keyObj = apiKey.toObject();
  delete keyObj.hashedKey;

  // Add status and formatting
  if (keyObj.expires && new Date() > keyObj.expires) {
    keyObj.status = 'expired';
  } else if (keyObj.isActive) {
    keyObj.status = 'active';
  } else {
    keyObj.status = 'inactive';
  }

  keyObj.created = keyObj.createdAt;
  keyObj.lastUsed = keyObj.lastUsedAt ? getRelativeTime(keyObj.lastUsedAt) : 'Never';

  res.send(keyObj);
});

/**
 * Delete API key
 * @param {string} req.params.keyId - API key ID
 * @returns {void}
 * @example
 * DELETE /api-keys/60d5ec49f1b2c8b1f8e4e1a1
 */
const deleteApiKey = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;
  console.log('req.params.keyId', req.params.keyId);
  await apiKeyService.deleteApiKeyById(req.params.keyId, tenantId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get API key analytics
 * @param {string} req.params.keyId - API key ID
 * @param {Object} req.query - Analytics parameters
 * @param {Date} req.query.startDate - Start date for analytics
 * @param {Date} req.query.endDate - End date for analytics
 * @param {string} req.query.granularity - Analytics granularity (hour, day, week, month)
 * @returns {Object} Analytics data
 * @example
 * GET /api-keys/60d5ec49f1b2c8b1f8e4e1a1/analytics?granularity=day
 */
const getApiKeyAnalytics = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;

  const options = {
    startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
    endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
    granularity: req.query.granularity || 'day',
  };

  const analytics = await apiKeyService.getApiKeyAnalytics(req.params.keyId, tenantId, options);
  res.send(analytics);
});

/**
 * Regenerate API key
 * @param {string} req.params.keyId - API key ID
 * @returns {Object} Regenerated API key with new raw key
 * @example
 * POST /api-keys/60d5ec49f1b2c8b1f8e4e1a1/regenerate
 */
const regenerateApiKey = catchAsync(async (req, res) => {
  const tenantId = req.user.tenantId;
  const { apiKey, rawKey } = await apiKeyService.regenerateApiKey(req.params.keyId, tenantId);

  const keyObj = apiKey.toObject();
  delete keyObj.hashedKey;

  // Add status and formatting
  keyObj.status = keyObj.isActive ? 'active' : 'inactive';
  keyObj.created = keyObj.createdAt;
  keyObj.lastUsed = 'Never'; // Reset since it's regenerated

  res.send({
    apiKey: keyObj,
    rawKey, // This is the only time the raw key is returned after creation
  });
});

/**
 * Helper function to get relative time
 * @param {Date} date
 * @returns {string}
 */
const getRelativeTime = (date) => {
  const now = new Date();
  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }
};

module.exports = {
  getApiKeys,
  createApiKey,
  getApiKey,
  updateApiKey,
  deleteApiKey,
  getApiKeyAnalytics,
  regenerateApiKey,
};
