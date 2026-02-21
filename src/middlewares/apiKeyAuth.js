/**
 * API Key Authentication Middleware Module
 *
 * This module provides middleware functions for API key authentication:
 * - `apiKeyAuth()`: Required API key authentication
 * - `apiKeyAuth.optional()`: Optional API key authentication
 * - `hybridAuth()`: Supports both JWT and API key authentication
 * - `validateScope()`: Validates API key scope
 * - `validateEnvironment()`: Validates API key environment
 * - `apiKeyRateLimit()`: Rate limiting for API keys
 * - `extractApiKey()`: Helper function to extract API key from headers
 *
 * **Request Object Structure (after successful authentication):**
 * ```javascript
 * req.apiKey = {
 *   id: ObjectId,              // API key document ID
 *   label: string,             // API key label
 *   tenant: Object,            // Tenant object
 *   permissions: string[],     // Array of permissions
 *   scope: string,             // API key scope (e.g., 'api', 'mobile')
 *   environment: string,       // Environment (e.g., 'production', 'development')
 *   rateLimit: number,        // Rate limit value
 *   usageCount: number        // Current usage count
 * };
 * req.tenantId = ObjectId;    // Tenant ID (for convenience)
 * req.tenant = Object;        // Tenant object (for convenience)
 * ```
 *
 * **Response Headers (set automatically):**
 * - `X-RateLimit-Limit`: Rate limit value
 * - `X-RateLimit-Remaining`: Remaining requests in current window
 * - `X-RateLimit-Reset`: Reset timestamp (ISO 8601 format)
 *
 * @module middlewares/apiKeyAuth
 */

const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { apiKeyService } = require('../services');
const catchAsync = require('../utils/catchAsync');
const logger = require('../config/logger');
const auth = require('./auth');

/**
 * Extract API key from request headers
 * Checks x-api-key header first, then Authorization header for Bearer sk_... format
 * @param {Object} req - Express request object
 * @returns {string|null} Normalized API key string or null if not found
 * @example
 * // From x-api-key header
 * extractApiKey(req) // returns "sk_live_..."
 *
 * // From Authorization header
 * extractApiKey(req) // returns "Bearer sk_live_..." or "sk_live_..."
 *
 * // Not found
 * extractApiKey(req) // returns null
 */
const extractApiKey = (req) => {
  if (!req || typeof req.header !== 'function') {
    return null;
  }

  // Check x-api-key header first (case-insensitive)
  let apiKey = req.header('x-api-key') || req.header('X-API-Key');
  if (typeof apiKey === 'string' && apiKey.trim() === '') {
    apiKey = null;
  }

  // If not found, check Authorization header for Bearer token format
  if (!apiKey) {
    const authHeader = req.header('Authorization');
    if (typeof authHeader === 'string' && authHeader.trim() !== '') {
      // Support standard Bearer tokens (allow extra whitespace after "Bearer")
      if (/^Bearer\s+/i.test(authHeader)) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        // Only treat Bearer as an API key when it matches our API key prefix.
        if (token.startsWith('sk_')) {
          // Keep original header formatting for backward compatibility (tests rely on this)
          apiKey = authHeader;
        }
      } else if (authHeader.startsWith('sk_')) {
        // Direct API key without Bearer prefix
        apiKey = authHeader;
      } else if (/^Bearersk_/i.test(authHeader)) {
        // Malformed "Bearer" header (missing space) but containing a valid API key
        apiKey = authHeader;
      }
    }
  }

  // Log extraction result (mask sensitive data)
  console.log('[extractApiKey] 🔍 Extracting API key from request headers...');
  console.log('[extractApiKey] Checking headers:', {
    'x-api-key': req.header('x-api-key') ? 'present' : 'missing',
    'X-API-Key': req.header('X-API-Key') ? 'present' : 'missing',
    Authorization: req.header('Authorization') ? 'present' : 'missing',
  });

  if (apiKey) {
    const masked = apiKey.length > 20 ? `${apiKey.substring(0, 20)}...` : '***';
    console.log('[extractApiKey] ✅ API key extracted:', masked);
    logger.info('Extracted API key:', masked);
  } else {
    console.log('[extractApiKey] ❌ No API key found in request headers');
    logger.info('Extracted API key: (none)');
  }

  return apiKey || null;
};

/**
 * API Key Authentication Middleware
 * ONLY authenticates API keys - does NOT check permissions or rate limits
 * Use with requireAccess() middleware for access control
 *
 * **Request Object Structure:**
 * After successful authentication, the following properties are added to `req`:
 * - `req.apiKey`: Object containing API key information
 *   - `id`: API key document ID
 *   - `label`: API key label
 *   - `tenant`: Tenant object
 *   - `permissions`: Array of permissions
 *   - `scope`: API key scope
 *   - `environment`: API key environment
 *   - `rateLimit`: Rate limit value
 *   - `usageCount`: Current usage count
 * - `req.tenantId`: Tenant ID (for convenience)
 * - `req.tenant`: Tenant object (for convenience)
 *
 * **Note:** Permission checking and rate limiting should be handled by requireAccess() middleware
 *
 * @returns {Function} Express middleware function
 * @throws {ApiError} 401 if API key is missing or invalid
 * @example
 * // Authenticate with API key, then check permissions
 * router.post('/data', apiKeyAuth(), requireAccess({ permissions: ['data:create'] }), controller.create);
 *
 * // Authenticate with API key only
 * router.get('/public', apiKeyAuth(), controller.getPublic);
 */
const apiKeyAuth = () =>
  catchAsync(async (req, res, next) => {
    // If req.apiKey already exists (set by previous middleware), skip
    if (req.apiKey) {
      return next();
    }

    // Extract API key from headers using centralized helper
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'API key is required');
    }

    console.log('[apiKeyAuth] 🔍 Required API key authentication starting...');
    console.log('[apiKeyAuth] Request details:', {
      endpoint: req.originalUrl,
      method: req.method,
      ip: req.ip,
      apiKeyPrefix: apiKey.substring(0, 15),
    });

    try {
      // Verify the API key (includes: hash validation, active check, expired check, approval status, usage limits)
      console.log('[apiKeyAuth] 📞 Calling apiKeyService.verifyApiKey()...');
      const apiKeyDoc = await apiKeyService.verifyApiKey(apiKey);
      console.log('[apiKeyAuth] ✅ API key verification successful');

      // Add API key info to request for downstream middleware/controllers
      // Structure matches requireAccess.js expectations
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

      console.log(
        '[apiKeyAuth] ✅✅✅ Authentication successful. Setting req.apiKey:',
        {
          id: req.apiKey.id,
          label: req.apiKey.label,
          environment: req.apiKey.environment,
          tenantId: req.tenantId,
        }
      );

      next();
    } catch (error) {
      console.log('[apiKeyAuth] ❌ API key verification failed:', {
        error: error.message,
        statusCode: error.statusCode,
        endpoint: req.originalUrl,
      });

      // Log failed API key attempts for security monitoring
      logger.warn('Failed API key authentication attempt', {
        error: error.message,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        endpoint: req.originalUrl,
        method: req.method,
      });

      throw error;
    }
  });

/**
 * Optional API Key Authentication Middleware
 * Validates API keys if present, but does not require them
 * Useful for endpoints that support both authenticated and unauthenticated access
 *
 * **Request Object Structure:**
 * Same as `apiKeyAuth()` if API key is present and valid.
 * If no API key or invalid key, request proceeds without `req.apiKey`.
 *
 * @param {Array<string>} requiredPermissions - Array of required permissions (if API key is present)
 * @returns {Function} Express middleware function
 * @example
 * // Optional API key authentication
 * router.get('/public', apiKeyAuth.optional(['data:read']), controller.getPublic);
 * // If API key is provided, it must have 'data:read' permission
 * // If no API key, request proceeds without authentication
 */
/**
 * Optional API Key Authentication Middleware
 * Authenticates API keys if present, but does not require them
 * Does NOT check permissions or rate limits - use requireAccess() for that
 *
 * @returns {Function} Express middleware function
 * @example
 * // Optional API key authentication
 * router.get('/public', apiKeyAuth.optional(), requireAccess({ permissions: ['data:read'] }), controller.getPublic);
 */
apiKeyAuth.optional = () =>
  catchAsync(async (req, res, next) => {
    // If req.apiKey already exists, skip
    if (req.apiKey) {
      return next();
    }

    // Extract API key from headers using centralized helper
    const apiKey = extractApiKey(req);

    // If no API key, proceed without authentication
    if (!apiKey) {
      return next();
    }

    // If API key is present, validate it
    console.log(
      '[apiKeyAuth.optional] 🔍 API key detected, starting verification...'
    );
    console.log('[apiKeyAuth.optional] Request details:', {
      endpoint: req.originalUrl,
      method: req.method,
      ip: req.ip,
      apiKeyPrefix: apiKey.substring(0, 15),
    });

    try {
      // Verify the API key (includes all validation)
      console.log(
        '[apiKeyAuth.optional] 📞 Calling apiKeyService.verifyApiKey()...'
      );
      const apiKeyDoc = await apiKeyService.verifyApiKey(apiKey);
      console.log('[apiKeyAuth.optional] ✅ API key verification successful');

      // Add API key info to request
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

      // Add tenant info
      req.tenantId = apiKeyDoc.tenant._id;
      req.tenant = apiKeyDoc.tenant;

      console.log(
        '[apiKeyAuth.optional] ✅✅✅ Authentication successful. Setting req.apiKey:',
        {
          id: req.apiKey.id,
          label: req.apiKey.label,
          environment: req.apiKey.environment,
          tenantId: req.tenantId,
        }
      );

      next();
    } catch (error) {
      console.log('[apiKeyAuth.optional] ❌ API key verification failed:', {
        error: error.message,
        statusCode: error.statusCode,
        endpoint: req.originalUrl,
      });

      // For optional auth, check if this is a critical error that should block the request
      // Critical errors: approval status, usage limits, expired keys, inactive keys
      const isCriticalError =
        error.statusCode === httpStatus.FORBIDDEN ||
        (error.message &&
          (error.message.includes('pending approval') ||
            error.message.includes('usage limit reached') ||
            error.message.includes('expired') ||
            error.message.includes('inactive') ||
            error.message.includes('not approved') ||
            error.message.includes('not ready')));

      console.log('[apiKeyAuth.optional] Error classification:', {
        isCriticalError,
        statusCode: error.statusCode,
        message: error.message,
      });

      if (isCriticalError) {
        // For critical errors, throw the error (don't proceed)
        console.log(
          '[apiKeyAuth.optional] 🚫 Critical error - blocking request'
        );
        throw error;
      }

      // For non-critical errors (e.g., invalid key format), log and proceed without req.apiKey
      console.log(
        '[apiKeyAuth.optional] ⚠️ Non-critical error - proceeding without authentication'
      );
      logger.warn('Optional API key validation failed (non-critical)', {
        error: error.message,
        ip: req.ip,
        endpoint: req.originalUrl,
        method: req.method,
      });
      // Proceed without authentication
      next();
    }
  });

/**
 * Combined authentication middleware that supports both JWT and API key auth
 * ONLY authenticates - does NOT check permissions (use requireAccess() for that)
 * Rule: If API key is provided and user is ordinary → use API key, otherwise use JWT
 *
 * @returns {Function} Express middleware function
 * @example
 * // Authenticate (JWT or API key), then check permissions
 * router.get('/data', hybridAuth(), requireAccess({ permissions: ['data:read'] }), controller.get);
 */
const hybridAuth = () =>
  catchAsync(async (req, res, next) => {
    // If already authenticated, skip
    if (req.apiKey || req.user) {
      return next();
    }

    // Check if API key is provided
    const apiKey = extractApiKey(req);

    if (apiKey) {
      // API key provided - check if user is ordinary
      try {
        // Verify API key (this will throw if invalid)
        const apiKeyDoc = await apiKeyService.verifyApiKey(apiKey);

        // Get the user who created the API key
        const { User } = require('../models'); // eslint-disable-line global-require
        const userId = apiKeyDoc.createdBy || apiKeyDoc.requestedBy;

        if (!userId) {
          throw new ApiError(
            httpStatus.UNAUTHORIZED,
            'API key user information not found'
          );
        }

        const apiKeyUser = await User.findById(userId).lean();

        if (!apiKeyUser) {
          throw new ApiError(httpStatus.UNAUTHORIZED, 'API key user not found');
        }

        // Check if user is ordinary (all privilege flags false)
        const isOrdinaryUser =
          !apiKeyUser.isSaby &&
          !apiKeyUser.isSuper &&
          !apiKeyUser.isOwner &&
          !apiKeyUser.isAdmin;

        if (isOrdinaryUser) {
          // User is ordinary → use API key authentication
          return apiKeyAuth()(req, res, next);
        }
        // User is privileged → fall through to JWT
        logger.info(
          'Privileged user attempted API key auth, using JWT instead',
          {
            userId: apiKeyUser._id,
            email: apiKeyUser.email,
          }
        );
      } catch (error) {
        // API key validation failed → fall through to JWT
        logger.info('API key validation failed, trying JWT', {
          error: error.message,
        });
      }
    }

    // Use JWT authentication (either no API key, or API key user is privileged, or API key failed)
    const authHeader = req.header('Authorization');
    const jwtToken =
      authHeader?.startsWith('Bearer ') && !authHeader?.includes('sk_');

    if (jwtToken) {
      // JWT token provided → use JWT auth (no permission checking here)
      return new Promise((resolve, reject) => {
        const authMiddleware = auth(); // No permissions - let requireAccess handle it
        authMiddleware(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
        .then(() => next())
        .catch((err) => next(err));
    }

    // No authentication found
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'Authentication required. Provide either a JWT token or API key.'
    );
  });

/**
 * Scope validation middleware
 * Validates that the API key has access to the requested scope
 * @param {string} requiredScope - Required scope (e.g., 'api', 'mobile', 'crm')
 * @returns {Function} Express middleware function
 */
const validateScope = (requiredScope) => (req, res, next) => {
  if (!req.apiKey) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'API key authentication required'
    );
  }

  if (req.apiKey.scope !== requiredScope && req.apiKey.scope !== 'admin') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `API key scope '${req.apiKey.scope}' does not have access to '${requiredScope}' resources`
    );
  }

  next();
};

/**
 * Environment validation middleware
 * Ensures API keys are used in their intended environment
 * @param {string} requiredEnvironment - Required environment
 * @returns {Function} Express middleware function
 */
const validateEnvironment = (requiredEnvironment) => (req, res, next) => {
  if (!req.apiKey) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'API key authentication required'
    );
  }

  if (req.apiKey.environment !== requiredEnvironment) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `API key is for '${req.apiKey.environment}' environment, but '${requiredEnvironment}' is required`
    );
  }

  next();
};

/**
 * Rate limiting middleware specifically for API keys
 * @param {number} customLimit - Custom rate limit (optional)
 * @returns {Function} Express middleware function
 */
const apiKeyRateLimit = (customLimit) =>
  catchAsync(async (req, res, next) => {
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
    const isWithinLimit = await apiKeyService.checkRateLimit(
      req.apiKey.id,
      req.apiKey.usageCount
    );

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

module.exports = {
  extractApiKey,
  apiKeyAuth,
  hybridAuth,
  validateScope,
  validateEnvironment,
  apiKeyRateLimit,
};
