const httpStatus = require('http-status');
const passport = require('passport');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { apiKeyService } = require('../services');
const Role = require('../models/role.model');
const { extractApiKey } = require('./apiKeyAuth');
const {
  ownerResourceBundle,
} = require('../scripts/permissions/ownerResource.json');

/**
 * Normalize permission format (support both old and new during migration)
 * Old format: "action:resource" (e.g., "view:user")
 * New format: "resource:action" (e.g., "user:read")
 */
const normalizePermission = (permission) => {
  if (!permission || typeof permission !== 'string') {
    return permission;
  }

  // Special cases
  if (permission === '*' || permission === 'all:*') {
    return '*';
  }

  // If already in new format (resource:action), return as-is
  // Check for pattern: lowercase_resource:action (e.g., "user:read", "node:create")
  if (
    permission.match(
      /^[a-z]+[A-Z]?[a-z]*:(read|create|update|delete|manage|import|export|assign|restore|activate|deactivate|move|upload|download|share|copy|publish|archive|submit|process|complete|cancel|refund|regenerate|deleteAll|toggleStatus|assignRole|sendMessage|forgotPassword|resetPassword|verify|refresh|send|draft|retry|public|private|permissions|status|auth)$/
    )
  ) {
    return permission;
  }

  // Try to load mapping if available
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');
    const mappingFile = path.join(
      __dirname,
      '../scripts/permissions/permission-mapping-simple.json'
    );
    if (fs.existsSync(mappingFile)) {
      const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
      if (mapping[permission]) {
        return mapping[permission];
      }
    }
  } catch (error) {
    // If mapping file doesn't exist or can't be read, continue with fallback logic
  }

  // Fallback: Try to convert old format to new format
  const parts = permission.split(':');
  if (parts.length >= 2) {
    const action = parts[0]; // e.g., 'view', 'create'
    const resourceParts = parts
      .slice(1)
      .filter((p) => p && !p.startsWith('::'));

    if (resourceParts.length > 0) {
      const resource = resourceParts[0];

      // Map old actions to new actions
      const actionMap = {
        view: 'read',
        create: 'create',
        update: 'update',
        delete: 'delete',
        manage: 'manage',
        read: 'read',
      };

      const newAction = actionMap[action] || action;
      return `${resource}:${newAction}`;
    }
  }

  // If we can't normalize, return as-is (might be already in correct format or special case)
  return permission;
};

/**
 * Check user permissions with bulk resource support
 * Supports:
 * - Exact permission match: "user:read" or "view:user" (both formats during migration)
 * - Wildcard permission: "*"
 * - Bulk resource check: "user:*" (all actions on resource) or "*:user" (old format)
 * - Manage permission: "user:manage" (equivalent to read, create, update, delete)
 *
 * @param {string[]} userPermissions - User's permissions array
 * @param {string[]} requiredPermissions - Required permissions array
 * @param {boolean} hasWildcard - Whether user has wildcard permission
 * @returns {boolean} True if user has all required permissions
 */
const checkUserPermissions = (
  userPermissions,
  requiredPermissions,
  hasWildcard
) => {
  // If user has wildcard, grant all access
  if (hasWildcard) {
    return true;
  }

  // Normalize user permissions (support both formats during migration)
  const normalizedUserPerms = userPermissions.map(normalizePermission);

  // Check each required permission
  return requiredPermissions.every((requiredPerm) => {
    // Normalize required permission
    const normalizedRequired = normalizePermission(requiredPerm);

    // Direct match (check both normalized and original formats)
    if (
      normalizedUserPerms.includes(normalizedRequired) ||
      userPermissions.includes(requiredPerm)
    ) {
      return true;
    }

    // Parse permission: "resource:action" (new format) or "action:resource" (old format)
    const parts = normalizedRequired.split(':');
    if (parts.length !== 2) {
      // Invalid format, require exact match
      return false;
    }

    // Try both formats: resource:action and action:resource
    const [part1, part2] = parts;

    // Determine if it's new format (resource:action) or old format (action:resource)
    const isNewFormat = [
      'read',
      'create',
      'update',
      'delete',
      'manage',
      'import',
      'export',
      'assign',
      'restore',
      'activate',
      'deactivate',
      'move',
      'upload',
      'download',
      'share',
      'copy',
      'publish',
      'archive',
      'submit',
      'process',
      'complete',
      'cancel',
      'refund',
    ].includes(part2);

    const resource = isNewFormat ? part1 : part2;
    const action = isNewFormat ? part2 : part1;

    // Check for bulk resource permission: "resource:*" (new) or "*:resource" (old)
    if (
      normalizedUserPerms.includes(`${resource}:*`) ||
      normalizedUserPerms.includes(`*:${resource}`) ||
      userPermissions.includes(`*:${resource}`)
    ) {
      return true;
    }

    // Check for manage permission: "resource:manage" covers all CRUD actions
    if (
      normalizedUserPerms.includes(`${resource}:manage`) ||
      userPermissions.includes(`manage:${resource}`)
    ) {
      const crudActions = ['read', 'create', 'update', 'delete', 'view'];
      if (crudActions.includes(action)) {
        return true;
      }
    }

    // Check if user has all CRUD actions for this resource (they effectively have manage)
    const resourceActions = normalizedUserPerms
      .filter((perm) => {
        const permParts = perm.split(':');
        if (permParts.length !== 2) return false;
        // Check both formats
        const permResource = [
          'read',
          'create',
          'update',
          'delete',
          'manage',
        ].includes(permParts[1])
          ? permParts[0]
          : permParts[1];
        return permResource === resource;
      })
      .map((perm) => {
        const permParts = perm.split(':');
        const isNew = ['read', 'create', 'update', 'delete', 'manage'].includes(
          permParts[1]
        );
        return isNew ? permParts[1] : permParts[0];
      });

    const hasAllCrud = ['read', 'create', 'update', 'delete'].every(
      (act) =>
        resourceActions.includes(act) ||
        resourceActions.includes(act === 'read' ? 'view' : act)
    );

    if (hasAllCrud && (action === 'manage' || action === 'view')) {
      return true;
    }

    return false;
  });
};

/**
 * Check if owner matches the required resource rights
 */
const checkOwnerAccess = (permissions) => {
  // eslint-disable-next-line no-console
  console.log('🔍 [checkOwnerAccess] Checking permissions:', permissions);
  // eslint-disable-next-line no-console
  console.log('🔍 [checkOwnerAccess] Owner bundle:', ownerResourceBundle);

  return permissions.every((perm) => {
    // Extract resource from permission string
    // Format: "resource:action" (e.g., "user:read")
    // We need the resource (first part), not the action (second part)
    const parts = perm.split(':');
    const resource = parts[0]; // First part is the resource

    // eslint-disable-next-line no-console
    console.log(
      `🔍 [checkOwnerAccess] Permission: "${perm}" → Resource: "${resource}"`
    );

    if (!resource) {
      // eslint-disable-next-line no-console
      console.log(`❌ [checkOwnerAccess] No resource extracted from "${perm}"`);
      return false;
    }

    const hasAccess = ownerResourceBundle.includes(resource);
    // eslint-disable-next-line no-console
    console.log(`🔍 [checkOwnerAccess] "${resource}" in bundle? ${hasAccess}`);

    if (!hasAccess) {
      // eslint-disable-next-line no-console
      console.log('🔍 [checkOwnerAccess] Checking each bundle item:');
      ownerResourceBundle.forEach((item, idx) => {
        // eslint-disable-next-line no-console
        console.log(
          `  [${idx}] "${item}" === "${resource}"? ${item === resource}`
        );
      });
    }

    return hasAccess;
  });
};

/**
 * Normalize access object: supports both req.user and req.apiKey
 *
 * **Priority Order:**
 * 1. Check if `req.apiKey` exists (set by `apiKeyAuth` middleware) - skip verification
 * 2. Try JWT authentication (if no API key)
 * 3. Try API key authentication (extract and verify)
 */
const resolveAccessIdentity = async (req, requiredPermissions = []) => {
  console.log('[requireAccess] Incoming headers:', {
    Authorization: req.header('Authorization'),
    'x-api-key': req.header('x-api-key'),
    requiredPermissions,
    hasReqApiKey: !!req.apiKey,
  });

  // === 0. Check if req.apiKey already exists (set by apiKeyAuth middleware) ===
  // This means apiKeyAuth middleware already verified the API key
  if (req.apiKey) {
    console.log(
      '[requireAccess] Using existing req.apiKey from apiKeyAuth middleware:',
      req.apiKey.id
    );

    // Check permissions (verification already done by apiKeyAuth middleware)
    if (requiredPermissions.length > 0) {
      const hasPermission = requiredPermissions.some(
        (perm) =>
          req.apiKey.permissions.includes(perm) ||
          req.apiKey.permissions.includes('admin')
      );

      if (!hasPermission) {
        console.log(
          '[requireAccess] API key lacks required permissions:',
          requiredPermissions,
          req.apiKey.permissions
        );
        throw new ApiError(
          httpStatus.FORBIDDEN,
          `API key lacks required permissions: ${requiredPermissions.join(
            ', '
          )}`
        );
      }
    }

    // Ensure tenant info is set (should already be set by apiKeyAuth, but double-check)
    if (!req.tenantId && req.apiKey.tenant) {
      req.tenantId = req.apiKey.tenant._id;
      req.tenant = req.apiKey.tenant;
    }

    return { type: 'apiKey', value: req.apiKey };
  }

  // === 1. Try JWT (only if req.user not already set) ===
  if (!req.user) {
    const header = req.header('Authorization');
    const isJwt = header?.startsWith('Bearer ') && !header?.includes('sk_');

    if (isJwt) {
      console.log('[requireAccess] Detected JWT, authenticating...');
      return new Promise((resolve, reject) => {
        passport.authenticate(
          'jwt',
          { session: false },
          async (err, user, info) => {
            if (err || info || !user) {
              console.log('[requireAccess] JWT auth failed', {
                err,
                info,
                user,
              });
              return reject(
                new ApiError(httpStatus.UNAUTHORIZED, 'Invalid or missing JWT')
              );
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
                return reject(
                  new ApiError(
                    httpStatus.FORBIDDEN,
                    'Owner does not have access to this resource'
                  )
                );
              }
              return resolve({ type: 'user', value: user });
            }

            // === Role Permission Check ===
            if (user.isAdmin) {
              console.log(
                '[requireAccess] isAdmin user - checking role permissions'
              );
            }

            const userRoles = await Role.find({
              _id: { $in: user.roles },
            }).populate('permissions');

            const userPermissions = userRoles.flatMap((role) =>
              role.permissions.map((p) => p.name)
            );

            if (user.isAdmin) {
              console.log(
                '[requireAccess] isAdmin roles:',
                userRoles.map((r) => r.name)
              );
              console.log(
                '[requireAccess] isAdmin permissions:',
                userPermissions
              );
            }

            const hasWildcard = userPermissions.includes('*');

            // Check permissions with bulk resource support
            const hasRights = checkUserPermissions(
              userPermissions,
              requiredPermissions,
              hasWildcard
            );

            if (!hasRights) {
              console.log(
                '[requireAccess] User missing permissions:',
                requiredPermissions,
                'User has:',
                userPermissions
              );
              return reject(
                new ApiError(
                  httpStatus.FORBIDDEN,
                  `Missing permissions: ${requiredPermissions.join(', ')}`
                )
              );
            }

            return resolve({ type: 'user', value: user });
          }
        )(req, {}, () => {});
      });
    }
  } else {
    // req.user already exists - check permissions only
    console.log('[requireAccess] Using existing req.user');
    const { user } = req;

    // Superuser bypass
    if (user.isSuper) return { type: 'user', value: user };

    // Owner check
    if (user.isOwner) {
      const hasAccess = checkOwnerAccess(requiredPermissions);
      if (!hasAccess) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'Owner does not have access to this resource'
        );
      }
      return { type: 'user', value: user };
    }

    // Role permission check
    const userRoles = await Role.find({
      _id: { $in: user.roles },
    }).populate('permissions');

    const userPermissions = userRoles.flatMap((role) =>
      role.permissions.map((p) => p.name)
    );

    const hasWildcard = userPermissions.includes('*');
    const hasRights = checkUserPermissions(
      userPermissions,
      requiredPermissions,
      hasWildcard
    );

    if (!hasRights) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Missing permissions: ${requiredPermissions.join(', ')}`
      );
    }
    return { type: 'user', value: user };
  }

  // === 2. Try API Key (only if req.apiKey not already set) ===
  if (!req.apiKey) {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Missing API key or JWT');
    }

    console.log('[requireAccess] Detected API key, verifying...');
    // Verify API key (this includes all validation: hash, active, expired, approval, limits)
    const apiKeyDoc = await apiKeyService.verifyApiKey(apiKey);
    console.log(
      '[requireAccess] API key verified:',
      apiKeyDoc && apiKeyDoc._id
    );

    // Set req.apiKey (duplicate of what apiKeyAuth does, but needed if apiKeyAuth wasn't used)
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
  } else {
    console.log('[requireAccess] Using existing req.apiKey');
  }

  // Permissions check for API key (always check, even if req.apiKey was set by previous middleware)
  if (
    requiredPermissions.length > 0 &&
    !requiredPermissions.some(
      (perm) =>
        req.apiKey.permissions.includes(perm) ||
        req.apiKey.permissions.includes('admin')
    )
  ) {
    console.log(
      '[requireAccess] API key lacks required permissions:',
      requiredPermissions,
      req.apiKey.permissions
    );
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `API key lacks required permissions: ${requiredPermissions.join(', ')}`
    );
  }

  return { type: 'apiKey', value: req.apiKey };
};

/**
 * Main middleware: requireAccess(config)
 * Supports JWT & API key auth, RBAC, scope, env, rateLimit, ownership
 *
 * Supports both old and new patterns:
 * - Old: requireAccess('user:read')
 * - New: requireAccess({ permissions: ['user:read'] })
 */
const requireAccess = (config) => {
  // Handle old pattern: requireAccess('permission')
  if (typeof config === 'string') {
    config = { permissions: [config] };
  }

  // Handle missing config
  if (!config || typeof config !== 'object') {
    config = {};
  }

  const {
    permissions = [],
    scope,
    environment,
    rateLimit = false,
    ownership, // async (req) => tenantId | true
    jwtOnly = false,
    apiOnly = false,
  } = config;

  return catchAsync(async (req, res, next) => {
    try {
      console.log(
        '[requireAccess] Checking access for endpoint:',
        req.originalUrl,
        {
          permissions,
          scope,
          environment,
          jwtOnly,
          apiOnly,
        }
      );
      // STEP 1: Resolve user or apiKey identity
      const access = await resolveAccessIdentity(req, permissions);
      req.access = access; // Normalized access layer
      console.log('[requireAccess] Resolved access:', access.type);

      // JWT-only block
      if (jwtOnly && access.type === 'apiKey') {
        console.log('[requireAccess] Blocked: API key not allowed (jwtOnly)');
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'API key authentication is not allowed for this endpoint.'
        );
      }
      // API-only block
      if (apiOnly && access.type === 'user') {
        console.log('[requireAccess] Blocked: JWT not allowed (apiOnly)');
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'JWT authentication is not allowed for this endpoint.'
        );
      }

      // STEP 2: Scope validation (API key only)
      if (access.type === 'apiKey' && scope) {
        if (req.apiKey.scope !== scope && req.apiKey.scope !== 'admin') {
          console.log(
            '[requireAccess] API key scope mismatch:',
            req.apiKey.scope,
            scope
          );
          throw new ApiError(
            httpStatus.FORBIDDEN,
            `API key scope '${req.apiKey.scope}' does not match required scope '${scope}'`
          );
        }
      }

      // STEP 3: Environment validation (API key only)
      if (access.type === 'apiKey' && environment) {
        if (req.apiKey.environment !== environment) {
          console.log(
            '[requireAccess] API key environment mismatch:',
            req.apiKey.environment,
            environment
          );
          throw new ApiError(
            httpStatus.FORBIDDEN,
            `API key is for '${req.apiKey.environment}' environment; '${environment}' is required`
          );
        }
      }

      // STEP 4: Rate Limiting (API key only)
      if (access.type === 'apiKey' && rateLimit) {
        const withinLimit = await apiKeyService.checkRateLimit(
          req.apiKey.id,
          req.apiKey.usageCount
        );
        if (!withinLimit) {
          res.set({
            'X-RateLimit-Limit': req.apiKey.rateLimit,
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString(),
          });
          console.log('[requireAccess] Rate limit exceeded');
          throw new ApiError(
            httpStatus.TOO_MANY_REQUESTS,
            'Rate limit exceeded'
          );
        }

        res.set({
          'X-RateLimit-Limit': req.apiKey.rateLimit,
          'X-RateLimit-Remaining': Math.max(
            0,
            req.apiKey.rateLimit - req.apiKey.usageCount
          ),
          'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString(),
        });
      }

      // STEP 5: Ownership Check (optional)
      if (ownership && typeof ownership === 'function') {
        const resourceTenantId = await ownership(req);
        const currentTenantId =
          access.type === 'user'
            ? req.user.tenant
            : req.apiKey.tenant._id.toString();

        if (
          resourceTenantId &&
          resourceTenantId.toString() !== currentTenantId.toString()
        ) {
          console.log(
            '[requireAccess] Ownership check failed:',
            resourceTenantId,
            currentTenantId
          );
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'Resource does not belong to your tenant'
          );
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
