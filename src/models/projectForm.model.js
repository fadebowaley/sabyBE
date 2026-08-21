const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { nanoid, customAlphabet } = require('nanoid');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

// Schema for form elements (from form builder)
const FormElementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    properties: {
      label: String,
      placeholder: String,
      required: { type: Boolean, default: false },
      validation: mongoose.Schema.Types.Mixed,
      options: [String], // For select, radio, checkbox
      multiple: { type: Boolean, default: false },
      accept: String, // For file uploads
      defaultValue: mongoose.Schema.Types.Mixed,
      numberType: String,
      formula: String,
      paragraphAlignment: String,
      headerLevel: String,
      headerAlignment: String,
      textAlign: String,
      acceptedTypes: String,
      defaultCountry: String,
    },
    aliases: [{ type: String }],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    semantic: {
      role: {
        type: String,
        enum: ['measure', 'dimension', 'status', 'label', 'ignore'],
      },
      valueType: {
        type: String,
        enum: [
          'number',
          'currency',
          'percent',
          'boolean',
          'text',
          'enum',
          'date',
          'datetime',
          'time',
          'unknown',
        ],
      },
      aggregationAllowed: [
        {
          type: String,
          enum: [
            'sum',
            'avg',
            'min',
            'max',
            'count',
            'count_distinct',
            'ratio',
            'trend',
          ],
        },
      ],
    },
  },
  { _id: false, strict: false }
);

const ProjectAnalysisProfileSchema = new mongoose.Schema(
  {
    dataNature: {
      type: String,
      enum: ['qualitative', 'quantitative', 'hybrid'],
      default: 'qualitative',
    },
    domain: {
      type: String,
      enum: ['finance', 'attendance', 'hr', 'operations', 'custom'],
      default: 'custom',
    },
    primaryTimeField: { type: String, default: 'event_date' },
    defaultMeasureFieldKeys: [{ type: String }],
    defaultDimensionFieldKeys: [{ type: String }],
    currency: { type: String, default: null },
    scoreStrategy: {
      type: String,
      enum: ['rule_based', 'trend_based', 'custom'],
      default: 'rule_based',
    },
    inferredAt: { type: Date, default: Date.now },
    fieldStats: {
      totalFields: { type: Number, default: 0 },
      numericFields: { type: Number, default: 0 },
      categoricalFields: { type: Number, default: 0 },
      dateFields: { type: Number, default: 0 },
      textFields: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const ProjectIdentitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: {
      type: String,
      enum: ['standard', 'system'],
      default: 'standard',
    },
    tags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
    },
  },
  { _id: false }
);

const LayoutBuilderSchema = new mongoose.Schema(
  {
    gridSize: { type: Number, default: 12 },
    snapToGrid: { type: Boolean, default: true },
    showGridLines: { type: Boolean, default: false },
    autoArrange: { type: Boolean, default: false },
  },
  { _id: false }
);

const LayoutSchema = new mongoose.Schema(
  {
    style: { type: String, default: 'default' },
    wizardMode: { type: Boolean, default: false },
    grid: {
      columns: { type: Number, default: 12 },
      columnSpans: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    builder: {
      type: LayoutBuilderSchema,
      default: () => ({}),
    },
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW SCHEMAS
// Each module can carry an array of workflow add-ons that activate on
// submission.  A workflow is made up of ordered steps (approval, review,
// notification).  Multiple workflows can be attached to a single module
// (e.g. "Manager Approval" + "Finance Review" + "Notify Admin").
// ─────────────────────────────────────────────────────────────────────────────

const WorkflowNotificationSchema = new mongoose.Schema(
  {
    onSubmit:    { type: Boolean, default: true },
    onAssign:    { type: Boolean, default: true },
    onApprove:   { type: Boolean, default: true },
    onReject:    { type: Boolean, default: true },
    onComplete:  { type: Boolean, default: true },
    onReminder:  { type: Boolean, default: false },
    // Delivery channels: 'email' | 'inApp' | 'sms'
    channels:    [{ type: String, enum: ['email', 'inApp', 'sms'] }],
    // Extra recipients (email addresses) beyond the assignees
    extraRecipients: [{ type: String }],
  },
  { _id: false }
);

const WorkflowStepSchema = new mongoose.Schema(
  {
    id:        { type: String, required: true },
    name:      { type: String, required: true },
    stepOrder: { type: Number, default: 0 },

    // Higher-level action type used by the frontend workflow builder
    // Maps to step `type` at runtime but is preserved for round-trip fidelity
    actionType: {
      type: String,
      enum: ['SUBMIT', 'REVIEW', 'APPROVE', 'REJECT', 'ESCALATE', 'NOTIFY'],
    },

    // Step category (runtime type used by the backend service)
    type: {
      type: String,
      enum: ['approval', 'review', 'notification'],
      default: 'approval',
    },

    // Who handles this step
    assigneeType: {
      type: String,
      enum: ['role', 'user', 'dynamic_field', 'auto'],
      default: 'role',
    },
    // Legacy single-role field — kept for backward compatibility
    assigneeRole: { type: String },
    // Multi-role support: any user with one of these roles can act on this step
    assigneeRoles: [{ type: String }],
    assigneeUsers: [{ type: String }],          // specific user IDs
    assigneeDynamicField: { type: String },     // form field that names the assignee
    escalationType: {
      type: String,
      enum: ['none', 'role', 'user'],
      default: 'none',
    },
    escalationRoles: [{ type: String }],
    escalationUsers: [{ type: String }],

    // Service-level agreement
    sla: {
      hours:          { type: Number, default: 48 },
      escalateTo: { type: String, default: null },
      escalateOnExpiry: { type: Boolean, default: false },
    },

    // Transition rules
    onApprove: {
      nextStep: { type: String, default: 'complete' }, // step id or 'complete'
      notify:   { type: Boolean, default: true },
    },
    onReject: {
      terminal:      { type: Boolean, default: true },
      notify:        { type: Boolean, default: true },
      requireReason: { type: Boolean, default: false },
    },

    notifications: WorkflowNotificationSchema,
  },
  { _id: false }
);

const WorkflowSchema = new mongoose.Schema(
  {
    id:          { type: String, required: true },
    name:        { type: String, required: true },
    description: { type: String },

    // Workflow type — determines the UI template and default behaviours
    type: {
      type: String,
      enum: [
        'approval',       // generic approve/reject
        'review',         // read-only review, no approve/reject
        'notification',   // fire-and-forget notifications
        'hr_leave',       // leave application approval chain
        'payment_auth',   // payment/expenditure authorisation
        'custom',         // fully custom multi-step
      ],
      default: 'approval',
    },

    enabled:   { type: Boolean, default: true },

    // When to start this workflow
    triggerOn: {
      type: String,
      enum: ['submission', 'submit', 'update', 'manual'],
      default: 'submission',
    },

    // Ordered list of steps
    steps: [WorkflowStepSchema],

    // Module-level notification defaults (can be overridden per step)
    notifications: WorkflowNotificationSchema,

    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

// Schema for user settings (from userFormSettings)
const AccessSchema = new mongoose.Schema(
  {
    whoCanAccess: {
      type: String,
      enum: [
        'anyone',
        'authenticated_users',
        'selected_roles',
        'selected_users',
      ],
      default: 'anyone',
    },
    allowedRoles: [String],
    allowedUsers: [String],
    restrictByLocation: { type: Boolean, default: false },
    allowedCountries: [String],
    requireNodeAccess: { type: Boolean, default: false },
  },
  { _id: false }
);

const SecurityAuthenticationSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      enum: ['none', 'otp', 'access_code'],
      default: 'none',
    },
    requireLogin: { type: Boolean, default: false },
    allowAnonymous: { type: Boolean, default: true },
    requireOtp: { type: Boolean, default: false },
  },
  { _id: false }
);

const SecuritySubmissionProtectionSchema = new mongoose.Schema(
  {
    preventDuplicateSubmission: { type: Boolean, default: false },
    duplicateCheckField: { type: String, default: null },
    rateLimitEnabled: { type: Boolean, default: false },
    maxSubmissionsPerUser: { type: Number, default: null },
  },
  { _id: false }
);

const SecurityAccessCodeSchema = new mongoose.Schema(
  {
    code: { type: String, default: null, trim: true },
    hint: { type: String, default: null, trim: true },
    maxAttempts: { type: Number, default: 5, min: 1, max: 20 },
    lockoutMinutes: { type: Number, default: 15, min: 1, max: 1440 },
  },
  { _id: false }
);

const ExperienceBehaviorSchema = new mongoose.Schema(
  {
    allowMultipleSubmissions: { type: Boolean, default: true },
    enableProgressSave: { type: Boolean, default: true },
    autoSave: { type: Boolean, default: false },
    submitOnComplete: { type: Boolean, default: true },
  },
  { _id: false }
);

const ExperiencePreviewSubmissionSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    layout: { type: String, default: 'biodata_document' },
    allowEditBeforeSubmit: { type: Boolean, default: true },
    showBranding: { type: Boolean, default: true },
  },
  { _id: false }
);

const ExperienceDistributionSchema = new mongoose.Schema(
  {
    enableSharing: { type: Boolean, default: true },
    allowEmbedding: { type: Boolean, default: true },
    generateQR: { type: Boolean, default: false },
    enableDeepLinking: { type: Boolean, default: false },
  },
  { _id: false }
);

const ExperienceNotificationsSchema = new mongoose.Schema(
  {
    emailOnSubmission: { type: Boolean, default: false },
    notifyOwner: { type: Boolean, default: true },
    customEmails: [String],
    smsNotifications: { type: Boolean, default: false },
  },
  { _id: false }
);

const UISchema = new mongoose.Schema(
  {
    theme: { type: String, default: 'default' },
    primaryColor: { type: String, default: '#3b82f6' },
    secondaryColor: { type: String, default: '#dbeafe' },
    companyLogoUrl: { type: String, default: '' },
    conversationTitle: { type: String, default: '' },
    conversationDescription: { type: String, default: '' },
    layout: {
      type: String,
      enum: ['single', 'multi-step'],
      default: 'single',
    },
    showProgressBar: { type: Boolean, default: true },
    headerLayout: { type: String, default: 'classic' },
    headerPattern: { type: String, default: 'none' },
    headerPatternOpacity: { type: Number, default: 12 },
  },
  { _id: false }
);

const CapabilityExperienceSecuritySchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    audience: {
      type: String,
      enum: ['public', 'authenticated', 'selected_roles', 'selected_users'],
      default: 'public',
    },
    profile: {
      type: String,
      enum: [
        'open_public',
        'private_safe',
        'restricted_team',
        'internal_staff',
        'high_security',
      ],
      default: 'open_public',
    },
    mode: {
      type: String,
      enum: ['public', 'private', 'restricted', 'internal'],
      default: 'public',
    },
    publicSecureMode: {
      type: String,
      enum: ['off', 'link_only', 'otp', 'access_code'],
      default: 'off',
    },
    access: {
      type: AccessSchema,
      default: () => ({}),
    },
    authentication: {
      type: SecurityAuthenticationSchema,
      default: () => ({}),
    },
    accessCode: {
      type: SecurityAccessCodeSchema,
      default: () => ({}),
    },
    submissionProtection: {
      type: SecuritySubmissionProtectionSchema,
      default: () => ({}),
    },
    channels: [
      {
        type: String,
        enum: ['web', 'api', 'embedded', 'javascript', 'mobile', 'whatsapp', 'telegram'],
        trim: true,
      },
    ],
  },
  { _id: false }
);

const CapabilityExperienceComplianceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    availability: {
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
    },
    reportingPeriod: {
      scope: {
        type: String,
        enum: ['yearly', 'monthly', 'weekly', 'daily', 'custom_range'],
        default: 'monthly',
      },
      weekStartsOn: { type: Number, enum: [0, 1] },
      timezone: { type: String },
      defaultYear: { type: Number, default: null },
      defaultMonth: { type: String, default: null },
      customRange: {
        maxDays: { type: Number, default: null },
      },
    },
    submissionPolicy: {
      maxSubmissionsPerPeriod: { type: Number, default: 1 },
      allowBackdating: { type: Boolean, default: false },
      closeWindowAtPeriodEnd: { type: Boolean },
    },
    submissionFrequency: {
      mode: {
        type: String,
        enum: ['once', 'multiple', 'daily', 'weekly', 'monthly', 'custom'],
        default: 'monthly',
      },
      count: { type: Number, default: 1 },
      weekdays: { type: [Number], default: [] },
      monthDates: { type: [Number], default: [] },
      intervalWeeks: { type: Number, default: 1 },
      custom: {
        interval: { type: Number, default: null },
        unit: { type: String, enum: ['day', 'week', 'month'], default: undefined },
      },
    },
    trackingMode: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none',
    },
    dailyConfig: {
      activeDays: { type: [Number], default: [] },
      frequencyPerDay: { type: Number, default: 1 },
      skipWeekends: { type: Boolean, default: false },
      skipHolidays: { type: Boolean, default: false },
    },
    weeklyConfig: {
      days: {
        type: [
          new mongoose.Schema(
            {
              day: { type: Number, min: 0, max: 6, required: true },
              name: { type: String, required: true },
              frequency: {
                type: String,
                enum: ['weekly', 'biweekly', 'monthly'],
                required: true,
              },
              occurrences: { type: Number, default: null },
              enabled: { type: Boolean, default: true },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
    },
    monthlyConfig: {
      dates: { type: [Number], default: [] },
      submissionLimitPerDate: { type: Number, default: 1 },
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'monthly',
    },
    schedule: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'monthly',
      },
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
      daily: {
        weekdays: { type: [Number], default: [] },
      },
      weekly: {
        intervalWeeks: { type: Number, default: 1 },
        weekdays: { type: [Number], default: [] },
        anchorDate: { type: String, default: null },
      },
      monthly: {
        dates: { type: [Number], default: [] },
      },
    },
    submissionLimit: {
      count: { type: Number, default: 1 },
      scope: {
        type: String,
        enum: ['occurrence'],
        default: 'occurrence',
      },
    },
    enforcement: {
      allowBackdating: { type: Boolean, default: false },
      closeWindowAtPeriodEnd: { type: Boolean },
    },
    requireNodeId: { type: Boolean, default: true },
    requireMonth: { type: Boolean, default: true },
    trackCompliance: { type: Boolean, default: true },
    autoGenerateCalendar: { type: Boolean, default: true },
    autoLockMonthEnd: { type: Boolean },
    calendarRequired: { type: Boolean, default: false },
    eventTypes: { type: [String], default: [] },
    calendarGeneration: {
      startDate: { type: String, default: null },
      endDate: { type: String, default: null },
      allowBackdating: { type: Boolean, default: false },
      monthsToGenerate: { type: Number, default: null },
    },
  },
  { _id: false }
);

const CapabilityExperienceWorkflowSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    approvalMode: { type: String, default: 'none' },
    triggerOn: { type: String, default: 'submission' },
    steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
    workflows: { type: [WorkflowSchema], default: [] },
  },
  { _id: false }
);

const CapabilityTransactionPaymentSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    mode: { type: String, default: 'none' },
    currency: { type: String, default: null },
    enabledChannels: [{ type: String }],
    defaultChannel: { type: String, default: null },
    collectionStage: { type: String, default: 'submission' },
    settlementType: { type: String, default: 'none' },
    receivingAccount: { type: mongoose.Schema.Types.Mixed, default: null },
    channelConfigs: { type: mongoose.Schema.Types.Mixed, default: {} },
    policies: {
      requirePaymentBeforeSubmit: { type: Boolean, default: false },
      allowPartialPayment: { type: Boolean, default: false },
      allowOverpayment: { type: Boolean, default: false },
      refundPolicy: { type: String, default: 'none' },
    },
  },
  { _id: false }
);

const CapabilityTransactionRemittanceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    accountSource: { type: String, default: 'tenant_global' },
    specificNodeId: { type: String, default: null },
    targetLevelId: { type: String, default: null },
    requireNodeAccount: { type: Boolean, default: false },
    nodeAccountField: { type: String, default: null },
    inheritParentAccount: { type: Boolean, default: false },
    settlementRule: {
      mode: { type: String, default: 'single' },
      splitType: { type: String, default: 'selection' },
      targets: {
        type: [
          new mongoose.Schema(
            {
              nodeId: { type: String, default: null },
              percentage: { type: Number, default: null },
            },
            { _id: false }
          ),
        ],
        default: [],
      },
    },
    routing: {
      byNode: { type: Boolean, default: false },
      bySubmissionValue: { type: Boolean, default: false },
      fallbackAccountId: { type: String, default: null },
    },
  },
  { _id: false }
);

const CapabilityTransactionInvoiceSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    calculationMode: { type: String, default: 'none' },
    currency: { type: String, default: null },
    baseAmount: { type: Number, default: 0 },
    amountSourceField: { type: String, default: null },
    lineItemsEnabled: { type: Boolean, default: false },
    lineItems: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, default: null },
            label: { type: String, default: '' },
            sourceField: { type: String, default: null },
            enabled: { type: Boolean, default: true },
            calculationType: { type: String, default: 'fixed' },
            rate: { type: Number, default: 0 },
            fixedAmount: { type: Number, default: null },
            quantityField: { type: String, default: null },
            baseExpression: { type: String, default: null },
            computedExpression: { type: String, default: null },
            includeInSubtotal: { type: Boolean, default: true },
            conditions: { type: [mongoose.Schema.Types.Mixed], default: [] },
            active: { type: Boolean, default: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    discountsEnabled: { type: Boolean, default: false },
    taxEnabled: { type: Boolean, default: false },
    discounts: {
      enabled: { type: Boolean, default: false },
      mode: { type: String, default: 'none' },
      value: { type: Number, default: 0 },
      expression: { type: String, default: null },
      conditions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    tax: {
      enabled: { type: Boolean, default: false },
      mode: { type: String, default: 'none' },
      value: { type: Number, default: 0 },
      expression: { type: String, default: null },
      conditions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    totals: {
      subtotalExpression: { type: String, default: null },
      discountExpression: { type: String, default: null },
      taxExpression: { type: String, default: null },
      grandTotalExpression: { type: String, default: null },
    },
    invoiceNumbering: {
      mode: { type: String, default: 'auto' },
      prefix: { type: String, default: '' },
      nextNumber: { type: Number, default: 1 },
    },
    presentation: {
      showPaymentInstructions: { type: Boolean, default: true },
      showRemittanceDetails: { type: Boolean, default: true },
      showDueDate: { type: Boolean, default: true },
      showSubtotal: { type: Boolean, default: true },
      showDiscount: { type: Boolean, default: true },
      showTax: { type: Boolean, default: true },
      showGrandTotal: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const CapabilityAutomationRuleConditionSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => randomUUID() },
    sourceType: {
      type: String,
      enum: ['field', 'submission_status', 'workflow_status'],
      default: 'field',
    },
    fieldId: { type: String, default: null },
    statusKey: { type: String, default: null },
    operator: {
      type: String,
      enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'],
      default: 'eq',
    },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const CapabilityAutomationRuleSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => randomUUID() },
    name: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, default: 1 },
    matchMode: {
      type: String,
      enum: ['all', 'any'],
      default: 'all',
    },
    scope: {
      source: {
        type: String,
        enum: ['submission', 'workflow'],
        default: 'submission',
      },
      trigger: {
        type: String,
        enum: ['created', 'updated', 'approved', 'rejected', 'completed', 'manual'],
        default: 'created',
      },
    },
    conditions: {
      type: [CapabilityAutomationRuleConditionSchema],
      default: [],
    },
    actionRefs: { type: [String], default: [] },
    outcome: {
      statusOnMatch: { type: String, default: null },
      note: { type: String, default: '' },
    },
  },
  { _id: false }
);

const CapabilityAutomationConnectedActionSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => randomUUID() },
    name: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    provider: {
      type: String,
      enum: ['internal', 'webhook', 'email', 'slack', 'zapier', 'power_automate'],
      default: 'internal',
    },
    actionType: {
      type: String,
      enum: ['notify', 'status_update', 'integration_sync', 'assign', 'webhook_call'],
      default: 'notify',
    },
    target: { type: String, default: null },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    retryPolicy: {
      enabled: { type: Boolean, default: false },
      maxAttempts: { type: Number, default: 3 },
    },
  },
  { _id: false }
);

const CapabilityAutomationOperationalVisibilitySchema = new mongoose.Schema(
  {
    showRunLog: { type: Boolean, default: true },
    showStatuses: { type: Boolean, default: true },
    showOwners: { type: Boolean, default: true },
    showAuditTrail: { type: Boolean, default: true },
    showRuleMatches: { type: Boolean, default: true },
    showLastRunAt: { type: Boolean, default: true },
  },
  { _id: false }
);

const CapabilitiesSchema = new mongoose.Schema(
  {
    experience: {
      security: {
        type: CapabilityExperienceSecuritySchema,
        default: () => ({}),
      },
      behavior: {
        type: ExperienceBehaviorSchema,
        default: () => ({}),
      },
      previewSubmission: {
        type: ExperiencePreviewSubmissionSchema,
        default: () => ({}),
      },
      distribution: {
        type: ExperienceDistributionSchema,
        default: () => ({}),
      },
      notifications: {
        type: ExperienceNotificationsSchema,
        default: () => ({}),
      },
      compliance: {
        type: CapabilityExperienceComplianceSchema,
        default: () => ({}),
      },
      workflow: {
        type: CapabilityExperienceWorkflowSchema,
        default: () => ({}),
      },
    },
    transaction: {
      payment: {
        type: CapabilityTransactionPaymentSchema,
        default: () => ({}),
      },
      remittance: {
        type: CapabilityTransactionRemittanceSchema,
        default: () => ({}),
      },
      invoice: {
        type: CapabilityTransactionInvoiceSchema,
        default: () => ({}),
      },
    },
    automation: {
      rules: {
        type: [CapabilityAutomationRuleSchema],
        default: [],
      },
      connectedActions: {
        type: [CapabilityAutomationConnectedActionSchema],
        default: [],
      },
      operationalVisibility: {
        type: CapabilityAutomationOperationalVisibilitySchema,
        default: () => ({}),
      },
    },
  },
  { _id: false }
);

const SmartMappingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    autoDetect: { type: Boolean, default: true },
    allowManualOverride: { type: Boolean, default: true },
    fields: {
      phone: { type: String, default: 'phone_number' },
      email: { type: String, default: 'email' },
      fullName: { type: String, default: 'full_name' },
      dob: { type: String, default: 'date_of_birth' },
      joinDate: { type: String, default: 'join_date' },
      eventDate: { type: String, default: 'event_date' },
    },
  },
  { _id: false }
);

// Main project form schema
const ProjectFormSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      unique: true,
      index: true,
    },
    formId: {
      type: String,
      unique: true,
      sparse: true, // Optional, for linking to event_calendar
      index: true,
    },
    formReference: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // Format: #SB-000001 (human-readable sequential reference)
    },
    publicRef: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // URL-safe canonical reference used for public links and embeds
    },
    shareRef: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // Opaque public share reference used by /s/:shareRef
    },
    shareCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      // Short-code share token used by shortener routes (/go/:shortCode)
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    workspaceId: {
      type: String,
      trim: true,
      default: 'ws_default',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    schemaVersion: {
      type: String,
      enum: ['2.0.0'],
      default: '2.0.0',
      required: true,
    },
    identity: {
      type: ProjectIdentitySchema,
      required: true,
    },
    elements: [FormElementSchema],
    layout: {
      type: LayoutSchema,
      default: () => ({}),
    },

    capabilities: {
      type: CapabilitiesSchema,
      default: () => ({}),
    },

    smartMappings: {
      type: SmartMappingsSchema,
      default: () => ({}),
    },

    analytics: {
      profile: {
        type: ProjectAnalysisProfileSchema,
        default: () => ({}),
      },
      views: { type: Number, default: 0 },
      submissions: { type: Number, default: 0 },
      lastAccessed: { type: Date },
      conversionRate: { type: Number, default: 0 },
    },

    ui: {
      type: UISchema,
      default: () => ({}),
    },

    // New access and API-related fields
    slug: {
      type: String,
      unique: true,
      sparse: true, // Optional slug
      trim: true,
    },
    apiToken: {
      type: String,
      default: () => nanoid(),
    },
    webhookURL: {
      type: String,
      default: null,
    },
    publicAccessToken: {
      type: String,
      default: null,
    },

    // Metadata
    metadata: {
      schemaVersion: { type: String, default: '2.0.0' },
      enabledCapabilities: { type: [String], default: [] },
      moduleStudio: {
        type: mongoose.Schema.Types.Mixed,
        default: undefined,
      },
      systemTarget: {
        type: String,
        enum: ['user_profile', 'node_profile', null],
        default: null,
      },
      systemVersion: { type: String, default: null },
      elementsCount: { type: Number, default: 0 },
      hasValidation: { type: Boolean, default: false },
      lastModified: { type: Date, default: Date.now },
      formCategory: { type: String, default: null },
      integrations: {
        type: mongoose.Schema.Types.Mixed,
        default: ['web'],
        set: (values) => {
          if (Array.isArray(values)) {
            return values.map((value) => String(value).toLowerCase());
          }
          if (typeof values === 'string') {
            return [values.toLowerCase()];
          }
          return values;
        },
      },
    },

    // Status and lifecycle
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
    },
    publishedAt: { type: Date },
    archivedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Add plugins
ProjectFormSchema.plugin(toJSON);
ProjectFormSchema.plugin(paginate);
ProjectFormSchema.plugin(tenantPlugin);
ProjectFormSchema.index({ tenantId: 1, workspaceId: 1, deletedAt: 1, updatedAt: -1 });
ProjectFormSchema.index({ tenantId: 1, 'identity.tags': 1 });
ProjectFormSchema.index({ tenantId: 1, 'analytics.profile.domain': 1 });
ProjectFormSchema.index({ tenantId: 1, 'analytics.profile.dataNature': 1 });
ProjectFormSchema.index(
  { tenantId: 1, 'identity.category': 1, 'metadata.systemTarget': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'identity.category': 'system',
      deletedAt: null,
    },
  }
);

/**
 * Generate a unique projectId
 * @returns {string}
 */
const createProjectSlug = (input = '') => {
  if (!input || typeof input !== 'string') {
    return 'project';
  }

  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-|-$/g, '');

  if (!normalized) {
    return 'project';
  }

  return normalized.slice(0, 32);
};

ProjectFormSchema.statics.generateProjectId = function (projectName = '') {
  const slug = createProjectSlug(projectName);
  const suffix = nanoid(6).toLowerCase();
  return `proj_${slug}-${suffix}`;
};

/**
 * Generate canonical URL-safe public reference
 * @returns {string}
 */
ProjectFormSchema.statics.generatePublicRef = function (projectName = '') {
  const slug = createProjectSlug(projectName) || 'form';
  const suffix = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)();
  return `frm_${slug}-${suffix}`;
};

/**
 * Generate opaque share reference (UUID)
 * @returns {string}
 */
ProjectFormSchema.statics.generateShareRef = function () {
  return randomUUID();
};

const shortCodeAlphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const generateShortCode = customAlphabet(shortCodeAlphabet, 8);

/**
 * Generate URL short code for public short links
 * @returns {string}
 */
ProjectFormSchema.statics.generateShareCode = function () {
  return generateShortCode();
};

/**
 * Generate a unique formId
 * @returns {string}
 */
ProjectFormSchema.statics.generateFormId = function () {
  return `form_${nanoid(12)}`;
};

/**
 * Create a new project form
 * @param {Object} projectData - The project form data
 * @param {string} tenantId - The tenant ID
 * @param {ObjectId} createdBy - The user creating the project
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.statics.createProjectForm = async function (
  projectData,
  tenantId,
  createdBy
) {
  // Generate unique project ID
  console.log(
    '🎯 [ProjectForm] Creating project form with elements:',
    projectData
  );
  console.log(
    '🎯 [ProjectForm] Elements count:',
    projectData.elements ? projectData.elements.length : 0
  );

  if (projectData.elements && projectData.elements.length > 0) {
    projectData.elements.forEach((element, index) => {
      console.log(`🎯 [ProjectForm] Element ${index + 1}:`, {
        fullElementJson: JSON.stringify(element, null, 2),
      });
    });
  }

  const projectId = this.generateProjectId(
    projectData?.identity?.name || projectData?.name || ''
  );
  let publicRef = this.generatePublicRef(
    projectData?.identity?.name || projectData?.name || ''
  );
  let shareRef = this.generateShareRef();
  let shareCode = this.generateShareCode();
  let attempts = 0;
  while (attempts < 8) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await this.exists({ publicRef });
    if (!exists) break;
    publicRef = this.generatePublicRef(
      projectData?.identity?.name || projectData?.name || ''
    );
    attempts += 1;
  }

  attempts = 0;
  while (attempts < 8) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await this.exists({ shareRef });
    if (!exists) break;
    shareRef = this.generateShareRef();
    attempts += 1;
  }

  attempts = 0;
  while (attempts < 8) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await this.exists({ shareCode });
    if (!exists) break;
    shareCode = this.generateShareCode();
    attempts += 1;
  }

  // Generate human-readable form reference
  const Counter = require('./counter.model');
  const formReference = await Counter.generateReference('formReference');

  console.log(`🎯 [ProjectForm] Generated reference: ${formReference}`);

  // Prepare the project data
  const projectFormData = {
    ...projectData,
    projectId,
    publicRef,
    shareRef,
    shareCode,
    formReference,
    tenantId,
    createdBy,
    metadata: {
      ...projectData.metadata,
      elementsCount: projectData.elements ? projectData.elements.length : 0,
      hasValidation: projectData.elements
        ? projectData.elements.some(
            (el) =>
              el.properties &&
              el.properties.validation &&
              el.properties.validation.required
          )
        : false,
      lastModified: new Date(),
    },
  };

  const projectForm = new this(projectFormData);
  await projectForm.save();
  return projectForm;
};

/**
 * Check if project name is taken within tenant
 * @param {string} projectName - The project name
 * @param {string} tenantId - The tenant ID
 * @param {ObjectId} [excludeProjectId] - The project ID to exclude from check
 * @returns {Promise<boolean>}
 */
ProjectFormSchema.statics.isProjectNameTaken = async function (
  projectName,
  tenantId,
  excludeProjectId
) {
  const query = {
    'identity.name': projectName,
    tenantId,
    deletedAt: null,
  };

  if (excludeProjectId) {
    query._id = { $ne: excludeProjectId };
  }

  const project = await this.findOne(query);
  return !!project;
};

/**
 * Update analytics when project is viewed
 * @returns {Promise<void>}
 */
ProjectFormSchema.methods.incrementViews = async function () {
  this.analytics.views += 1;
  this.analytics.lastAccessed = new Date();
  await this.save();
};

/**
 * Update analytics when form is submitted
 * @returns {Promise<void>}
 */
ProjectFormSchema.methods.incrementSubmissions = async function () {
  this.analytics.submissions += 1;
  this.analytics.conversionRate =
    this.analytics.views > 0
      ? (this.analytics.submissions / this.analytics.views) * 100
      : 0;
  await this.save();
};

/**
 * Soft delete project
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.softDelete = async function (userId = null) {
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.status = 'archived';
  if (!this.identity || typeof this.identity !== 'object') {
    this.identity = {};
  }
  this.identity.status = 'archived';
  await this.save({ validateBeforeSave: false });
  return this;
};

/**
 * Permanently delete project form and all related data
 * @returns {Promise<Object>}
 */
ProjectFormSchema.methods.permanentlyDelete = async function () {
  const { postgresPool } = require('../config/postgres');
  const projectId = this.projectId;

  // Delete from PostgreSQL
  await postgresPool.query('DELETE FROM form_submissions WHERE project_id = $1', [projectId]);
  await postgresPool.query('DELETE FROM event_calendar WHERE project_id = $1', [projectId]);
  await postgresPool.query('DELETE FROM submission_activity_log WHERE project_id = $1', [projectId]);
  await postgresPool.query('DELETE FROM dead_letter_queue WHERE project_id = $1', [projectId]);

  // Delete from MongoDB
  await this.deleteOne();

  return {
    deleted: true,
    permanent: true,
    projectId,
  };
};

/**
 * Restore soft deleted project
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.restore = async function () {
  // Check if past 14-day grace period
  if (this.deletedAt) {
    const daysSinceDeletion = (Date.now() - this.deletedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDeletion > 14) {
      const ApiError = require('../utils/ApiError');
      const httpStatus = require('http-status');
      throw new ApiError(httpStatus.GONE, 'Form deletion period expired (>14 days). Cannot restore.');
    }
  }

  this.deletedAt = null;
  this.deletedBy = null;
  this.status = 'inactive'; // Don't auto-activate, let user republish
  this.identity.status = 'draft';
  await this.save();
  return this;
};

/**
 * Publish project
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.publish = async function (options = {}) {
  const {
    startDate = null,
    endDate = null,
    // monthsToGenerate is kept for explicit overrides but the new default
    // is the full current calendar year (Jan–Dec), so this value is only
    // used when both startDate AND endDate are explicitly provided.
    monthsToGenerate = null,
    allowBackdating = false,
  } = options;

  this.identity.status = 'published';
  this.publishedAt = new Date();
  this.status = 'active';

  // Auto-generate formId if not set
  if (!this.formId) {
    this.formId = this.constructor.generateFormId();
  }

  // Auto-generate calendar if PERM is enabled
  if (
    this.capabilities?.experience?.compliance?.enabled &&
    this.capabilities?.experience?.compliance?.autoGenerateCalendar
  ) {
    try {
      const { eventCalendarService } = require('../services');

      let baseDate, finalDate;

      if (startDate && endDate) {
        // Explicit range supplied by the admin
        baseDate  = new Date(startDate);
        finalDate = new Date(endDate);
      } else if (startDate && monthsToGenerate) {
        // Explicit start + N months
        baseDate  = new Date(startDate);
        finalDate = new Date(baseDate);
        finalDate.setMonth(finalDate.getMonth() + (monthsToGenerate - 1));
      } else {
        // Default: generate the FULL current calendar year (Jan–Dec).
        // This ensures all 12 months are always available in event_calendar
        // from day one, regardless of when the module was published.
        const now  = new Date();
        const year = now.getFullYear();
        baseDate  = new Date(year, 0, 1);   // 1 Jan
        finalDate = new Date(year, 11, 1);  // 1 Dec
      }

      // Build the month list
      const months = [];
      let cursor = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
      const stop  = new Date(finalDate.getFullYear(), finalDate.getMonth(), 1);

      while (cursor <= stop) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        months.push({ month: `${y}-${m}-01`, year: y });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      // Generate (or upsert) calendar entries for each month
      for (const { month, year } of months) {
        await eventCalendarService.generateCalendarFromForm(this, month, year);
      }

      // eslint-disable-next-line no-console
      console.log(
        `✅ Auto-generated ${months.length}-month calendar for form ${this.projectId}` +
        ` (${months[0]?.month} → ${months[months.length - 1]?.month})`
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('⚠️ Failed to auto-generate calendar:', error.message);
      // Don't fail the publish if calendar generation fails
    }
  }

  await this.save();
  return this;
};

/**
 * Unpublish project without archiving it
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.unpublish = async function () {
  this.identity.status = 'draft';
  this.status = 'inactive';
  this.archivedAt = null;
  await this.save();
  return this;
};

/**
 * Archive project
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.archive = async function () {
  this.identity.status = 'archived';
  this.archivedAt = new Date();
  this.status = 'archived';
  await this.save();
  return this;
};

/**
 * Generate URLs for different accessibility options
 * @param {string} baseUrl - The base URL of the application
 * @returns {Object} Object containing different URL types
 */
ProjectFormSchema.methods.generateAccessibilityUrls = function (
  baseUrl = process.env.FRONTEND_URL || 'https://app.halo.com'
) {
  const urls = {};

  (this.capabilities?.experience?.security?.channels || []).forEach((type) => {
    switch (type) {
      case 'api':
        urls.api = `${baseUrl}/api/v1/forms/${this.projectId}`;
        urls.apiSubmit = `${baseUrl}/api/v1/forms/${this.projectId}/submit`;
        break;
      case 'embedded':
        urls.embedded = `${baseUrl}/embed/${this.projectId}`;
        break;
      case 'javascript':
        urls.javascript = `${baseUrl}/js/forms/${this.projectId}`;
        urls.jsLibrary = `${baseUrl}/js/halo-form.min.js`;
        break;
      case 'mobile':
        urls.mobile = `${baseUrl}/m/${this.projectId}`;
        urls.mobileDeepLink = `halo://form/${this.projectId}`;
        break;
    }
  });

  // Always include the public form URL if published
  if (this.identity?.status === 'published') {
    urls.public = `${baseUrl}/form/${this.publicRef || this.projectId}`;
  }

  return urls;
};

/**
 * Generate embedded HTML code for the form
 * @param {Object} options - Embedding options
 * @returns {string} HTML embed code
 */
ProjectFormSchema.methods.generateEmbedHtml = function (options = {}) {
  const {
    width = '100%',
    height = '600px',
    theme = this.ui?.theme || 'default',
    showBorder = true,
    baseUrl = process.env.FRONTEND_URL || 'https://app.halo.com',
  } = options;

  const embedUrl = `${baseUrl}/embed/${this.projectId}?theme=${theme}`;

  return `<!-- Halo Form Embed: ${this.identity.name} -->
<iframe
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  frameborder="${showBorder ? '1' : '0'}"
  scrolling="auto"
  title="${this.identity.name}"
  loading="lazy"
  allow="clipboard-write"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups">
  <p>Your browser does not support iframes.
    <a href="${embedUrl}" target="_blank">Click here to open the form</a>
  </p>
</iframe>

<!-- Optional: Auto-resize script -->
<script>
  window.addEventListener('message', function(event) {
    if (event.data.type === 'halo-form-resize' && event.data.projectId === '${
      this.projectId
    }') {
      const iframe = document.querySelector('iframe[src*="${this.projectId}"]');
      if (iframe && event.data.height) {
        iframe.style.height = event.data.height + 'px';
      }
    }
  });
</script>`;
};

/**
 * Generate API webhook configuration
 * @param {Object} options - Webhook options
 * @returns {Object} Webhook configuration
 */
ProjectFormSchema.methods.generateWebhookConfig = function (options = {}) {
  const {
    webhookUrl,
    events = ['form.submitted', 'form.updated'],
    secret = null,
    retryAttempts = 3,
    timeout = 30000,
  } = options;

  const baseUrl = process.env.BACKEND_URL || 'https://api.halo.com';

  return {
    projectId: this.projectId,
    webhookEndpoint: webhookUrl,
    events,
    signature: {
      algorithm: 'sha256',
      secret: secret || `halo_${this.projectId}_${Date.now()}`,
      header: 'X-Halo-Signature',
    },
    retry: {
      attempts: retryAttempts,
      backoff: 'exponential',
    },
    timeout,
    apiEndpoints: {
      register: `${baseUrl}/api/v1/forms/${this.projectId}/webhooks`,
      test: `${baseUrl}/api/v1/forms/${this.projectId}/webhooks/test`,
      logs: `${baseUrl}/api/v1/forms/${this.projectId}/webhooks/logs`,
    },
    payloadExample: {
      event: 'form.submitted',
      projectId: this.projectId,
      submissionId: 'sub_xxxxxxxxxxxx',
      timestamp: new Date().toISOString(),
      data: {
        // Form field values will be here
      },
      metadata: {
        userAgent: 'Mozilla/5.0...',
        ipAddress: '192.168.1.1',
        referrer: 'https://example.com',
      },
    },
  };
};

/**
 * Generate JavaScript code for loading the form
 * @param {Object} options - JavaScript loading options
 * @returns {Object} JavaScript code and configuration
 */
ProjectFormSchema.methods.generateJavaScriptLoader = function (options = {}) {
  const {
    containerId = 'halo-form-container',
    theme = this.ui?.theme || 'default',
    autoLoad = true,
    showLoader = true,
    baseUrl = process.env.FRONTEND_URL || 'https://app.halo.com',
  } = options;

  const config = {
    projectId: this.projectId,
    containerId,
    theme,
    apiUrl: `${baseUrl}/api/v1/forms/${this.projectId}`,
    options: {
      autoLoad,
      showLoader,
      responsive: true,
      validation: this.metadata.hasValidation,
      allowMultipleSubmissions:
        this.capabilities?.experience?.behavior?.allowMultipleSubmissions,
    },
  };

  const jsCode = `<!-- Halo Form JavaScript Loader -->
<div id="${containerId}">
  ${showLoader ? '<div class="halo-form-loader">Loading form...</div>' : ''}
</div>

<script src="${baseUrl}/js/halo-form.min.js"></script>
<script>
  // Initialize Halo Form
  document.addEventListener('DOMContentLoaded', function() {
    const haloForm = new HaloForm(${JSON.stringify(config, null, 2)});

    ${autoLoad ? 'haloForm.load();' : '// Call haloForm.load() when ready'}

    // Event listeners
    haloForm.on('loaded', function() {
      console.log('Halo form loaded successfully');
    });

    haloForm.on('submitted', function(data) {
      console.log('Form submitted:', data);
      // Handle successful submission
    });

    haloForm.on('error', function(error) {
      console.error('Form error:', error);
      // Handle errors
    });
  });
</script>

<!-- Optional: Custom styles -->
<style>
  #${containerId} {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
  }

  .halo-form-loader {
    text-align: center;
    padding: 20px;
    color: #666;
  }
</style>`;

  return {
    config,
    jsCode,
    npmInstall: 'npm install @halo/form-sdk',
    cdnUrl: `${baseUrl}/js/halo-form.min.js`,
    documentation: `${baseUrl}/docs/javascript-sdk`,
  };
};

/**
 * Generate complete integration guide
 * @param {string} baseUrl - The base URL of the application
 * @returns {Object} Complete integration options
 */
ProjectFormSchema.methods.generateIntegrationGuide = function (
  baseUrl = process.env.FRONTEND_URL || 'https://app.halo.com'
) {
  const urls = this.generateAccessibilityUrls(baseUrl);

  return {
    projectInfo: {
      projectId: this.projectId,
      name: this.identity.name,
      status: this.identity.status,
      accessibility: this.capabilities?.experience?.security?.channels || [],
      security: this.capabilities?.experience?.security?.mode,
    },
    urls,
    embed: {
      html: this.generateEmbedHtml(),
      responsive: this.generateEmbedHtml({ width: '100%', height: 'auto' }),
      minimal: this.generateEmbedHtml({ showBorder: false, theme: 'minimal' }),
    },
    javascript: this.generateJavaScriptLoader(),
    webhook: this.generateWebhookConfig(),
    api: {
      endpoint: urls.api,
      method: 'GET',
      authentication:
        this.capabilities?.experience?.security?.mode === 'private'
          ? 'Bearer token required'
          : 'Public access',
      submitEndpoint: urls.apiSubmit,
      submitMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.capabilities?.experience?.security?.mode === 'private' && {
          Authorization: 'Bearer YOUR_API_TOKEN',
        }),
      },
    },
  };
};

// Pre-save middleware
ProjectFormSchema.pre('save', function (next) {
  if (this.identity?.category === 'system') {
    if (!this.metadata.systemTarget) {
      return next(new Error('System forms must define metadata.systemTarget'));
    }
    if (this.capabilities?.experience?.security?.mode !== 'private') {
      if (!this.capabilities) this.capabilities = {};
      if (!this.capabilities.experience) this.capabilities.experience = {};
      if (!this.capabilities.experience.security) this.capabilities.experience.security = {};
      this.capabilities.experience.security.mode = 'private';
    }
    if (!this.metadata.systemVersion) {
      this.metadata.systemVersion = '1.0.0';
    }
  }

  // Update metadata on save
  this.metadata.lastModified = new Date();

  // Update elements count
  if (this.elements) {
    this.metadata.elementsCount = this.elements.length;
    this.metadata.hasValidation = this.elements.some(
      (el) =>
        el.properties &&
        el.properties.validation &&
        el.properties.validation.required
    );
  }

  next();
});

module.exports = mongoose.model('ProjectForm', ProjectFormSchema);
