const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// General auth limiter (IP-based, higher limit for shared networks)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 failed attempts per IP
  skipSuccessfulRequests: true, // Only count failed attempts
  message: {
    error: 'TOO_MANY_REQUESTS',
    message:
      'Too many login attempts from this IP address. Please try again in 5 minutes.',
    retryAfter: 300, // seconds (5 minutes)
  },
  standardHeaders: true, // Enable standard rate limit headers
  legacyHeaders: true, // Enable legacy X-RateLimit-* headers
  onLimitReached: (req, res, options) => {
    logger.warn({
      event: 'RATE_LIMIT_HIT',
      ip: req.ip,
      realIp: req.headers['x-real-ip'],
      forwardedFor: req.headers['x-forwarded-for'],
      path: req.path,
      method: req.method,
      email: req.body?.email,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    });
  },
});

// User-based rate limiter for login (email-based, prevents shared IP issues)
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 failed attempts per email
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: (req) => {
    // Use email from request body for login attempts, fallback to IP
    const email = req.body?.email?.toLowerCase();
    return email || req.ip;
  },
  message: {
    error: 'TOO_MANY_REQUESTS',
    message:
      'Too many login attempts for this email address. Please try again in 5 minutes.',
    retryAfter: 300, // seconds (5 minutes)
  },
  standardHeaders: true,
  legacyHeaders: true,
  onLimitReached: (req, res, options) => {
    logger.warn({
      event: 'LOGIN_RATE_LIMIT_HIT',
      ip: req.ip,
      realIp: req.headers['x-real-ip'],
      email: req.body?.email?.toLowerCase(),
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString(),
    });
  },
});

module.exports = {
  authLimiter,
  loginLimiter,
};
