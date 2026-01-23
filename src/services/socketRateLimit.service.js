const logger = require('../config/logger');
const { redisClient } = require('../config/redis');

const RATE_LIMIT_KEY_PREFIX = 'socket:ratelimit';

// Rate limit configurations
const RATE_LIMITS = {
  // Messages: 60 per minute per user
  MESSAGE: {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 messages per minute
    keyPrefix: 'message',
  },
  // Typing indicators: 20 per minute per socket
  TYPING: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 typing events per minute
    keyPrefix: 'typing',
  },
};

/**
 * Check if an action should be rate limited
 * Uses sliding window algorithm with Redis
 * @param {string} identifier - User ID or socket ID
 * @param {string} tenantId - Tenant ID
 * @param {string} type - Rate limit type ('MESSAGE' or 'TYPING')
 * @param {string} socketId - Socket ID (optional, for per-socket limits)
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date, limit: number}>}
 */
const checkRateLimit = async (identifier, tenantId, type = 'MESSAGE', socketId = null) => {
  const config = RATE_LIMITS[type];
  if (!config) {
    logger.error(`Unknown rate limit type: ${type}`);
    return { allowed: true, remaining: 0, resetAt: null, limit: 0 };
  }

  // Build Redis key
  // Format: socket:ratelimit:{type}:{tenantId}:{identifier}[:socketId]
  let key = `${RATE_LIMIT_KEY_PREFIX}:${config.keyPrefix}:${tenantId}:${identifier}`;
  if (socketId && type === 'TYPING') {
    key += `:${socketId}`;
  }

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Use Redis sorted set for sliding window
    // Score = timestamp, Value = unique request ID
    const pipeline = redisClient.pipeline();

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count entries in the current window
    pipeline.zcard(key);

    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);

    // Set expiration for the key (windowMs + 1 second buffer)
    pipeline.expire(key, Math.ceil((config.windowMs / 1000) + 1));

    // Execute pipeline
    const results = await pipeline.exec();

    // Extract count before adding current request
    const currentCount = results[1][1]; // zcard result

    // Check if limit exceeded (before adding current request)
    const allowed = currentCount < config.max;
    const remaining = Math.max(0, config.max - (currentCount + 1));
    const resetAt = new Date(now + config.windowMs);

    if (!allowed) {
      logger.warn({
        event: 'SOCKET_RATE_LIMIT_EXCEEDED',
        type,
        identifier,
        tenantId,
        socketId,
        count: currentCount + 1,
        limit: config.max,
        windowMs: config.windowMs,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      allowed,
      remaining,
      resetAt,
      limit: config.max,
      currentCount: currentCount + 1,
    };
  } catch (error) {
    // On Redis error, allow the request but log the error
    logger.error({
      event: 'SOCKET_RATE_LIMIT_ERROR',
      type,
      identifier,
      tenantId,
      socketId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    // Fail open - allow the request if Redis is down
    return {
      allowed: true,
      remaining: config.max,
      resetAt: new Date(Date.now() + config.windowMs),
      limit: config.max,
      error: true,
    };
  }
};

/**
 * Check message rate limit for a user
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date, limit: number}>}
 */
const checkMessageRateLimit = async (userId, tenantId) => {
  return checkRateLimit(userId, tenantId, 'MESSAGE');
};

/**
 * Check typing indicator rate limit for a socket
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @param {string} socketId - Socket ID
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: Date, limit: number}>}
 */
const checkTypingRateLimit = async (userId, tenantId, socketId) => {
  return checkRateLimit(userId, tenantId, 'TYPING', socketId);
};

/**
 * Get rate limit status for a user/socket without consuming a request
 * @param {string} identifier - User ID or socket ID
 * @param {string} tenantId - Tenant ID
 * @param {string} type - Rate limit type ('MESSAGE' or 'TYPING')
 * @param {string} socketId - Socket ID (optional, for per-socket limits)
 * @returns {Promise<{remaining: number, resetAt: Date, limit: number, currentCount: number}>}
 */
const getRateLimitStatus = async (identifier, tenantId, type = 'MESSAGE', socketId = null) => {
  const config = RATE_LIMITS[type];
  if (!config) {
    return { remaining: 0, resetAt: null, limit: 0, currentCount: 0 };
  }

  let key = `${RATE_LIMIT_KEY_PREFIX}:${config.keyPrefix}:${tenantId}:${identifier}`;
  if (socketId && type === 'TYPING') {
    key += `:${socketId}`;
  }

  try {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old entries
    await redisClient.zremrangebyscore(key, 0, windowStart);

    // Count current entries
    const currentCount = await redisClient.zcard(key);
    const remaining = Math.max(0, config.max - currentCount);
    const resetAt = new Date(now + config.windowMs);

    return {
      remaining,
      resetAt,
      limit: config.max,
      currentCount,
    };
  } catch (error) {
    logger.error({
      event: 'SOCKET_RATE_LIMIT_STATUS_ERROR',
      type,
      identifier,
      tenantId,
      socketId,
      error: error.message,
    });
    return {
      remaining: config.max,
      resetAt: new Date(Date.now() + config.windowMs),
      limit: config.max,
      currentCount: 0,
      error: true,
    };
  }
};

/**
 * Reset rate limit for a user/socket (admin function)
 * @param {string} identifier - User ID or socket ID
 * @param {string} tenantId - Tenant ID
 * @param {string} type - Rate limit type ('MESSAGE' or 'TYPING')
 * @param {string} socketId - Socket ID (optional, for per-socket limits)
 * @returns {Promise<boolean>}
 */
const resetRateLimit = async (identifier, tenantId, type = 'MESSAGE', socketId = null) => {
  const config = RATE_LIMITS[type];
  if (!config) {
    return false;
  }

  let key = `${RATE_LIMIT_KEY_PREFIX}:${config.keyPrefix}:${tenantId}:${identifier}`;
  if (socketId && type === 'TYPING') {
    key += `:${socketId}`;
  }

  try {
    await redisClient.del(key);
    logger.info({
      event: 'SOCKET_RATE_LIMIT_RESET',
      type,
      identifier,
      tenantId,
      socketId,
    });
    return true;
  } catch (error) {
    logger.error({
      event: 'SOCKET_RATE_LIMIT_RESET_ERROR',
      type,
      identifier,
      tenantId,
      socketId,
      error: error.message,
    });
    return false;
  }
};

/**
 * Create a Socket.IO rate limit middleware function
 * @param {string} type - Rate limit type ('MESSAGE' or 'TYPING')
 * @returns {Function} Middleware function
 */
const createRateLimitMiddleware = (type) => {
  return async (socket, data, next) => {
    try {
      const userId = socket.userId;
      const tenantId = socket.tenantId;
      const socketId = socket.id;

      if (!userId || !tenantId) {
        return next(new Error('User ID and tenant ID are required for rate limiting'));
      }

      let rateLimitResult;
      if (type === 'TYPING') {
        rateLimitResult = await checkTypingRateLimit(userId, tenantId, socketId);
      } else {
        rateLimitResult = await checkMessageRateLimit(userId, tenantId);
      }

      if (!rateLimitResult.allowed) {
        // Emit rate limit error to the client
        socket.emit('rate-limit-exceeded', {
          type,
          message: `Rate limit exceeded. Maximum ${rateLimitResult.limit} ${type.toLowerCase()} events per minute.`,
          remaining: rateLimitResult.remaining,
          resetAt: rateLimitResult.resetAt,
          limit: rateLimitResult.limit,
        });

        return next(new Error(`Rate limit exceeded: ${rateLimitResult.limit} ${type.toLowerCase()} events per minute`));
      }

      // Attach rate limit info to socket/data for potential client feedback
      if (!socket.rateLimitInfo) {
        socket.rateLimitInfo = {};
      }
      socket.rateLimitInfo[type.toLowerCase()] = {
        remaining: rateLimitResult.remaining,
        resetAt: rateLimitResult.resetAt,
        limit: rateLimitResult.limit,
      };

      next();
    } catch (error) {
      logger.error({
        event: 'SOCKET_RATE_LIMIT_MIDDLEWARE_ERROR',
        type,
        error: error.message,
        stack: error.stack,
      });
      // Fail open - allow the request if there's an error
      next();
    }
  };
};

module.exports = {
  checkRateLimit,
  checkMessageRateLimit,
  checkTypingRateLimit,
  getRateLimitStatus,
  resetRateLimit,
  createRateLimitMiddleware,
  RATE_LIMITS,
};
