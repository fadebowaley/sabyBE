const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Channel-aware access control middleware
 * Allows all authenticated users to access web portal
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const channelAwareAccess = (req, res, next) => {
  // Skip if no user is authenticated
  if (!req.user) {
    return next();
  }

  // Allow all authenticated users (including ordinary users) to access web portal
  // Removed: Ordinary user web portal restriction
  next();
};

/**
 * Web portal access check middleware
 * Allows all authenticated users to access web portal routes
 * API key is optional for enhanced security but not required
 */
const webPortalAccess = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  // Allow all authenticated users (including ordinary users) to access web portal
  // API key is optional for enhanced security but not required
  // Removed: Ordinary user web portal restriction
  next();
};

/**
 * Admin access middleware
 * Only allows SabyUser, SuperUser, and Owner access
 */
const adminAccess = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
  }

  if (req.user.isOrdinaryUser && req.user.isOrdinaryUser()) {
    console.log(
      `[AdminAccess] Ordinary user ${req.user.email} blocked from admin access`
    );
    throw new ApiError(httpStatus.FORBIDDEN, 'Admin access required');
  }

  next();
};

/**
 * SuperUser access middleware
 * Only allows SabyUser and SuperUser access
 */
const superUserAccess = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
  }

  if (!req.user.isSaby && !req.user.isSuper) {
    console.log(
      `[SuperUserAccess] User ${req.user.email} blocked from super user access`
    );
    throw new ApiError(httpStatus.FORBIDDEN, 'Super user access required');
  }

  next();
};

/**
 * SabyUser access middleware
 * Only allows SabyUser access
 */
const sabyUserAccess = (req, res, next) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
  }

  if (!req.user.isSaby) {
    console.log(
      `[SabyUserAccess] User ${req.user.email} blocked from SabyUser access`
    );
    throw new ApiError(httpStatus.FORBIDDEN, 'SabyUser access required');
  }

  next();
};

module.exports = {
  channelAwareAccess,
  webPortalAccess,
  adminAccess,
  superUserAccess,
  sabyUserAccess,
};
