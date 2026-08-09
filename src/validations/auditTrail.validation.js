const Joi = require('joi');

const getAuditTrail = {
  query: Joi.object().keys({
    tenantId: Joi.string().max(128),
    userId: Joi.string().max(128),
    action: Joi.string().max(64),
    resource: Joi.string().max(128),
    resourceId: Joi.string().max(128),
    method: Joi.string().valid('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
    statusCode: Joi.number().integer().min(100).max(599),
    ipAddress: Joi.string().max(45),
    from: Joi.date().iso(),
    to: Joi.date().iso(),
    path: Joi.string().max(512),
    search: Joi.string().max(256),
    sortBy: Joi.string().valid('created_at', 'duration_ms', 'status_code').default('created_at'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
    limit: Joi.number().integer().min(1).max(1000).default(50),
    page: Joi.number().integer().min(1).default(1),
  }),
};

module.exports = {
  getAuditTrail,
};
