const Joi = require('joi');
const httpStatus = require('http-status');
const { v4: uuidv4 } = require('uuid');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { postgresPool } = require('../config/postgres');

/**
 * Middleware to validate request data against a given schema.
 *
 * @param {Object} schema - The validation schema for the request data.
 * @returns {Function} Middleware function to validate the request.
 */
const validate = (schema) => async (req, res, next) => {
  // Pick the relevant parts of the schema (params, query, body)
  const validSchema = pick(schema, ['params', 'query', 'body']);
  // Pick the relevant parts of the request (params, query, body)
  const object = pick(req, Object.keys(validSchema));
  // Validate the request data against the schema
  const { value, error } = Joi.compile(validSchema)
    .prefs({ errors: { label: 'key' }, abortEarly: false })
    .validate(object);

  // If there is a validation error, create an error message and pass it to the next middleware
  if (error) {
    const errorMessage = error.details
      .map((details) => details.message)
      .join(', ');
    // Only log if authenticated (req.user exists)
    if (req.user) {
      try {
        const body = req.body || {};
        const nodeId = body.nodeId ?? body.node_id ?? null;
        await postgresPool.query(
          `INSERT INTO submission_activity_log (tenant_id, user_id, node_id, action, status, job_id, message, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            req.user.tenantId || null,
            req.user._id || null,
            nodeId,
            'rejected',
            'rejected',
            uuidv4(),
            errorMessage,
            new Date(),
          ]
        );
      } catch (logErr) {
        // Optionally log this error somewhere
      }
    }
    return next(new ApiError(httpStatus.BAD_REQUEST, errorMessage));
  }
  // If validation is successful, assign the validated values to the request object
  Object.assign(req, value);
  return next();
};

module.exports = validate;
