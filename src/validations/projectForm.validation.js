const Joi = require('joi');
const { objectId } = require('./custom.validation');

// Common schemas for reusability
const formElementSchema = Joi.object({
  _id: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
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
      .default('center'),
    textAlign: Joi.string()
      .valid('left', 'center', 'right', 'justify')
      .default('left'),
    acceptedTypes: Joi.string().default('.jpg,.png,.pdf'),
    defaultValue: Joi.any(),
    defaultCountry: Joi.string().allow(''),
    buttonText: Joi.string().allow(''), // NEW: Submit button text
    buttonType: Joi.string().allow(''), // NEW: Submit button type
  }).unknown(true),
  metadata: Joi.object().unknown(true).optional(),
  aliases: Joi.array().items(Joi.string()).optional(),
}).unknown(true);

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

const metadataIntegrationsSchema = Joi.alternatives()
  .try(
    Joi.array().items(
      Joi.string().valid(
        'web',
        'whatsapp',
        'telegram',
        'mobile',
        'email',
        'api'
      )
    ),
    Joi.object().unknown(true)
  )
  .default(['web']);

const metadataSchema = Joi.object({
  version: Joi.string().default('1.0.0'),
  elementsCount: Joi.number().default(0),
  hasValidation: Joi.boolean().default(false),
  lastModified: Joi.date().default(Date.now),
  deploymentStatus: Joi.string()
    .valid('draft', 'published', 'archived')
    .default('draft'),
  batchMode: Joi.string()
    .valid('single_prompt', 'multi_step')
    .default('multi_step'),
  integrations: metadataIntegrationsSchema,
  permEnabled: Joi.boolean().optional(),
}).unknown(true);

// PERM Settings Schema
const permSettingsSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  trackingMode: Joi.string().valid('none', 'daily', 'weekly').default('none'),
  dailyConfig: Joi.object({
    activeDays: Joi.array().items(Joi.number().min(0).max(6)).default([]),
    frequencyPerDay: Joi.number().integer().min(1).max(10).default(1),
    skipWeekends: Joi.boolean().default(false),
    skipHolidays: Joi.boolean().default(false),
  }).default({}),
  weeklyConfig: Joi.object({
    days: Joi.array()
      .items(
        Joi.object({
          day: Joi.number().min(0).max(6).required(),
          name: Joi.string().required(),
          frequency: Joi.string()
            .valid('weekly', 'biweekly', 'monthly')
            .required(),
          occurrences: Joi.number().integer().min(1).max(10),
          enabled: Joi.boolean().default(true),
        })
      )
      .default([]),
  }).default({}),
  requireNodeId: Joi.boolean().default(true),
  requireMonth: Joi.boolean().default(true),
  trackCompliance: Joi.boolean().default(true),
  autoGenerateCalendar: Joi.boolean().default(true),
  autoLockMonthEnd: Joi.boolean().default(false),
  calendarRequired: Joi.boolean().default(false),
  eventTypes: Joi.array().items(Joi.string()).default([]),
  // Calendar Generation options for backdating
  calendarGeneration: Joi.object({
    startDate: Joi.string().isoDate().optional(),
    endDate: Joi.string().isoDate().optional(),
    allowBackdating: Joi.boolean().default(false),
    monthsToGenerate: Joi.number().integer().min(1).max(36).optional(),
  }).optional(),
}).default({
  enabled: false,
  trackingMode: 'none',
  requireNodeId: true,
  requireMonth: true,
  trackCompliance: true,
  autoGenerateCalendar: true,
  autoLockMonthEnd: false,
});

// ── Workflow Schemas ─────────────────────────────────────────────────────────
// Mirrors ProjectForm.workflows[] in the Mongoose model.

const workflowStepSchema = Joi.object({
  id: Joi.string().optional(),
  name: Joi.string().required().trim().min(1).max(100),
  stepOrder: Joi.number().integer().min(0).default(0),
  actionType: Joi.string()
    .valid('SUBMIT', 'REVIEW', 'APPROVE', 'REJECT', 'ESCALATE', 'NOTIFY')
    .required(),
  // Multi-role assignment (preferred)
  assigneeRoles: Joi.array().items(Joi.string()).default([]),
  // Legacy single-role (kept for backward compat)
  assigneeRole: Joi.string().allow('', null).optional(),
  assigneeType: Joi.string().valid('role', 'user', 'dynamic_field').default('role'),
  assigneeUsers: Joi.array().items(Joi.string()).default([]),
  sla: Joi.object({
    hours: Joi.number().integer().min(1).default(48),
    escalateTo: Joi.string().allow('', null).optional(),
  }).optional(),
  type: Joi.string().optional(),
  description: Joi.string().allow('', null).optional(),
}).unknown(true);

const workflowSchema = Joi.object({
  id: Joi.string().optional(),
  name: Joi.string().required().trim().min(1).max(100),
  enabled: Joi.boolean().default(true),
  type: Joi.string().valid('approval', 'review', 'notification', 'custom').default('approval'),
  triggerOn: Joi.string().valid('submit', 'update', 'manual').default('submit'),
  steps: Joi.array().items(workflowStepSchema).min(1).required(),
  metadata: Joi.object().unknown(true).optional(),
  description: Joi.string().allow('', null).optional(),
}).unknown(true);

// Validation schemas
const createProjectForm = {
  body: Joi.object().keys({
    configuration: projectConfigurationSchema.required(),
    elements: Joi.array().items(formElementSchema).default([]),
    style: Joi.string().default('default'),
    wizardMode: Joi.boolean().default(false),
    columnSpans: Joi.object().default({}),
    userSettings: userSettingsSchema,
    permSettings: permSettingsSchema,
    metadata: metadataSchema,
    workflows: Joi.array().items(workflowSchema).default([]),
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
      permSettings: permSettingsSchema,
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
      workflows: Joi.array().items(workflowSchema).default([]),
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
      permSettings: permSettingsSchema,
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
      workflows: Joi.array().items(workflowSchema).default([]),
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
  body: Joi.object()
    .keys({
      calendarGeneration: Joi.object({
        startDate: Joi.string().isoDate().optional(),
        endDate: Joi.string().isoDate().optional(),
        allowBackdating: Joi.boolean().default(false),
        monthsToGenerate: Joi.number().integer().min(1).max(36).optional(),
      }).optional(),
    })
    .optional(),
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
