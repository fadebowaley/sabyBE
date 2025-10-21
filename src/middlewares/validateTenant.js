const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Middleware factory to validate that a resource belongs to the user's tenant
 *
 * This middleware helps eliminate duplicate tenant validation code across controllers
 * by providing a reusable way to verify tenant ownership of resources.
 *
 * @param {Function} getResourceFn - Async function to retrieve the resource
 *   The function receives (req) and should return the resource object with a tenantId field
 *   Example: async (req) => await NodeService.getNodeById(req.params.nodeId)
 *
 * @param {Object} options - Configuration options
 * @param {string} options.resourceName - Name of the resource for error messages (default: 'Resource')
 * @param {string} options.attachAs - Property name to attach resource to req object (default: 'resource')
 *
 * @returns {Function} Express middleware function
 *
 * @example
 * // In routes file:
 * const validateTenant = require('../middlewares/validateTenant');
 * const { nodeService } = require('../services');
 *
 * router.patch(
 *   '/:nodeId',
 *   auth('update:node'),
 *   validateTenant(
 *     async (req) => await nodeService.getNodeById(req.params.nodeId),
 *     { resourceName: 'Node', attachAs: 'node' }
 *   ),
 *   nodeController.updateNodeById
 * );
 *
 * // In controller, access via req.node instead of fetching again
 */
const validateTenant = (getResourceFn, options = {}) => {
  const { resourceName = 'Resource', attachAs = 'resource' } = options;

  return async (req, res, next) => {
    try {
      // Validate user and tenant ID exist
      if (!req.user || !req.user.tenantId) {
        return next(
          new ApiError(httpStatus.UNAUTHORIZED, 'User authentication required')
        );
      }

      // Fetch the resource using the provided function
      const resource = await getResourceFn(req);

      // Check if resource exists
      if (!resource) {
        return next(
          new ApiError(httpStatus.NOT_FOUND, `${resourceName} not found`)
        );
      }

      // Validate resource has tenantId field
      if (!resource.tenantId) {
        console.error(
          `[validateTenant] ${resourceName} missing tenantId field`,
          { resourceId: resource._id || resource.id }
        );
        return next(
          new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            'Resource tenant validation failed'
          )
        );
      }

      // Verify resource belongs to user's tenant
      if (resource.tenantId !== req.user.tenantId) {
        console.warn(`[validateTenant] Tenant mismatch for ${resourceName}`, {
          resourceId: resource._id || resource.id,
          resourceTenant: resource.tenantId,
          userTenant: req.user.tenantId,
        });
        return next(
          new ApiError(
            httpStatus.FORBIDDEN,
            `Access denied - ${resourceName.toLowerCase()} belongs to different tenant`
          )
        );
      }

      // Attach resource to request for use in controller
      // This eliminates the need to fetch the resource again in the controller
      req[attachAs] = resource;

      console.log(
        `[validateTenant] ${resourceName} tenant validated successfully`,
        {
          resourceId: resource._id || resource.id,
          tenantId: resource.tenantId,
        }
      );

      next();
    } catch (error) {
      console.error('[validateTenant] Error during tenant validation:', error);
      next(error);
    }
  };
};

/**
 * Convenience function to create a tenant validator for common resource types
 *
 * @param {string} resourceType - Type of resource ('node', 'structure', 'level', etc.)
 * @param {Function} serviceFn - Service function to fetch the resource
 * @param {Function} idExtractor - Function to extract ID from request (default: req => req.params[`${resourceType}Id`])
 * @returns {Function} Configured validateTenant middleware
 *
 * @example
 * const { createTenantValidator } = require('../middlewares/validateTenant');
 * const { nodeService } = require('../services');
 *
 * const validateNodeTenant = createTenantValidator(
 *   'node',
 *   nodeService.getNodeById
 * );
 *
 * router.patch('/:nodeId', auth('update:node'), validateNodeTenant, nodeController.updateNodeById);
 */
const createTenantValidator = (
  resourceType,
  serviceFn,
  idExtractor = (req) => req.params[`${resourceType}Id`]
) => {
  const resourceName =
    resourceType.charAt(0).toUpperCase() + resourceType.slice(1);

  return validateTenant(
    async (req) => {
      const id = idExtractor(req);
      return await serviceFn(id);
    },
    {
      resourceName,
      attachAs: resourceType,
    }
  );
};

module.exports = validateTenant;
module.exports.createTenantValidator = createTenantValidator;
