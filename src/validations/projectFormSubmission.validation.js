const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSubmission = {
  body: Joi.object().keys({
    projectId: Joi.string().required(),
    source: Joi.string().optional(),
    submissionData: Joi.object().required(),
    submittedAt: Joi.date().iso(),
    metadata: Joi.object().keys({
      submissionId: Joi.string(),
      source: Joi.string(),
      userAgent: Joi.string(),
      ipAddress: Joi.string(),
      referrer: Joi.string(),
      timestamp: Joi.number(),
      deviceInfo: Joi.object(),
      geolocation: Joi.object(),
    }),
  }),
};

const createSubmissionByReference = {
  params: Joi.object().keys({
    reference: Joi.string().required(),
  }),
  body: Joi.object().keys({
    source: Joi.string().optional(),
    submissionData: Joi.object().required(),
    submittedAt: Joi.date().iso(),
    metadata: Joi.object().keys({
      submissionId: Joi.string(),
      source: Joi.string(),
      userAgent: Joi.string(),
      ipAddress: Joi.string(),
      referrer: Joi.string(),
      timestamp: Joi.number(),
      deviceInfo: Joi.object(),
      geolocation: Joi.object(),
    }),
  }),
  query: Joi.object().keys({
    accessToken: Joi.string().optional(),
  }),
};

const getSubmissions = {
  query: Joi.object().keys({
    projectId: Joi.string(),
    status: Joi.string().valid(
      'submitted',
      'processing',
      'completed',
      'failed',
      'archived'
    ),
    submittedBy: Joi.string().custom(objectId),
    submittedAt: Joi.date().iso(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

const getSubmissionsByProject = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid(
      'submitted',
      'processing',
      'completed',
      'failed',
      'archived'
    ),
    submittedBy: Joi.string().custom(objectId),
    submittedAt: Joi.date().iso(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

const getSubmissionsByTenant = {
  params: Joi.object().keys({
    tenantId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    projectId: Joi.string(),
    status: Joi.string().valid(
      'submitted',
      'processing',
      'completed',
      'failed',
      'archived'
    ),
    submittedBy: Joi.string().custom(objectId),
    submittedAt: Joi.date().iso(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

const getSubmission = {
  params: Joi.object().keys({
    submissionId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const updateSubmissionStatus = {
  params: Joi.object().keys({
    submissionId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid('submitted', 'processing', 'completed', 'failed', 'archived')
      .required(),
    notes: Joi.string().allow(''),
  }),
};

const updateSubmission = {
  params: Joi.object().keys({
    submissionId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      submissionData: Joi.object(),
      status: Joi.string().valid(
        'submitted',
        'processing',
        'completed',
        'failed',
        'archived'
      ),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteSubmission = {
  params: Joi.object().keys({
    submissionId: Joi.string().custom(objectId).required(),
  }),
};

const getSubmissionStats = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
};

const exportSubmissions = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    format: Joi.string().valid('csv', 'excel', 'json', 'pdf').default('csv'),
  }),
};

module.exports = {
  createSubmission,
  createSubmissionByReference,
  getSubmissions,
  getSubmissionsByProject,
  getSubmissionsByTenant,
  getSubmission,
  updateSubmissionStatus,
  updateSubmission,
  deleteSubmission,
  getSubmissionStats,
  exportSubmissions,
};
