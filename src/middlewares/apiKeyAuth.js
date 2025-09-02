const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { apiKeyService } = require('../services');
const catchAsync = require('../utils/catchAsync');

/**
 * API Key Authentication Middleware
 * Validates API keys from the Authorization header or x-api-key header
 * @param {Array<string>} requiredPermissions - Array of required permissions
 * @returns {Function} Express middleware function
 */
const apiKeyAuth = (requiredPermissions = []) => {
  return catchAsync(async (req, res, next) => {
    // Extract API key from headers
    let apiKey = req.header('x-api-key') || req.header('X-API-Key');

    // Also check Authorization header for Bearer token format
    if (!apiKey) {
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader;
      }
    }

    if (!apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'API key is required');
    }

    try {
      // Verify the API key
      const apiKeyDoc = await apiKeyService.verifyApiKey(apiKey);

      // Check if the API key has required permissions
      if (requiredPermissions.length > 0) {
        const hasPermission = requiredPermissions.some(
          (permission) => apiKeyDoc.permissions.includes(permission) || apiKeyDoc.permissions.includes('admin')
        );

        if (!hasPermission) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            `API key requires one of the following permissions: ${requiredPermissions.join(', ')}`
          );
        }
      }

      // Check rate limiting
      const isWithinRateLimit = await apiKeyService.checkRateLimit(apiKeyDoc._id, apiKeyDoc.usageCount);

      if (!isWithinRateLimit) {
        throw new ApiError(httpStatus.TOO_MANY_REQUESTS, 'API key rate limit exceeded');
      }

      // Add API key info to request for downstream middleware/controllers
      req.apiKey = {
        id: apiKeyDoc._id,
        label: apiKeyDoc.label,
        tenant: apiKeyDoc.tenant,
        permissions: apiKeyDoc.permissions,
        scope: apiKeyDoc.scope,
        environment: apiKeyDoc.environment,
        rateLimit: apiKeyDoc.rateLimit,
        usageCount: apiKeyDoc.usageCount,
      };

      // Add tenant info for tenant-scoped operations
      req.tenantId = apiKeyDoc.tenant._id;
      req.tenant = apiKeyDoc.tenant;

      next();
    } catch (error) {
      // Log failed API key attempts for security monitoring
      console.warn(`Failed API key authentication attempt: ${error.message}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        endpoint: req.originalUrl,
      });

      throw error;
    }
  });
};

/**
 * Combined authentication middleware that supports both JWT and API key auth
 * Tries JWT first, then falls back to API key
 * @param {string|Array<string>} permissions - Required permissions
 * @returns {Function} Express middleware function
 */
const hybridAuth = (permissions = []) => {
  return catchAsync(async (req, res, next) => {
    // Check if JWT token is present
    const jwtToken = req.header('Authorization')?.startsWith('Bearer ') && !req.header('Authorization')?.includes('sk_');

    if (jwtToken) {
      // Use regular JWT auth
      const auth = require('./auth');
      return auth(permissions)(req, res, next);
    } else {
      // Use API key auth
      const permissionsArray = Array.isArray(permissions) ? permissions : [permissions];
      return apiKeyAuth(permissionsArray)(req, res, next);
    }
  });
};

/**
 * Scope validation middleware
 * Validates that the API key has access to the requested scope
 * @param {string} requiredScope - Required scope (e.g., 'api', 'mobile', 'crm')
 * @returns {Function} Express middleware function
 */
const validateScope = (requiredScope) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'API key authentication required');
    }

    if (req.apiKey.scope !== requiredScope && req.apiKey.scope !== 'admin') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `API key scope '${req.apiKey.scope}' does not have access to '${requiredScope}' resources`
      );
    }

    next();
  };
};

/**
 * Environment validation middleware
 * Ensures API keys are used in their intended environment
 * @param {string} requiredEnvironment - Required environment
 * @returns {Function} Express middleware function
 */
const validateEnvironment = (requiredEnvironment) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'API key authentication required');
    }

    if (req.apiKey.environment !== requiredEnvironment) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `API key is for '${req.apiKey.environment}' environment, but '${requiredEnvironment}' is required`
      );
    }

    next();
  };
};

/**
 * Rate limiting middleware specifically for API keys
 * @param {number} customLimit - Custom rate limit (optional)
 * @returns {Function} Express middleware function
 */
const apiKeyRateLimit = (customLimit) => {
  return catchAsync(async (req, res, next) => {
    if (!req.apiKey) {
      return next();
    }

    const limit = customLimit || req.apiKey.rateLimit;

    // In a production environment, you would use Redis for distributed rate limiting
    // This is a simplified version for demonstration
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - 1); // 1-minute window

    // Here you would typically query a rate limiting store (Redis)
    // For now, we'll use the basic check from the service
    const isWithinLimit = await apiKeyService.checkRateLimit(req.apiKey.id, req.apiKey.usageCount);

    if (!isWithinLimit) {
      res.set({
        'X-RateLimit-Limit': limit,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString(),
      });

      throw new ApiError(httpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded');
    }

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': limit,
      'X-RateLimit-Remaining': Math.max(0, limit - req.apiKey.usageCount),
      'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString(),
    });

    next();
  });
};

module.exports = {
  apiKeyAuth,
  hybridAuth,
  validateScope,
  validateEnvironment,
  apiKeyRateLimit,
};
