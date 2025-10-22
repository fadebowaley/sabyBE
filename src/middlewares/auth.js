const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Role = require('../models/role.model');
const {
  ownerResourceBundle,
} = require('../scripts/permissions/ownerResource.json');

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

      // Precompile regex patterns for resource matching
      const resourceRegexMap = new Map();
      // Regex to match the resource part of the required right (after the first colon and before any other colons)
      const resourceRegex = /^[a-zA-Z]+:([a-zA-Z]+)/;

      requiredRights.forEach((right) => {
        // Extract the resource part from each right using regex
        const match = right.match(resourceRegex);

        if (match) {
          const resource = match[1]; // The part after the colon (e.g., 'user', 'payment')

          // eslint-disable-next-line no-console
          console.log(`🔍 Extracted Resource from "${right}": "${resource}"`);
          // eslint-disable-next-line no-console
          console.log(`🔍 Resource type: ${typeof resource}`);
          // eslint-disable-next-line no-console
          console.log(`🔍 Resource length: ${resource.length}`);

          // If the resource is valid and hasn't been added to the map, create the regex for it
          if (resource && !resourceRegexMap.has(resource)) {
            const regex = new RegExp(`(^|:|-)${resource}($|:|-)`, 'i');
            resourceRegexMap.set(resource, regex);
          }
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

        // eslint-disable-next-line no-console
        console.log(`🔍 Checking if "${matchedResource}" is in bundle...`);
        // eslint-disable-next-line no-console
        console.log(`🔍 Bundle contents:`, JSON.stringify(ownerResourceBundle));

        // Check if the matched resource is in the owner's allowed resource bundle
        const hasResourceAccess = ownerResourceBundle.includes(matchedResource);

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

    // Fast lookup for regular users
    const userRoles = await Role.find({ _id: { $in: user.roles } }).populate(
      'permissions'
    );
    const userPermissions = userRoles.flatMap((role) => role.permissions);
    const userPermissionNames = new Set(userPermissions.map((p) => p.name));

    const hasWildcardPermission = userPermissionNames.has('*');

    const hasRequiredRights = requiredRights.every(
      (right) => userPermissionNames.has(right) || hasWildcardPermission
    );

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
  async (req, res, next) =>
    new Promise((resolve, reject) => {
      passport.authenticate(
        'jwt',
        { session: false },
        verifyCallback(req, resolve, reject, requiredRights)
      )(req, res, next);
    })
      .then(() => next())
      .catch((err) => next(err));

module.exports = auth;
