const rateLimit = require('express-rate-limit');

const publicFormReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.PUBLIC_FORM_READ_RATE_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many form page requests. Please retry shortly.',
  },
});

const publicFormSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.PUBLIC_FORM_SUBMIT_RATE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many form submissions. Please retry later.',
  },
});

module.exports = {
  publicFormReadLimiter,
  publicFormSubmitLimiter,
};

