const Joi = require('joi');
const { objectId } = require('./custom.validation');

// Common schemas for reusability
const formElementSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().required(),
  properties: Joi.object({
    formula: Joi.string().allow(''),
    numberType: Joi.string().allow(''),
    label: Joi.string().allow(''),
    placeholder: Joi.string().allow(''),
    required: Joi.boolean().default(false),
    validation: Joi.object().allow({}),
    options: Joi.array().items(Joi.string()),
    multiple: Joi.boolean().default(false),
    accept: Joi.string(),
    ratingType: Joi.string(),
    maxRating: Joi.number().allow(null, 0),
    placeholder: Joi.string().allow(''),
    helpText: Joi.string().allow(''),
    min: Joi.number().allow(null),
    max: Joi.number().allow(null),
    step: Joi.number().allow(null),
    paragraphAlignment: Joi.string()
      .valid('left', 'center', 'right')
      .default('left'),
    conditional: Joi.boolean().default(false),
    colSpan: Joi.number().integer().min(1).max(12).default(12),
    headerLevel: Joi.string().allow(''),
    headerAlignment: Joi.string()
      .valid('left', 'center', 'right')
      .default('centre'),
    textAlign: Joi.string()
      .valid('left', 'center', 'right', 'justify')
      .default('left'),
    acceptedTypes: Joi.string().default('.jpg,.png,.pdf'),
    defaultValue: Joi.any(),
    defaultCountry: Joi.string().allow(''),
  }),
});

const projectConfigurationSchema = Joi.object({
  projectName: Joi.string().required().trim().min(1).max(100),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  accessibility: Joi.array()
    .items(Joi.string().valid('api', 'embedded', 'javascript', 'mobile'))
    .default([]),
  security: Joi.string().valid('public', 'private').default('private'),
});

const userSettingsSchema = Joi.object({
  access: Joi.object({
    allowedRoles: Joi.array().items(Joi.string()).default([]),
    allowedUsers: Joi.array().items(Joi.string()).default([]),
    restrictByLocation: Joi.boolean().default(false),
    allowedCountries: Joi.array().items(Joi.string()).default([]),
  }).default({}),
  behavior: Joi.object({
    allowMultipleSubmissions: Joi.boolean().default(true),
    enableProgressSave: Joi.boolean().default(true),
    autoSave: Joi.boolean().default(false),
    submitOnComplete: Joi.boolean().default(true),
  }).default({}),
  distribution: Joi.object({
    enableSharing: Joi.boolean().default(true),
    allowEmbedding: Joi.boolean().default(false),
    generateQR: Joi.boolean().default(false),
    enableDeepLinking: Joi.boolean().default(false),
  }).default({}),
  notifications: Joi.object({
    emailOnSubmission: Joi.boolean().default(false),
    notifyOwner: Joi.boolean().default(true),
    customEmails: Joi.array().items(Joi.string().email()).default([]),
    smsNotifications: Joi.boolean().default(false),
  }).default({}),
  ui: Joi.object({
    theme: Joi.string().default('default'),
    primaryColor: Joi.string().default('#3b82f6'),
    layout: Joi.string().valid('single', 'multi-step').default('single'),
    showProgressBar: Joi.boolean().default(true),
  }).default({}),
  builder: Joi.object({
    gridSize: Joi.number().default(12),
    snapToGrid: Joi.boolean().default(true),
    showGridLines: Joi.boolean().default(false),
    autoArrange: Joi.boolean().default(false),
  }).default({}),
}).default({});

const metadataSchema = Joi.object({
  version: Joi.string().default('1.0.0'),
  elementsCount: Joi.number().default(0),
  hasValidation: Joi.boolean().default(false),
  lastModified: Joi.date().default(Date.now),
  deploymentStatus: Joi.string()
    .valid('draft', 'published', 'archived')
    .default('draft'),
});

// Validation schemas
const createProjectForm = {
  body: Joi.object().keys({
    configuration: projectConfigurationSchema.required(),
    elements: Joi.array().items(formElementSchema).default([]),
    style: Joi.string().default('default'),
    wizardMode: Joi.boolean().default(false),
    columnSpans: Joi.object().default({}),
    userSettings: userSettingsSchema,
    metadata: metadataSchema,
  }),
};

const getProjectForms = {
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'configuration.projectName': Joi.string(),
    'configuration.tags': Joi.string(),
    'configuration.security': Joi.string().valid('public', 'private'),
    'metadata.deploymentStatus': Joi.string().valid(
      'draft',
      'published',
      'archived'
    ),
    tenantId: Joi.string(),
    q: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

const getProjectFormsByTenant = {
  params: Joi.object().keys({
    tenantId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'configuration.projectName': Joi.string(),
    'configuration.tags': Joi.string(),
    'metadata.deploymentStatus': Joi.string().valid(
      'draft',
      'published',
      'archived'
    ),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

const getProjectFormsByUser = {
  params: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'configuration.projectName': Joi.string(),
    'configuration.tags': Joi.string(),
    'metadata.deploymentStatus': Joi.string().valid(
      'draft',
      'published',
      'archived'
    ),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

const getProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const getProjectFormByProjectId = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const updateProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      configuration: projectConfigurationSchema,
      elements: Joi.array().items(formElementSchema),
      style: Joi.string(),
      wizardMode: Joi.boolean(),
      columnSpans: Joi.object(),
      userSettings: userSettingsSchema,
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
    })
    .min(1),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const updateProjectFormByProjectId = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      configuration: projectConfigurationSchema,
      elements: Joi.array().items(formElementSchema),
      style: Joi.string(),
      wizardMode: Joi.boolean(),
      columnSpans: Joi.object(),
      userSettings: userSettingsSchema,
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
    })
    .min(1),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const deleteProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
};

const softDeleteProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
};

const restoreProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
};

const publishProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
};

const archiveProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
};

const getProjectAnalytics = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
};

const incrementSubmissions = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
};

const bulkOperations = {
  body: Joi.object().keys({
    operations: Joi.array()
      .items(
        Joi.object().keys({
          type: Joi.string()
            .valid('delete', 'restore', 'publish', 'archive')
            .required(),
          projectFormId: Joi.string().custom(objectId).required(),
        })
      )
      .required()
      .min(1),
  }),
};

const searchProjectForms = {
  query: Joi.object().keys({
    q: Joi.string().required().min(1),
    sortBy: Joi.string(),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    populate: Joi.string(),
  }),
};

module.exports = {
  createProjectForm,
  getProjectForms,
  getProjectFormsByTenant,
  getProjectFormsByUser,
  getProjectForm,
  getProjectFormByProjectId,
  updateProjectForm,
  updateProjectFormByProjectId,
  deleteProjectForm,
  softDeleteProjectForm,
  restoreProjectForm,
  publishProjectForm,
  archiveProjectForm,
  getProjectAnalytics,
  incrementSubmissions,
  bulkOperations,
  searchProjectForms,
};
