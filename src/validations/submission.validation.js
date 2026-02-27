const Joi = require('joi');
const { objectId } = require('./custom.validation');

const submitData = {
  body: Joi.object().keys({
    tenantId: Joi.string().required().description('Tenant identifier'),
    projectId: Joi.string().required().description('Project identifier'),
    formId: Joi.string().required().description('Form identifier'),
    nodeId: Joi.string().optional().allow('').description('Node identifier'),
    node_id: Joi.string().optional().allow('').description('Node identifier (snake_case alias)'),
    userId: Joi.string().optional().description('User identifier'),
    source: Joi.string()
      .valid(
        'mobile',
        'api',
        'email',
        'telegram',
        'whatsapp',
        'iot',
        'web',
        'saby-simulator',
        'unknown'
      )
      .default('unknown')
      .description('Origin of data'),
    payload: Joi.object()
      .required()
      .unknown(true)
      .description('Submitted data (form fields, etc.)'),
    meta: Joi.object().optional().description('Additional metadata'),
    status: Joi.string().optional().description('Submission status'),
    idempotency_key: Joi.string()
      .max(255)
      .optional()
      .description('Client-provided idempotency key'),
    project_name: Joi.string().max(128).allow('').optional(),
    project_category: Joi.string().max(64).allow('').optional(),
    // Submitter Blueprint (Required for all submissions)
    user_name: Joi.string().max(255).optional().description('User full name'),
    user_email: Joi.string()
      .email()
      .max(255)
      .allow('')
      .optional()
      .description('User email'),
    user_phone: Joi.string()
      .max(50)
      .optional()
      .description('User phone number'),
    node_name: Joi.string().max(255).optional().description('Node name'),
    node_reference: Joi.string()
      .max(100)
      .optional()
      .description('Node reference code'),
    form_reference: Joi.string()
      .max(100)
      .optional()
      .description('Form reference code'),
    // PERM-specific fields
    month: Joi.string()
      .optional()
      .pattern(/^\d{4}-\d{2}(-\d{2})?$/)
      .description('Month for PERM submissions (YYYY-MM or YYYY-MM-DD)'),
    year: Joi.number()
      .integer()
      .min(2000)
      .max(2100)
      .optional()
      .description('Year for PERM submissions'),
    perm_enabled: Joi.boolean()
      .optional()
      .description('Flag to indicate PERM submission'),
    // Per-date tracking (daily / weekly modes)
    // The specific calendar date this submission is FOR, e.g. "2026-02-09".
    // Validated by calendarEnforcement at processing time.
    event_date: Joi.string()
      .optional()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .description('Specific event date for daily/weekly tracked modules (YYYY-MM-DD)'),
    // Alias accepted from the frontend (same value as event_date).
    // The backend ignores it after storing; the generated column takes precedence.
    submission_date: Joi.string()
      .optional()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .description('Date the submission is recorded for (YYYY-MM-DD)'),
    // Audit fields
    submitted_by: Joi.string()
      .optional()
      .description('User ID who submitted the form'),
    submitted_at: Joi.date()
      .optional()
      .description('Timestamp when form was submitted'),
  }),
};

const getSubmissionById = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
};

const deleteSubmission = {
  params: Joi.object().keys({
    form_id: Joi.string().required(),
  }),
};

const retrySubmission = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
};

const listSubmissions = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string(),
    form_id: Joi.string(),
    node_id: Joi.string(),
    nodeId: Joi.string(),
    user_id: Joi.string(),
    status: Joi.string(),
    source: Joi.string(),
    idempotency_key: Joi.string(),
    project_name: Joi.string().max(128).allow('').optional(),
    project_category: Joi.string().max(64).allow('').optional(),
  }),
};

const updateSubmission = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      data: Joi.object()
        .optional()
        .description('Updated submission data/payload'),
      payload: Joi.object()
        .optional()
        .description('Updated submission data/payload'),
      status: Joi.string().optional().description('Updated status'),
      meta: Joi.object().optional().description('Updated metadata'),
      // Admin override for locked submissions (requires admin/sabyUser role)
      force: Joi.boolean().optional().description('Force-update a locked submission (admin only)'),
    })
    .min(1),
};

const deleteSubmissionById = {
  params: Joi.object().keys({
    id: Joi.string().required(),
  }),
};

const cleanupTestData = {
  body: Joi.object().keys({
    tenantId: Joi.string().required().description('Tenant ID to filter cleanup'),
    source: Joi.string()
      .required()
      .pattern(/^(test-|saby-simulator)/)
      .messages({
        'string.pattern.base':
          'Source must start with test- or saby-simulator for safety',
      })
      .description('Source identifier for test data'),
    projectId: Joi.string().optional().description('Optional project filter'),
    deleteFormData: Joi.boolean().default(true),
    deleteCalendar: Joi.boolean().default(false),
    deleteForm: Joi.boolean().default(false),
  }),
};

module.exports = {
  submitData,
  getSubmissionById,
  deleteSubmission,
  retrySubmission,
  listSubmissions,
  updateSubmission,
  deleteSubmissionById,
  cleanupTestData,
};
