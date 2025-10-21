/**
 * Submission Report Validation Schemas
 *
 * Joi validation schemas for submission report API endpoints.
 *
 * @module validations/submissionReport
 */

const Joi = require('joi');

/**
 * Validation for GET /v1/submission-reports (list with filters)
 */
const getSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string().uuid(),
    node_id: Joi.string().uuid(),
    user_id: Joi.string().uuid(),
    status: Joi.string().valid(
      'pending',
      'in_progress',
      'completed',
      'failed',
      'deleted',
      'archived'
    ),
    source: Joi.string().valid(
      'api',
      'whatsapp',
      'telegram',
      'email',
      'agent',
      'manual'
    ),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    year: Joi.number().integer().min(2020).max(2100),
    perm_enabled: Joi.boolean(),
    is_locked: Joi.boolean(),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
    completeness_status: Joi.string().valid(
      'complete',
      'partial',
      'incomplete'
    ),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

/**
 * Validation for GET /v1/submission-reports/:id
 */
const getSubmissionById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/compliance/:month
 */
const getComplianceReport = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/node/:nodeId
 */
const getSubmissionsByNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    perm_only: Joi.boolean(),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

/**
 * Validation for GET /v1/submission-reports/stats
 */
const getSubmissionStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string().uuid(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    year: Joi.number().integer().min(2020).max(2100),
  }),
};

/**
 * Validation for GET /v1/submission-reports/monthly/:month
 */
const getMonthlyReport = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/incomplete/:month
 */
const getIncompleteSubmissions = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/locked
 */
const getLockedSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

/**
 * Validation for PATCH /v1/submission-reports/:id
 */
const updateSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object()
    .keys({
      data: Joi.object(),
      meta: Joi.object(),
      status: Joi.string().valid(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'deleted',
        'archived'
      ),
      event_date: Joi.date().iso(),
    })
    .min(1),
};

/**
 * Validation for PATCH /v1/submission-reports/:id/status
 */
const updateSubmissionStatus = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'deleted',
        'archived'
      )
      .required(),
  }),
};

/**
 * Validation for POST /v1/submission-reports/:id/lock
 */
const lockSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500),
  }),
};

/**
 * Validation for POST /v1/submission-reports/:id/unlock
 */
const unlockSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500),
  }),
};

/**
 * Validation for DELETE /v1/submission-reports/:id
 */
const deleteSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for POST /v1/submission-reports/bulk-delete
 */
const bulkDeleteSubmissions = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    hard: Joi.boolean().default(false),
  }),
};

module.exports = {
  getSubmissions,
  getSubmissionById,
  getComplianceReport,
  getSubmissionsByNode,
  getSubmissionStats,
  getMonthlyReport,
  getIncompleteSubmissions,
  getLockedSubmissions,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
};

 *
 * Joi validation schemas for submission report API endpoints.
 *
 * @module validations/submissionReport
 */

const Joi = require('joi');

/**
 * Validation for GET /v1/submission-reports (list with filters)
 */
const getSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string().uuid(),
    node_id: Joi.string().uuid(),
    user_id: Joi.string().uuid(),
    status: Joi.string().valid(
      'pending',
      'in_progress',
      'completed',
      'failed',
      'deleted',
      'archived'
    ),
    source: Joi.string().valid(
      'api',
      'whatsapp',
      'telegram',
      'email',
      'agent',
      'manual'
    ),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    year: Joi.number().integer().min(2020).max(2100),
    perm_enabled: Joi.boolean(),
    is_locked: Joi.boolean(),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
    completeness_status: Joi.string().valid(
      'complete',
      'partial',
      'incomplete'
    ),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

/**
 * Validation for GET /v1/submission-reports/:id
 */
const getSubmissionById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/compliance/:month
 */
const getComplianceReport = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/node/:nodeId
 */
const getSubmissionsByNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    perm_only: Joi.boolean(),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

/**
 * Validation for GET /v1/submission-reports/stats
 */
const getSubmissionStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string().uuid(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    year: Joi.number().integer().min(2020).max(2100),
  }),
};

/**
 * Validation for GET /v1/submission-reports/monthly/:month
 */
const getMonthlyReport = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/incomplete/:month
 */
const getIncompleteSubmissions = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/locked
 */
const getLockedSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

/**
 * Validation for PATCH /v1/submission-reports/:id
 */
const updateSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object()
    .keys({
      data: Joi.object(),
      meta: Joi.object(),
      status: Joi.string().valid(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'deleted',
        'archived'
      ),
      event_date: Joi.date().iso(),
    })
    .min(1),
};

/**
 * Validation for PATCH /v1/submission-reports/:id/status
 */
const updateSubmissionStatus = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'deleted',
        'archived'
      )
      .required(),
  }),
};

/**
 * Validation for POST /v1/submission-reports/:id/lock
 */
const lockSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500),
  }),
};

/**
 * Validation for POST /v1/submission-reports/:id/unlock
 */
const unlockSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500),
  }),
};

/**
 * Validation for DELETE /v1/submission-reports/:id
 */
const deleteSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for POST /v1/submission-reports/bulk-delete
 */
const bulkDeleteSubmissions = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    hard: Joi.boolean().default(false),
  }),
};

module.exports = {
  getSubmissions,
  getSubmissionById,
  getComplianceReport,
  getSubmissionsByNode,
  getSubmissionStats,
  getMonthlyReport,
  getIncompleteSubmissions,
  getLockedSubmissions,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
};

 *
 * Joi validation schemas for submission report API endpoints.
 *
 * @module validations/submissionReport
 */

const Joi = require('joi');

/**
 * Validation for GET /v1/submission-reports (list with filters)
 */
const getSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string().uuid(),
    node_id: Joi.string().uuid(),
    user_id: Joi.string().uuid(),
    status: Joi.string().valid(
      'pending',
      'in_progress',
      'completed',
      'failed',
      'deleted',
      'archived'
    ),
    source: Joi.string().valid(
      'api',
      'whatsapp',
      'telegram',
      'email',
      'agent',
      'manual'
    ),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    year: Joi.number().integer().min(2020).max(2100),
    perm_enabled: Joi.boolean(),
    is_locked: Joi.boolean(),
    start_date: Joi.date().iso(),
    end_date: Joi.date().iso(),
    completeness_status: Joi.string().valid(
      'complete',
      'partial',
      'incomplete'
    ),
    limit: Joi.number().integer().min(1).max(200).default(50),
    offset: Joi.number().integer().min(0).default(0),
  }),
};

/**
 * Validation for GET /v1/submission-reports/:id
 */
const getSubmissionById = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/compliance/:month
 */
const getComplianceReport = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/node/:nodeId
 */
const getSubmissionsByNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    perm_only: Joi.boolean(),
    limit: Joi.number().integer().min(1).max(500).default(100),
  }),
};

/**
 * Validation for GET /v1/submission-reports/stats
 */
const getSubmissionStats = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string().uuid(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
    year: Joi.number().integer().min(2020).max(2100),
  }),
};

/**
 * Validation for GET /v1/submission-reports/monthly/:month
 */
const getMonthlyReport = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/incomplete/:month
 */
const getIncompleteSubmissions = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-01$/)
      .required(),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for GET /v1/submission-reports/locked
 */
const getLockedSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().uuid().required(),
    month: Joi.string().pattern(/^\d{4}-\d{2}-01$/),
  }),
};

/**
 * Validation for PATCH /v1/submission-reports/:id
 */
const updateSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object()
    .keys({
      data: Joi.object(),
      meta: Joi.object(),
      status: Joi.string().valid(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'deleted',
        'archived'
      ),
      event_date: Joi.date().iso(),
    })
    .min(1),
};

/**
 * Validation for PATCH /v1/submission-reports/:id/status
 */
const updateSubmissionStatus = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid(
        'pending',
        'in_progress',
        'completed',
        'failed',
        'deleted',
        'archived'
      )
      .required(),
  }),
};

/**
 * Validation for POST /v1/submission-reports/:id/lock
 */
const lockSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500),
  }),
};

/**
 * Validation for POST /v1/submission-reports/:id/unlock
 */
const unlockSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500),
  }),
};

/**
 * Validation for DELETE /v1/submission-reports/:id
 */
const deleteSubmission = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for POST /v1/submission-reports/bulk-delete
 */
const bulkDeleteSubmissions = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
    hard: Joi.boolean().default(false),
  }),
};

module.exports = {
  getSubmissions,
  getSubmissionById,
  getComplianceReport,
  getSubmissionsByNode,
  getSubmissionStats,
  getMonthlyReport,
  getIncompleteSubmissions,
  getLockedSubmissions,
  updateSubmission,
  updateSubmissionStatus,
  lockSubmission,
  unlockSubmission,
  deleteSubmission,
  bulkDeleteSubmissions,
};
