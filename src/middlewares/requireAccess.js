const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { apiKeyService } = require('../services');
const Role = require('../models/role.model');
const ownerResourceBundle = require('../scripts/permissions/ownerResource.json').ownerResourceBundle;
const passport = require('passport');

/**
 * Normalize access object: supports both req.user and req.apiKey
 */
const resolveAccessIdentity = async (req, requiredPermissions = []) => {
  const header = req.header('Authorization');
  const isJwt = header?.startsWith('Bearer ') && !header?.includes('sk_');
  const apiKey = req.header('x-api-key') || header;

  console.log('[requireAccess] Incoming headers:', {
    Authorization: req.header('Authorization'),
    'x-api-key': req.header('x-api-key'),
    requiredPermissions,
  });

  // === 1. Try JWT ===
  if (isJwt) {
    console.log('[requireAccess] Detected JWT');
    return new Promise((resolve, reject) => {
      passport.authenticate('jwt', { session: false }, async (err, user, info) => {
        if (err || info || !user) {
          console.log('[requireAccess] JWT auth failed', { err, info, user });
          return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or missing JWT'));
        }

        req.user = user;
        console.log('[requireAccess] Authenticated user:', user);

        // Superuser bypass
        if (user.isSuper) return resolve({ type: 'user', value: user });

        // === Owner Check ===
        if (user.isOwner) {
          const hasAccess = checkOwnerAccess(requiredPermissions);
          if (!hasAccess) {
            console.log('[requireAccess] Owner lacks access');
            return reject(new ApiError(httpStatus.FORBIDDEN, 'Owner does not have access to this resource'));
          }
          return resolve({ type: 'user', value: user });
        }

        // === Role Permission Check ===
        const userRoles = await Role.find({ _id: { $in: user.roles } }).populate('permissions');
        const userPermissions = userRoles.flatMap((role) => role.permissions.map((p) => p.name));
        const hasWildcard = userPermissions.includes('*');

        const hasRights = requiredPermissions.every((perm) => userPermissions.includes(perm) || hasWildcard);

        if (!hasRights) {
          console.log('[requireAccess] User missing permissions:', requiredPermissions);
          return reject(new ApiError(httpStatus.FORBIDDEN, `Missing permissions: ${requiredPermissions.join(', ')}`));
        }

        return resolve({ type: 'user', value: user });
      })(req);
    });
  }

  // === 2. Try API Key ===
  if (!apiKey) throw new ApiError(httpStatus.UNAUTHORIZED, 'Missing API key or JWT');

  console.log('[requireAccess] Detected API key:', apiKey);
  const apiKeyDoc = await apiKeyService.verifyApiKey(apiKey);
  console.log('[requireAccess] API key doc:', apiKeyDoc && apiKeyDoc._id);

  // Permissions check
  if (
    requiredPermissions.length > 0 &&
    !requiredPermissions.some((perm) => apiKeyDoc.permissions.includes(perm) || apiKeyDoc.permissions.includes('admin'))
  ) {
    console.log('[requireAccess] API key lacks required permissions:', requiredPermissions, apiKeyDoc.permissions);
    throw new ApiError(httpStatus.FORBIDDEN, `API key lacks required permissions: ${requiredPermissions.join(', ')}`);
  }

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

  req.tenantId = apiKeyDoc.tenant._id;
  req.tenant = apiKeyDoc.tenant;

  return { type: 'apiKey', value: req.apiKey };
};

/**
 * Check if owner matches the required resource rights
 */
const checkOwnerAccess = (permissions) => {
  const regex = /^[a-zA-Z]+:([a-zA-Z]+)/;
  return permissions.every((perm) => {
    const match = perm.match(regex);
    const resource = match?.[1];
    if (!resource) return false;
    return ownerResourceBundle.includes(resource);
  });
};

/**
 * Main middleware: requireAccess(config)
 * Supports JWT & API key auth, RBAC, scope, env, rateLimit, ownership
 */
const requireAccess = ({
  permissions = [],
  scope,
  environment,
  rateLimit = false,
  ownership, // async (req) => tenantId | true
  jwtOnly = false,
  apiOnly = false,
} = {}) => {
  return catchAsync(async (req, res, next) => {
    try {
      console.log('[requireAccess] Checking access for endpoint:', req.originalUrl, {
        permissions,
        scope,
        environment,
        jwtOnly,
        apiOnly,
      });
      // STEP 1: Resolve user or apiKey identity
      const access = await resolveAccessIdentity(req, permissions);
      req.access = access; // Normalized access layer
      console.log('[requireAccess] Resolved access:', access.type);

      // JWT-only block
      if (jwtOnly && access.type === 'apiKey') {
        console.log('[requireAccess] Blocked: API key not allowed (jwtOnly)');
        throw new ApiError(httpStatus.FORBIDDEN, 'API key authentication is not allowed for this endpoint.');
      }
      // API-only block
      if (apiOnly && access.type === 'user') {
        console.log('[requireAccess] Blocked: JWT not allowed (apiOnly)');
        throw new ApiError(httpStatus.FORBIDDEN, 'JWT authentication is not allowed for this endpoint.');
      }

      // STEP 2: Scope validation (API key only)
      if (access.type === 'apiKey' && scope) {
        if (req.apiKey.scope !== scope && req.apiKey.scope !== 'admin') {
          console.log('[requireAccess] API key scope mismatch:', req.apiKey.scope, scope);
          throw new ApiError(
            httpStatus.FORBIDDEN,
            `API key scope '${req.apiKey.scope}' does not match required scope '${scope}'`
          );
        }
      }

      // STEP 3: Environment validation (API key only)
      if (access.type === 'apiKey' && environment) {
        if (req.apiKey.environment !== environment) {
          console.log('[requireAccess] API key environment mismatch:', req.apiKey.environment, environment);
          throw new ApiError(
            httpStatus.FORBIDDEN,
            `API key is for '${req.apiKey.environment}' environment; '${environment}' is required`
          );
        }
      }

      // STEP 4: Rate Limiting (API key only)
      if (access.type === 'apiKey' && rateLimit) {
        const withinLimit = await apiKeyService.checkRateLimit(req.apiKey.id, req.apiKey.usageCount);
        if (!withinLimit) {
          res.set({
            'X-RateLimit-Limit': req.apiKey.rateLimit,
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString(),
          });
          console.log('[requireAccess] Rate limit exceeded');
          throw new ApiError(httpStatus.TOO_MANY_REQUESTS, 'Rate limit exceeded');
        }

        res.set({
          'X-RateLimit-Limit': req.apiKey.rateLimit,
          'X-RateLimit-Remaining': Math.max(0, req.apiKey.rateLimit - req.apiKey.usageCount),
          'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString(),
        });
      }

      // STEP 5: Ownership Check (optional)
      if (ownership && typeof ownership === 'function') {
        const resourceTenantId = await ownership(req);
        const currentTenantId = access.type === 'user' ? req.user.tenant : req.apiKey.tenant._id.toString();

        if (resourceTenantId && resourceTenantId.toString() !== currentTenantId.toString()) {
          console.log('[requireAccess] Ownership check failed:', resourceTenantId, currentTenantId);
          throw new ApiError(httpStatus.FORBIDDEN, 'Resource does not belong to your tenant');
        }
      }

      next();
    } catch (err) {
      console.warn(`[Access Denied]: ${err.message}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        time: new Date().toISOString(),
      });
      next(err);
    }
  });
};

module.exports = requireAccess;
