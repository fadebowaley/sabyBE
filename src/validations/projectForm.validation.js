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
    validation: Joi.any(),
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
    .valid('off', 'link_only', 'otp', 'access_code')
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
    allowEmbedding: Joi.boolean().default(true),
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

const invoiceConditionSchema = Joi.object({
  sourceType: Joi.string()
    .valid('field', 'submission_status', 'workflow_status')
    .default('field'),
  fieldId: Joi.string().allow('', null).default(null),
  statusKey: Joi.string().allow('', null).default(null),
  operator: Joi.string()
    .valid('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in')
    .default('eq'),
  value: Joi.alternatives()
    .try(Joi.string().allow(''), Joi.number(), Joi.boolean(), Joi.allow(null))
    .default(null),
}).unknown(true);

const invoiceLineItemSchema = Joi.object({
  id: Joi.string().optional(),
  label: Joi.string().allow('').default(''),
  sourceField: Joi.string().allow('', null).default(null),
  enabled: Joi.boolean().default(true),
  calculationType: Joi.string().valid('fixed', 'percentage', 'formula').default('fixed'),
  rate: Joi.number().min(0).default(0),
  fixedAmount: Joi.number().allow(null).default(null),
  quantityField: Joi.string().allow('', null).default(null),
  baseExpression: Joi.string().allow('', null).default(null),
  computedExpression: Joi.string().allow('', null).default(null),
  includeInSubtotal: Joi.boolean().default(true),
  conditions: Joi.array().items(invoiceConditionSchema).default([]),
  active: Joi.boolean().default(true),
}).unknown(true);

const invoiceChargeAdjustmentSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  mode: Joi.string().valid('none', 'fixed', 'percentage', 'formula').default('none'),
  value: Joi.number().default(0),
  expression: Joi.string().allow('', null).default(null),
  conditions: Joi.array().items(invoiceConditionSchema).default([]),
}).default({});

const invoiceConfigSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  calculationMode: Joi.string()
    .valid('none', 'fixed', 'line_items', 'rule_based')
    .default('none'),
  currency: Joi.string().allow('', null).default(null),
  baseAmount: Joi.number().min(0).default(0),
  amountSourceField: Joi.string().allow('', null).default(null),
  lineItemsEnabled: Joi.boolean().default(false),
  lineItems: Joi.array().items(invoiceLineItemSchema).default([]),
  discountsEnabled: Joi.boolean().default(false),
  taxEnabled: Joi.boolean().default(false),
  discounts: invoiceChargeAdjustmentSchema,
  tax: invoiceChargeAdjustmentSchema,
  totals: Joi.object({
    subtotalExpression: Joi.string().allow('', null).default(null),
    discountExpression: Joi.string().allow('', null).default(null),
    taxExpression: Joi.string().allow('', null).default(null),
    grandTotalExpression: Joi.string().allow('', null).default(null),
  }).default({}),
  invoiceNumbering: Joi.object({
    mode: Joi.string().default('auto'),
    prefix: Joi.string().allow('').default(''),
    nextNumber: Joi.number().integer().min(1).default(1),
  }).default({}),
  presentation: Joi.object({
    showPaymentInstructions: Joi.boolean().default(true),
    showRemittanceDetails: Joi.boolean().default(true),
    showDueDate: Joi.boolean().default(true),
    showSubtotal: Joi.boolean().default(true),
    showDiscount: Joi.boolean().default(true),
    showTax: Joi.boolean().default(true),
    showGrandTotal: Joi.boolean().default(true),
  }).default({}),
})
  .custom((value, helpers) => {
    if (value.calculationMode === 'fixed' && Number(value.baseAmount) < 0) {
      return helpers.error('any.custom', { message: 'baseAmount must be 0 or greater' });
    }
    if (
      ['line_items', 'rule_based'].includes(value.calculationMode) &&
      (!Array.isArray(value.lineItems) || value.lineItems.length === 0)
    ) {
      return helpers.error('any.custom', {
        message: 'lineItems are required when calculationMode is line_items or rule_based',
      });
    }
    return value;
  })
  .messages({
    'any.custom': '{{#message}}',
  })
  .default({});

const TRANSACTION_COLLECTION_STAGE_VALUES = [
  'submission',
  'pre_approval',
  'post_approval',
  'before_submit',
  'before_approval',
  'after_approval',
];

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
      availability: Joi.object({
        startDate: Joi.string().isoDate().allow(null, '').optional(),
        endDate: Joi.string().isoDate().allow(null, '').optional(),
      }).default({}),
      reportingPeriod: Joi.object({
        scope: Joi.string()
          .valid('yearly', 'monthly', 'weekly', 'daily', 'custom_range')
          .default('monthly'),
        weekStartsOn: Joi.number().integer().valid(0, 1),
        timezone: Joi.string().allow('', null),
        defaultYear: Joi.number().integer().min(2000).max(2100).allow(null).default(null),
        defaultMonth: Joi.string().pattern(/^\d{4}-\d{2}$/).allow(null, '').default(null),
        customRange: Joi.object({
          maxDays: Joi.number().integer().min(1).max(366).allow(null).default(null),
        }).default({}),
      }).default({}),
      submissionPolicy: Joi.object({
        maxSubmissionsPerPeriod: Joi.number().integer().min(1).max(20).default(1),
        allowBackdating: Joi.boolean().default(false),
        closeWindowAtPeriodEnd: Joi.boolean(),
      }).default({}),
      submissionFrequency: Joi.object({
        mode: Joi.string()
          .valid('once', 'multiple', 'daily', 'weekly', 'monthly', 'custom')
          .default('monthly'),
        count: Joi.number().integer().min(1).max(20).default(1),
        weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
        monthDates: Joi.array().items(Joi.number().integer().min(1).max(31)).default([]),
        intervalWeeks: Joi.number().integer().min(1).max(4).default(1),
        custom: Joi.object({
          interval: Joi.number().integer().min(1).max(365).allow(null).default(null),
          unit: Joi.string().valid('day', 'week', 'month').optional(),
        }).default({}),
      }).default({}),
      trackingMode: Joi.string().valid('none', 'daily', 'weekly', 'monthly').default('none'),
      frequency: Joi.string()
        .valid('daily', 'weekly', 'monthly')
        .default('monthly'),
      requireNodeId: Joi.boolean().default(true),
      requireMonth: Joi.boolean().default(true),
      trackCompliance: Joi.boolean().default(false),
      autoGenerateCalendar: Joi.boolean().default(false),
      autoLockMonthEnd: Joi.boolean(),
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
      currency: Joi.string().allow('', null).default(null),
      enabledChannels: Joi.array().items(Joi.string()).default([]),
      defaultChannel: Joi.string().allow(null).default(null),
      collectionStage: Joi.string()
        .valid(...TRANSACTION_COLLECTION_STAGE_VALUES)
        .default('submission'),
      settlementType: Joi.string().default('none'),
      receivingAccount: Joi.any().allow(null).default(null),
      channelConfigs: Joi.object().unknown(true).default({}),
      policies: Joi.object({
        requirePaymentBeforeSubmit: Joi.boolean().default(false),
        allowPartialPayment: Joi.boolean().default(false),
        allowOverpayment: Joi.boolean().default(false),
        refundPolicy: Joi.string().default('none'),
      }).default({}),
    }).default({}),
    remittance: Joi.object({
      enabled: Joi.boolean().default(false),
      accountSource: Joi.string()
        .valid('tenant_global', 'specific_node', 'dynamic_node', 'level_nodes', 'form_field')
        .default('tenant_global'),
      specificNodeId: Joi.string().allow('', null).default(null),
      targetLevelId: Joi.string().allow('', null).default(null),
      requireNodeAccount: Joi.boolean().default(false),
      nodeAccountField: Joi.string().allow('', null).default(null),
      inheritParentAccount: Joi.boolean().default(false),
      settlementRule: Joi.object({
        mode: Joi.string().default('single'),
        splitType: Joi.string().default('selection'),
        targets: Joi.array()
          .items(
            Joi.object({
              nodeId: Joi.string().required(),
              percentage: Joi.number().min(0).max(100).optional(),
            })
          )
          .default([]),
      }).default({}),
      routing: Joi.object({
        byNode: Joi.boolean().default(false),
        bySubmissionValue: Joi.boolean().default(false),
        fallbackAccountId: Joi.string().allow('', null).default(null),
      }).default({}),
    }).default({}),
    invoice: invoiceConfigSchema.default({}),
  })
    .custom((value, helpers) => {
      if (value?.payment?.enabled) {
        if (!value?.invoice?.enabled) {
          return helpers.error('any.custom', {
            message: 'invoice.enabled is required when payment is enabled',
          });
        }
        if (!value?.invoice?.calculationMode || value.invoice.calculationMode === 'none') {
          return helpers.error('any.custom', {
            message: 'invoice.calculationMode cannot be none when payment is enabled',
          });
        }
      }
      return value;
    })
    .messages({
      'any.custom': '{{#message}}',
    })
    .default({}),
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

const identitySchema = Joi.object({
  name: Joi.string().required().trim().min(1).max(100),
  description: Joi.string().allow('').default(''),
  category: Joi.string().required().trim(),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  status: Joi.string().valid('draft', 'published', 'archived').default('draft'),
}).required();

const layoutSchema = Joi.object({
  style: Joi.string().default('default'),
  wizardMode: Joi.boolean().default(false),
  grid: Joi.object({
    columns: Joi.number().integer().min(1).max(24).default(12),
    columnSpans: Joi.object().default({}),
  }).required(),
  builder: Joi.object().unknown(true).default({}),
}).required();

const securityAuthenticationSchema = Joi.object({
  method: Joi.string().valid('none', 'otp', 'access_code').default('none'),
  requireLogin: Joi.boolean().default(false),
  allowAnonymous: Joi.boolean().default(true),
  requireOtp: Joi.boolean().default(false),
})
  .unknown(true)
  .default({});

const securityAccessCodeSchema = Joi.object({
  code: Joi.string().trim().min(4).max(64).allow('', null).default(null),
  hint: Joi.string().trim().max(160).allow('', null).default(null),
  maxAttempts: Joi.number().integer().min(1).max(20).default(5),
  lockoutMinutes: Joi.number().integer().min(1).max(1440).default(15),
})
  .unknown(true)
  .default({});

const securitySubmissionProtectionSchema = Joi.object({
  preventDuplicateSubmission: Joi.boolean().default(false),
  duplicateCheckField: Joi.string().allow('', null).default(null),
  rateLimitEnabled: Joi.boolean().default(false),
  maxSubmissionsPerUser: Joi.number().integer().min(1).allow(null).default(null),
})
  .unknown(true)
  .default({});

const paymentConfigSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  mode: Joi.string().default('none'),
  currency: Joi.string().allow('', null).default(null),
  enabledChannels: Joi.array().items(Joi.string()).default([]),
  defaultChannel: Joi.string().allow('', null).default(null),
  collectionStage: Joi.string()
    .valid(...TRANSACTION_COLLECTION_STAGE_VALUES)
    .default('submission'),
  settlementType: Joi.string().default('none'),
  receivingAccount: Joi.any().allow(null).default(null),
  channelConfigs: Joi.object().unknown(true).default({}),
  policies: Joi.object({
    requirePaymentBeforeSubmit: Joi.boolean().default(false),
    allowPartialPayment: Joi.boolean().default(false),
    allowOverpayment: Joi.boolean().default(false),
    refundPolicy: Joi.string().default('none'),
  }).default({}),
}).unknown(true);

const remittanceConfigSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  accountSource: Joi.string()
    .valid('tenant_global', 'specific_node', 'dynamic_node', 'level_nodes', 'form_field')
    .default('tenant_global'),
  specificNodeId: Joi.string().allow('', null).default(null),
  targetLevelId: Joi.string().allow('', null).default(null),
  requireNodeAccount: Joi.boolean().default(false),
  nodeAccountField: Joi.string().allow('', null).default(null),
  inheritParentAccount: Joi.boolean().default(false),
  settlementRule: Joi.object({
    mode: Joi.string().default('single'),
    splitType: Joi.string().default('selection'),
    targets: Joi.array()
      .items(
        Joi.object({
          nodeId: Joi.string().required(),
          percentage: Joi.number().min(0).max(100).optional(),
        })
      )
      .default([]),
  }).default({}),
  routing: Joi.object({
    byNode: Joi.boolean().default(false),
    bySubmissionValue: Joi.boolean().default(false),
    fallbackAccountId: Joi.string().allow('', null).default(null),
  }).default({}),
})
  .custom((value, helpers) => {
    if (value.accountSource === 'specific_node' && !value.specificNodeId) {
      return helpers.error('any.custom', {
        message: 'specificNodeId is required when accountSource is specific_node',
      });
    }
    if (value.accountSource === 'level_nodes') {
      if (!value.targetLevelId) {
        return helpers.error('any.custom', {
          message: 'targetLevelId is required when accountSource is level_nodes',
        });
      }
      const targets = Array.isArray(value?.settlementRule?.targets)
        ? value.settlementRule.targets
        : [];
      const nodeIds = targets.map((target) => target.nodeId);
      if (new Set(nodeIds).size !== nodeIds.length) {
        return helpers.error('any.custom', {
          message: 'settlementRule.targets cannot contain duplicate nodeId values',
        });
      }
    }
    if (value.accountSource === 'form_field' && !value.nodeAccountField) {
      return helpers.error('any.custom', {
        message: 'nodeAccountField is required when accountSource is form_field',
      });
    }
    return value;
  })
  .messages({
    'any.custom': '{{#message}}',
  })
  .default({});

const automationRuleConditionSchema = Joi.object({
  id: Joi.string().optional(),
  sourceType: Joi.string()
    .valid('field', 'submission_status', 'workflow_status')
    .default('field'),
  fieldId: Joi.string().allow('', null).default(null),
  statusKey: Joi.string().allow('', null).default(null),
  operator: Joi.string()
    .valid('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in')
    .default('eq'),
  value: Joi.alternatives()
    .try(Joi.string().allow(''), Joi.number(), Joi.boolean(), Joi.array(), Joi.object().unknown(true), Joi.allow(null))
    .default(null),
}).unknown(true);

const automationRuleSchema = Joi.object({
  id: Joi.string().optional(),
  name: Joi.string().allow('').default(''),
  enabled: Joi.boolean().default(true),
  priority: Joi.number().integer().min(1).default(1),
  matchMode: Joi.string().valid('all', 'any').default('all'),
  scope: Joi.object({
    source: Joi.string().valid('submission', 'workflow').default('submission'),
    trigger: Joi.string()
      .valid('created', 'updated', 'approved', 'rejected', 'completed', 'manual')
      .default('created'),
  }).default({}),
  conditions: Joi.array().items(automationRuleConditionSchema).default([]),
  actionRefs: Joi.array().items(Joi.string()).default([]),
  outcome: Joi.object({
    statusOnMatch: Joi.string().allow('', null).default(null),
    note: Joi.string().allow('').default(''),
  }).default({}),
}).unknown(true);

const connectedActionSchema = Joi.object({
  id: Joi.string().optional(),
  name: Joi.string().allow('').default(''),
  enabled: Joi.boolean().default(true),
  provider: Joi.string()
    .valid('internal', 'webhook', 'email', 'slack', 'zapier', 'power_automate')
    .default('internal'),
  actionType: Joi.string()
    .valid('notify', 'status_update', 'integration_sync', 'assign', 'webhook_call')
    .default('notify'),
  target: Joi.string().allow('', null).default(null),
  config: Joi.object().unknown(true).default({}),
  retryPolicy: Joi.object({
    enabled: Joi.boolean().default(false),
    maxAttempts: Joi.number().integer().min(1).max(10).default(3),
  }).default({}),
}).unknown(true);

const automationOperationalVisibilitySchema = Joi.object({
  showRunLog: Joi.boolean().default(true),
  showStatuses: Joi.boolean().default(true),
  showOwners: Joi.boolean().default(true),
  showAuditTrail: Joi.boolean().default(true),
  showRuleMatches: Joi.boolean().default(true),
  showLastRunAt: Joi.boolean().default(true),
}).default({});

// PERM Settings Schema
const permSettingsSchema = Joi.object({
  enabled: Joi.boolean().default(false),
  availability: Joi.object({
    startDate: Joi.string().isoDate().allow(null, '').optional(),
    endDate: Joi.string().isoDate().allow(null, '').optional(),
  }).default({}),
  reportingPeriod: Joi.object({
    scope: Joi.string()
      .valid('yearly', 'monthly', 'weekly', 'daily', 'custom_range')
      .default('monthly'),
    weekStartsOn: Joi.number().integer().valid(0, 1),
    timezone: Joi.string().allow('', null),
    defaultYear: Joi.number().integer().min(2000).max(2100).allow(null).default(null),
    defaultMonth: Joi.string().pattern(/^\d{4}-\d{2}$/).allow(null, '').default(null),
    customRange: Joi.object({
      maxDays: Joi.number().integer().min(1).max(366).allow(null).default(null),
    }).default({}),
  }).default({}),
  submissionPolicy: Joi.object({
    maxSubmissionsPerPeriod: Joi.number().integer().min(1).max(20).default(1),
    allowBackdating: Joi.boolean().default(false),
    closeWindowAtPeriodEnd: Joi.boolean(),
  }).default({}),
  submissionFrequency: Joi.object({
    mode: Joi.string()
      .valid('once', 'multiple', 'daily', 'weekly', 'monthly', 'custom')
      .default('monthly'),
    count: Joi.number().integer().min(1).max(20).default(1),
    weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
    monthDates: Joi.array().items(Joi.number().integer().min(1).max(31)).default([]),
    intervalWeeks: Joi.number().integer().min(1).max(4).default(1),
    custom: Joi.object({
      interval: Joi.number().integer().min(1).max(365).allow(null).default(null),
      unit: Joi.string().valid('day', 'week', 'month').optional(),
    }).default({}),
  }).default({}),
  trackingMode: Joi.string().valid('none', 'daily', 'weekly', 'monthly').default('none'),
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
  monthlyConfig: Joi.object({
    dates: Joi.array().items(Joi.number().integer().min(1).max(31)).default([]),
    submissionLimitPerDate: Joi.number().integer().min(1).max(20).default(1),
  }).default({}),
  schedule: Joi.object({
    frequency: Joi.string().valid('daily', 'weekly', 'monthly').default('monthly'),
    startDate: Joi.string().isoDate().allow(null, '').optional(),
    endDate: Joi.string().isoDate().allow(null, '').optional(),
    daily: Joi.object({
      weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
    }).default({}),
    weekly: Joi.object({
      intervalWeeks: Joi.number().integer().min(1).max(4).default(1),
      weekdays: Joi.array().items(Joi.number().integer().min(0).max(6)).default([]),
      anchorDate: Joi.string().isoDate().allow(null, '').optional(),
    }).default({}),
    monthly: Joi.object({
      dates: Joi.array().items(Joi.number().integer().min(1).max(31)).default([]),
    }).default({}),
  }).default({}),
  submissionLimit: Joi.object({
    count: Joi.number().integer().min(1).max(20).default(1),
    scope: Joi.string().valid('occurrence').default('occurrence'),
  }).default({}),
  enforcement: Joi.object({
    allowBackdating: Joi.boolean().default(false),
    closeWindowAtPeriodEnd: Joi.boolean(),
  }).default({}),
  requireNodeId: Joi.boolean().default(true),
  requireMonth: Joi.boolean().default(true),
  trackCompliance: Joi.boolean().default(true),
  autoGenerateCalendar: Joi.boolean().default(true),
  autoLockMonthEnd: Joi.boolean(),
  calendarRequired: Joi.boolean().default(false),
  eventTypes: Joi.array().items(Joi.string()).default([]),
  calendarGeneration: Joi.object({
    startDate: Joi.string().isoDate().allow(null, '').optional(),
    endDate: Joi.string().isoDate().allow(null, '').optional(),
    allowBackdating: Joi.boolean().default(false),
    monthsToGenerate: Joi.number().integer().min(1).max(36).allow(null).optional(),
  }).optional(),
}).unknown(true).default({
  enabled: false,
  availability: {
    startDate: null,
    endDate: null,
  },
  reportingPeriod: {
    scope: 'monthly',
    customRange: {
      maxDays: null,
    },
  },
  submissionPolicy: {
    maxSubmissionsPerPeriod: 1,
    allowBackdating: false,
  },
  submissionFrequency: {
    mode: 'daily',
    count: 1,
    weekdays: [],
    monthDates: [],
    intervalWeeks: 1,
    custom: {
      interval: null,
    },
  },
  trackingMode: 'none',
  frequency: 'daily',
  schedule: {
    frequency: 'daily',
  },
  submissionLimit: {
    count: 1,
    scope: 'occurrence',
  },
  enforcement: {
    allowBackdating: false,
  },
  requireNodeId: true,
  requireMonth: true,
  trackCompliance: true,
  autoGenerateCalendar: true,
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
  assigneeRoles: Joi.array().items(Joi.string()).default([]),
  assigneeRole: Joi.string().allow('', null).optional(),
  assigneeType: Joi.string().valid('role', 'user', 'dynamic_field').default('role'),
  assigneeUsers: Joi.array().items(Joi.string()).default([]),
  escalationType: Joi.string().valid('none', 'role', 'user').default('none'),
  escalationRoles: Joi.array().items(Joi.string()).default([]),
  escalationUsers: Joi.array().items(Joi.string()).default([]),
  sla: Joi.object({
    hours: Joi.number().integer().min(1).default(48),
    escalateTo: Joi.string().allow('', null).optional(),
    escalateOnExpiry: Joi.boolean().default(false),
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

const v2CapabilitiesSchema = Joi.object({
  experience: Joi.object({
    security: Joi.object({
      enabled: Joi.boolean().default(false),
      audience: Joi.string()
        .valid('public', 'authenticated', 'selected_roles', 'selected_users')
        .default('public'),
      profile: Joi.string()
        .valid(
          'open_public',
          'private_safe',
          'restricted_team',
          'internal_staff',
          'high_security'
        )
        .default('open_public'),
      mode: Joi.string()
        .valid('public', 'private', 'restricted', 'internal')
        .default('public'),
      publicSecureMode: Joi.string()
        .valid('off', 'link_only', 'otp', 'access_code')
        .default('off'),
      access: Joi.object({
        whoCanAccess: Joi.string()
          .valid(
            'anyone',
            'authenticated_users',
            'selected_roles',
            'selected_users'
          )
          .default('anyone'),
        allowedRoles: Joi.array().items(Joi.string()).default([]),
        allowedUsers: Joi.array().items(Joi.string()).default([]),
        restrictByLocation: Joi.boolean().default(false),
        allowedCountries: Joi.array().items(Joi.string()).default([]),
      })
        .unknown(true)
        .default({}),
      authentication: securityAuthenticationSchema,
      accessCode: securityAccessCodeSchema,
      submissionProtection: securitySubmissionProtectionSchema,
      channels: Joi.array()
        .items(
          Joi.string().valid(
            'web',
            'api',
            'embedded',
            'javascript',
            'mobile',
            'whatsapp',
            'telegram'
          )
        )
        .default(['web']),
    })
      .required()
      .unknown(true),
    behavior: Joi.object().unknown(true).default({}),
    previewSubmission: Joi.object({
      enabled: Joi.boolean().default(false),
      layout: Joi.string().default('biodata_document'),
      allowEditBeforeSubmit: Joi.boolean().default(true),
      showBranding: Joi.boolean().default(true),
    })
      .unknown(true)
      .default({}),
    distribution: Joi.object().unknown(true).default({}),
    notifications: Joi.object().unknown(true).default({}),
    compliance: permSettingsSchema.default({}),
    workflow: Joi.object({
      enabled: Joi.boolean().default(false),
      approvalMode: Joi.string().default('none'),
      triggerOn: Joi.string()
        .valid('submission', 'submit', 'update', 'manual')
        .default('submission'),
      workflows: Joi.array().items(workflowSchema).default([]),
    })
      .unknown(true)
      .default({}),
  })
    .required()
    .unknown(true),
  transaction: Joi.object({
    payment: paymentConfigSchema.default({}),
    remittance: remittanceConfigSchema.default({}),
    invoice: invoiceConfigSchema.default({}),
  })
    .custom((value, helpers) => {
      if (value?.payment?.enabled) {
        if (!value?.invoice?.enabled) {
          return helpers.error('any.custom', {
            message: 'invoice.enabled is required when payment is enabled',
          });
        }
        if (!value?.invoice?.calculationMode || value.invoice.calculationMode === 'none') {
          return helpers.error('any.custom', {
            message: 'invoice.calculationMode cannot be none when payment is enabled',
          });
        }
      }
      return value;
    })
    .messages({
      'any.custom': '{{#message}}',
    })
    .required()
    .unknown(true),
  automation: Joi.object({
    rules: Joi.array().items(automationRuleSchema).default([]),
    connectedActions: Joi.array()
      .items(connectedActionSchema)
      .default([]),
    operationalVisibility: automationOperationalVisibilitySchema,
  })
    .required()
    .unknown(true),
})
  .required()
  .unknown(true);

const analyticsSchema = Joi.object({
  profile: projectAnalysisProfileSchema.default({}),
})
  .required()
  .unknown(true);

const uiSchema = Joi.object({
  theme: Joi.string().default('default'),
  primaryColor: Joi.string().default('#3b82f6'),
  layout: Joi.string().valid('single', 'multi-step').default('single'),
  showProgressBar: Joi.boolean().default(true),
  headerLayout: Joi.string()
    .valid('classic', 'centered', 'inline', 'banner')
    .default('classic'),
  headerPattern: Joi.string()
    .valid('none', 'dots', 'grid', 'diagonal', 'waves')
    .default('none'),
  headerPatternOpacity: Joi.number().min(0).max(100).default(12),
})
  .unknown(true)
  .default({});

const rejectLegacyRootFields = (value, helpers) => {
  const forbidden = [
    'configuration',
    'userSettings',
    'permSettings',
    'paymentConfig',
    'workflows',
    'style',
    'wizardMode',
    'columnSpans',
    'calendar',
    'behaviorHooks',
  ];
  const found = forbidden.filter((key) =>
    Object.prototype.hasOwnProperty.call(value || {}, key)
  );
  if (found.length > 0) {
    return helpers.error('any.custom', {
      message: `Legacy ProjectForm root fields are not supported: ${found.join(', ')}`,
    });
  }
  return value;
};

const enforceSystemFormContract = (value, helpers) => {
  const category = value?.identity?.category;
  if (category !== 'system') {
    return value;
  }

  const target = value?.metadata?.systemTarget;
  if (!target) {
    return helpers.error('any.custom', {
      message: 'metadata.systemTarget is required when identity.category is system',
    });
  }

  if (
    value?.capabilities?.experience?.security?.mode &&
    value.capabilities.experience.security.mode !== 'private'
  ) {
    return helpers.error('any.custom', {
      message: 'System forms must set capabilities.experience.security.mode to private',
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

// Validation schemas
const createProjectForm = {
  body: Joi.object()
    .keys({
      schemaVersion: Joi.string().valid('2.0.0').required(),
      workspaceId: Joi.string().trim().optional(),
      identity: identitySchema,
      elements: Joi.array().items(formElementSchema).default([]),
      layout: layoutSchema,
      capabilities: v2CapabilitiesSchema,
      smartMappings: smartMappingsSchema,
      analytics: analyticsSchema,
      ui: uiSchema,
      metadata: metadataSchema,
    })
    .custom(rejectLegacyRootFields, 'legacy root field rejection')
    .custom(validateSmartMappingsAgainstElements, 'smart mapping validation'),
};

const getProjectForms = {
  query: Joi.object().keys({
    workspaceId: Joi.string().trim(),
    status: Joi.string().valid('active', 'inactive', 'archived'),
    'identity.name': Joi.string(),
    'identity.tags': Joi.string(),
    'capabilities.experience.security.mode': Joi.string().valid('public', 'private'),
    'identity.category': Joi.string().valid('standard', 'system'),
    'metadata.systemTarget': Joi.string().valid('user_profile', 'node_profile'),
    'identity.status': Joi.string().valid(
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
    'identity.name': Joi.string(),
    'identity.tags': Joi.string(),
    'identity.category': Joi.string().valid('standard', 'system'),
    'metadata.systemTarget': Joi.string().valid('user_profile', 'node_profile'),
    'identity.status': Joi.string().valid(
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
    'identity.name': Joi.string(),
    'identity.tags': Joi.string(),
    'identity.category': Joi.string().valid('standard', 'system'),
    'metadata.systemTarget': Joi.string().valid('user_profile', 'node_profile'),
    'identity.status': Joi.string().valid(
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

const listPublicProjectForms = {
  query: Joi.object().keys({
    status: Joi.string()
      .valid('active', 'inactive', 'archived')
      .optional(),
    'identity.status': Joi.string()
      .valid('draft', 'published', 'archived')
      .optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    page: Joi.number().integer().min(1).default(1),
    sortBy: Joi.string().optional(),
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

const verifyPublicAccessGateCode = {
  body: Joi.object().keys({
    reference: Joi.string().required(),
    accessCode: Joi.string().trim().min(4).max(64).required(),
    qrContextToken: Joi.string().optional(),
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
    reference: Joi.string().optional(),
    nodeId: Joi.string().optional().allow('', null),
    source: Joi.string().optional(),
    submissionData: Joi.alternatives()
      .try(Joi.object().unknown(true), Joi.array().items(Joi.any()))
      .required(),
    submittedAt: Joi.string().isoDate().optional(),
    event_date: Joi.string().isoDate().optional(),
    submission_date: Joi.string().isoDate().optional(),
    month: Joi.string().optional().allow('', null),
    year: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
    metadata: Joi.object().unknown(true).optional(),
  }),
};

const requestFieldVerificationCode = {
  body: Joi.object().keys({
    formId: Joi.string().required(),
    fieldKey: Joi.string().required(),
    channel: Joi.string().valid('email', 'phone').required(),
    identifier: Joi.string().required(),
    submissionId: Joi.string().optional().allow('', null),
    accessToken: Joi.string().optional().allow('', null),
  }),
};

const verifyFieldVerificationCode = {
  body: Joi.object().keys({
    challengeId: Joi.string().required(),
    otp: Joi.string().pattern(/^\d{4,6}$/).required(),
  }),
};

const initiatePublicUpload = {
  params: Joi.object().keys({
    formId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    tenantId: Joi.string().optional().allow('', null),
    projectId: Joi.string().optional().allow('', null),
    fieldId: Joi.string().required(),
    fileName: Joi.string().required(),
    mimeType: Joi.string().required(),
    sizeBytes: Joi.number().integer().positive().required(),
    reference: Joi.string().optional().allow('', null),
    accessToken: Joi.string().optional().allow('', null),
    sessionKey: Joi.string().optional().allow('', null),
  }),
};

const completePublicUpload = {
  params: Joi.object().keys({
    formId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    uploadId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required(),
    reference: Joi.string().optional().allow('', null),
    accessToken: Joi.string().optional().allow('', null),
    sessionKey: Joi.string().optional().allow('', null),
    width: Joi.number().integer().min(1).optional().allow(null),
    height: Joi.number().integer().min(1).optional().allow(null),
  }),
};

const generateFormFieldId = {
  params: Joi.object().keys({
    formId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    tenantId: Joi.string().optional().allow('', null),
    projectId: Joi.string().optional().allow('', null),
    formId: Joi.string().optional().allow('', null),
    fieldKey: Joi.string().required(),
    prefix: Joi.string().optional().allow(''),
    separator: Joi.string().optional().allow(''),
    length: Joi.number().integer().min(1).max(12).optional(),
  }),
};

const evaluatePublicInvoice = {
  params: Joi.object().keys({
    formId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    tenantId: Joi.string().optional().allow('', null),
    projectId: Joi.string().optional().allow('', null),
    submissionData: Joi.object().unknown(true).required(),
  }),
};

const createPublicPaymentIntent = {
  params: Joi.object().keys({
    formId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    tenantId: Joi.string().optional().allow('', null),
    projectId: Joi.string().optional().allow('', null),
    submissionId: Joi.string().optional().allow('', null),
    requestedChannel: Joi.string().optional().allow('', null),
    triggerStage: Joi.string()
      .valid('submission', 'pre_approval', 'post_approval')
      .default('submission'),
    respondentContext: Joi.object().unknown(true).optional(),
    submissionData: Joi.object().unknown(true).required(),
  }),
};

const getPublicPaymentStatus = {
  params: Joi.object().keys({
    formId: Joi.string().required(),
    reference: Joi.string().required(),
  }),
  query: Joi.object().keys({
    tenantId: Joi.string().optional().allow('', null),
    projectId: Joi.string().optional().allow('', null),
    provider: Joi.string().optional().allow('', null),
    transaction_id: Joi.string().optional().allow('', null),
    transactionId: Joi.string().optional().allow('', null),
    tx_ref: Joi.string().optional().allow('', null),
    status: Joi.string().optional().allow('', null),
  }),
};

const updateProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      schemaVersion: Joi.string().valid('2.0.0'),
      workspaceId: Joi.string().trim(),
      identity: identitySchema,
      elements: Joi.array().items(formElementSchema),
      layout: layoutSchema,
      capabilities: v2CapabilitiesSchema,
      smartMappings: smartMappingsSchema,
      analytics: analyticsSchema,
      ui: uiSchema,
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
    })
    .custom(rejectLegacyRootFields, 'legacy root field rejection')
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
      schemaVersion: Joi.string().valid('2.0.0'),
      workspaceId: Joi.string().trim(),
      identity: identitySchema,
      elements: Joi.array().items(formElementSchema),
      layout: layoutSchema,
      capabilities: v2CapabilitiesSchema,
      smartMappings: smartMappingsSchema,
      analytics: analyticsSchema,
      ui: uiSchema,
      metadata: metadataSchema,
      status: Joi.string().valid('active', 'inactive', 'archived'),
    })
    .custom(rejectLegacyRootFields, 'legacy root field rejection')
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
  query: Joi.object().keys({
    includeAll: Joi.boolean().truthy('true').falsy('false').optional(),
  }),
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

const listProjectWorkspaceMembers = {
  query: Joi.object().keys({
    includeAll: Joi.boolean().truthy('true').falsy('false').optional(),
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
      accessProfileId: Joi.string()
        .valid('workspace_owner', 'data_administrator', 'editor', 'viewer')
        .optional(),
    })
    .or('userId', 'email'),
};

const listWorkspaceInvitations = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
  }),
};

const createWorkspaceInvitation = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
  }),
  body: Joi.object().keys({
    email: Joi.string().email().required(),
    firstname: Joi.string().trim().allow('').default(''),
    lastname: Joi.string().trim().allow('').default(''),
    phoneNumber: Joi.string().trim().allow('', null).default(null),
    accessProfileId: Joi.string()
      .valid('workspace_owner', 'data_administrator', 'editor', 'viewer')
      .default('viewer'),
    redirectPath: Joi.string().trim().allow('', null).default(null),
  }),
};

const resendWorkspaceInvitation = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
    invitationId: Joi.string().custom(objectId).required(),
  }),
};

const revokeWorkspaceInvitation = {
  params: Joi.object().keys({
    workspaceId: Joi.string().trim().required(),
    invitationId: Joi.string().custom(objectId).required(),
  }),
};

const getWorkspaceInvitation = {
  params: Joi.object().keys({
    token: Joi.string().trim().required(),
  }),
};

const acceptWorkspaceInvitation = {
  params: Joi.object().keys({
    token: Joi.string().trim().required(),
  }),
  body: Joi.object().keys({
    firstname: Joi.string().trim().allow('', null).default(''),
    lastname: Joi.string().trim().allow('', null).default(''),
    password: Joi.string().min(8).allow('', null).default(''),
    phoneNumber: Joi.string().trim().allow('', null).default(null),
  }),
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
        startDate: Joi.string().isoDate().allow(null, '').optional(),
        endDate: Joi.string().isoDate().allow(null, '').optional(),
        allowBackdating: Joi.boolean().default(false),
        monthsToGenerate: Joi.number().integer().min(1).max(36).allow(null).optional(),
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
  listPublicProjectForms,
  getPublicProjectFormByShortCode,
  requestPublicAccessLink,
  requestPublicAccessCode,
  verifyPublicAccessCode,
  verifyPublicAccessGateCode,
  resendPublicAccessCode,
  consumePublicAccessLink,
  getPublicAccessPrefill,
  submitPublicAccessForm,
  requestFieldVerificationCode,
  verifyFieldVerificationCode,
  initiatePublicUpload,
  completePublicUpload,
  generateFormFieldId,
  evaluatePublicInvoice,
  createPublicPaymentIntent,
  getPublicPaymentStatus,
  bootstrapSystemForms,
  getSystemProjectForm,
  submitSystemForm,
  listProjectWorkspaces,
  createProjectWorkspace,
  renameProjectWorkspace,
  listProjectWorkspaceMembers,
  addProjectWorkspaceMember,
  listWorkspaceInvitations,
  createWorkspaceInvitation,
  resendWorkspaceInvitation,
  revokeWorkspaceInvitation,
  getWorkspaceInvitation,
  acceptWorkspaceInvitation,
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
