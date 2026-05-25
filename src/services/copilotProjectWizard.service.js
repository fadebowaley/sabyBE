const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const projectFormService = require('./projectForm.service');
const copilotSessionContextService = require('./copilotSessionContext.service');

const DOMAIN_TAGS = {
  finance: ['financial', 'payment', 'collection'],
  attendance: ['attendance', 'operations'],
  hr: ['hr', 'people'],
  healthcare: ['healthcare', 'operations'],
  education: ['education', 'operations'],
  government: ['government', 'compliance'],
  retail: ['retail', 'sales'],
  nonprofit: ['nonprofit', 'operations'],
  generic: ['operations'],
};

const makeId = (prefix, i) => `${prefix}_${String(i + 1).padStart(2, '0')}`;

const slug = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'field';

const titleCase = (value = '') =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());

const inferDomain = (prompt = '') => {
  const t = String(prompt || '').toLowerCase();
  if (/(payment|finance|offering|tithe|subscription|amount|revenue)/.test(t)) return 'finance';
  if (/(attendance|member|service report|church)/.test(t)) return 'attendance';
  if (/(hr|employee|staff|payroll|leave)/.test(t)) return 'hr';
  if (/(patient|clinic|hospital|medical)/.test(t)) return 'healthcare';
  if (/(school|student|course|class|exam)/.test(t)) return 'education';
  if (/(government|agency|public sector|citizen)/.test(t)) return 'government';
  if (/(retail|store|inventory|product|order)/.test(t)) return 'retail';
  if (/(ngo|nonprofit|charity|faith|church)/.test(t)) return 'nonprofit';
  return 'generic';
};

const inferDefaultProjectName = (prompt = '', domain = 'generic') => {
  const p = String(prompt || '').trim();
  const m = p.match(/\b(?:create|build|design|setup)\s+(?:a|an)?\s*(.+?)(?:\s+form|\s+module|\s+project|$)/i);
  if (m?.[1]) return titleCase(m[1]);
  const byDomain = {
    finance: 'Financial Collection Module',
    attendance: 'Attendance Module',
    hr: 'HR Operations Module',
    healthcare: 'Healthcare Intake Module',
    education: 'Education Reporting Module',
    government: 'Public Service Module',
    retail: 'Retail Operations Module',
    nonprofit: 'Community Operations Module',
    generic: 'Operations Module',
  };
  return byDomain[domain] || byDomain.generic;
};

const parseExplicitFields = (prompt = '') => {
  const p = String(prompt || '');
  const m = p.match(/\bfields?\s*[:\-]\s*([^.]+)/i);
  if (!m?.[1]) return [];
  return m[1]
    .split(/,| and /i)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 40);
};

const inferFieldType = (label = '') => {
  const t = String(label || '').toLowerCase();
  if (/(email)/.test(t)) return 'email';
  if (/(phone|mobile|tel)/.test(t)) return 'phone';
  if (/(date|day|month|year|time)/.test(t)) return 'datepicker';
  if (/(amount|price|cost|total|number|qty|quantity|count)/.test(t)) return 'number';
  if (/(status|type|category|method|channel|gender|role)/.test(t)) return 'dropdown';
  if (/(description|note|comment|remark|address)/.test(t)) return 'textarea';
  if (/(file|upload|document|attachment)/.test(t)) return 'fileupload';
  return 'text';
};

const defaultOptionsForLabel = (label = '') => {
  const t = String(label || '').toLowerCase();
  if (/(payment method|channel)/.test(t)) return ['Cash', 'POS', 'Transfer', 'Other'];
  if (/(status)/.test(t)) return ['Pending', 'Approved', 'Rejected'];
  if (/(gender)/.test(t)) return ['Male', 'Female', 'Other'];
  return [];
};

const defaultDomainFields = (domain = 'generic') => {
  const map = {
    finance: ['Payer Name', 'Amount', 'Payment Method', 'Transaction Date', 'Reference', 'Notes'],
    attendance: ['Service Date', 'Node', 'Attendance Count', 'Service Type', 'Remarks'],
    hr: ['Employee Name', 'Employee ID', 'Department', 'Request Type', 'Request Date', 'Notes'],
    healthcare: ['Patient Name', 'Patient ID', 'Visit Date', 'Diagnosis', 'Prescription Notes'],
    education: ['Student Name', 'Student ID', 'Class', 'Subject', 'Score', 'Exam Date'],
    government: ['Service Category', 'Citizen Name', 'Request Date', 'Location', 'Status', 'Remarks'],
    retail: ['Product Name', 'Category', 'Quantity', 'Unit Price', 'Total Amount', 'Sale Date'],
    nonprofit: ['Beneficiary Name', 'Program', 'Activity Date', 'Outcome', 'Notes'],
    generic: ['Name', 'Category', 'Date', 'Status', 'Notes'],
  };
  return map[domain] || map.generic;
};

const buildElements = (fieldLabels = []) => {
  const dedup = [];
  const seen = new Set();
  fieldLabels.forEach((raw) => {
    const label = titleCase(raw);
    if (!label) return;
    const key = slug(label);
    if (seen.has(key)) return;
    seen.add(key);
    dedup.push(label);
  });

  return dedup.map((label, index) => {
    const type = inferFieldType(label);
    const id = `${slug(label)}_${String(index + 1).padStart(2, '0')}`;
    const element = {
      id,
      type,
      properties: {
        label,
        required: index < 4,
        placeholder: `Enter ${label.toLowerCase()}`,
      },
    };
    if (type === 'dropdown') {
      element.properties.options = defaultOptionsForLabel(label);
    }
    if (type === 'fileupload') {
      element.properties.acceptedTypes = '.jpg,.png,.pdf';
    }
    return element;
  });
};

const buildDefaultPermSettings = (enabled = false) => ({
  enabled: Boolean(enabled),
  trackingMode: enabled ? 'daily' : 'none',
  dailyConfig: {
    activeDays: [1, 2, 3, 4, 5],
    frequencyPerDay: 1,
    skipWeekends: false,
    skipHolidays: false,
  },
  weeklyConfig: { days: [] },
  requireNodeId: true,
  requireMonth: true,
  trackCompliance: true,
  autoGenerateCalendar: true,
  autoLockMonthEnd: false,
  calendarRequired: false,
});

const buildDefaultWorkflow = (enabled = false) => {
  if (!enabled) return [];
  return [
    {
      id: makeId('wf', 0),
      name: 'Default Approval Workflow',
      type: 'custom',
      enabled: true,
      triggerOn: 'submission',
      steps: [
        {
          id: makeId('step', 0),
          name: 'Initial Review',
          stepOrder: 0,
          actionType: 'REVIEW',
          type: 'review',
          assigneeType: 'role',
          assigneeRoles: [],
          assigneeUsers: [],
          sla: { hours: 24 },
          requiredApprovals: 1,
        },
        {
          id: makeId('step', 1),
          name: 'Final Approval',
          stepOrder: 1,
          actionType: 'APPROVE',
          type: 'approval',
          assigneeType: 'role',
          assigneeRoles: [],
          assigneeUsers: [],
          sla: { hours: 48 },
          requiredApprovals: 1,
        },
      ],
    },
  ];
};

const buildDraftFromPrompt = ({ prompt, projectName, options = {} }) => {
  const domain = inferDomain(prompt);
  const baseName = titleCase(projectName || inferDefaultProjectName(prompt, domain));
  const explicitFields = parseExplicitFields(prompt);
  const fieldLabels =
    explicitFields.length > 0 ? explicitFields : defaultDomainFields(domain);
  const elements = buildElements(fieldLabels);

  const autoTags = DOMAIN_TAGS[domain] || DOMAIN_TAGS.generic;
  const optionTags = Array.isArray(options.tags) ? options.tags : [];
  const optionExtraTags = Array.isArray(options.additionalTags)
    ? options.additionalTags
    : [];
  const tags = Array.from(
    new Set(
      [...autoTags, ...optionTags, ...optionExtraTags]
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const experienceSecurity = options.capabilities?.experience?.security || {};
  const experienceWorkflow = options.capabilities?.experience?.workflow || {};
  const experienceCompliance = options.capabilities?.experience?.compliance || {};
  const transaction = options.capabilities?.transaction || {};
  const automation = options.capabilities?.automation || {};

  const accessibility =
    Array.isArray(experienceSecurity.channels) &&
    experienceSecurity.channels.length
      ? experienceSecurity.channels
    : ['api'];

  const workflowEnabled = Boolean(
    experienceWorkflow.enabled ||
      (Array.isArray(experienceWorkflow.workflows) &&
        experienceWorkflow.workflows.length > 0)
  );
  const permEnabled = Boolean(experienceCompliance.enabled);
  const publishNow = Boolean(options.publishNow);

  const draft = {
    schemaVersion: '2.0.0',
    identity: {
      name: baseName,
      description: '',
      category: 'standard',
      tags,
      status: publishNow ? 'published' : 'draft',
    },
    elements,
    layout: {
      style: options.layout?.style || 'default',
      wizardMode: options.layout?.wizardMode !== false,
      grid: {
        columns: options.layout?.grid?.columns || 12,
        columnSpans: options.layout?.grid?.columnSpans || {},
      },
      builder: options.layout?.builder || {},
    },
    capabilities: {
      experience: {
        security: {
          mode: experienceSecurity.mode === 'public' ? 'public' : 'private',
          publicSecureMode: experienceSecurity.publicSecureMode || 'off',
          access: experienceSecurity.access || {},
          authentication: experienceSecurity.authentication || {
            requireLogin: true,
            allowAnonymous: false,
            requireOtp: false,
          },
          submissionProtection: experienceSecurity.submissionProtection || {
            preventDuplicateSubmission: false,
            duplicateCheckField: null,
            rateLimitEnabled: false,
            maxSubmissionsPerUser: null,
          },
          channels: accessibility,
        },
        behavior: options.capabilities?.experience?.behavior || {},
        distribution: options.capabilities?.experience?.distribution || {},
        notifications: options.capabilities?.experience?.notifications || {},
        compliance:
          Object.keys(experienceCompliance).length > 0
            ? experienceCompliance
            : buildDefaultPermSettings(permEnabled),
        workflow: {
          enabled: workflowEnabled,
          approvalMode:
            experienceWorkflow.approvalMode ||
            (workflowEnabled ? 'approval' : 'none'),
          triggerOn: experienceWorkflow.triggerOn || 'submission',
          workflows: Array.isArray(experienceWorkflow.workflows)
            ? experienceWorkflow.workflows
            : buildDefaultWorkflow(workflowEnabled),
        },
      },
      transaction: {
        payment: transaction.payment || {},
        remittance: transaction.remittance || {},
        invoice: transaction.invoice || {},
      },
      automation: {
        rules: automation.rules || [],
        connectedActions: automation.connectedActions || [],
        operationalVisibility: automation.operationalVisibility || {},
      },
    },
    smartMappings: {
      enabled: true,
      autoDetect: true,
      allowManualOverride: true,
      fields: {},
    },
    analytics: {
      profile: options.analytics?.profile || {},
    },
    ui: options.ui || {},
    metadata: {
      schemaVersion: '2.0.0',
      elementsCount: elements.length,
      hasValidation: true,
      batchMode: 'single_prompt',
      integrations: accessibility,
      enabledCapabilities: [],
    },
  };

  return {
    draft,
    summary: {
      inferredDomain: domain,
      projectName: draft.identity.name,
      tags: draft.identity.tags,
      fieldsCount: draft.elements.length,
      firstFields: draft.elements.slice(0, 8).map((el) => ({
        id: el.id,
        type: el.type,
        label: el?.properties?.label || el.id,
      })),
      workflowEnabled:
        workflowEnabled ||
        (draft.capabilities.experience.workflow.workflows || []).length > 0,
      permEnabled,
      publishNow,
    },
  };
};

const generateProjectWizardDraft = async ({
  tenantId,
  actorUserId,
  prompt,
  projectName,
  options = {},
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!actorUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'actorUserId is required');
  }
  if (!String(prompt || '').trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'prompt is required');
  }
  const built = buildDraftFromPrompt({ prompt, projectName, options });
  return {
    ...built,
    checklist: {
      hasProjectName: Boolean(built?.draft?.identity?.name),
      hasFields: Array.isArray(built?.draft?.elements) && built.draft.elements.length > 0,
      hasAccess: Array.isArray(
        built?.draft?.capabilities?.experience?.security?.channels
      ),
      canFinalize: true,
    },
    suggestedNextPrompts: [
      'add workflow with finance manager approval',
      'set this module to private security',
      'include weekly PERM tracking with compliance',
      'publish this module after creation',
    ],
  };
};

const finalizeProjectWizardDraft = async ({
  tenantId,
  actorUserId,
  draft,
  publish = false,
  publishOptions = {},
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!actorUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'actorUserId is required');
  }
  if (!draft || typeof draft !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'draft is required');
  }
  if (!draft.identity || !draft.identity.name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'draft.identity.name is required');
  }

  const created = await projectFormService.createProjectForm(
    draft,
    tenantId,
    actorUserId
  );

  let finalDoc = created;
  if (publish) {
    finalDoc = await projectFormService.publishProjectForm(created._id, publishOptions);
  }

  const schemaProfile = await projectFormService.getProjectSchemaProfile(
    finalDoc.projectId
  );

  return {
    projectId: finalDoc.projectId,
    projectFormId: finalDoc._id,
    deploymentStatus: finalDoc?.identity?.status,
    status: finalDoc.status,
    projectName: finalDoc?.identity?.name,
    published: Boolean(publish),
    schemaProfile,
  };
};

const saveProjectWizardDraft = async ({
  tenantId,
  actorUserId,
  draft,
  summary = {},
  prompt = null,
}) => {
  if (!tenantId) throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  if (!actorUserId) throw new ApiError(httpStatus.BAD_REQUEST, 'actorUserId is required');
  if (!draft || typeof draft !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'draft is required');
  }

  const existing = await copilotSessionContextService.getSessionContext({
    tenantId,
    userId: actorUserId,
  });
  const context = {
    ...(existing?.context_json || {}),
    projectWizard: {
      draft,
      summary,
      prompt,
      savedAt: new Date().toISOString(),
    },
  };
  const row = await copilotSessionContextService.upsertSessionContext({
    tenantId,
    userId: actorUserId,
    currentProjectId: null,
    currentNodeId: null,
    recentEntities: existing?.recent_entities || [],
    context,
    lastIntent: 'project_wizard_draft_saved',
  });
  return row?.context_json?.projectWizard || context.projectWizard;
};

const getProjectWizardDraft = async ({ tenantId, actorUserId }) => {
  if (!tenantId) throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  if (!actorUserId) throw new ApiError(httpStatus.BAD_REQUEST, 'actorUserId is required');
  const existing = await copilotSessionContextService.getSessionContext({
    tenantId,
    userId: actorUserId,
  });
  return existing?.context_json?.projectWizard || null;
};

const clearProjectWizardDraft = async ({ tenantId, actorUserId }) => {
  if (!tenantId) throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  if (!actorUserId) throw new ApiError(httpStatus.BAD_REQUEST, 'actorUserId is required');
  const existing = await copilotSessionContextService.getSessionContext({
    tenantId,
    userId: actorUserId,
  });
  const context = { ...(existing?.context_json || {}) };
  delete context.projectWizard;
  await copilotSessionContextService.upsertSessionContext({
    tenantId,
    userId: actorUserId,
    currentProjectId: null,
    currentNodeId: null,
    recentEntities: existing?.recent_entities || [],
    context,
    lastIntent: 'project_wizard_draft_cleared',
  });
  return { cleared: true };
};

module.exports = {
  generateProjectWizardDraft,
  finalizeProjectWizardDraft,
  saveProjectWizardDraft,
  getProjectWizardDraft,
  clearProjectWizardDraft,
  __private: {
    buildDraftFromPrompt,
    parseExplicitFields,
    inferDomain,
    inferFieldType,
  },
};
