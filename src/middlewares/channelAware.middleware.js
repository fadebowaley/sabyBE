const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Channel-aware access control middleware
 * Blocks ordinary users from accessing web portal
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const channelAwareAccess = (req, res, next) => {
  // Skip if no user is authenticated
  if (!req.user) {
    return next();
  }

  // Check if this is a web portal request
  const isWebPortal =
    req.headers['user-agent'] &&
    (req.headers['user-agent'].includes('Mozilla') ||
      req.headers['user-agent'].includes('Chrome') ||
      req.headers['user-agent'].includes('Safari') ||
      req.headers['user-agent'].includes('Firefox'));

  // Check if user is an ordinary user
  if (req.user.isOrdinaryUser && req.user.isOrdinaryUser()) {
    if (isWebPortal) {
      console.log(
        `[ChannelAware] Ordinary user ${req.user.email} blocked from web portal access`
      );
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Access denied. This account cannot access the web portal. Please use the designated access channel.'
      );
    }
  }

  next();
};

/**
 * Web portal access check middleware
 * Explicitly blocks ordinary users from web portal routes
 */
const webPortalAccess = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  if (req.user.isOrdinaryUser && req.user.isOrdinaryUser()) {
    console.log(
      `[WebPortalAccess] Ordinary user ${req.user.email} blocked from web portal`
    );
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied. This account cannot access the web portal.'
    );
  }

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
