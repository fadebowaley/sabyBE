/**
 * Baseline Permission Middleware
 * Enforces hierarchical access control for baseline intelligence endpoints
 */

const { nodeAccessService } = require('../services');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const logger = require('../config/logger');

/**
 * Middleware to check if user can access a node's baseline intelligence
 * @param {string} paramName - Name of the route parameter containing nodeId (default: 'nodeId')
 * @returns {Function} Express middleware function
 */
const canAccessNodeBaseline = (paramName = 'nodeId') => {
  return async (req, res, next) => {
    try {
      const nodeId = req.params[paramName];
      const { tenantId } = req.user;
      const user = req.user;

      // Owners/Supers/Saby bypass permission check
      if (user.isOwner || user.isSuper || user.isSaby) {
        logger.debug(`User ${user._id} has full access (Owner/Super/Saby)`);
        return next();
      }

      // Check if user has access to this node
      const hasAccess = await nodeAccessService.canUserAccessNode(
        user,
        nodeId,
        tenantId
      );

      if (!hasAccess) {
        logger.warn(
          `User ${user._id} denied access to node ${nodeId} baseline (not in their family tree)`
        );
        throw new ApiError(
          httpStatus.FORBIDDEN,
          "You do not have permission to access this node's baseline intelligence. You can only view baselines for nodes you are assigned to and their descendants."
        );
      }

      logger.debug(
        `User ${user._id} granted access to node ${nodeId} baseline`
      );
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check if user can recompute baselines
 * Only Owners, Supers, and Saby users can trigger recomputation
 */
const canRecomputeBaseline = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.isOwner && !user.isSuper && !user.isSaby) {
      logger.warn(
        `User ${user._id} denied permission to recompute baselines (insufficient privileges)`
      );
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Insufficient permissions to recompute baselines. Only Owners and Super Users can perform this action.'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  canAccessNodeBaseline,
  canRecomputeBaseline,
};
