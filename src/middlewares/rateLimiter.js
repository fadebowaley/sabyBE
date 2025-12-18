const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

// General auth limiter (IP-based, higher limit for shared networks)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased from 20 to handle shared IPs
  skipSuccessfulRequests: true, // Only count failed attempts
  message: {
    error: 'TOO_MANY_REQUESTS',
    message:
      'Too many login attempts from this IP address. Please try again in 15 minutes.',
    retryAfter: 900, // seconds
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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per email
  skipSuccessfulRequests: true, // Only count failed attempts
  keyGenerator: (req) => {
    // Use email from request body for login attempts, fallback to IP
    const email = req.body?.email?.toLowerCase();
    return email || req.ip;
  },
  message: {
    error: 'TOO_MANY_REQUESTS',
    message:
      'Too many login attempts for this email address. Please try again in 15 minutes.',
    retryAfter: 900, // seconds
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
