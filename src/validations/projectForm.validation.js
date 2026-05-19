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
  semantic: Joi.object({
    role: Joi.string()
      .valid('measure', 'dimension', 'status', 'label', 'ignore')
      .optional(),
    valueType: Joi.string()
      .valid(
        'number',
        'currency',
        'percent',
        'boolean',
        'text',
        'enum',
        'date',
        'datetime',
        'time',
        'unknown'
      )
      .optional(),
    aggregationAllowed: Joi.array()
      .items(
        Joi.string().valid(
          'sum',
          'avg',
          'min',
          'max',
          'count',
          'count_distinct',
          'ratio',
          'trend'
        )
      )
      .optional(),
  }).optional(),
}).unknown(true);

const projectAnalysisProfileSchema = Joi.object({
  dataNature: Joi.string()
    .valid('qualitative', 'quantitative', 'hybrid')
    .default('qualitative'),
  domain: Joi.string()
    .valid('finance', 'attendance', 'hr', 'operations', 'custom')
    .default('custom'),
  primaryTimeField: Joi.string().allow('', null).default('event_date'),
  defaultMeasureFieldKeys: Joi.array().items(Joi.string()).default([]),
  defaultDimensionFieldKeys: Joi.array().items(Joi.string()).default([]),
  currency: Joi.string().allow('', null).default(null),
  scoreStrategy: Joi.string()
    .valid('rule_based', 'trend_based', 'custom')
    .default('rule_based'),
  inferredAt: Joi.date().optional(),
  fieldStats: Joi.object({
    totalFields: Joi.number().integer().min(0).default(0),
    numericFields: Joi.number().integer().min(0).default(0),
    categoricalFields: Joi.number().integer().min(0).default(0),
    dateFields: Joi.number().integer().min(0).default(0),
    textFields: Joi.number().integer().min(0).default(0),
  }).optional(),
}).optional();

const projectConfigurationSchema = Joi.object({
  projectName: Joi.string().required().trim().min(1).max(100),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  analysisProfile: projectAnalysisProfileSchema,
  publicSecureMode: Joi.string()
    .valid('off', 'single_qr_passwordless')
    .default('off'),
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
  schemaVersion: Joi.string().default('1.1.0'),
  enabledCapabilities: Joi.array().items(Joi.string()).default([]),
  formCategory: Joi.string().valid('standard', 'system').default('standard'),
  systemTarget: Joi.string()
    .valid('user_profile', 'node_profile')
    .allow(null)
    .optional(),
  systemVersion: Joi.string().allow('', null).optional(),
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

const capabilitiesSchema = Joi.object({
  experience: Joi.object({
    security: Joi.object({
      enabled: Joi.boolean().default(false),
      mode: Joi.string().valid('public', 'private').default('public'),
      authRequired: Joi.boolean().default(false),
      allowedRoles: Joi.array().items(Joi.string()).default([]),
      allowedUsers: Joi.array().items(Joi.string()).default([]),
      restrictByLocation: Joi.boolean().default(false),
      allowedCountries: Joi.array().items(Joi.string()).default([]),
      requireNodeAccess: Joi.boolean().default(false),
    }).default({}),
    compliance: Joi.object({
      enabled: Joi.boolean().default(false),
      trackingMode: Joi.string().valid('none', 'daily', 'weekly').default('none'),
      frequency: Joi.string()
        .valid('none', 'daily', 'weekly', 'biweekly', 'monthly')
        .default('none'),
      requireNodeId: Joi.boolean().default(true),
      requireMonth: Joi.boolean().default(true),
      trackCompliance: Joi.boolean().default(false),
      autoGenerateCalendar: Joi.boolean().default(false),
      autoLockMonthEnd: Joi.boolean().default(false),
      calendarRequired: Joi.boolean().default(false),
    }).default({}),
    workflow: Joi.object({
      enabled: Joi.boolean().default(false),
      approvalMode: Joi.string().default('none'),
      triggerOn: Joi.string().default('submission'),
      steps: Joi.array().items(Joi.object().unknown(true)).default([]),
    }).default({}),
  }).default({}),
  transaction: Joi.object({
    payment: Joi.object({
      enabled: Joi.boolean().default(false),
      mode: Joi.string().default('none'),
      enabledChannels: Joi.array().items(Joi.string()).default([]),
      defaultChannel: Joi.string().allow(null).default(null),
      settlementType: Joi.string().default('none'),
      receivingAccount: Joi.any().allow(null).default(null),
      channelConfigs: Joi.object().unknown(true).default({}),
    }).default({}),
    remittance: Joi.object({
      enabled: Joi.boolean().default(false),
      accountSource: Joi.string().default('none'),
      requireNodeAccount: Joi.boolean().default(false),
      nodeAccountField: Joi.string().allow(null).default(null),
      settlementRule: Joi.any().allow(null).default(null),
    }).default({}),
    invoice: Joi.object({
      enabled: Joi.boolean().default(false),
      calculationMode: Joi.string().default('none'),
      currency: Joi.string().allow(null).default(null),
      lineItemsEnabled: Joi.boolean().default(false),
      discountsEnabled: Joi.boolean().default(false),
      taxEnabled: Joi.boolean().default(false),
      rules: Joi.array().items(Joi.object().unknown(true)).default([]),
    }).default({}),
  }).default({}),
}).default({});

const smartMappingsSchema = Joi.object({
  enabled: Joi.boolean().default(true),
  autoDetect: Joi.boolean().default(true),
  allowManualOverride: Joi.boolean().default(true),
  fields: Joi.object({
    phone: Joi.string().allow('', null).optional(),
    email: Joi.string().allow('', null).optional(),
    fullName: Joi.string().allow('', null).optional(),
    dob: Joi.string().allow('', null).optional(),
    joinDate: Joi.string().allow('', null).optional(),
    eventDate: Joi.string().allow('', null).optional(),
  }).default({}),
}).default({});

const enforceSystemFormContract = (value, helpers) => {
  const category = value?.metadata?.formCategory;
  if (category !== 'system') {
    return value;
  }

  const target = value?.metadata?.systemTarget;
  if (!target) {
    return helpers.error('any.custom', {
      message: 'metadata.systemTarget is required when metadata.formCategory is system',
    });
  }

  if (value?.configuration?.security && value.configuration.security !== 'private') {
    return helpers.error('any.custom', {
      message: 'System forms must set configuration.security to private',
    });
  }

  return value;
};

const validateSmartMappingsAgainstElements = (value, helpers) => {
  const elements = Array.isArray(value?.elements) ? value.elements : [];
  const validIds = new Set(
    elements
      .map((element) => String(element?.id || '').trim())
      .filter(Boolean)
  );
  const mappingFields = value?.smartMappings?.fields || {};

  Object.entries(mappingFields).forEach(([mappingKey, mappedFieldId]) => {
    const id = String(mappedFieldId || '').trim();
    if (!id) return;
    if (!validIds.has(id)) {
      delete mappingFields[mappingKey];
    }
  });

  return value;
};

const paymentConfigSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  enabledChannels: Joi.array().items(Joi.string()).default([]),
  defaultChannel: Joi.string().allow('', null),
  channelConfigs: Joi.object().unknown(true).default({}),
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
  triggerOn: Joi.string()
    .valid('submission', 'submit', 'update', 'manual')
    .default('submission'),
  steps: Joi.array()
    .items(workflowStepSchema)
    .when('enabled', {
      is: true,
      then: Joi.array().items(workflowStepSchema).min(1).required(),
      otherwise: Joi.array().items(workflowStepSchema).default([]),
    }),
  metadata: Joi.object().unknown(true).optional(),
  description: Joi.string().allow('', null).optional(),
}).unknown(true);

// Validation schemas
const createProjectForm = {
  body: Joi.object()
    .keys({
      workspaceId: Joi.string().trim().optional(),
      configuration: projectConfigurationSchema.required(),
      elements: Joi.array().items(formElementSchema).default([]),
      style: Joi.string().default('default'),
      wizardMode: Joi.boolean().default(false),
      columnSpans: Joi.object().default({}),
      userSettings: userSettingsSchema,
      permSettings: permSettingsSchema,
      paymentConfig: paymentConfigSchema,
      capabilities: capabilitiesSchema,
      smartMappings: smartMappingsSchema,
      calendar: Joi.object().unknown(true).optional(),
      behaviorHooks: Joi.object().unknown(true).optional(),
      metadata: metadataSchema,
      workflows: Joi.array().items(workflowSchema).default([]),
    })
    .custom(enforceSystemFormContract, 'system form contract')
    .custom(validateSmartMappingsAgainstElements, 'smart mapping validation'),
};

const getProjectForms = {
  query: Joi.object().keys({
    workspaceId: Joi.string().trim(),
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'configuration.projectName': Joi.string(),
    'configuration.tags': Joi.string(),
    'configuration.security': Joi.string().valid('public', 'private'),
    'metadata.formCategory': Joi.string().valid('standard', 'system'),
    'metadata.systemTarget': Joi.string().valid('user_profile', 'node_profile'),
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
    workspaceId: Joi.string().trim(),
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'configuration.projectName': Joi.string(),
    'configuration.tags': Joi.string(),
    'metadata.formCategory': Joi.string().valid('standard', 'system'),
    'metadata.systemTarget': Joi.string().valid('user_profile', 'node_profile'),
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
    workspaceId: Joi.string().trim(),
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'configuration.projectName': Joi.string(),
    'configuration.tags': Joi.string(),
    'metadata.formCategory': Joi.string().valid('standard', 'system'),
    'metadata.systemTarget': Joi.string().valid('user_profile', 'node_profile'),
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

const getProjectFormByPublicRef = {
  params: Joi.object().keys({
    publicRef: Joi.string().required(),
  }),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const getPublicProjectFormByReference = {
  params: Joi.object().keys({
    reference: Joi.string().required(),
  }),
  query: Joi.object().keys({
    accessToken: Joi.string().optional(),
  }),
};

const getPublicProjectFormByShortCode = {
  params: Joi.object().keys({
    shortCode: Joi.string().alphanum().min(4).max(16).required(),
  }),
  query: Joi.object().keys({
    accessToken: Joi.string().optional(),
  }),
};

const requestPublicAccessLink = {
  body: Joi.object().keys({
    reference: Joi.string().required(),
    identifier: Joi.string().required(),
    qrContextToken: Joi.string().optional(),
  }),
};

const requestPublicAccessCode = {
  body: Joi.object().keys({
    reference: Joi.string().required(),
    channel: Joi.string().valid('email', 'phone').required(),
    identifier: Joi.string().required(),
    qrContextToken: Joi.string().optional(),
  }),
};

const verifyPublicAccessCode = {
  body: Joi.object().keys({
    challengeId: Joi.string().required(),
    otp: Joi.string().pattern(/^\d{6}$/).required(),
  }),
};

const resendPublicAccessCode = {
  body: Joi.object().keys({
    challengeId: Joi.string().required(),
  }),
};

const consumePublicAccessLink = {
  query: Joi.object().keys({
    accessToken: Joi.string().required(),
  }),
};

const getPublicAccessPrefill = {
  query: Joi.object().keys({
    accessToken: Joi.string().required(),
    nodeId: Joi.string().optional().allow('', null),
  }),
};

const submitPublicAccessForm = {
  body: Joi.object().keys({
    accessToken: Joi.string().required(),
    nodeId: Joi.string().optional().allow('', null),
    source: Joi.string().optional(),
    submissionData: Joi.alternatives()
      .try(Joi.object().unknown(true), Joi.array().items(Joi.any()))
      .required(),
    submittedAt: Joi.string().isoDate().optional(),
    metadata: Joi.object().unknown(true).optional(),
  }),
};

const updateProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      workspaceId: Joi.string().trim(),
      configuration: projectConfigurationSchema,
      elements: Joi.array().items(formElementSchema),
      style: Joi.string(),
      wizardMode: Joi.boolean(),
      columnSpans: Joi.object(),
      userSettings: userSettingsSchema,
      permSettings: permSettingsSchema,
      paymentConfig: paymentConfigSchema,
      capabilities: capabilitiesSchema,
      smartMappings: smartMappingsSchema,
      calendar: Joi.object().unknown(true).optional(),
      behaviorHooks: Joi.object().unknown(true).optional(),
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
      workflows: Joi.array().items(workflowSchema).default([]),
    })
    .custom(enforceSystemFormContract, 'system form contract')
    .custom(validateSmartMappingsAgainstElements, 'smart mapping validation')
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
      workspaceId: Joi.string().trim(),
      configuration: projectConfigurationSchema,
      elements: Joi.array().items(formElementSchema),
      style: Joi.string(),
      wizardMode: Joi.boolean(),
      columnSpans: Joi.object(),
      userSettings: userSettingsSchema,
      permSettings: permSettingsSchema,
      paymentConfig: paymentConfigSchema,
      capabilities: capabilitiesSchema,
      smartMappings: smartMappingsSchema,
      calendar: Joi.object().unknown(true).optional(),
      behaviorHooks: Joi.object().unknown(true).optional(),
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
      workflows: Joi.array().items(workflowSchema).default([]),
    })
    .custom(enforceSystemFormContract, 'system form contract')
    .custom(validateSmartMappingsAgainstElements, 'smart mapping validation')
    .min(1),
  query: Joi.object().keys({
    populate: Joi.string(),
  }),
};

const bootstrapSystemForms = {
  body: Joi.object().keys({
    targets: Joi.array()
      .items(Joi.string().valid('user_profile', 'node_profile'))
      .optional(),
    force: Joi.boolean().default(false),
  }),
};

const getSystemProjectForm = {
  params: Joi.object().keys({
    target: Joi.string().valid('user_profile', 'node_profile').required(),
  }),
};

const submitSystemForm = {
  params: Joi.object().keys({
    publicRef: Joi.string().required(),
  }),
  body: Joi.object().keys({
    targetId: Joi.string().optional(),
    submissionData: Joi.object().unknown(true).required(),
  }),
};

const listProjectWorkspaces = {
  query: Joi.object().keys({}),
};

const createProjectWorkspace = {
  body: Joi.object().keys({
    name: Joi.string().trim().min(2).max(120).required(),
    visibility: Joi.string().valid('private', 'public').default('private'),
  }),
};

const renameProjectWorkspace = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
  }),
  body: Joi.object().keys({
    name: Joi.string().trim().min(2).max(120).required(),
    visibility: Joi.string().valid('private', 'public').optional(),
  }),
};

const addProjectWorkspaceMember = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
  }),
  body: Joi.object()
    .keys({
      userId: Joi.string().custom(objectId).optional(),
      email: Joi.string().email().optional(),
      role: Joi.string().valid('owner', 'editor', 'viewer').required(),
    })
    .or('userId', 'email'),
};

const removeProjectWorkspaceMember = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
    userId: Joi.string().custom(objectId).required(),
  }),
};

const leaveProjectWorkspace = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
  }),
};

const deleteProjectWorkspace = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
  }),
};

const duplicateProjectForm = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    name: Joi.string().trim().max(120).optional(),
    workspaceId: Joi.string().trim().optional(),
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

const unpublishProjectForm = {
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

const getProjectPublicAccessMetrics = {
  params: Joi.object().keys({
    projectId: Joi.string().required(),
  }),
  query: Joi.object().keys({
    windowHours: Joi.number().integer().min(1).max(168).optional(),
  }),
};

const getProjectSchemaProfile = {
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
    workspaceId: Joi.string().trim().optional(),
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
  getProjectFormByPublicRef,
  getPublicProjectFormByReference,
  getPublicProjectFormByShortCode,
  requestPublicAccessLink,
  requestPublicAccessCode,
  verifyPublicAccessCode,
  resendPublicAccessCode,
  consumePublicAccessLink,
  getPublicAccessPrefill,
  submitPublicAccessForm,
  bootstrapSystemForms,
  getSystemProjectForm,
  submitSystemForm,
  listProjectWorkspaces,
  createProjectWorkspace,
  renameProjectWorkspace,
  addProjectWorkspaceMember,
  removeProjectWorkspaceMember,
  leaveProjectWorkspace,
  deleteProjectWorkspace,
  updateProjectForm,
  updateProjectFormByProjectId,
  duplicateProjectForm,
  deleteProjectForm,
  softDeleteProjectForm,
  restoreProjectForm,
  publishProjectForm,
  unpublishProjectForm,
  archiveProjectForm,
  getProjectAnalytics,
  getProjectPublicAccessMetrics,
  getProjectSchemaProfile,
  incrementSubmissions,
  bulkOperations,
  searchProjectForms,
};
