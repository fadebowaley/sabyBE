/**
 * Validation Report Validation Schemas
 *
 * @module validations/validationReport
 */

const Joi = require('joi');

const getValidations = {
  query: Joi.object().keys({
    tenant_id: Joi.string(),
    project_id: Joi.string(),
    submission_id: Joi.string().uuid(),
    category: Joi.string().valid(
      'schema',
      'business',
      'compliance',
      'data_quality'
    ),
    severity: Joi.string().valid('critical', 'warning', 'info'),
    is_valid: Joi.boolean(),
    resolution_status: Joi.string().valid('pending', 'resolved', 'ignored'),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getValidationById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getValidationsBySubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getFailedValidations = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    category: Joi.string().valid(
      'schema',
      'business',
      'compliance',
      'data_quality'
    ),
    severity: Joi.string().valid('critical', 'warning', 'info'),
    limit: Joi.number().integer().min(1).max(200).default(100),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getValidationStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getValidationErrors = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
  }),
};

const resolveValidation = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    resolution_note: Joi.string().max(1000),
  }),
};

const bulkResolveValidations = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    resolution_note: Joi.string().max(1000),
  }),
};

const deleteValidation = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getValidations,
  getValidationById,
  getValidationsBySubmission,
  getFailedValidations,
  getValidationStats,
  getValidationErrors,
  resolveValidation,
  bulkResolveValidations,
  deleteValidation,
};

 *
 * @module validations/validationReport
 */

const Joi = require('joi');

const getValidations = {
  query: Joi.object().keys({
    tenant_id: Joi.string(),
    project_id: Joi.string(),
    submission_id: Joi.string().uuid(),
    category: Joi.string().valid(
      'schema',
      'business',
      'compliance',
      'data_quality'
    ),
    severity: Joi.string().valid('critical', 'warning', 'info'),
    is_valid: Joi.boolean(),
    resolution_status: Joi.string().valid('pending', 'resolved', 'ignored'),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getValidationById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getValidationsBySubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getFailedValidations = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    category: Joi.string().valid(
      'schema',
      'business',
      'compliance',
      'data_quality'
    ),
    severity: Joi.string().valid('critical', 'warning', 'info'),
    limit: Joi.number().integer().min(1).max(200).default(100),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getValidationStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getValidationErrors = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
  }),
};

const resolveValidation = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    resolution_note: Joi.string().max(1000),
  }),
};

const bulkResolveValidations = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    resolution_note: Joi.string().max(1000),
  }),
};

const deleteValidation = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getValidations,
  getValidationById,
  getValidationsBySubmission,
  getFailedValidations,
  getValidationStats,
  getValidationErrors,
  resolveValidation,
  bulkResolveValidations,
  deleteValidation,
};

 *
 * @module validations/validationReport
 */

const Joi = require('joi');

const getValidations = {
  query: Joi.object().keys({
    tenant_id: Joi.string(),
    project_id: Joi.string(),
    submission_id: Joi.string().uuid(),
    category: Joi.string().valid(
      'schema',
      'business',
      'compliance',
      'data_quality'
    ),
    severity: Joi.string().valid('critical', 'warning', 'info'),
    is_valid: Joi.boolean(),
    resolution_status: Joi.string().valid('pending', 'resolved', 'ignored'),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getValidationById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getValidationsBySubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

const getFailedValidations = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    category: Joi.string().valid(
      'schema',
      'business',
      'compliance',
      'data_quality'
    ),
    severity: Joi.string().valid('critical', 'warning', 'info'),
    limit: Joi.number().integer().min(1).max(200).default(100),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

const getValidationStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

const getValidationErrors = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
  }),
};

const resolveValidation = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    resolution_note: Joi.string().max(1000),
  }),
};

const bulkResolveValidations = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    resolution_note: Joi.string().max(1000),
  }),
};

const deleteValidation = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getValidations,
  getValidationById,
  getValidationsBySubmission,
  getFailedValidations,
  getValidationStats,
  getValidationErrors,
  resolveValidation,
  bulkResolveValidations,
  deleteValidation,
};
