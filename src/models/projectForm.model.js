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

// Schema for configuration data from modal
const ProjectConfigurationSchema = new mongoose.Schema({
  projectName: { type: String, required: true, trim: true },
  tags: [{ type: String, trim: true }], // Categories like CRM, Sales, etc.
  analysisProfile: {
    type: ProjectAnalysisProfileSchema,
    default: undefined,
  },
  publicSecureMode: {
    type: String,
    enum: ['off', 'single_qr_passwordless'],
    default: 'off',
  },
  accessibility: [
    {
      type: String,
      enum: ['api', 'embedded', 'javascript', 'mobile'],
      trim: true,
    },
  ],
  security: {
    type: String,
    enum: ['public', 'private'],
    default: 'private',
  },
});

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
      enum: ['SUBMIT', 'REVIEW', 'APPROVE', 'ESCALATE', 'NOTIFY'],
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

    // Service-level agreement
    sla: {
      hours:          { type: Number, default: 48 },
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
      enum: ['submission', 'manual'],
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
const UserSettingsSchema = new mongoose.Schema(
  {
    access: {
      allowedRoles: [String],
      allowedUsers: [String],
      restrictByLocation: { type: Boolean, default: false },
      allowedCountries: [String],
    },
    behavior: {
      allowMultipleSubmissions: { type: Boolean, default: true },
      enableProgressSave: { type: Boolean, default: true },
      autoSave: { type: Boolean, default: false },
      submitOnComplete: { type: Boolean, default: true },
    },
    distribution: {
      enableSharing: { type: Boolean, default: true },
      allowEmbedding: { type: Boolean, default: false },
      generateQR: { type: Boolean, default: false },
      enableDeepLinking: { type: Boolean, default: false },
    },
    notifications: {
      emailOnSubmission: { type: Boolean, default: false },
      notifyOwner: { type: Boolean, default: true },
      customEmails: [String],
      smsNotifications: { type: Boolean, default: false },
    },
    ui: {
      theme: { type: String, default: 'default' },
      primaryColor: { type: String, default: '#3b82f6' },
      layout: {
        type: String,
        enum: ['single', 'multi-step'],
        default: 'single',
      },
      showProgressBar: { type: Boolean, default: true },
    },
    builder: {
      gridSize: { type: Number, default: 12 },
      snapToGrid: { type: Boolean, default: true },
      showGridLines: { type: Boolean, default: false },
      autoArrange: { type: Boolean, default: false },
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Configuration from modal
    configuration: {
      type: ProjectConfigurationSchema,
      required: true,
    },

    // Form structure and elements
    elements: [FormElementSchema],
    style: { type: String, default: 'default' },
    wizardMode: { type: Boolean, default: false },
    columnSpans: { type: mongoose.Schema.Types.Mixed, default: {} },

    // User settings
    userSettings: UserSettingsSchema,

    // ✨ NEW: PERM Settings (Flexible Calendar & Compliance Tracking)
    permSettings: {
      enabled: { type: Boolean, default: false },
      // Tracking mode: 'none' (month-only), 'daily', or 'weekly'
      trackingMode: {
        type: String,
        enum: ['none', 'daily', 'weekly'],
        default: 'none',
      },
      // Configuration for daily tracking mode
      dailyConfig: {
        activeDays: [{ type: Number }], // [0-6] where 0=Sunday, 1=Monday, etc.
        frequencyPerDay: { type: Number, default: 1 }, // 1x, 2x, 3x, 4x per day
        skipWeekends: { type: Boolean, default: false },
        skipHolidays: { type: Boolean, default: false },
      },
      // Configuration for weekly tracking mode
      weeklyConfig: {
        days: [
          {
            day: { type: Number }, // 0-6 (Sunday-Saturday)
            name: { type: String }, // "Sunday", "Monday", etc.
            frequency: {
              type: String,
              enum: ['weekly', 'biweekly', 'monthly'],
            },
            occurrences: { type: Number }, // For biweekly/monthly: how many times in month
            enabled: { type: Boolean, default: true },
          },
        ],
      },
      // Common settings
      requireNodeId: { type: Boolean, default: true },
      requireMonth: { type: Boolean, default: true },
      trackCompliance: { type: Boolean, default: true },
      autoGenerateCalendar: { type: Boolean, default: true },
      autoLockMonthEnd: { type: Boolean, default: true },
      // Legacy field (kept for backward compatibility)
      eventTypes: [{ type: String }],
      // Optional: Require calendar template before submissions
      calendarRequired: { type: Boolean, default: false },
      // Calendar generation options for backdating
      calendarGeneration: {
        startDate: { type: String },
        endDate: { type: String },
        allowBackdating: { type: Boolean, default: false },
        monthsToGenerate: { type: Number },
      },
    },

    // ─────────────────────────────────────────────────────────────────────
    // WORKFLOW CONFIGURATIONS
    // An ordered list of workflow add-ons attached to this module.
    // Each add-on is independently enabled/disabled and can model anything
    // from a simple email notification to a multi-step approval chain.
    // ─────────────────────────────────────────────────────────────────────
    workflows: {
      type: [WorkflowSchema],
      default: [],
    },

    // Payment configuration (for forms with financial tag)
    paymentConfig: {
      enabled: { type: Boolean, default: false },
      enabledChannels: [{ type: String }], // ['sabypipe', 'paystack', etc.]
      defaultChannel: { type: String, default: 'sabypipe' },
      channelConfigs: {
        sabypipe: { type: mongoose.Schema.Types.Mixed },
        paystack: { type: mongoose.Schema.Types.Mixed },
        psb9mobile: { type: mongoose.Schema.Types.Mixed },
        flutterwave: { type: mongoose.Schema.Types.Mixed },
        premiumtrust: { type: mongoose.Schema.Types.Mixed },
        monnify: { type: mongoose.Schema.Types.Mixed },
        remita: { type: mongoose.Schema.Types.Mixed },
        seerbit: { type: mongoose.Schema.Types.Mixed },
      },
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
      version: { type: String, default: '1.0.0' },
      formCategory: {
        type: String,
        enum: ['standard', 'system'],
        default: 'standard',
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
      deploymentStatus: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
      },
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

    // Analytics and usage
    analytics: {
      views: { type: Number, default: 0 },
      submissions: { type: Number, default: 0 },
      lastAccessed: { type: Date },
      conversionRate: { type: Number, default: 0 },
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
ProjectFormSchema.index({ tenantId: 1, 'configuration.tags': 1 });
ProjectFormSchema.index({ tenantId: 1, 'configuration.analysisProfile.domain': 1 });
ProjectFormSchema.index({ tenantId: 1, 'configuration.analysisProfile.dataNature': 1 });
ProjectFormSchema.index(
  { tenantId: 1, 'metadata.formCategory': 1, 'metadata.systemTarget': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'metadata.formCategory': 'system',
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
    projectData?.configuration?.projectName || projectData?.name || ''
  );
  let publicRef = this.generatePublicRef(
    projectData?.configuration?.projectName || projectData?.name || ''
  );
  let shareRef = this.generateShareRef();
  let shareCode = this.generateShareCode();
  let attempts = 0;
  while (attempts < 8) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await this.exists({ publicRef });
    if (!exists) break;
    publicRef = this.generatePublicRef(
      projectData?.configuration?.projectName || projectData?.name || ''
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
    'configuration.projectName': projectName,
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
  this.metadata.deploymentStatus = 'archived';
  await this.save();
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
  this.metadata.deploymentStatus = 'draft';
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

  this.metadata.deploymentStatus = 'published';
  this.publishedAt = new Date();
  this.status = 'active';

  // Auto-generate formId if not set
  if (!this.formId) {
    this.formId = this.constructor.generateFormId();
  }

  // Auto-generate calendar if PERM is enabled
  if (this.permSettings?.enabled && this.permSettings?.autoGenerateCalendar) {
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
 * Archive project
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.archive = async function () {
  this.metadata.deploymentStatus = 'archived';
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

  this.configuration.accessibility.forEach((type) => {
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
  if (this.metadata.deploymentStatus === 'published') {
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
    theme = this.userSettings.ui.theme || 'default',
    showBorder = true,
    baseUrl = process.env.FRONTEND_URL || 'https://app.halo.com',
  } = options;

  const embedUrl = `${baseUrl}/embed/${this.projectId}?theme=${theme}`;

  return `<!-- Halo Form Embed: ${this.configuration.projectName} -->
<iframe
  src="${embedUrl}"
  width="${width}"
  height="${height}"
  frameborder="${showBorder ? '1' : '0'}"
  scrolling="auto"
  title="${this.configuration.projectName}"
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
    theme = this.userSettings.ui.theme || 'default',
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
        this.userSettings.behavior.allowMultipleSubmissions,
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
      name: this.configuration.projectName,
      status: this.metadata.deploymentStatus,
      accessibility: this.configuration.accessibility,
      security: this.configuration.security,
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
        this.configuration.security === 'private'
          ? 'Bearer token required'
          : 'Public access',
      submitEndpoint: urls.apiSubmit,
      submitMethod: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.configuration.security === 'private' && {
          Authorization: 'Bearer YOUR_API_TOKEN',
        }),
      },
    },
  };
};

// Pre-save middleware
ProjectFormSchema.pre('save', function (next) {
  if (this.metadata?.formCategory === 'system') {
    if (!this.metadata.systemTarget) {
      return next(new Error('System forms must define metadata.systemTarget'));
    }
    if (this.configuration?.security !== 'private') {
      this.configuration.security = 'private';
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
