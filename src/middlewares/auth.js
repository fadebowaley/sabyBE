const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Role = require('../models/role.model');
const {
  ownerResourceBundle,
} = require('../scripts/permissions/ownerResource.json');

/**
 * Normalize resource name to singular form for bundle matching
 * Handles common plural forms: permissions -> permission, roles -> role, etc.
 */
const normalizeResourceToSingular = (resource) => {
  if (!resource || typeof resource !== 'string') {
    return resource;
  }

  // Common plural-to-singular mappings
  const pluralToSingular = {
    permissions: 'permission',
    roles: 'role',
    users: 'user',
    nodes: 'node',
    levels: 'level',
    structures: 'structure',
    submissions: 'submission',
    storages: 'storage',
    apikeys: 'apikey',
  };

  // Check if resource is plural and has a mapping
  if (pluralToSingular[resource.toLowerCase()]) {
    return pluralToSingular[resource.toLowerCase()];
  }

  // If ends with 's' and not in exceptions, try removing 's'
  if (resource.endsWith('s') && resource.length > 1) {
    const singular = resource.slice(0, -1);
    // Only normalize if singular form exists in bundle
    if (ownerResourceBundle.includes(singular)) {
      return singular;
    }
  }

  return resource;
};

// Debug: Log the owner resource bundle on startup
// eslint-disable-next-line no-console
console.log(
  '🔍 [AUTH MIDDLEWARE] Owner Resource Bundle loaded:',
  ownerResourceBundle
);
// eslint-disable-next-line no-console
console.log('🔍 [AUTH MIDDLEWARE] Bundle type:', typeof ownerResourceBundle);
// eslint-disable-next-line no-console
console.log(
  '🔍 [AUTH MIDDLEWARE] Is Array?:',
  Array.isArray(ownerResourceBundle)
);

const verifyCallback =
  (req, resolve, reject, requiredRights) => async (err, user, info) => {
    // Debug: Log the permissions required and the route being checked
    // eslint-disable-next-line no-console
    console.log('--- AUTH DEBUG ---');
    // eslint-disable-next-line no-console
    console.log('Route:', req.originalUrl);
    // eslint-disable-next-line no-console
    console.log('HTTP Method:', req.method);
    // eslint-disable-next-line no-console
    console.log('Required Permissions:', requiredRights);

    if (err || info || !user) {
      return reject(
        new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate')
      );
    }

    req.user = user;

    if (user.isSuper) {
      return resolve();
    }

    // Handle Owner role check
    if (user.isOwner) {
      // eslint-disable-next-line no-console
      console.log(
        'User is an Owner. Checking resource-based permissions with regex matching...'
      );
      // eslint-disable-next-line no-console
      console.log('🔍 Owner Resource Bundle:', ownerResourceBundle);
      // eslint-disable-next-line no-console
      console.log('🔍 Required Rights:', requiredRights);

      // Normalize permission format (support both old and new during migration)
      const normalizePermission = (permission) => {
        if (!permission || typeof permission !== 'string') {
          return permission;
        }
        // Special cases
        if (permission === '*' || permission === 'all:*') {
          return '*';
        }
        // If already in new format (resource:action), extract resource
        if (
          permission.match(
            /^[a-z]+[A-Z]?[a-z]*:(read|create|update|delete|manage|import|export|assign|restore|activate|deactivate|move|upload|download|share|copy|publish|archive|submit|process|complete|cancel|refund|regenerate|deleteAll|toggleStatus|assignRole|sendMessage|forgotPassword|resetPassword|verify|refresh|send|draft|retry|public|private|permissions|status|auth)$/
          )
        ) {
          return permission.split(':')[0]; // Return resource part
        }
        // Old format (action:resource) - extract resource
        const parts = permission.split(':');
        if (parts.length >= 2) {
          const resourceParts = parts
            .slice(1)
            .filter((p) => p && !p.startsWith('::'));
          if (resourceParts.length > 0) {
            return resourceParts[0];
          }
        }
        return permission;
      };

      // Precompile regex patterns for resource matching
      const resourceRegexMap = new Map();
      // Regex to match the resource part of the required right (after the first colon and before any other colons)
      const resourceRegex = /^[a-zA-Z]+:([a-zA-Z]+)/;

      requiredRights.forEach((right) => {
        // Extract resource from permission (supports both formats)
        const resource = normalizePermission(right);

        // eslint-disable-next-line no-console
        console.log(`🔍 Extracted Resource from "${right}": "${resource}"`);

        // If the resource is valid and hasn't been added to the map, create the regex for it
        if (resource && resource !== '*' && !resourceRegexMap.has(resource)) {
          const regex = new RegExp(`(^|:|-)${resource}($|:|-)`, 'i');
          resourceRegexMap.set(resource, regex);
        }
      });

      // Check if the user has access to all required resources based on the regex patterns
      const hasAccessToAllResources = requiredRights.every((right) => {
        let matchedResource = null;

        // Match each right to the precompiled regex for the resource
        // eslint-disable-next-line no-restricted-syntax
        for (const [resource, regex] of resourceRegexMap) {
          if (regex.test(right)) {
            matchedResource = resource;
            break;
          }
        }

        if (!matchedResource) {
          // eslint-disable-next-line no-console
          console.log(`❌ Owner missing permission for action: ${right}`);
          return false;
        }

        // Normalize resource to singular form for bundle matching
        const normalizedResource = normalizeResourceToSingular(matchedResource);

        // eslint-disable-next-line no-console
        console.log(`🔍 Checking if "${normalizedResource}" (normalized from "${matchedResource}") is in bundle...`);
        // eslint-disable-next-line no-console
        console.log(`🔍 Bundle contents:`, JSON.stringify(ownerResourceBundle));

        // Check if the normalized resource is in the owner's allowed resource bundle
        const hasResourceAccess = ownerResourceBundle.includes(normalizedResource);

        // eslint-disable-next-line no-console
        console.log(`🔍 includes() result: ${hasResourceAccess}`);

        if (!hasResourceAccess) {
          // eslint-disable-next-line no-console
          console.log(
            `❌ Resource ${matchedResource} is not in Owner's allowed bundle.`
          );
          // Additional debug: Check each item in the bundle
          // eslint-disable-next-line no-console
          console.log('🔍 Checking each bundle item:');
          ownerResourceBundle.forEach((item, idx) => {
            // eslint-disable-next-line no-console
            console.log(
              `  [${idx}] "${item}" === "${matchedResource}"? ${
                item === matchedResource
              }`
            );
            // eslint-disable-next-line no-console
            console.log(
              `  [${idx}] Type: ${typeof item}, Length: ${item.length}`
            );
          });
        }

        return hasResourceAccess;
      });

      if (!hasAccessToAllResources) {
        return reject(
          new ApiError(
            httpStatus.FORBIDDEN,
            'Owner does not have access to this resource'
          )
        );
      }

      return resolve();
    }

    // Handle regular user role check (if needed)
    // eslint-disable-next-line no-console
    console.log('User is a regular user. Checking name-based permissions...');

    // Normalize permission format (support both old and new during migration)
    const normalizePermission = (permission) => {
      if (!permission || typeof permission !== 'string') {
        return permission;
      }
      // Special cases
      if (permission === '*' || permission === 'all:*') {
        return '*';
      }
      // If already in new format (resource:action), return as-is
      if (
        permission.match(
          /^[a-z]+[A-Z]?[a-z]*:(read|create|update|delete|manage|import|export|assign|restore|activate|deactivate|move|upload|download|share|copy|publish|archive|submit|process|complete|cancel|refund|regenerate|deleteAll|toggleStatus|assignRole|sendMessage|forgotPassword|resetPassword|verify|refresh|send|draft|retry|public|private|permissions|status|auth)$/
        )
      ) {
        return permission;
      }
      // Try to load mapping if available
      try {
        const fs = require('fs');
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
        const action = parts[0];
        const resourceParts = parts
          .slice(1)
          .filter((p) => p && !p.startsWith('::'));
        if (resourceParts.length > 0) {
          const resource = resourceParts[0];
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
      return permission;
    };

    // Fast lookup for regular users
    const userRoles = await Role.find({ _id: { $in: user.roles } }).populate(
      'permissions'
    );
    const userPermissions = userRoles.flatMap((role) => role.permissions);
    const userPermissionNames = new Set(userPermissions.map((p) => p.name));

    // Normalize user permissions (support both formats)
    const normalizedUserPerms =
      Array.from(userPermissionNames).map(normalizePermission);
    const normalizedUserPermSet = new Set(normalizedUserPerms);

    const hasWildcardPermission =
      userPermissionNames.has('*') || normalizedUserPermSet.has('*');

    const hasRequiredRights = requiredRights.every((right) => {
      const normalizedRight = normalizePermission(right);
      // Check both original and normalized formats
      return (
        userPermissionNames.has(right) ||
        normalizedUserPermSet.has(normalizedRight) ||
        hasWildcardPermission
      );
    });

    if (!hasRequiredRights) {
      return reject(
        new ApiError(
          httpStatus.FORBIDDEN,
          `Missing required permissions: ${requiredRights.join(', ')}`
        )
      );
    }

    resolve();
  };;

const auth =
  (...requiredRights) =>
  async (req, res, next) => {
    // Skip authentication for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }

    return new Promise((resolve, reject) => {
      passport.authenticate(
        'jwt',
        { session: false },
        verifyCallback(req, resolve, reject, requiredRights)
      )(req, res, next);
    })
      .then(() => next())
      .catch((err) => next(err));
  };

module.exports = auth;
