const Joi = require('joi');
const { objectId } = require('./custom.validation');

const submitData = {
  body: Joi.object().keys({
    tenantId: Joi.string().required().description('Tenant identifier'),
    projectId: Joi.string().required().description('Project identifier'),
    formId: Joi.string().required().description('Form identifier'),
    nodeId: Joi.string().optional().description('Node identifier'),
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
        'unknown'
      )
      .default('unknown')
      .description('Origin of data'),
    payload: Joi.object()
      .required()
      .description('Submitted data (form fields, etc.)'),
    meta: Joi.object().optional().description('Additional metadata'),
    status: Joi.string().optional().description('Submission status'),
    project_name: Joi.string().max(128),
    project_category: Joi.string().max(64),
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
    user_id: Joi.string(),
    status: Joi.string(),
    source: Joi.string(),
    project_name: Joi.string().max(128),
    project_category: Joi.string().max(64),
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
    })
    .min(1), // At least one field must be provided
};

const deleteSubmissionById = {
  params: Joi.object().keys({
    id: Joi.string().required(),
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
};
