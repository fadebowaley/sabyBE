const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const TenantKnowledgeArtifact = require('../models/tenantKnowledgeArtifact.model');
const ExecutiveIntelligenceAuditEvent = require('../models/executiveIntelligenceAuditEvent.model');
const ProjectForm = require('../models/projectForm.model');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const Permission = require('../models/permission.model');
const Nodes = require('../models/node.model');
const Level = require('../models/level.model');
const Structures = require('../models/structure.model');
const TenantConfig = require('../models/tenantConfig.model');
const WorkspaceInvitation = require('../models/workspaceInvitation.model');
const TenantOnboarding = require('../models/tenantOnboarding.model');
const ExecutiveSemanticMemory = require('../models/executiveSemanticMemory.model');
const submissionReportService = require('./submissionReport.service');
const executiveReportRenderer = require('./executiveReportRenderer.service');
const executiveReportExportService = require('./executiveReportExport.service');
const executiveGeneratedAnalysisPolicy = require('./executiveGeneratedAnalysisPolicy.service');
const executiveGeneratedSqlExecutor = require('./executiveGeneratedSqlExecutor.service');
const executiveSandboxRunner = require('./executiveSandboxRunner.service');

const SCHEMA_VERSION = '1.0';
const ARTIFACT_WARN_BYTES = 8 * 1024 * 1024;
const ARTIFACT_BLOCK_BYTES = 12 * 1024 * 1024;

const CANONICAL_OPERATIONS = [
  'SUMMARIZE',
  'ANALYZE',
  'AGGREGATE',
  'COMPARE',
  'TREND',
  'RANK',
  'FILTER',
  'EXPLAIN',
  'DETECT_ANOMALY',
  'FORECAST',
  'CORRELATE',
  'SEGMENT',
  'RECOMMEND',
  'GENERATE_REPORT',
  'EXPORT',
  'DRILL_DOWN',
  'VALIDATE',
];

const ERROR_CODES = [
  'UNAUTHORIZED_SCOPE',
  'UNKNOWN_BUSINESS_TERM',
  'AMBIGUOUS_METRIC',
  'NO_DATA',
  'STALE_TENANT_ARTIFACT',
  'INVALID_EXECUTION_PLAN',
  'QUERY_REJECTED',
  'QUERY_TIMEOUT',
  'ROW_LIMIT_EXCEEDED',
  'SANDBOX_TIMEOUT',
  'SANDBOX_POLICY_VIOLATION',
  'ANALYSIS_FAILED',
  'RENDER_FAILED',
  'OUTPUT_TOO_LARGE',
  'MODEL_TIMEOUT',
  'MODEL_INVALID_RESPONSE',
  'DEPENDENCY_UNAVAILABLE',
];

const TOOL_REGISTRY = [
  {
    toolKey: 'load_tenant_artifact',
    version: 1,
    enabled: true,
    requiredPermissions: ['executiveintelligence:read'],
    allowedAgentTypes: ['REQUEST_COORDINATOR'],
    timeoutSeconds: 10,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_report',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['DATA_RETRIEVAL'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_aggregation',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['DATA_RETRIEVAL'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_multi_project_form_comparison',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 45,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_ranking',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_trend',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_period_comparison',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_anomalies',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'get_project_form_analysis',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'execute_generated_sql',
    version: 1,
    enabled: true,
    requiredPermissions: ['submission:read'],
    allowedAgentTypes: ['DATA_RETRIEVAL', 'ANALYTICS'],
    timeoutSeconds: 10,
    tenantConfigurable: false,
  },
  {
    toolKey: 'profile_dataset',
    version: 1,
    enabled: false,
    requiredPermissions: ['analytics:read'],
    allowedAgentTypes: ['ANALYTICS'],
    timeoutSeconds: 30,
    tenantConfigurable: false,
  },
  {
    toolKey: 'render_markdown_report',
    version: 1,
    enabled: true,
    requiredPermissions: ['executiveintelligence:read'],
    allowedAgentTypes: ['REPORT_RENDERER'],
    timeoutSeconds: 10,
    tenantConfigurable: false,
  },
];

const DEFAULT_BUDGETS = {
  maxDatabaseQueries: 10,
  maxRows: 5000,
  maxExecutionSeconds: 60,
  maxSandboxMemoryMb: 0,
  maxOutputFiles: 1,
};

const DEFAULT_POLICY_SNAPSHOT = {
  rawSqlAllowed: false,
  generatedCodeAllowed: false,
  readOnlyDataAccess: true,
  generatedAnalysis: executiveGeneratedAnalysisPolicy.getPolicySnapshot(),
  maxRows: DEFAULT_BUDGETS.maxRows,
  requireWorkspaceActor: true,
  requireBackendReferenceValidation: true,
  allowSubmitterOnlyIntelligence: false,
};

const EXECUTION_PLAN_SCHEMA_VERSION = '1.0';
const EXECUTIVE_REPORT_MAX_ROWS = 100;
const EXECUTIVE_REPORT_DEFAULT_ROWS = 75;
const EXECUTIVE_AGGREGATION_MAX_GROUPS = 50;
const EXECUTIVE_AGGREGATION_DEFAULT_GROUPS = 25;
const EXECUTIVE_RANKING_MAX_GROUPS = 25;
const EXECUTIVE_RANKING_DEFAULT_GROUPS = 10;
const EXECUTIVE_TREND_MAX_PERIODS = 60;
const EXECUTIVE_TREND_DEFAULT_PERIODS = 24;
const REDACTED_VALUE = '[redacted]';
const REDACTED_FILE_VALUE = '[redacted:file]';
const SUBMISSION_STATUS_VALUES = ['submitted', 'pending', 'approved', 'rejected', 'completed', 'failed'];
const SUBMISSION_STATUS_SET = new Set(SUBMISSION_STATUS_VALUES);

const normalizeId = (value) => {
  if (!value) return null;
  return String(value._id || value.id || value.userId || value).trim() || null;
};

const compactDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const hashValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return `sha256:${crypto.createHash('sha256').update(normalized).digest('hex')}`;
};

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const compactArray = (values = [], limit = 1000) =>
  unique((Array.isArray(values) ? values : []).map((value) => String(value || '').trim())).slice(0, limit);

const normalizeTerm = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildSemanticMemoryId = () =>
  `sem_${crypto
    .createHash('sha256')
    .update(`${Date.now()}:${process.hrtime.bigint()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 24)}`;

const sanitizeSemanticAliases = (aliases = []) =>
  compactArray(
    (Array.isArray(aliases) ? aliases : [])
      .map((alias) => String(alias || '').trim())
      .filter(Boolean),
    25
  );

const sanitizeSemanticEvidence = (evidence = []) =>
  (Array.isArray(evidence) ? evidence : [])
    .filter((item) => item && typeof item === 'object')
    .slice(0, 10)
    .map((item) => ({
      type: String(item.type || 'note').slice(0, 80),
      value: String(item.value || '').slice(0, 500),
      source: item.source ? String(item.source).slice(0, 160) : undefined,
    }));

const compileApprovedSemanticMemory = (records = []) => {
  const activeRecords = records.filter((record) => record.approvalStatus === 'approved' && record.status !== 'inactive');
  const glossary = activeRecords
    .filter((record) => record.type === 'glossary_term')
    .map((record) => ({
      memory_id: record.memoryId,
      term: record.term,
      normalized_term: record.normalizedTerm,
      definition: record.definition || null,
      aliases: sanitizeSemanticAliases(record.aliases),
      target_type: record.targetType || 'general',
      target_ref: record.targetRef || null,
      confidence: Number(record.confidence || 0),
      evidence_count: (record.evidence || []).length,
      approved_at: compactDate(record.reviewedAt || record.updatedAt),
    }));
  const synonyms = activeRecords
    .filter((record) => ['synonym', 'metric_alias'].includes(record.type))
    .map((record) => ({
      memory_id: record.memoryId,
      term: record.term,
      normalized_term: record.normalizedTerm,
      aliases: sanitizeSemanticAliases(record.aliases),
      target_type: record.targetType || 'general',
      target_ref: record.targetRef || null,
      target_label: record.targetLabel || null,
      confidence: Number(record.confidence || 0),
      approved_at: compactDate(record.reviewedAt || record.updatedAt),
    }));
  const reportingRules = activeRecords
    .filter((record) => record.type === 'reporting_rule')
    .map((record) => ({
      key: record.normalizedTerm,
      description: record.definition || record.term,
      source: 'approved_semantic_memory',
      memory_id: record.memoryId,
    }));

  return {
    glossary,
    synonyms,
    reportingRules,
    counts: {
      approved: activeRecords.length,
      glossary: glossary.length,
      synonyms: synonyms.length,
      reporting_rules: reportingRules.length,
    },
  };
};

const createRequestId = () =>
  `req_${crypto
    .createHash('sha256')
    .update(`${Date.now()}:${process.hrtime.bigint()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 32)}`;

const getSandboxMaxInputBytes = () => {
  const configured = Number(process.env.EXECUTIVE_INTELLIGENCE_SANDBOX_MAX_INPUT_BYTES);
  if (Number.isFinite(configured) && configured > 0) return Math.min(configured, 5 * 1024 * 1024);
  return 2 * 1024 * 1024;
};

const assertSandboxInputPayloadWithinLimit = (inputPayload) => {
  const bytes = Buffer.byteLength(JSON.stringify(inputPayload ?? null), 'utf8');
  const maxBytes = getSandboxMaxInputBytes();
  if (bytes > maxBytes) {
    throw new ApiError(httpStatus.PAYLOAD_TOO_LARGE, 'SANDBOX_INPUT_PAYLOAD_TOO_LARGE');
  }
  return bytes;
};

const latestIso = (items = []) => {
  const timestamp = items.reduce((max, item) => {
    const value = item?.updatedAt || item?.createdAt;
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? Math.max(max, time) : max;
  }, 0);
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
};

const inferOperation = (message) => {
  const text = String(message || '').toLowerCase();
  if (/\b(export|download|csv|excel|xlsx|pdf|docx|powerpoint|pptx)\b/.test(text)) {
    return 'EXPORT';
  }
  if (/\b(compare|versus|vs\.?)\b/.test(text)) return 'COMPARE';
  if (/\b(anomaly|anomalies|unusual|spike|spikes|drop|drops|outlier|outliers)\b/.test(text)) return 'DETECT_ANOMALY';
  if (/\b(trend|over time|month over month|quarter)\b/.test(text)) return 'TREND';
  if (/\b(rank|top|bottom|highest|lowest|best|worst)\b/.test(text)) return 'RANK';
  if (/\b(forecast|predict|next month|projection)\b/.test(text)) return 'FORECAST';
  if (/\b(recommend|what should|next action|next step)\b/.test(text)) return 'RECOMMEND';
  if (/\b(sum|total|count|average|avg|min|max|group by|breakdown by|by)\b/.test(text)) return 'AGGREGATE';
  if (/\b(show|give|tell|list)\b/.test(text)) return 'GENERATE_REPORT';
  if (/\b(report|summarize|summary|brief|overview)\b/.test(text)) return 'GENERATE_REPORT';
  return 'ANALYZE';
};

const extractCandidateTerms = (message) => {
  const normalized = normalizeTerm(message);
  if (!normalized) return [];
  const stopWords = new Set([
    'a',
    'accepted',
    'an',
    'anomalies',
    'anomaly',
    'analyse',
    'analysis',
    'analyze',
    'and',
    'approved',
    'are',
    'as',
    'at',
    'best',
    'bottom',
    'by',
    'compare',
    'compared',
    'comparison',
    'count',
    'counts',
    'complete',
    'completed',
    'current',
    'declined',
    'detect',
    'daily',
    'days',
    'done',
    'drop',
    'drops',
    'failed',
    'failure',
    'for',
    'form',
    'from',
    'give',
    'generate',
    'i',
    'in',
    'into',
    'is',
    'last',
    'me',
    'months',
    'monthly',
    'node',
    'of',
    'on',
    'or',
    'our',
    'overview',
    'over',
    'pending',
    'period',
    'periods',
    'previous',
    'received',
    'rejected',
    'report',
    'show',
    'submission',
    'submissions',
    'submitted',
    'summarize',
    'summary',
    'profile',
    'quarterly',
    'quarters',
    'statistics',
    'stats',
    'spike',
    'spikes',
    'outlier',
    'outliers',
    'unusual',
    'rank',
    'ranking',
    'tell',
    'the',
    'this',
    'time',
    'to',
    'top',
    'trend',
    'trends',
    'us',
    'versus',
    'vs',
    'weekly',
    'weeks',
    'what',
    'which',
    'with',
    'brief',
    'advanced',
    'calculate',
    'code',
    'compute',
    'correlate',
    'correlation',
    'custom',
    'deviation',
    'executive',
    'forecast',
    'median',
    'percentile',
    'predict',
    'prediction',
    'project',
    'python',
    'regression',
    'sandbox',
    'scenario',
    'selected',
    'simulate',
    'simulation',
    'standard',
    'table',
    'tables',
    'variance',
    'years',
  ]);
  const words = normalized
    .split(' ')
    .filter((word) => (word.length >= 3 || word === 'id') && !stopWords.has(word));
  const phrases = [];
  for (let size = 3; size >= 2; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      phrases.push(words.slice(index, index + size).join(' '));
    }
  }
  return compactArray([...phrases, ...words], 80);
};

const normalizePermissionName = (permission = {}) => {
  if (permission.resource && permission.action) {
    return `${String(permission.resource).toLowerCase()}:${String(permission.action).toLowerCase()}`;
  }
  return String(permission.name || '').toLowerCase();
};

const roleHasPermission = ({ role = {}, permissionByRef = new Map(), matcher }) => {
  if (!Array.isArray(role.permissions)) return false;
  return role.permissions.some((permissionRef) => {
    const permission = permissionByRef.get(normalizeId(permissionRef));
    return permission ? matcher(permission) : false;
  });
};

const resolveUserAccessProfile = ({
  user = {},
  assignedNodeRefs = [],
  acceptedInvitationByUserRef = new Map(),
  activeWorkspaceMembershipByUserRef = new Map(),
  roleByRef = new Map(),
  permissionByRef = new Map(),
}) => {
  const userRef = normalizeId(user);
  const roleRefs = Array.isArray(user.roles)
    ? user.roles.map(normalizeId).filter(Boolean)
    : [];
  const roles = roleRefs.map((roleRef) => roleByRef.get(roleRef)).filter(Boolean);
  const privilegedFlags = [
    user.isOwner ? 'owner' : null,
    user.isSuper ? 'super' : null,
    user.isAdmin ? 'admin' : null,
    user.isSaby ? 'saby_operator' : null,
  ].filter(Boolean);
  const acceptedInvitation = acceptedInvitationByUserRef.get(userRef);
  const activeMembership = activeWorkspaceMembershipByUserRef.get(userRef);
  const hasWorkspacePermission = roles.some((role) =>
    roleHasPermission({
      role,
      permissionByRef,
      matcher: (permission) => {
        const name = normalizePermissionName(permission);
        return (
          permission.isWildcard ||
          name === '*:*' ||
          ['workspace', 'projectform', 'project-form', 'project_form', 'user', 'role', 'permission'].includes(
            String(permission.resource || '').toLowerCase()
          ) ||
          ['user:read', 'role:read', 'permission:read'].includes(name)
        );
      },
    })
  );
  const hasSubmissionPermission = roles.some((role) =>
    roleHasPermission({
      role,
      permissionByRef,
      matcher: (permission) => {
        const name = normalizePermissionName(permission);
        const resource = String(permission.resource || '').toLowerCase();
        return (
          name === 'submission:submit' ||
          name === 'submission:create' ||
          name === 'formsubmission:create' ||
          name === 'projectformsubmission:create' ||
          (resource.includes('submission') && ['submit', 'create'].includes(String(permission.action || '').toLowerCase()))
        );
      },
    })
  );

  const workspaceAccessReason = [
    ...privilegedFlags,
    acceptedInvitation ? 'accepted_workspace_invitation' : null,
    activeMembership ? 'active_workspace_membership' : null,
    hasWorkspacePermission ? 'workspace_permission' : null,
  ].filter(Boolean);
  const submissionAccessReason = [
    assignedNodeRefs.length > 0 ? 'assigned_to_node' : null,
    hasSubmissionPermission ? 'submission_permission' : null,
  ].filter(Boolean);
  const workspaceActor = workspaceAccessReason.length > 0;
  const submitter = submissionAccessReason.length > 0;

  return {
    workspace_actor: workspaceActor,
    submitter,
    main_app_login_allowed: workspaceActor,
    intelligence_allowed: workspaceActor,
    submission_allowed: submitter,
    workspace_access_reason: workspaceAccessReason,
    submission_access_reason: submissionAccessReason,
    workspace_membership: activeMembership || null,
    accepted_invitation: acceptedInvitation || null,
  };
};

const inferValueType = (field = {}) => {
  const semanticValue = field.semantic?.valueType;
  if (semanticValue) return semanticValue;
  const type = String(field.type || '').toLowerCase();
  const numberType = String(field.properties?.numberType || '').toLowerCase();
  const label = String(field.properties?.label || field.label || field.id || '').toLowerCase();
  if (numberType.includes('currency') || label.includes('amount') || label.includes('price')) return 'currency';
  if (numberType.includes('percent') || label.includes('percent') || label.includes('rate')) return 'percent';
  if (type.includes('number')) return 'number';
  if (type.includes('date')) return 'date';
  if (type.includes('time')) return 'time';
  if (type.includes('checkbox') || type.includes('boolean')) return 'boolean';
  if (type.includes('select') || type.includes('radio')) return 'enum';
  if (type.includes('file') || type.includes('upload') || type.includes('attachment')) return 'attachment';
  return 'text';
};

const inferFieldRole = (field = {}) => {
  if (field.semantic?.role) return field.semantic.role;
  const type = String(field.type || '').toLowerCase();
  const label = String(field.properties?.label || field.label || field.id || '').toLowerCase();
  if (type.includes('file') || type.includes('upload') || type.includes('attachment')) return 'attachment';
  if (type.includes('date') || type.includes('time')) return 'time';
  if (label.includes('status') || label.includes('approval')) return 'status';
  if (label.includes('email') || label.includes('phone') || label.includes('name') || label.includes('id number')) {
    return 'identity';
  }
  if (type.includes('number')) return 'measure';
  if (type.includes('select') || type.includes('radio') || type.includes('checkbox')) return 'dimension';
  if (type.includes('textarea')) return 'free_text';
  return 'label';
};

const redactionPolicyForField = ({ role, valueType, label }) => {
  const normalizedLabel = String(label || '').toLowerCase();
  if (role === 'attachment' || valueType === 'attachment') return 'attachment_summary';
  if (role === 'identity') return 'hash';
  if (
    normalizedLabel.includes('email') ||
    normalizedLabel.includes('phone') ||
    normalizedLabel.includes('password') ||
    normalizedLabel.includes('token') ||
    normalizedLabel.includes('secret')
  ) {
    return 'hash';
  }
  if (role === 'free_text') return 'mask';
  return 'none';
};

const allowedOperationsForField = ({ role, valueType }) => {
  if (role === 'measure') return ['sum', 'avg', 'min', 'max', 'rank', 'trend'];
  if (role === 'dimension') return ['count', 'count_distinct', 'filter', 'group'];
  if (role === 'time') return ['filter', 'trend', 'period_compare'];
  if (role === 'status') return ['count', 'filter', 'group'];
  if (valueType === 'attachment') return ['count'];
  return ['filter'];
};

const classifyField = ({ form, field }) => {
  const label = field.properties?.label || field.label || field.id || 'Untitled field';
  const role = inferFieldRole(field);
  const valueType = inferValueType(field);
  const fieldRef = `${form.projectId}:${field.id || 'unknown'}`;
  return {
    field_ref: fieldRef,
    project_id: form.projectId,
    field_id: field.id || null,
    label,
    field_type: field.type || 'unknown',
    required: Boolean(field.properties?.required || field.required),
    intelligence_role: role,
    value_type: valueType,
    allowed_operations: allowedOperationsForField({ role, valueType }),
    allowed_as_filter: !['attachment', 'free_text', 'ignore'].includes(role),
    allowed_as_dimension: ['dimension', 'status', 'time'].includes(role),
    contains_identity: role === 'identity',
    contains_attachment: role === 'attachment' || valueType === 'attachment',
    contains_sensitive_value: ['identity'].includes(role),
    redaction_policy: redactionPolicyForField({ role, valueType, label }),
    aliases: Array.isArray(field.aliases) ? field.aliases.slice(0, 12) : [],
    semantic: field.semantic || {},
    quality_checks: [
      Boolean(field.properties?.required || field.required) ? 'required' : null,
      role === 'measure' ? 'numeric' : null,
      role === 'free_text' ? 'untrusted_text' : null,
      role === 'attachment' ? 'attachment_summary_only' : null,
    ].filter(Boolean),
  };
};

const buildProjectIntelligenceProfile = ({ form, fieldProfiles }) => {
  const analyticsProfile = form.analytics?.profile || {};
  const measureRefs = fieldProfiles
    .filter((field) => field.intelligence_role === 'measure')
    .map((field) => field.field_ref);
  const dimensionRefs = fieldProfiles
    .filter((field) => field.allowed_as_dimension)
    .map((field) => field.field_ref);
  const timeRefs = fieldProfiles
    .filter((field) => field.intelligence_role === 'time')
    .map((field) => field.field_ref);
  const statusRefs = fieldProfiles
    .filter((field) => field.intelligence_role === 'status')
    .map((field) => field.field_ref);
  const attachmentRefs = fieldProfiles
    .filter((field) => field.contains_attachment)
    .map((field) => field.field_ref);
  const identityRefs = fieldProfiles
    .filter((field) => field.contains_identity)
    .map((field) => field.field_ref);
  const requiredRefs = fieldProfiles
    .filter((field) => field.required)
    .map((field) => field.field_ref);

  let profileStatus = 'ready';
  const caveats = [];
  if (measureRefs.length === 0 && dimensionRefs.length === 0) {
    profileStatus = 'partial';
    caveats.push('No explicit metric or dimension fields were detected.');
  }
  if (form.status !== 'active') {
    profileStatus = 'blocked';
    caveats.push(`Project form status is ${form.status}.`);
  }

  return {
    project_id: form.projectId,
    profile_status: profileStatus,
    business_summary: form.identity?.description || form.identity?.name || 'Untitled project form',
    data_nature: analyticsProfile.dataNature || 'unknown',
    domain: analyticsProfile.domain || 'custom',
    primary_time_field_ref:
      timeRefs.find((ref) => ref.endsWith(`:${analyticsProfile.primaryTimeField}`)) ||
      timeRefs[0] ||
      null,
    default_measure_field_refs: analyticsProfile.defaultMeasureFieldKeys?.length
      ? analyticsProfile.defaultMeasureFieldKeys.map((key) => `${form.projectId}:${key}`)
      : measureRefs.slice(0, 8),
    default_dimension_field_refs: analyticsProfile.defaultDimensionFieldKeys?.length
      ? analyticsProfile.defaultDimensionFieldKeys.map((key) => `${form.projectId}:${key}`)
      : dimensionRefs.slice(0, 8),
    status_field_refs: statusRefs,
    attachment_field_refs: attachmentRefs,
    identity_field_refs: identityRefs,
    safe_filter_field_refs: fieldProfiles
      .filter((field) => field.allowed_as_filter)
      .map((field) => field.field_ref)
      .slice(0, 40),
    required_field_refs: requiredRefs,
    data_quality_rules: requiredRefs.map((ref) => ({ type: 'required', field_ref: ref })),
    reporting_caveats: caveats,
  };
};

const compileProjectScope = (form) => {
  const security = form.capabilities?.experience?.security || {};
  const access = security.access || {};
  return {
    primary_scope: 'tenant',
    tenant_id: form.tenantId,
    workspace_id: form.workspaceId || null,
    access_model: security.mode || 'tenant_default',
    audience: security.audience || 'public',
    security_profile: security.profile || 'open_public',
    public_access: (security.mode || 'public') === 'public',
    secure_access: Boolean(security.enabled || security.publicSecureMode !== 'off'),
    public_secure_mode: security.publicSecureMode || 'off',
    node_restrictions: access.requireNodeAccess ? ['requester_assigned_nodes'] : [],
    user_restrictions: Array.isArray(access.allowedUsers) ? access.allowedUsers : [],
    role_restrictions: Array.isArray(access.allowedRoles) ? access.allowedRoles : [],
    restriction_source: 'ProjectForm.capabilities.experience.security',
  };
};

const compileProjectSettings = (form) => {
  const capabilities = form.capabilities || {};
  const security = capabilities.experience?.security || {};
  const workflow = capabilities.experience?.workflow || {};
  const compliance = capabilities.experience?.compliance || {};
  const payment = capabilities.transaction?.payment || {};
  const remittance = capabilities.transaction?.remittance || {};
  const invoice = capabilities.transaction?.invoice || {};
  const automation = capabilities.automation || {};

  return {
    security: {
      enabled: Boolean(security.enabled),
      mode: security.mode || 'public',
      audience: security.audience || 'public',
      profile: security.profile || 'open_public',
      public_secure_mode: security.publicSecureMode || 'off',
      channels: Array.isArray(security.channels) ? security.channels : [],
      authentication_required: Boolean(
        security.authentication?.requireLogin ||
          security.authentication?.requireOtp ||
          (security.authentication?.method && security.authentication.method !== 'none')
      ),
    },
    compliance: {
      enabled: Boolean(compliance.enabled),
      reporting_period_scope: compliance.reportingPeriod?.scope || null,
      frequency: compliance.frequency || compliance.schedule?.frequency || null,
      require_node_id: compliance.requireNodeId !== false,
      require_month: compliance.requireMonth !== false,
      track_compliance: compliance.trackCompliance !== false,
      calendar_required: Boolean(compliance.calendarRequired),
    },
    workflow: {
      enabled: Boolean(workflow.enabled),
      approval_mode: workflow.approvalMode || 'none',
      trigger_on: workflow.triggerOn || 'submission',
      step_count: Array.isArray(workflow.steps) ? workflow.steps.length : 0,
      workflow_count: Array.isArray(workflow.workflows) ? workflow.workflows.length : 0,
    },
    payment: {
      enabled: Boolean(payment.enabled),
      mode: payment.mode || 'none',
      currency: payment.currency || null,
      collection_stage: payment.collectionStage || 'submission',
      require_payment_before_submit: Boolean(payment.policies?.requirePaymentBeforeSubmit),
      allow_partial_payment: Boolean(payment.policies?.allowPartialPayment),
    },
    remittance: {
      enabled: Boolean(remittance.enabled),
      account_source: remittance.accountSource || 'tenant_global',
      require_node_account: Boolean(remittance.requireNodeAccount),
    },
    invoice: {
      enabled: Boolean(invoice.enabled),
      calculation_mode: invoice.calculationMode || 'none',
      line_items_enabled: Boolean(invoice.lineItemsEnabled),
      tax_enabled: Boolean(invoice.taxEnabled),
      discounts_enabled: Boolean(invoice.discountsEnabled),
    },
    automation: {
      rule_count: Array.isArray(automation.rules) ? automation.rules.length : 0,
      connected_action_count: Array.isArray(automation.connectedActions)
        ? automation.connectedActions.length
        : 0,
    },
    integrations: {
      channels: Array.isArray(form.metadata?.integrations) ? form.metadata.integrations : [],
    },
  };
};

const sanitizeLevel = (level) => ({
  level_ref: normalizeId(level),
  tenant_id: level.tenantId,
  name: level.name,
  description: level.description || '',
  rank: level.rank,
  is_special: Boolean(level.isSpecial),
  is_active: level.isActive !== false,
});

const sanitizeStructure = (structure) => ({
  structure_ref: normalizeId(structure),
  tenant_id: structure.tenantId,
  name: structure.name,
  code: structure.code || null,
  halo_id: structure.haloId || null,
  level_ref: normalizeId(structure.level),
  type: structure.type || 'administrative',
  parent_structure_ref: normalizeId(structure.parent),
  path: structure.path || '',
  is_active: structure.isActive !== false,
});

const sanitizeNode = (node) => ({
  node_ref: normalizeId(node),
  node_id: node.nodeId || normalizeId(node),
  tenant_id: node.tenantId,
  name: node.name,
  level_ref: normalizeId(node.level),
  structure_ref: normalizeId(node.structure),
  parent_node_ref: normalizeId(node.parent),
  ancestor_node_refs: Array.isArray(node.identity) ? node.identity.map(normalizeId).filter(Boolean) : [],
  path: node.path || '',
  is_main: Boolean(node.isMain),
  is_active: node.isActive !== false,
});

const sanitizeRole = (role) => ({
  role_ref: normalizeId(role),
  tenant_id: role.tenantId,
  name: role.name,
  description: role.description || '',
  is_active: role.isActive !== false,
  permission_refs: Array.isArray(role.permissions) ? role.permissions.map(normalizeId).filter(Boolean) : [],
});

const sanitizePermission = (permission) => ({
  permission_ref: normalizeId(permission),
  name: normalizePermissionName(permission),
  original_name: permission.name || null,
  resource: permission.resource || null,
  action: permission.action || null,
  path: permission.path || null,
  method: permission.method || null,
  is_wildcard: Boolean(permission.isWildcard),
  is_admin_level: Boolean(permission.isAdminLevel),
});

const sanitizeUser = ({
  user,
  assignedNodeRefs,
  acceptedInvitationByUserRef,
  activeWorkspaceMembershipByUserRef,
  roleByRef,
  permissionByRef,
}) => {
  const accessProfile = resolveUserAccessProfile({
    user,
    assignedNodeRefs,
    acceptedInvitationByUserRef,
    activeWorkspaceMembershipByUserRef,
    roleByRef,
    permissionByRef,
  });
  return {
  user_ref: normalizeId(user),
  user_id: user.userId || normalizeId(user),
  tenant_id: user.tenantId,
  display_name: [user.firstname, user.lastname].filter(Boolean).join(' ') || 'Unnamed user',
  email_hash: hashValue(user.email),
  access_profile: {
    workspace_actor: accessProfile.workspace_actor,
    submitter: accessProfile.submitter,
    main_app_login_allowed: accessProfile.main_app_login_allowed,
    intelligence_allowed: accessProfile.intelligence_allowed,
    submission_allowed: accessProfile.submission_allowed,
  },
  workspace_access_reason: accessProfile.workspace_access_reason,
  submission_access_reason: accessProfile.submission_access_reason,
  workspace_membership: accessProfile.workspace_membership,
  accepted_invitation: accessProfile.accepted_invitation,
  flags: {
    is_owner: Boolean(user.isOwner),
    is_super: Boolean(user.isSuper),
    is_admin: Boolean(user.isAdmin),
    is_saby: Boolean(user.isSaby),
  },
  status: user.status,
  role_refs: Array.isArray(user.roles) ? user.roles.map(normalizeId).filter(Boolean) : [],
  assigned_node_refs: assignedNodeRefs,
  };
};

const sanitizeTenantConfig = (config) => ({
  entity_type: config.entityType,
  version: config.version,
  fields: Array.isArray(config.fields)
    ? config.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: Boolean(field.required),
        analytics: field.analytics || {},
      }))
    : [],
});

const edge = ({ edgeType, fromRef, toRef, tenantId, source }) => ({
  edge_type: edgeType,
  from_ref: fromRef,
  to_ref: toRef,
  tenant_id: tenantId,
  source,
});

const compileRelationshipEdges = ({ tenantId, structures, nodes, roles, forms }) => {
  const edges = [];

  structures.forEach((structure) => {
    const structureRef = normalizeId(structure);
    const parentRef = normalizeId(structure.parent);
    const levelRef = normalizeId(structure.level);
    if (parentRef) edges.push(edge({ edgeType: 'structure_parent', fromRef: structureRef, toRef: parentRef, tenantId, source: 'Structures.parent' }));
    if (levelRef) edges.push(edge({ edgeType: 'structure_level', fromRef: structureRef, toRef: levelRef, tenantId, source: 'Structures.level' }));
  });

  nodes.forEach((node) => {
    const nodeRef = normalizeId(node);
    const parentRef = normalizeId(node.parent);
    const levelRef = normalizeId(node.level);
    const structureRef = normalizeId(node.structure);
    if (parentRef) edges.push(edge({ edgeType: 'node_parent', fromRef: nodeRef, toRef: parentRef, tenantId, source: 'Nodes.parent' }));
    if (levelRef) edges.push(edge({ edgeType: 'node_level', fromRef: nodeRef, toRef: levelRef, tenantId, source: 'Nodes.level' }));
    if (structureRef) edges.push(edge({ edgeType: 'node_structure', fromRef: nodeRef, toRef: structureRef, tenantId, source: 'Nodes.structure' }));
    (node.users || []).forEach((userRef) => {
      edges.push(edge({ edgeType: 'user_node', fromRef: normalizeId(userRef), toRef: nodeRef, tenantId, source: 'Nodes.users' }));
    });
  });

  roles.forEach((role) => {
    const roleRef = normalizeId(role);
    (role.permissions || []).forEach((permissionRef) => {
      edges.push(edge({ edgeType: 'role_permission', fromRef: roleRef, toRef: normalizeId(permissionRef), tenantId, source: 'Role.permissions' }));
    });
  });

  forms.forEach((form) => {
    if (form.workspaceId) {
      edges.push(edge({ edgeType: 'project_form_workspace', fromRef: form.projectId, toRef: form.workspaceId, tenantId, source: 'ProjectForm.workspaceId' }));
    }
    edges.push(edge({ edgeType: 'project_form_dataset', fromRef: form.projectId, toRef: `project_form:${form.projectId}`, tenantId, source: 'ProjectForm.projectId' }));
  });

  return edges;
};

const compileUserNodeAssignments = ({ tenantId, nodes }) => {
  const assignments = [];
  const userNodeMap = new Map();

  nodes.forEach((node) => {
    const nodeRef = normalizeId(node);
    const nodeId = node.nodeId || nodeRef;
    (node.users || []).forEach((user) => {
      const userRef = normalizeId(user);
      if (!userRef || !nodeRef) return;
      assignments.push({
        assignment_ref: `${userRef}:${nodeRef}`,
        tenant_id: tenantId,
        user_ref: userRef,
        node_ref: nodeRef,
        node_id: nodeId,
        assignment_source: 'Nodes.users',
        effective_from: null,
        effective_to: null,
        is_active: node.isActive !== false,
      });
      const existing = userNodeMap.get(userRef) || [];
      existing.push(nodeRef);
      userNodeMap.set(userRef, existing);
    });
  });

  return {
    assignments,
    userNodeMap,
  };
};

const compileProjectForm = ({ form, fieldProfiles }) => ({
  project_id: form.projectId,
  form_id: form.formId || null,
  tenant_id: form.tenantId,
  workspace_id: form.workspaceId || null,
  name: form.identity?.name || form.metadata?.projectName || 'Untitled form',
  description: form.identity?.description || '',
  status: form.status || form.identity?.status || 'active',
  category: form.identity?.category || 'standard',
  tags: Array.isArray(form.identity?.tags) ? form.identity.tags.slice(0, 20) : [],
  analytics_profile: form.analytics?.profile || {},
  scope: compileProjectScope(form),
  settings: compileProjectSettings(form),
  field_refs: fieldProfiles.map((field) => field.field_ref),
  dataset_ref: `project_form:${form.projectId}`,
  project_intelligence_profile: buildProjectIntelligenceProfile({ form, fieldProfiles }),
  source_updated_at: compactDate(form.updatedAt),
});

const compileSourceVersions = ({
  users,
  roles,
  permissions,
  levels,
  structures,
  nodes,
  forms,
  tenantConfigs,
  acceptedInvitations,
  tenantOnboarding,
}) => ({
  users: { count: users.length, latest_updated_at: latestIso(users) },
  roles: { count: roles.length, latest_updated_at: latestIso(roles) },
  permissions: { count: permissions.length, latest_updated_at: latestIso(permissions) },
  levels: { count: levels.length, latest_updated_at: latestIso(levels) },
  structures: { count: structures.length, latest_updated_at: latestIso(structures) },
  nodes: { count: nodes.length, latest_updated_at: latestIso(nodes) },
  project_forms: { count: forms.length, latest_updated_at: latestIso(forms) },
  tenant_config: { count: tenantConfigs.length, latest_updated_at: latestIso(tenantConfigs) },
  workspace_invitations: {
    count: acceptedInvitations.length,
    latest_updated_at: latestIso(acceptedInvitations),
  },
  tenant_onboarding: {
    count: tenantOnboarding ? 1 : 0,
    latest_updated_at: latestIso(tenantOnboarding ? [tenantOnboarding] : []),
  },
});

const logAuditEvent = async ({
  requestId = null,
  tenantId,
  userId = null,
  component,
  action,
  status,
  durationMs = null,
  inputReferences = {},
  outputReferences = {},
  artifactVersion = null,
  modelIdentifier = null,
  tokenUsage = {},
  errorCategory = null,
  policyDecision = {},
  metadata = {},
}) => {
  if (!tenantId) return null;
  return ExecutiveIntelligenceAuditEvent.create({
    requestId,
    tenantId,
    userId,
    component,
    action,
    status,
    durationMs,
    inputReferences,
    outputReferences,
    artifactVersion,
    modelIdentifier,
    tokenUsage,
    errorCategory,
    policyDecision,
    metadata,
  });
};

const getCapabilities = () => ({
  name: 'Saby Executive Intelligence',
  status: 'foundation',
  schemaVersion: SCHEMA_VERSION,
  supportedOperations: CANONICAL_OPERATIONS,
  supportedOutputs: ['chat', 'markdown', 'json', 'csv', 'xlsx', 'html', 'pdf', 'docx'],
  plannedOutputs: ['pptx'],
  enabledTools: TOOL_REGISTRY.filter((tool) => tool.enabled),
  disabledTools: TOOL_REGISTRY.filter((tool) => !tool.enabled),
  errorCodes: ERROR_CODES,
  artifactCapabilities: {
    tenantGraph: true,
    levels: true,
    structures: true,
    nodes: true,
    relationshipEdges: true,
    userNodeAssignments: true,
    projectProfiles: true,
    fieldClassifications: true,
    datasetDescriptors: true,
    operationalRowsEmbedded: false,
  },
  guardrails: {
    modelIsNotSourceOfTruth: true,
    tenantScoped: true,
    permissionsResolvedServerSide: true,
    directModelDatabaseAccess: false,
    generatedCodeCanModifyProduction: false,
    rawSqlFromClientAccepted: false,
    generatedSqlRequiresAstValidation: true,
    generatedSqlExecutionEnabled: executiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities().enabled,
    generatedCodeRequiresSandbox: true,
    sandboxExecutionEnabled: executiveSandboxRunner.getSandboxCapabilities().enabled,
  },
  generatedAnalysisPolicy: executiveGeneratedAnalysisPolicy.getPolicySnapshot(),
  generatedSqlExecution: executiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities(),
  sandbox: executiveSandboxRunner.getSandboxCapabilities(),
});

const getActiveArtifact = async ({ tenantId }) =>
  TenantKnowledgeArtifact.findOne({ tenantId, status: 'active' })
    .sort({ artifactVersion: -1 })
    .lean();

const canInitializeTenantArtifact = (user = {}) =>
  Boolean(user.isOwner || user.isSuper || user.isAdmin || user.isSaby);

const getArtifactPayload = (record) => record?.artifact || null;

const resolveArtifactUser = ({ artifact, user }) => {
  const securityUsers = artifact?.security?.users || [];
  const userRef = normalizeId(user);
  const userId = String(user?.userId || '').trim();
  const emailHash = hashValue(user?.email);

  return securityUsers.find((artifactUser) => {
    if (!artifactUser) return false;
    return (
      artifactUser.user_ref === userRef ||
      (userId && artifactUser.user_id === userId) ||
      (emailHash && artifactUser.email_hash === emailHash)
    );
  }) || null;
};

const resolveArtifactUserRoles = ({ artifact, artifactUser }) => {
  const security = artifact?.security || {};
  const roleRefsFromUser = compactArray(artifactUser?.role_refs || []);
  const roleRefsFromEdges = compactArray(
    (security.user_roles || [])
      .filter((edgeItem) => edgeItem.user_ref === artifactUser?.user_ref)
      .map((edgeItem) => edgeItem.role_ref)
  );
  const roleRefs = compactArray([...roleRefsFromUser, ...roleRefsFromEdges]);
  const roles = (security.roles || []).filter((role) => roleRefs.includes(role.role_ref));

  return roles.map((role) => ({
    role_ref: role.role_ref,
    name: role.name,
    is_active: role.is_active !== false,
  }));
};

const resolveArtifactUserPermissions = ({ artifact, roles }) => {
  const security = artifact?.security || {};
  const roleRefs = compactArray(roles.map((role) => role.role_ref));
  const permissionRefs = compactArray(
    (security.role_permissions || [])
      .filter((edgeItem) => roleRefs.includes(edgeItem.role_ref))
      .map((edgeItem) => edgeItem.permission_ref)
  );

  return (security.permissions || [])
    .filter((permission) => permissionRefs.includes(permission.permission_ref))
    .map((permission) => ({
      permission_ref: permission.permission_ref,
      name: permission.name,
      resource: permission.resource,
      action: permission.action,
      is_wildcard: Boolean(permission.is_wildcard),
      is_admin_level: Boolean(permission.is_admin_level),
    }));
};

const buildNodeIndex = ({ artifact, tenantId }) => {
  const nodes = (artifact?.organization?.nodes || [])
    .filter((node) => node?.tenant_id === tenantId && node.is_active !== false);
  const byRef = new Map();
  const byNodeId = new Map();
  const childrenByParentRef = new Map();

  nodes.forEach((node) => {
    if (!node.node_ref) return;
    byRef.set(node.node_ref, node);
    if (node.node_id) byNodeId.set(node.node_id, node);
    if (node.parent_node_ref) {
      const siblings = childrenByParentRef.get(node.parent_node_ref) || [];
      siblings.push(node.node_ref);
      childrenByParentRef.set(node.parent_node_ref, siblings);
    }
  });

  return { nodes, byRef, byNodeId, childrenByParentRef };
};

const summarizeNode = (node) => ({
  node_ref: node.node_ref,
  node_id: node.node_id || null,
  name: node.name || null,
  parent_node_ref: node.parent_node_ref || null,
  level_ref: node.level_ref || null,
  structure_ref: node.structure_ref || null,
});

const expandNodeDescendants = ({ seedNodeRefs = [], nodeIndex }) => {
  const visited = new Set();
  const queue = compactArray(seedNodeRefs);

  while (queue.length) {
    const nodeRef = queue.shift();
    if (!nodeRef || visited.has(nodeRef)) continue;
    if (!nodeIndex.byRef.has(nodeRef)) continue;
    visited.add(nodeRef);
    (nodeIndex.childrenByParentRef.get(nodeRef) || []).forEach((childRef) => {
      if (!visited.has(childRef)) queue.push(childRef);
    });
  }

  return Array.from(visited);
};

const resolveRequestedNodeRefs = ({ tenantId, requestedNodeIds = [], nodeIndex }) => {
  const allowedRequestedNodeRefs = [];
  const deniedNodes = [];

  compactArray(requestedNodeIds, 50).forEach((requestedNodeId) => {
    const node = nodeIndex.byRef.get(requestedNodeId) || nodeIndex.byNodeId.get(requestedNodeId);
    if (!node) {
      deniedNodes.push({
        requested_node_id: requestedNodeId,
        reason: 'node_not_found_in_active_artifact',
      });
      return;
    }
    if (node.tenant_id !== tenantId) {
      deniedNodes.push({
        requested_node_id: requestedNodeId,
        node_ref: node.node_ref,
        reason: 'cross_tenant_node_reference_denied',
      });
      return;
    }
    allowedRequestedNodeRefs.push(node.node_ref);
  });

  return {
    allowed_requested_node_refs: compactArray(allowedRequestedNodeRefs),
    denied_nodes: deniedNodes,
  };
};

const resolveVisibleScope = ({ artifact, tenantId, artifactUser, roles, permissions, requestedNodeIds = [] }) => {
  const nodeIndex = buildNodeIndex({ artifact, tenantId });
  const assignedNodeRefs = compactArray(artifactUser?.assigned_node_refs || []);
  const privileged = Boolean(
    artifactUser?.flags?.is_owner ||
      artifactUser?.flags?.is_super ||
      artifactUser?.flags?.is_admin ||
      artifactUser?.flags?.is_saby ||
      permissions.some((permission) => permission.is_wildcard || permission.is_admin_level)
  );
  const requestedNodeDecision = resolveRequestedNodeRefs({ tenantId, requestedNodeIds, nodeIndex });
  const allNodeRefs = compactArray(nodeIndex.nodes.map((node) => node.node_ref));

  if (privileged) {
    const hasRequestedNodes = requestedNodeDecision.allowed_requested_node_refs.length > 0;
    const visibleNodeRefs = hasRequestedNodes
      ? expandNodeDescendants({
          seedNodeRefs: requestedNodeDecision.allowed_requested_node_refs,
          nodeIndex,
        })
      : allNodeRefs;

    return {
      scope_status: requestedNodeDecision.denied_nodes.length ? 'partial_denied' : 'resolved',
      scope_type: hasRequestedNodes ? 'requested_nodes_with_descendants' : 'tenant_all_nodes',
      visible_node_ids: visibleNodeRefs,
      visible_nodes: visibleNodeRefs.map((nodeRef) => summarizeNode(nodeIndex.byRef.get(nodeRef))).filter(Boolean),
      assigned_node_refs: assignedNodeRefs,
      allowed_requested_node_ids: requestedNodeDecision.allowed_requested_node_refs,
      denied_node_ids: requestedNodeDecision.denied_nodes.map((node) => node.requested_node_id),
      denied_nodes: requestedNodeDecision.denied_nodes,
      excluded_node_ids: [],
      excluded_nodes: [],
      scope_reason: [
        'privileged_workspace_actor',
        hasRequestedNodes ? 'requested_nodes_narrow_scope' : 'all_tenant_nodes_visible',
      ],
      applied_policies: [
        'tenant_id_from_authenticated_user',
        'artifact_user_must_be_workspace_actor',
        'privileged_users_can_see_all_active_tenant_nodes',
        'requested_nodes_include_descendants',
      ],
      role_refs: roles.map((role) => role.role_ref),
      descendant_expansion: 'applied',
    };
  }

  const assignedScopeRefs = expandNodeDescendants({ seedNodeRefs: assignedNodeRefs, nodeIndex });
  const assignedScopeSet = new Set(assignedScopeRefs);
  const deniedNodes = [...requestedNodeDecision.denied_nodes];
  let visibleNodeRefs = assignedScopeRefs;
  let scopeType = assignedNodeRefs.length ? 'assigned_nodes_with_descendants' : 'no_assigned_nodes';

  if (requestedNodeDecision.allowed_requested_node_refs.length) {
    const allowedRequestedWithinScope = [];
    requestedNodeDecision.allowed_requested_node_refs.forEach((nodeRef) => {
      if (assignedScopeSet.has(nodeRef)) {
        allowedRequestedWithinScope.push(nodeRef);
      } else {
        const node = nodeIndex.byRef.get(nodeRef);
        deniedNodes.push({
          requested_node_id: node?.node_id || nodeRef,
          node_ref: nodeRef,
          reason: 'requested_node_outside_user_scope',
        });
      }
    });

    visibleNodeRefs = expandNodeDescendants({ seedNodeRefs: allowedRequestedWithinScope, nodeIndex });
    scopeType = 'requested_assigned_nodes_with_descendants';
  }

  return {
    scope_status: deniedNodes.length ? 'partial_denied' : 'resolved',
    scope_type: scopeType,
    visible_node_ids: visibleNodeRefs,
    visible_nodes: visibleNodeRefs.map((nodeRef) => summarizeNode(nodeIndex.byRef.get(nodeRef))).filter(Boolean),
    assigned_node_refs: assignedNodeRefs,
    allowed_requested_node_ids: requestedNodeDecision.allowed_requested_node_refs.filter((nodeRef) =>
      visibleNodeRefs.includes(nodeRef)
    ),
    denied_node_ids: deniedNodes.map((node) => node.requested_node_id),
    denied_nodes: deniedNodes,
    excluded_node_ids: [],
    excluded_nodes: [],
    scope_reason: assignedNodeRefs.length
      ? ['assigned_node_refs', 'assigned_node_descendants_included']
      : ['no_node_assignment_found'],
    applied_policies: [
      'tenant_id_from_authenticated_user',
      'artifact_user_must_be_workspace_actor',
      'non_privileged_users_limited_to_assigned_nodes',
      'assigned_nodes_include_descendants',
      'requested_nodes_must_be_inside_assigned_scope',
    ],
    role_refs: roles.map((role) => role.role_ref),
    descendant_expansion: 'applied',
  };
};

const normalizeRequestedTimeRange = (timeRange) => {
  if (!timeRange) return null;
  return {
    start: compactDate(timeRange.start),
    end: compactDate(timeRange.end),
    timezone: timeRange.timezone || 'Africa/Lagos',
  };
};

const normalizeStatusFilters = (values = []) =>
  compactArray(values)
    .map((value) => value.toLowerCase())
    .filter((value) => SUBMISSION_STATUS_SET.has(value));

const resolveStatusFilters = ({ message, body = {} }) => {
  const explicit = normalizeStatusFilters([
    body.status,
    ...(Array.isArray(body.statuses) ? body.statuses : []),
  ]);
  if (explicit.length) return explicit;

  const text = normalizeTerm(message);
  const detected = SUBMISSION_STATUS_VALUES.filter((status) => {
    if (status === 'submitted') return /\b(submitted|submission received)\b/.test(text);
    if (status === 'pending') return /\b(pending|awaiting|waiting)\b/.test(text);
    if (status === 'approved') return /\b(approved|accepted)\b/.test(text);
    if (status === 'rejected') return /\b(rejected|declined)\b/.test(text);
    if (status === 'completed') return /\b(completed|complete|done)\b/.test(text);
    if (status === 'failed') return /\b(failed|failure|errored)\b/.test(text);
    return false;
  });
  return normalizeStatusFilters(detected);
};

const buildResolvedFilters = ({ message, body = {} }) => {
  const filters = [];
  const statuses = resolveStatusFilters({ message, body });
  if (statuses.length) {
    filters.push({
      type: 'submission_status',
      field: 'form_submissions.status',
      operator: 'in',
      values: statuses,
      source: Array.isArray(body.statuses) || body.status ? 'request' : 'message',
    });
  }

  const dimensionValues = compactArray(body.dimensionValues || [], 20);
  if (dimensionValues.length) {
    filters.push({
      type: 'dimension_value',
      operator: 'in',
      values: dimensionValues,
      source: 'request',
    });
  }
  return filters;
};

const referenceMatchesUserRestriction = ({ restrictions = [], artifactUser, user }) => {
  if (!restrictions.length) return true;
  const userCandidates = compactArray([
    artifactUser?.user_ref,
    artifactUser?.user_id,
    normalizeId(user),
    user?.userId,
  ]);
  return restrictions.some((restriction) => userCandidates.includes(String(restriction)));
};

const referenceMatchesRoleRestriction = ({ restrictions = [], roles }) => {
  if (!restrictions.length) return true;
  const roleCandidates = compactArray(roles.flatMap((role) => [role.role_ref, role.name]));
  return restrictions.some((restriction) => roleCandidates.includes(String(restriction)));
};

const resolveSelectedReferences = ({ artifact, user, artifactUser, roles, baseScope, requestedReferences = [] }) => {
  const projects = artifact?.projects || [];
  const forms = artifact?.forms || [];
  const datasets = artifact?.datasets || [];
  const resolved = [];
  const denied = [];

  requestedReferences
    .filter((reference) => reference?.type === 'project_form')
    .slice(0, 10)
    .forEach((reference) => {
      const requestedProjectId = String(reference.projectId || '').trim();
      const requestedFormId = String(reference.projectFormId || '').trim();
      const project = projects.find((item) => item.project_id === requestedProjectId);
      const form = forms.find((item) => {
        if (requestedFormId && item.form_id === requestedFormId) return true;
        return item.project_id === requestedProjectId;
      });
      const dataset = datasets.find((item) => item.project_id === requestedProjectId);
      const scope = project?.scope || form?.scope || {};

      if (!requestedProjectId || !project || !form || !dataset) {
        denied.push({
          type: 'project_form',
          projectId: requestedProjectId || null,
          projectFormId: requestedFormId || null,
          reason: 'reference_not_found_in_active_artifact',
        });
        return;
      }

      if (scope.tenant_id && scope.tenant_id !== user.tenantId) {
        denied.push({
          type: 'project_form',
          projectId: requestedProjectId,
          projectFormId: requestedFormId || form.form_id || null,
          reason: 'cross_tenant_reference_denied',
        });
        return;
      }

      if (!referenceMatchesUserRestriction({ restrictions: scope.user_restrictions || [], artifactUser, user })) {
        denied.push({
          type: 'project_form',
          projectId: requestedProjectId,
          projectFormId: requestedFormId || form.form_id || null,
          reason: 'user_not_in_project_access_override',
        });
        return;
      }

      if (!referenceMatchesRoleRestriction({ restrictions: scope.role_restrictions || [], roles })) {
        denied.push({
          type: 'project_form',
          projectId: requestedProjectId,
          projectFormId: requestedFormId || form.form_id || null,
          reason: 'role_not_in_project_access_override',
        });
        return;
      }

      if ((scope.node_restrictions || []).includes('requester_assigned_nodes') && !baseScope.assigned_node_refs.length) {
        denied.push({
          type: 'project_form',
          projectId: requestedProjectId,
          projectFormId: requestedFormId || form.form_id || null,
          reason: 'project_requires_node_assignment',
        });
        return;
      }

      const explicitNodeRestrictions = compactArray(scope.node_restrictions || []).filter(
        (nodeRef) => nodeRef !== 'requester_assigned_nodes'
      );
      if (
        explicitNodeRestrictions.length &&
        !explicitNodeRestrictions.some((nodeRef) => (baseScope.visible_node_ids || []).includes(nodeRef))
      ) {
        denied.push({
          type: 'project_form',
          projectId: requestedProjectId,
          projectFormId: requestedFormId || form.form_id || null,
          reason: 'project_outside_visible_node_scope',
        });
        return;
      }

      resolved.push({
        type: 'project_form',
        project_id: project.project_id,
        project_form_id: form.form_id || null,
        workspace_id: project.workspace_id || form.workspace_id || null,
        title: project.name || form.title || reference.title || 'Untitled project',
        status: project.status || form.status || 'active',
        dataset_ref: dataset.dataset_ref,
        required_permissions: dataset.required_permissions || [],
        scope,
        source: 'active_tenant_artifact',
      });
    });

  return { resolved, denied };
};

const getAllowedProjectIds = ({ artifact, selectedReferences = [] }) => {
  const selectedProjectIds = compactArray(selectedReferences.map((reference) => reference.project_id));
  if (selectedProjectIds.length) return new Set(selectedProjectIds);
  return new Set((artifact?.projects || []).map((project) => project.project_id).filter(Boolean));
};

const normalizeSemanticValueKind = (value) => {
  const normalized = normalizeTerm(value);
  if (['currency', 'number', 'integer', 'decimal', 'float', 'percentage'].includes(normalized)) return 'numeric';
  if (['date', 'datetime', 'time', 'timestamp'].includes(normalized)) return 'temporal';
  if (['boolean', 'checkbox', 'toggle'].includes(normalized)) return 'boolean';
  return normalized || 'text';
};

const buildFieldCompatibilitySignature = (field = {}) => {
  const label = normalizeTerm(field.label || field.display_name || field.field_id);
  const role = normalizeTerm(field.intelligence_role || field.role);
  const valueKind = normalizeSemanticValueKind(field.value_type || field.data_type || field.field_type);
  if (!label || !role) return null;
  return `${role}:${valueKind}:${label}`;
};

const summarizeCompatibleFields = ({ artifact = {}, selectedReferences = [], role }) => {
  const selectedProjectIds = new Set(selectedReferences.map((reference) => reference.project_id));
  const fields = (artifact.form_fields || []).filter((field) => selectedProjectIds.has(field.project_id));
  const relevantFields = fields.filter((field) => {
    if (role === 'metric') return field.intelligence_role === 'measure';
    if (role === 'dimension') return field.allowed_as_dimension && field.intelligence_role !== 'time';
    if (role === 'time') return field.intelligence_role === 'time';
    return false;
  });
  const bySignature = relevantFields.reduce((map, field) => {
    const signature = buildFieldCompatibilitySignature(field);
    if (!signature) return map;
    if (!map.has(signature)) map.set(signature, []);
    map.get(signature).push({
      project_id: field.project_id,
      field_ref: field.field_ref,
      field_id: field.field_id,
      label: field.label,
      value_type: field.value_type || field.data_type || field.field_type,
    });
    return map;
  }, new Map());

  return Array.from(bySignature.entries())
    .map(([signature, matches]) => ({
      signature,
      label: matches[0]?.label || signature,
      value_type: matches[0]?.value_type || null,
      project_count: new Set(matches.map((match) => match.project_id)).size,
      field_refs: matches.map((match) => match.field_ref).filter(Boolean),
      fields: matches,
    }))
    .filter((item) => item.project_count === selectedReferences.length);
};

const evaluateMultiProjectCompatibility = ({ artifact, selectedReferences = [], semanticResolution = {}, operation }) => {
  const projectCount = selectedReferences.length;
  if (projectCount <= 1) {
    return {
      status: 'single_project',
      compatible: true,
      project_count: projectCount,
      reasons: [],
      common_metrics: [],
      common_dimensions: [],
      common_time_fields: [],
      supported_operations: ['GENERATE_REPORT', 'ANALYZE', 'AGGREGATE', 'RANK', 'TREND', 'COMPARE', 'DETECT_ANOMALY'],
    };
  }

  const datasetRefs = new Set(selectedReferences.map((reference) => reference.dataset_ref).filter(Boolean));
  const commonMetrics = summarizeCompatibleFields({ artifact, selectedReferences, role: 'metric' });
  const commonDimensions = summarizeCompatibleFields({ artifact, selectedReferences, role: 'dimension' });
  const commonTimeFields = summarizeCompatibleFields({ artifact, selectedReferences, role: 'time' });
  const reasons = [];
  const selectedRefs = selectedReferences.map((reference) => ({
    project_id: reference.project_id,
    form_id: reference.project_form_id,
    dataset_ref: reference.dataset_ref,
    title: reference.title,
  }));

  if (datasetRefs.size !== projectCount) {
    reasons.push('duplicate_or_missing_dataset_references');
  }

  if (!commonMetrics.length) {
    reasons.push('no_common_metric_signature');
  }

  const requiresDimension = ['AGGREGATE', 'RANK', 'COMPARE'].includes(operation) || Boolean(semanticResolution.resolved_dimensions?.length);
  if (requiresDimension && !commonDimensions.length) {
    reasons.push('no_common_dimension_signature');
  }

  if ((semanticResolution.resolved_time_range || semanticResolution.resolved_time_fields?.length) && !commonTimeFields.length) {
    reasons.push('no_common_time_field_signature');
  }

  return {
    status: reasons.length ? 'incompatible' : 'compatible',
    compatible: reasons.length === 0,
    project_count: projectCount,
    selected_references: selectedRefs,
    reasons,
    common_metrics: commonMetrics.slice(0, 12),
    common_dimensions: commonDimensions.slice(0, 12),
    common_time_fields: commonTimeFields.slice(0, 8),
    supported_operations: ['COMPARE'],
    execution_note:
      'Compatibility is evaluated before execution. Multi-project execution needs a dedicated fan-out/fan-in plan and must not silently use only the first selected project.',
  };
};

const addSemanticVariants = (map, targetRef, values = []) => {
  const normalizedTargetRef = String(targetRef || '').trim();
  if (!normalizedTargetRef) return;
  const variants = compactArray(values.map(normalizeTerm), 50);
  if (!variants.length) return;
  map.set(normalizedTargetRef, compactArray([...(map.get(normalizedTargetRef) || []), ...variants], 80));
};

const buildApprovedSemanticVariantIndex = (artifact = {}) => {
  const index = new Map();
  const memoryRecords = [
    ...(artifact.synonyms || []),
    ...(artifact.business_glossary || []),
  ];
  memoryRecords.forEach((record) => {
    const targetRef = record.target_ref || record.targetRef;
    addSemanticVariants(index, targetRef, [
      record.term,
      record.normalized_term,
      record.normalizedTerm,
      record.target_label,
      record.targetLabel,
      ...(record.aliases || []),
    ]);
  });
  return index;
};

const semanticVariantsForRef = (semanticVariantIndex, targetRef) =>
  semanticVariantIndex?.get(String(targetRef || '').trim()) || [];

const generatedMeasureAliasesForField = (field = {}) => {
  if (field.intelligence_role !== 'measure') return [];
  const label = normalizeTerm(field.label);
  const valueType = normalizeTerm(field.value_type);
  const aliases = [];

  if (label.includes('amount') || valueType === 'currency' || valueType === 'number') {
    aliases.push('amount');
    const paymentLikeAmount =
      label.includes('payment') ||
      label.includes('paid') ||
      label.includes('payable') ||
      label.includes('amount paid') ||
      label.includes('amount due') ||
      label.includes('enter a amount');
    if (paymentLikeAmount) {
      aliases.push('total amount', 'payment amount', 'payment total', 'payment', 'total');
    }
  }
  if (label.includes('value')) {
    aliases.push('value', 'total value');
  }
  if (label.includes('cost')) {
    aliases.push('cost', 'total cost');
  }
  if (label.includes('fee')) {
    aliases.push('fee', 'total fee');
  }
  if (label.includes('price')) {
    aliases.push('price', 'total price');
  }
  if (label.includes('quantity') || label.includes('count')) {
    aliases.push('quantity', 'count', 'total count');
  }

  return aliases;
};

const termVariantsForField = (field, semanticVariantIndex = new Map()) =>
  compactArray([
    field.label,
    ...(field.aliases || []),
    ...(field.semantic?.aliases || []),
    ...generatedMeasureAliasesForField(field),
    ...semanticVariantsForRef(semanticVariantIndex, field.field_ref),
  ].map(normalizeTerm));

const termVariantsForMetric = (metric, semanticVariantIndex = new Map()) =>
  compactArray([
    metric.display_name,
    ...semanticVariantsForRef(semanticVariantIndex, metric.metric_key),
  ].map(normalizeTerm));

const termVariantsForDimension = (dimension, semanticVariantIndex = new Map()) =>
  compactArray([
    dimension.display_name,
    ...semanticVariantsForRef(semanticVariantIndex, dimension.dimension_key),
  ].map(normalizeTerm));

const isFieldEligibleAsQueryDimension = (field = {}) => {
  const role = String(field.intelligence_role || '').toLowerCase();
  const valueType = String(field.value_type || '').toLowerCase();
  if (['attachment', 'free_text', 'ignore', 'measure'].includes(role)) return false;
  if (['attachment', 'currency', 'number', 'percent'].includes(valueType)) return false;
  return Boolean(field.allowed_as_dimension || field.allowed_as_filter || ['label', 'identity', 'dimension', 'status', 'time'].includes(role));
};

const termVariantsForNodeObject = (item, keys) =>
  compactArray(keys.flatMap((key) => [item[key], normalizeTerm(item[key])]));

const scoreSemanticMatch = ({ terms, variants }) => {
  let score = 0;
  const matchedTerms = [];
  terms.forEach((term) => {
    if (!term) return;
    const matched = variants.some((variant) => {
      if (!variant) return false;
      if (variant === term) return true;
      if (!term.includes(' ') && ['id'].includes(term)) return false;
      if (!term.includes(' ') && variant.includes(term)) return true;
      return false;
    });
    if (matched) {
      matchedTerms.push(term);
      score = Math.max(score, term.includes(' ') ? 0.92 : 0.78);
    }
  });
  return { score, matchedTerms: compactArray(matchedTerms) };
};

const findSemanticMatches = ({ terms, candidates, variantBuilder, minScore = 0.74 }) =>
  Array.from(
    candidates
    .map((candidate) => {
      const variants = variantBuilder(candidate);
      const match = scoreSemanticMatch({ terms, variants });
      return {
        ...candidate,
        match_score: match.score,
        matched_terms: match.matchedTerms,
      };
    })
    .filter((candidate) => candidate.match_score >= minScore)
      .reduce((map, candidate) => {
        const key = candidate.field_ref || candidate.metric_key || candidate.dimension_key || candidate.node_ref || candidate.level_ref || candidate.structure_ref;
        if (!key) return map;
        const existing = map.get(key);
        if (!existing || candidate.match_score > existing.match_score) {
          map.set(key, candidate);
        }
        return map;
      }, new Map())
      .values()
  )
    .sort((left, right) => right.match_score - left.match_score || String(left.display_name || left.label || left.name || '').localeCompare(String(right.display_name || right.label || right.name || '')))
    .slice(0, 20);

const getSemanticMatchKey = (candidate) =>
  candidate.field_ref ||
  candidate.metric_key ||
  candidate.dimension_key ||
  candidate.node_ref ||
  candidate.level_ref ||
  candidate.structure_ref ||
  null;

const dedupeSemanticMatches = (matches = [], limit = 20) =>
  Array.from(
    matches
      .reduce((map, match) => {
        const key = getSemanticMatchKey(match);
        if (!key) return map;
        const existing = map.get(key);
        if (!existing || match.match_score > existing.match_score) {
          map.set(key, match);
        }
        return map;
      }, new Map())
      .values()
  ).slice(0, limit);

const resolveTimeRangeFromMessage = (message, existingTimeRange) => {
  if (existingTimeRange) return existingTimeRange;
  const text = normalizeTerm(message);
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

  if (text.includes('this month') || text.includes('current month')) {
    return {
      start: startOfMonth.toISOString(),
      end: endOfMonth.toISOString(),
      timezone: 'Africa/Lagos',
      source: 'message:this_month',
    };
  }
  if (text.includes('last month') || text.includes('previous month')) {
    return {
      start: previousMonthStart.toISOString(),
      end: previousMonthEnd.toISOString(),
      timezone: 'Africa/Lagos',
      source: 'message:last_month',
    };
  }
  return null;
};

const isMetricLikeUnresolvedTerm = (term) => {
  const words = String(term || '').split(' ').filter(Boolean);
  if (!words.length) return false;
  const dimensionWords = new Set(['branch', 'branches', 'category', 'categories', 'department', 'departments', 'region', 'regions']);
  const timeWords = new Set(['month', 'quarter', 'year', 'date']);
  return words.some((word) => !dimensionWords.has(word) && !timeWords.has(word));
};

const isTimeTerm = (term) => ['month', 'quarter', 'year', 'date'].includes(String(term || '').trim());

const termIsExplainedByResolvedParts = ({ term, matchedTermSet, resolvedTimeRange }) => {
  const words = String(term || '').split(' ').filter(Boolean);
  if (words.length <= 1) return false;
  const timeWords = new Set(['month', 'quarter', 'year', 'date']);
  const matchedWordSet = new Set(
    Array.from(matchedTermSet || []).flatMap((matchedTerm) => String(matchedTerm || '').split(' ').filter(Boolean))
  );
  return words.every(
    (word) =>
      matchedTermSet.has(word) ||
      matchedWordSet.has(word) ||
      (resolvedTimeRange && timeWords.has(word))
  );
};

const singleTermIsCoveredBySpecificPhrase = ({ term, matchedTermSet }) => {
  const normalizedTerm = String(term || '').trim();
  if (!normalizedTerm || normalizedTerm.includes(' ')) return false;
  return Array.from(matchedTermSet || []).some((matchedTerm) => {
    const words = String(matchedTerm || '').split(' ').filter(Boolean);
    return words.length > 1 && words.includes(normalizedTerm);
  });
};

const compactUnresolvedTerms = (terms = []) => {
  const normalizedTerms = compactArray(terms, 20);
  const timeWords = new Set(['day', 'week', 'month', 'quarter', 'year', 'date']);
  const withoutTimePhrases = normalizedTerms.filter((term) => {
    const words = String(term || '').split(' ').filter(Boolean);
    return !words.some((word) => timeWords.has(word));
  });
  const singleWordTerms = new Set(withoutTimePhrases.filter((term) => !String(term).includes(' ')));
  return withoutTimePhrases.filter((term) => {
    const words = String(term || '').split(' ').filter(Boolean);
    return words.length <= 1 || !words.every((word) => singleWordTerms.has(word));
  });
};

const resolveSemanticIntent = ({ artifact, message, operation, selectedReferences, scopeSnapshot, timeRange }) => {
  const terms = extractCandidateTerms(message);
  const allowedProjectIds = getAllowedProjectIds({ artifact, selectedReferences });
  const allowedNodeRefs = new Set(scopeSnapshot.visible_node_ids || []);
  const fields = (artifact?.form_fields || []).filter((field) => allowedProjectIds.has(field.project_id));
  const metrics = (artifact?.metrics || []).filter((metric) => allowedProjectIds.has(metric.source?.dataset?.replace('project_form:', '') || metric.source?.dataset));
  const dimensions = (artifact?.dimensions || []).filter((dimension) =>
    allowedProjectIds.has(dimension.source?.dataset?.replace('project_form:', '') || dimension.source?.dataset)
  );
  const nodes = (artifact?.organization?.nodes || []).filter((node) => allowedNodeRefs.has(node.node_ref));
  const levels = artifact?.organization?.levels || [];
  const structures = artifact?.organization?.structures || [];
  const semanticVariantIndex = buildApprovedSemanticVariantIndex(artifact);
  const fieldMetricMatches = findSemanticMatches({
    terms,
    candidates: fields.filter((field) => field.intelligence_role === 'measure'),
    variantBuilder: (field) => termVariantsForField(field, semanticVariantIndex),
  });
  const artifactMetricMatches = findSemanticMatches({
    terms,
    candidates: metrics.map((metric) => ({
      metric_key: metric.metric_key,
      display_name: metric.display_name,
      data_type: metric.data_type,
      aggregation: metric.aggregation,
      source: metric.source,
    })),
    variantBuilder: (metric) => termVariantsForMetric(metric, semanticVariantIndex),
  });
  const dimensionMatches = findSemanticMatches({
    terms,
    candidates: [
      ...fields.filter((field) => isFieldEligibleAsQueryDimension(field) && field.intelligence_role !== 'time'),
      ...dimensions.map((dimension) => ({
        field_ref: dimension.dimension_key,
        label: dimension.display_name,
        intelligence_role: dimension.role,
        value_type: dimension.data_type,
        source: dimension.source,
      })),
    ],
    variantBuilder: (field) => termVariantsForField(field, semanticVariantIndex),
  });
  const nodeMatches = findSemanticMatches({
    terms,
    candidates: nodes.map((node) => ({
      node_ref: node.node_ref,
      node_id: node.node_id,
      name: node.name,
      level_ref: node.level_ref,
      structure_ref: node.structure_ref,
    })),
    variantBuilder: (node) => termVariantsForNodeObject(node, ['node_id', 'name']),
  });
  const levelMatches = findSemanticMatches({
    terms,
    candidates: levels.map((level) => ({
      level_ref: level.level_ref,
      name: level.name,
      rank: level.rank,
    })),
    variantBuilder: (level) => termVariantsForNodeObject(level, ['name']),
  });
  const structureMatches = findSemanticMatches({
    terms,
    candidates: structures.map((structure) => ({
      structure_ref: structure.structure_ref,
      name: structure.name,
      code: structure.code,
      type: structure.type,
    })),
    variantBuilder: (structure) => termVariantsForNodeObject(structure, ['name', 'code', 'type']),
  });
  const resolvedMetrics = compactArray(
    [...fieldMetricMatches.map((field) => field.field_ref), ...artifactMetricMatches.map((metric) => metric.metric_key)],
    12
  );
  const resolvedDimensions = compactArray(dimensionMatches.map((field) => field.field_ref), 12);
  const resolvedTimeFieldRefs = compactArray(
      fields
        .filter((field) => field.intelligence_role === 'time')
        .filter((field) => scoreSemanticMatch({ terms, variants: termVariantsForField(field, semanticVariantIndex) }).score >= 0.74)
        .map((field) => field.field_ref),
    8
  );
  const ambiguities = [];
  const unresolvedTerms = [];
  const resolvedTimeRange = resolveTimeRangeFromMessage(message, timeRange);
  const allMatches = [
    ...fieldMetricMatches,
    ...artifactMetricMatches,
    ...dimensionMatches,
    ...nodeMatches,
    ...levelMatches,
    ...structureMatches,
  ];
  const matchedTermSet = new Set(allMatches.flatMap((match) => match.matched_terms || []));

  terms.forEach((term) => {
    const matchCount = allMatches.filter((match) => (match.matched_terms || []).includes(term)).length;
    if (matchCount > 5 && !singleTermIsCoveredBySpecificPhrase({ term, matchedTermSet })) {
      ambiguities.push({
        term,
        reason: 'matched_many_semantic_objects',
        candidate_count: matchCount,
      });
    } else if (
      matchCount === 0 &&
      term.length >= 4 &&
      !(resolvedTimeRange && isTimeTerm(term)) &&
      !termIsExplainedByResolvedParts({ term, matchedTermSet, resolvedTimeRange })
    ) {
      unresolvedTerms.push(term);
    }
  });

  const defaultProjectProfiles = selectedReferences
    .map((reference) => (artifact?.forms || []).find((form) => form.project_id === reference.project_id))
    .filter(Boolean)
    .map((form) => form.project_intelligence_profile)
    .filter(Boolean);
  const defaultMetricRefs = resolvedMetrics.length
    ? resolvedMetrics
    : compactArray(defaultProjectProfiles.flatMap((profile) => profile.default_measure_field_refs || []), 8);
  const defaultDimensionRefs = resolvedDimensions.length
    ? resolvedDimensions
    : compactArray(defaultProjectProfiles.flatMap((profile) => profile.default_dimension_field_refs || []), 8);
  const timeFieldCaveats = resolvedTimeRange && !resolvedTimeFieldRefs.length
    ? ['time_range_requested_but_no_project_time_field_detected']
    : [];
  const compactedUnresolvedTerms = compactUnresolvedTerms(unresolvedTerms);
  const metricLikeUnresolvedTerms = compactedUnresolvedTerms.filter(isMetricLikeUnresolvedTerm);
  const canUseDefaults = metricLikeUnresolvedTerms.length === 0;
  const finalMetricRefs = resolvedMetrics.length || canUseDefaults
    ? defaultMetricRefs
    : [];
  const finalDimensionRefs = resolvedDimensions.length || canUseDefaults
    ? defaultDimensionRefs
    : resolvedDimensions;
  const usedMetricDefaults = canUseDefaults && !resolvedMetrics.length && defaultMetricRefs.length > 0;
  const usedDimensionDefaults = canUseDefaults && !resolvedDimensions.length && defaultDimensionRefs.length > 0;
  const semanticStatus = ambiguities.length
    ? 'ambiguous'
    : metricLikeUnresolvedTerms.length
      ? 'unresolved'
      : unresolvedTerms.length && !finalMetricRefs.length && !finalDimensionRefs.length
      ? 'unresolved'
      : 'resolved';

  return {
    semantic_status: semanticStatus,
    operation,
    scope: {
      selected_project_ids: selectedReferences.map((reference) => reference.project_id),
      selected_form_ids: selectedReferences.map((reference) => reference.project_form_id).filter(Boolean),
      visible_node_count: scopeSnapshot.visible_node_ids?.length || 0,
    },
    candidate_terms: terms,
    resolved_projects: selectedReferences.map((reference) => ({
      project_id: reference.project_id,
      title: reference.title,
      dataset_ref: reference.dataset_ref,
    })),
    resolved_forms: selectedReferences.map((reference) => ({
      project_id: reference.project_id,
      form_id: reference.project_form_id,
    })),
    resolved_metrics: finalMetricRefs,
    resolved_dimensions: finalDimensionRefs,
    resolved_time_range: resolvedTimeRange,
    resolved_time_fields: resolvedTimeFieldRefs,
    resolved_filters: [],
    matched_objects: {
      metrics: dedupeSemanticMatches(fieldMetricMatches.concat(artifactMetricMatches), 12),
      dimensions: dimensionMatches.slice(0, 12),
      nodes: nodeMatches.slice(0, 12),
      levels: levelMatches.slice(0, 12),
      structures: structureMatches.slice(0, 12),
    },
    ambiguities: ambiguities.slice(0, 10),
    unresolved_terms: compactedUnresolvedTerms.slice(0, 20),
    caveats: timeFieldCaveats,
    assumptions: usedMetricDefaults || usedDimensionDefaults
      ? ['selected_project_defaults_used_when_message_did_not_name_specific_fields']
      : [],
    confidence: semanticStatus === 'resolved' ? 0.82 : semanticStatus === 'ambiguous' ? 0.55 : 0.3,
    source: 'active_tenant_artifact',
    llm_used: false,
  };
};

const listArtifactVersions = async ({ tenantId, limit = 20 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  return TenantKnowledgeArtifact.find({ tenantId })
    .select('tenantId artifactVersion schemaVersion status activatedAt builtBy sourceVersions buildMetadata buildErrors createdAt updatedAt')
    .sort({ artifactVersion: -1 })
    .limit(safeLimit)
    .lean();
};

const getKnowledgeArtifactStatus = async ({ tenantId }) => {
  const [activeArtifact, latestArtifact, totalVersions, pendingSemanticMemory] = await Promise.all([
    TenantKnowledgeArtifact.findOne({ tenantId, status: 'active' })
      .sort({ artifactVersion: -1 })
      .select('tenantId artifactVersion schemaVersion status activatedAt builtBy artifact sourceVersions buildMetadata buildErrors createdAt updatedAt')
      .lean(),
    TenantKnowledgeArtifact.findOne({ tenantId })
      .sort({ artifactVersion: -1 })
      .select('tenantId artifactVersion schemaVersion status activatedAt builtBy buildErrors createdAt updatedAt')
      .lean(),
    TenantKnowledgeArtifact.countDocuments({ tenantId }),
    ExecutiveSemanticMemory.countDocuments({ tenantId, approvalStatus: 'pending', status: 'active' }),
  ]);

  const artifact = getArtifactPayload(activeArtifact);
  return {
    tenant_id: tenantId,
    has_active_artifact: Boolean(activeArtifact),
    active_artifact: activeArtifact
      ? {
          artifact_version: activeArtifact.artifactVersion,
          schema_version: activeArtifact.schemaVersion,
          status: activeArtifact.status,
          activated_at: compactDate(activeArtifact.activatedAt),
          built_by: activeArtifact.builtBy || null,
          created_at: compactDate(activeArtifact.createdAt),
          updated_at: compactDate(activeArtifact.updatedAt),
        }
      : null,
    latest_artifact: latestArtifact
      ? {
          artifact_version: latestArtifact.artifactVersion,
          schema_version: latestArtifact.schemaVersion,
          status: latestArtifact.status,
          activated_at: compactDate(latestArtifact.activatedAt),
          build_errors: latestArtifact.buildErrors || [],
          created_at: compactDate(latestArtifact.createdAt),
          updated_at: compactDate(latestArtifact.updatedAt),
        }
      : null,
    total_versions: totalVersions,
    pending_semantic_memory: pendingSemanticMemory,
    counts: artifact
      ? {
          users: artifact.security?.users?.length || 0,
          workspace_actors: (artifact.security?.users || []).filter((user) => user.access_profile?.workspace_actor).length,
          submitter_only_users: (artifact.security?.users || []).filter(
            (user) => user.access_profile?.submitter && !user.access_profile?.workspace_actor
          ).length,
          nodes: artifact.organization?.nodes?.length || 0,
          projects: artifact.projects?.length || 0,
          forms: artifact.forms?.length || 0,
          datasets: artifact.datasets?.length || 0,
          metrics: artifact.metrics?.length || 0,
          dimensions: artifact.dimensions?.length || 0,
          business_glossary: artifact.business_glossary?.length || 0,
          synonyms: artifact.synonyms?.length || 0,
          reporting_rules: artifact.reporting_rules?.length || 0,
        }
      : {},
    semantic_memory: artifact?.semantic_memory || {
      source: 'ExecutiveSemanticMemory',
      approval_required: true,
      counts: {},
    },
  };
};

const listSemanticMemory = async ({ tenantId, type, approvalStatus, limit = 50 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const query = { tenantId };
  if (type) query.type = type;
  if (approvalStatus) query.approvalStatus = approvalStatus;
  return ExecutiveSemanticMemory.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();
};

const createSemanticMemory = async ({ tenantId, userId = null, body = {} }) => {
  const term = String(body.term || '').trim();
  if (!term) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Semantic memory term is required');
  }
  const normalizedTerm = normalizeTerm(term);
  if (!normalizedTerm) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Semantic memory term must contain searchable text');
  }

  const record = await ExecutiveSemanticMemory.create({
    memoryId: buildSemanticMemoryId(),
    tenantId,
    type: body.type,
    term,
    normalizedTerm,
    definition: body.definition || null,
    aliases: sanitizeSemanticAliases(body.aliases),
    targetType: body.targetType || 'general',
    targetRef: body.targetRef || null,
    targetLabel: body.targetLabel || null,
    confidence: Number(body.confidence || 0),
    evidence: sanitizeSemanticEvidence(body.evidence),
    source: body.source || 'admin',
    approvalStatus: 'pending',
    status: 'active',
    createdBy: userId,
    metadata: body.metadata || {},
  });

  await logAuditEvent({
    tenantId,
    userId,
    component: 'semantic_memory',
    action: 'semantic_memory_created',
    status: 'completed',
    inputReferences: {
      memoryId: record.memoryId,
      type: record.type,
      targetType: record.targetType,
      targetRef: record.targetRef,
    },
    policyDecision: {
      approval_required: true,
      learned_context_can_overwrite_controlled_definitions: false,
    },
  });

  return typeof record.toJSON === 'function' ? record.toJSON() : record;
};

const buildSemanticSuggestionCandidates = ({ semanticResolution = {} }) => {
  const matchedObjects = semanticResolution.matched_objects || {};
  return {
    metrics: (matchedObjects.metrics || []).slice(0, 5).map((item) => ({
      target_type: 'metric',
      target_ref: item.metric_key || item.field_ref || null,
      label: item.display_name || item.label || item.metric_key || item.field_ref || null,
      match_score: item.match_score || null,
    })),
    dimensions: (matchedObjects.dimensions || []).slice(0, 5).map((item) => ({
      target_type: 'dimension',
      target_ref: item.dimension_key || item.field_ref || null,
      label: item.display_name || item.label || item.dimension_key || item.field_ref || null,
      match_score: item.match_score || null,
    })),
  };
};

const createSemanticCorrectionSuggestions = async ({ tenantId, userId = null, context = {}, message = '' }) => {
  const semanticResolution = context.semantic_resolution || {};
  if (!['unresolved', 'ambiguous'].includes(semanticResolution.semantic_status)) {
    return [];
  }

  const unresolvedTerms = compactArray(semanticResolution.unresolved_terms || [], 5)
    .map(normalizeTerm)
    .filter((term) => term.length >= 3);
  if (!unresolvedTerms.length) return [];

  const candidates = buildSemanticSuggestionCandidates({ semanticResolution });
  const created = [];

  for (const term of unresolvedTerms) {
    const existing = await ExecutiveSemanticMemory.findOne({
      tenantId,
      normalizedTerm: term,
      approvalStatus: 'pending',
      status: 'active',
      source: 'system_suggestion',
    })
      .select('memoryId')
      .lean();
    if (existing) continue;

    const record = await ExecutiveSemanticMemory.create({
      memoryId: buildSemanticMemoryId(),
      tenantId,
      type: 'synonym',
      term,
      normalizedTerm: term,
      definition: `Review whether "${term}" should map to an approved Saby Intelligence metric, dimension, field, or business glossary term.`,
      aliases: [],
      targetType: 'general',
      targetRef: null,
      targetLabel: null,
      confidence: Math.min(Number(semanticResolution.confidence || 0.3), 0.6),
      evidence: sanitizeSemanticEvidence([
        {
          type: 'unresolved_prompt_term',
          value: term,
          source: context.request_id || 'request_context',
        },
        {
          type: 'prompt_excerpt',
          value: String(message || '').slice(0, 500),
          source: context.request_id || 'request_context',
        },
      ]),
      source: 'system_suggestion',
      approvalStatus: 'pending',
      status: 'active',
      createdBy: userId,
      metadata: {
        requestId: context.request_id || null,
        artifactVersion: context.artifact_version || null,
        semanticStatus: semanticResolution.semantic_status,
        selectedProjectIds: context.selected_project_ids || [],
        selectedFormIds: context.selected_form_ids || [],
        candidateTargets: candidates,
        llmUsed: false,
        requiresAdminTargetSelection: true,
      },
    });
    created.push(typeof record.toJSON === 'function' ? record.toJSON() : record);
  }

  if (created.length) {
    await logAuditEvent({
      tenantId,
      userId,
      requestId: context.request_id,
      component: 'semantic_memory',
      action: 'semantic_suggestions_created',
      status: 'completed',
      inputReferences: {
        unresolvedTerms,
        semanticStatus: semanticResolution.semantic_status,
      },
      outputReferences: {
        memoryIds: created.map((record) => record.memoryId),
      },
      artifactVersion: context.artifact_version,
      policyDecision: {
        approval_required: true,
        auto_approval_allowed: false,
        learned_context_can_overwrite_controlled_definitions: false,
      },
    });
  }

  return created;
};

const reviewSemanticMemory = async ({ tenantId, userId = null, memoryId, body = {} }) => {
  const approvalStatus = body.approvalStatus;
  const record = await ExecutiveSemanticMemory.findOneAndUpdate(
    { tenantId, memoryId },
    {
      $set: {
        approvalStatus,
        status: approvalStatus === 'archived' ? 'inactive' : 'active',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote || null,
      },
    },
    { new: true }
  ).lean();

  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Semantic memory record not found');
  }

  await logAuditEvent({
    tenantId,
    userId,
    component: 'semantic_memory',
    action: 'semantic_memory_reviewed',
    status: 'completed',
    inputReferences: {
      memoryId,
      approvalStatus,
      targetType: record.targetType,
      targetRef: record.targetRef,
    },
    policyDecision: {
      approval_required: true,
      artifact_rebuild_required: approvalStatus === 'approved',
    },
  });

  return record;
};

const buildTenantArtifact = async ({ tenantId, builtBy = null, activate = true }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const started = Date.now();
  await logAuditEvent({
    tenantId,
    userId: builtBy,
    component: 'tenant_artifact_builder',
    action: 'artifact_build_started',
    status: 'started',
  });

  try {
    const [
      latest,
      forms,
      users,
      roles,
      permissions,
      nodes,
      levels,
      structures,
      tenantConfigs,
      acceptedInvitations,
      tenantOnboarding,
      semanticMemory,
    ] =
      await Promise.all([
        TenantKnowledgeArtifact.findOne({ tenantId }).sort({ artifactVersion: -1 }).select('artifactVersion').lean(),
        ProjectForm.find({ tenantId, deletedAt: null })
          .select('tenantId projectId formId workspaceId identity elements analytics capabilities status metadata updatedAt createdAt')
          .lean(),
        User.find({ tenantId, deletedAt: null })
          .select('userId email firstname lastname roles isOwner isSuper isAdmin isSaby status updatedAt createdAt')
          .lean(),
        Role.find({ tenantId }).select('tenantId name description permissions isActive updatedAt createdAt').lean(),
        Permission.find({}).select('name resource action path method isWildcard isAdminLevel updatedAt createdAt').lean(),
        Nodes.find({ tenantId, deletedAt: null })
          .select('nodeId tenantId name parent identity path isMain isActive level structure users updatedAt createdAt')
          .lean(),
        Level.find({ tenantId, deletedAt: null })
          .select('tenantId name description rank isSpecial isActive updatedAt createdAt')
          .lean(),
        Structures.find({ tenantId })
          .select('tenantId name code haloId level type parent path isActive updatedAt createdAt')
          .lean(),
        TenantConfig.find({ tenantId }).select('entityType fields version updatedAt createdAt').lean(),
        WorkspaceInvitation.find({ tenantId, status: 'accepted' })
          .select('tenantId workspaceId email accessProfileId workspaceRole invitedUserId acceptedBy acceptedAt updatedAt createdAt')
          .lean(),
        TenantOnboarding.findOne({ tenantId })
          .select('tenantId ownerUserId workspaces updatedAt createdAt')
          .lean(),
        ExecutiveSemanticMemory.find({ tenantId, approvalStatus: 'approved', status: 'active' })
          .select('memoryId tenantId type term normalizedTerm definition aliases targetType targetRef targetLabel confidence evidence source approvalStatus status reviewedAt updatedAt')
          .lean(),
      ]);

    const artifactVersion = Number(latest?.artifactVersion || 0) + 1;
    const buildWarnings = [];
    const { assignments: userNodeAssignments, userNodeMap } = compileUserNodeAssignments({ tenantId, nodes });
    const relationships = compileRelationshipEdges({ tenantId, structures, nodes, roles, forms });
    const roleByRef = new Map(roles.map((role) => [normalizeId(role), role]));
    const permissionByRef = new Map(permissions.map((permission) => [normalizeId(permission), permission]));
    const acceptedInvitationByUserRef = new Map();
    acceptedInvitations.forEach((invitation) => {
      const userRef = normalizeId(invitation.acceptedBy || invitation.invitedUserId);
      if (!userRef) return;
      acceptedInvitationByUserRef.set(userRef, {
        workspace_id: invitation.workspaceId || null,
        workspace_role: invitation.workspaceRole || null,
        access_profile_id: invitation.accessProfileId || null,
        accepted_at: compactDate(invitation.acceptedAt),
        source: 'WorkspaceInvitation',
      });
    });
    const activeWorkspaceMembershipByUserRef = new Map();
    (tenantOnboarding?.workspaces || []).forEach((workspace) => {
      if (workspace?.isDeleted) return;
      (workspace.members || []).forEach((member) => {
        if (member.status && member.status !== 'active') return;
        const userRef = normalizeId(member.userId);
        if (!userRef) return;
        activeWorkspaceMembershipByUserRef.set(userRef, {
          workspace_id: workspace.workspaceId || null,
          workspace_role: member.role || null,
          access_profile_id: member.accessProfileId || null,
          source: 'TenantOnboarding.workspaces.members',
        });
      });
    });
    const userRoles = users.flatMap((user) =>
      (user.roles || []).map((roleRef) => ({
        tenant_id: tenantId,
        user_ref: normalizeId(user),
        role_ref: normalizeId(roleRef),
        source: 'User.roles',
      }))
    );
    const rolePermissions = roles.flatMap((role) =>
      (role.permissions || []).map((permissionRef) => ({
        tenant_id: tenantId,
        role_ref: normalizeId(role),
        permission_ref: normalizeId(permissionRef),
        source: 'Role.permissions',
      }))
    );

    const fieldProfilesByProject = new Map();
    const fieldProfiles = forms.flatMap((form) => {
      const profiles = (form.elements || []).map((field) => classifyField({ form, field }));
      fieldProfilesByProject.set(form.projectId, profiles);
      return profiles;
    });

    const metrics = fieldProfiles
      .filter((field) => field.intelligence_role === 'measure')
      .map((field) => ({
        metric_key: field.field_ref,
        display_name: field.label,
        data_type: field.value_type,
        aggregation: field.semantic?.aggregationAllowed?.[0] || field.allowed_operations[0] || 'count',
        source: {
          dataset: `project_form:${field.project_id}`,
          field: field.field_id,
        },
        version: 1,
      }));

    const dimensions = fieldProfiles
      .filter((field) => ['dimension', 'time', 'status'].includes(field.intelligence_role))
      .map((field) => ({
        dimension_key: field.field_ref,
        display_name: field.label,
        data_type: field.value_type,
        role: field.intelligence_role,
        source: {
          dataset: `project_form:${field.project_id}`,
          field: field.field_id,
        },
        version: 1,
      }));

    const sourceVersions = compileSourceVersions({
      users,
      roles,
      permissions,
      levels,
      structures,
      nodes,
      forms,
      tenantConfigs,
      acceptedInvitations,
      tenantOnboarding,
    });
    const approvedSemanticMemory = compileApprovedSemanticMemory(semanticMemory);

    const artifact = {
      tenant_id: tenantId,
      artifact_version: artifactVersion,
      schema_version: SCHEMA_VERSION,
      generated_at: new Date().toISOString(),
      status: 'building',
      organization: {
        levels: levels.map(sanitizeLevel),
        structures: structures.map(sanitizeStructure),
        nodes: nodes.map(sanitizeNode),
        relationships,
        user_node_assignments: userNodeAssignments,
        project_access_overrides: [],
        hierarchy_rules: [
          'Node visibility must be resolved server-side before data retrieval.',
          'Descendant access is deterministic and cannot be delegated to the model.',
          'Nodes.users is the initial source for user-node assignment edges.',
          'Projects are tenant-scoped by default; optional project settings may narrow access by workspace, users, roles, or nodes.',
        ],
      },
      security: {
        users: users.map((user) =>
          sanitizeUser({
            user,
            assignedNodeRefs: unique(userNodeMap.get(normalizeId(user)) || []),
            acceptedInvitationByUserRef,
            activeWorkspaceMembershipByUserRef,
            roleByRef,
            permissionByRef,
          })
        ),
        roles: roles.map(sanitizeRole),
        permissions: permissions.map(sanitizePermission),
        role_permissions: rolePermissions,
        user_roles: userRoles,
        workspace_actor_rules: [
          'isOwner, isSuper, isAdmin, or isSaby marks a user as workspace_actor.',
          'Accepted workspace invitations mark a user as workspace_actor.',
          'Active TenantOnboarding workspace membership marks a user as workspace_actor.',
          'A role alone does not mark a user as workspace_actor unless it resolves to an explicit workspace/admin permission.',
        ],
        submitter_separation_rules: [
          'Node assignment marks a user as submitter for form submission scope.',
          'Submission create/submit permission marks a user as submitter.',
          'Workspace_actor and submitter are independent capabilities; both can be true.',
          'Submitter-only users must be denied from main workspace login and Intelligence by default.',
        ],
        permission_rules: [
          'Use tenantId from authenticated user only.',
          'Use explicit project/form references only after backend revalidation.',
          'Model output must never grant or expand access.',
        ],
      },
      projects: forms.map((form) => ({
        project_id: form.projectId,
        tenant_id: tenantId,
        workspace_id: form.workspaceId || null,
        name: form.identity?.name || 'Untitled project',
        status: form.status,
        category: form.identity?.category || 'standard',
        scope: compileProjectScope(form),
        settings: compileProjectSettings(form),
        dataset_ref: `project_form:${form.projectId}`,
        source_updated_at: compactDate(form.updatedAt),
      })),
      forms: forms.map((form) =>
        compileProjectForm({ form, fieldProfiles: fieldProfilesByProject.get(form.projectId) || [] })
      ),
      form_fields: fieldProfiles,
      datasets: forms.map((form) => ({
        dataset_ref: `project_form:${form.projectId}`,
        tenant_id: tenantId,
        project_id: form.projectId,
        form_id: form.formId || null,
        type: 'project_form_submissions',
        read_tool: 'getProjectFormReport',
        source_endpoint: '/v1/submission-reports/module-table',
        contains_operational_data: true,
        embedded_in_artifact: false,
        required_permissions: ['submission:read'],
        scope_required: true,
      })),
      metrics,
      dimensions,
      tenant_configs: tenantConfigs.map(sanitizeTenantConfig),
      business_glossary: approvedSemanticMemory.glossary,
      synonyms: approvedSemanticMemory.synonyms,
      reporting_rules: [
        {
          key: 'project_form_default_report',
          description: 'Default executive reports use bounded submission samples, summary counts, and explicit caveats.',
        },
        {
          key: 'identity_redaction',
          description: 'Identity and attachment fields must be redacted or summarized before model/report output.',
        },
        ...approvedSemanticMemory.reportingRules,
      ],
      semantic_memory: {
        source: 'ExecutiveSemanticMemory',
        approval_required: true,
        counts: approvedSemanticMemory.counts,
      },
      output_preferences: {
        default_format: 'chat',
        allowed_formats: ['chat', 'markdown', 'json'],
      },
      feature_flags: {
        raw_sql_generation: false,
        python_sandbox: false,
        multi_form_comparison: false,
        export_files: false,
      },
      build_warnings: buildWarnings,
      source_versions: sourceVersions,
    };

    const serializedBytes = Buffer.byteLength(JSON.stringify(artifact), 'utf8');
    if (serializedBytes >= ARTIFACT_WARN_BYTES) {
      buildWarnings.push({
        code: 'artifact_size_warning',
        message: `Artifact size is ${serializedBytes} bytes; split storage should be considered before growth continues.`,
      });
    }
    if (serializedBytes >= ARTIFACT_BLOCK_BYTES) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Artifact size ${serializedBytes} bytes exceeds the safe activation threshold`
      );
    }

    let record = await TenantKnowledgeArtifact.create({
      tenantId,
      artifactVersion,
      schemaVersion: SCHEMA_VERSION,
      status: 'building',
      artifact,
      sourceVersions,
      buildMetadata: {
        durationMs: Date.now() - started,
        serializedBytes,
        counts: {
          users: users.length,
          workspaceActors: artifact.security.users.filter((user) => user.access_profile?.workspace_actor).length,
          submitters: artifact.security.users.filter((user) => user.access_profile?.submitter).length,
          workspaceSubmitters: artifact.security.users.filter(
            (user) => user.access_profile?.workspace_actor && user.access_profile?.submitter
          ).length,
          submitterOnly: artifact.security.users.filter(
            (user) => user.access_profile?.submitter && !user.access_profile?.workspace_actor
          ).length,
          unknownActors: artifact.security.users.filter(
            (user) => !user.access_profile?.workspace_actor && !user.access_profile?.submitter
          ).length,
          roles: roles.length,
          permissions: permissions.length,
          levels: levels.length,
          structures: structures.length,
          nodes: nodes.length,
          userNodeAssignments: userNodeAssignments.length,
          relationships: relationships.length,
          forms: forms.length,
          fields: fieldProfiles.length,
          metrics: metrics.length,
          dimensions: dimensions.length,
          tenantConfigs: tenantConfigs.length,
          acceptedWorkspaceInvitations: acceptedInvitations.length,
          onboardingWorkspaceMemberships: activeWorkspaceMembershipByUserRef.size,
        },
      },
      buildErrors: buildWarnings,
      activatedAt: null,
      builtBy,
    });

    if (activate) {
      const activatedAt = new Date();
      const promotedRecord = await TenantKnowledgeArtifact.findByIdAndUpdate(
        record._id,
        {
          $set: {
            status: 'active',
            'artifact.status': 'active',
            activatedAt,
          },
        },
        { new: true }
      );

      if (!promotedRecord) {
        throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to activate tenant knowledge artifact');
      }

      record = promotedRecord;

      try {
        await TenantKnowledgeArtifact.updateMany(
          {
            tenantId,
            status: 'active',
            _id: { $ne: record._id },
            artifactVersion: { $lt: artifactVersion },
          },
          {
            $set: {
              status: 'superseded',
              'artifact.status': 'superseded',
            },
          }
        );
      } catch (cleanupError) {
        await logAuditEvent({
          tenantId,
          userId: builtBy,
          component: 'tenant_artifact_builder',
          action: 'artifact_activation_cleanup_failed',
          status: 'warning',
          artifactVersion,
          metadata: {
            error: cleanupError.message,
          },
        });
      }
    }

    await logAuditEvent({
      tenantId,
      userId: builtBy,
      component: 'tenant_artifact_builder',
      action: 'artifact_build_completed',
      status: 'completed',
      durationMs: Date.now() - started,
      artifactVersion,
      outputReferences: {
        artifactId: normalizeId(record),
        artifactVersion,
      },
      metadata: record.buildMetadata,
    });

    return record;
  } catch (error) {
    await logAuditEvent({
      tenantId,
      userId: builtBy,
      component: 'tenant_artifact_builder',
      action: 'artifact_build_failed',
      status: 'failed',
      durationMs: Date.now() - started,
      errorCategory: 'ARTIFACT_BUILD_FAILED',
      metadata: { message: error.message },
    });
    throw error;
  }
};

const createRequestContext = async ({ user, body = {} }) => {
  if (!user?.tenantId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authenticated tenant is required');
  }

  const started = Date.now();
  const requestId = createRequestId();
  let activeArtifact = await getActiveArtifact({ tenantId: user.tenantId });
  if (!activeArtifact && canInitializeTenantArtifact(user)) {
    activeArtifact = await buildTenantArtifact({
      tenantId: user.tenantId,
      builtBy: normalizeId(user),
      activate: true,
    });
  }
  const artifact = getArtifactPayload(activeArtifact);
  const requestedReferences = Array.isArray(body.references) ? body.references : [];
  const requestedNodeIds = Array.isArray(body.requestedNodeIds) ? body.requestedNodeIds : [];
  const baseContext = {
    request_id: requestId,
    conversation_id: body.conversationId || null,
    tenant_id: user.tenantId,
    user_id: normalizeId(user),
    artifact_version: activeArtifact?.artifactVersion || null,
    artifact_status: activeArtifact ? activeArtifact.status : 'missing',
    artifact_stale: !activeArtifact,
    requested_operation: inferOperation(body.message),
    requested_output_formats: Array.isArray(body.outputFormats) && body.outputFormats.length ? body.outputFormats : ['chat'],
    resolved_time_range: normalizeRequestedTimeRange(body.timeRange),
    conversation_context: body.conversationContext || {},
    policy_snapshot: { ...DEFAULT_POLICY_SNAPSHOT },
    budgets: { ...DEFAULT_BUDGETS },
    created_at: new Date().toISOString(),
  };

  const completeBlockedContext = async ({ reason, statusCode = httpStatus.FORBIDDEN, metadata = {}, throwError = true }) => {
    const context = {
      ...baseContext,
      execution_allowed: false,
      blocking_reasons: [reason],
      user_roles: [],
      user_permissions: [],
      user_access_profile: null,
      user_flags: {
        isOwner: Boolean(user.isOwner),
        isSuper: Boolean(user.isSuper),
        isAdmin: Boolean(user.isAdmin),
        isSaby: Boolean(user.isSaby),
      },
      visible_node_ids: [],
      visible_nodes: [],
      selected_project_ids: [],
      selected_form_ids: [],
      selected_references: [],
      denied_references: [],
      resolved_metrics: [],
      resolved_dimensions: [],
      semantic_resolution: {
        semantic_status: 'blocked',
        operation: baseContext.requested_operation,
        resolved_projects: [],
        resolved_forms: [],
        resolved_metrics: [],
        resolved_dimensions: [],
        ambiguities: [],
        unresolved_terms: [],
        confidence: 0,
        source: 'blocked_context',
        llm_used: false,
      },
      scope_snapshot: {
        scope_status: 'blocked',
        scope_type: 'none',
        visible_node_ids: [],
        visible_nodes: [],
        assigned_node_refs: [],
        denied_node_ids: [],
        denied_nodes: [],
        excluded_node_ids: [],
        excluded_nodes: [],
        scope_reason: [reason],
        applied_policies: [],
        descendant_expansion: 'not_applicable',
      },
    };

    await logAuditEvent({
      requestId,
      tenantId: user.tenantId,
      userId: normalizeId(user),
      component: 'request_coordinator',
      action: 'request_context_blocked',
      status: 'blocked',
      durationMs: Date.now() - started,
      artifactVersion: context.artifact_version,
      inputReferences: { references: requestedReferences, requestedNodeIds },
      outputReferences: {
        operation: context.requested_operation,
        outputFormats: context.requested_output_formats,
      },
      errorCategory: reason,
      policyDecision: context.policy_snapshot,
      metadata,
    });

    if (throwError) {
      throw new ApiError(statusCode, reason);
    }

    return context;
  };

  if (!artifact) {
    return completeBlockedContext({
      reason: 'MISSING_ACTIVE_TENANT_ARTIFACT',
      statusCode: httpStatus.CONFLICT,
      throwError: false,
    });
  }

  const artifactUser = resolveArtifactUser({ artifact, user });
  if (!artifactUser) {
    await completeBlockedContext({
      reason: 'USER_NOT_FOUND_IN_ACTIVE_TENANT_ARTIFACT',
      metadata: { artifactVersion: activeArtifact.artifactVersion },
    });
  }

  const accessProfile = artifactUser.access_profile || {};
  if (!accessProfile.workspace_actor || !accessProfile.intelligence_allowed) {
    await completeBlockedContext({
      reason: 'SUBMITTER_ONLY_USER_BLOCKED_FROM_INTELLIGENCE',
      metadata: {
        artifactUserRef: artifactUser.user_ref,
        accessProfile,
      },
    });
  }

  const userRoles = resolveArtifactUserRoles({ artifact, artifactUser });
  const userPermissions = resolveArtifactUserPermissions({ artifact, roles: userRoles });
  const scopeSnapshot = resolveVisibleScope({
    artifact,
    tenantId: user.tenantId,
    artifactUser,
    roles: userRoles,
    permissions: userPermissions,
    requestedNodeIds,
  });
  const referenceDecision = resolveSelectedReferences({
    artifact,
    user,
    artifactUser,
    roles: userRoles,
    baseScope: scopeSnapshot,
    requestedReferences,
  });
  const blockingReasons = [];

  if (requestedReferences.length && referenceDecision.denied.length) {
    blockingReasons.push('DENIED_PROJECT_FORM_REFERENCES');
  }
  if (requestedNodeIds.length && scopeSnapshot.denied_nodes?.length) {
    blockingReasons.push('DENIED_NODE_REFERENCES');
  }
  const semanticResolution = resolveSemanticIntent({
    artifact,
    message: body.message,
    operation: baseContext.requested_operation,
    selectedReferences: referenceDecision.resolved,
    scopeSnapshot,
    timeRange: baseContext.resolved_time_range,
  });
  semanticResolution.resolved_filters = buildResolvedFilters({
    message: body.message,
    body,
  });
  const multiProjectCompatibility = evaluateMultiProjectCompatibility({
    artifact,
    selectedReferences: referenceDecision.resolved,
    semanticResolution,
    operation: baseContext.requested_operation,
  });

  if (referenceDecision.resolved.length > 1 && !multiProjectCompatibility.compatible) {
    blockingReasons.push('MULTI_PROJECT_REFERENCES_INCOMPATIBLE');
  }

  const context = {
    ...baseContext,
    execution_allowed: blockingReasons.length === 0,
    blocking_reasons: blockingReasons,
    user_roles: userRoles,
    user_permissions: userPermissions,
    user_access_profile: {
      workspace_actor: Boolean(accessProfile.workspace_actor),
      submitter: Boolean(accessProfile.submitter),
      main_app_login_allowed: Boolean(accessProfile.main_app_login_allowed),
      intelligence_allowed: Boolean(accessProfile.intelligence_allowed),
      submission_allowed: Boolean(accessProfile.submission_allowed),
    },
    user_flags: {
      isOwner: Boolean(artifactUser.flags?.is_owner),
      isSuper: Boolean(artifactUser.flags?.is_super),
      isAdmin: Boolean(artifactUser.flags?.is_admin),
      isSaby: Boolean(artifactUser.flags?.is_saby),
    },
    visible_node_ids: scopeSnapshot.visible_node_ids,
    visible_nodes: scopeSnapshot.visible_nodes,
    selected_project_ids: referenceDecision.resolved.map((reference) => reference.project_id),
    selected_form_ids: referenceDecision.resolved.map((reference) => reference.project_form_id).filter(Boolean),
    selected_references: referenceDecision.resolved,
    denied_references: referenceDecision.denied,
    resolved_metrics: semanticResolution.resolved_metrics,
    resolved_dimensions: semanticResolution.resolved_dimensions,
    semantic_resolution: semanticResolution,
    multi_project_compatibility: multiProjectCompatibility,
    scope_snapshot: scopeSnapshot,
  };

  const semanticSuggestions = await createSemanticCorrectionSuggestions({
    tenantId: user.tenantId,
    userId: normalizeId(user),
    context,
    message: body.message,
  });
  context.semantic_suggestions = semanticSuggestions.map((suggestion) => ({
    memory_id: suggestion.memoryId,
    term: suggestion.term,
    approval_status: suggestion.approvalStatus,
    source: suggestion.source,
  }));

  await logAuditEvent({
    requestId,
    tenantId: user.tenantId,
    userId: normalizeId(user),
    component: 'request_coordinator',
    action: context.execution_allowed ? 'request_context_created' : 'request_context_blocked',
    status: context.execution_allowed ? 'completed' : 'blocked',
    durationMs: Date.now() - started,
    artifactVersion: context.artifact_version,
    inputReferences: { references: requestedReferences, requestedNodeIds },
    outputReferences: {
      operation: context.requested_operation,
      outputFormats: context.requested_output_formats,
      selectedProjectIds: context.selected_project_ids,
      selectedFormIds: context.selected_form_ids,
      visibleNodeCount: context.visible_node_ids.length,
      semanticStatus: semanticResolution.semantic_status,
      multiProjectCompatibilityStatus: multiProjectCompatibility.status,
      semanticSuggestionIds: context.semantic_suggestions.map((suggestion) => suggestion.memory_id),
    },
    errorCategory: blockingReasons[0] || null,
    policyDecision: context.policy_snapshot,
    metadata: {
      artifactUserRef: artifactUser.user_ref,
      scopeType: scopeSnapshot.scope_type,
      deniedNodes: scopeSnapshot.denied_nodes,
      deniedReferences: referenceDecision.denied,
      semanticStatus: semanticResolution.semantic_status,
      unresolvedTerms: semanticResolution.unresolved_terms,
      ambiguities: semanticResolution.ambiguities,
      multiProjectCompatibility,
      semanticSuggestionsCreated: context.semantic_suggestions.length,
    },
  });

  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, blockingReasons[0]);
  }

  return context;
};

const getToolDefinition = (toolKey) => TOOL_REGISTRY.find((tool) => tool.toolKey === toolKey) || null;

const userHasRequiredToolPermissions = ({ context = {}, requiredPermissions = [] }) => {
  if (!requiredPermissions.length) return true;
  if (
    context.user_flags?.isOwner ||
    context.user_flags?.isSuper ||
    context.user_flags?.isAdmin ||
    context.user_flags?.isSaby
  ) {
    return true;
  }

  const permissionNames = new Set();
  (context.user_permissions || []).forEach((permission) => {
    if (permission?.name) permissionNames.add(String(permission.name).toLowerCase());
    if (permission?.resource && permission?.action) {
      permissionNames.add(`${permission.resource}:${permission.action}`.toLowerCase());
    }
    if (permission?.permission_ref) permissionNames.add(String(permission.permission_ref).toLowerCase());
  });

  return requiredPermissions.every((permission) => permissionNames.has(String(permission).toLowerCase()));
};

const resolveExecutionMode = ({ context = {}, requestedMode = 'auto' }) => {
  const explicit = String(requestedMode || 'auto').toLowerCase();
  if (
    ['report', 'aggregation', 'analysis', 'ranking', 'trend', 'comparison', 'multi_project_comparison', 'anomaly'].includes(
      explicit
    )
  ) {
    return explicit;
  }
  if ((context.selected_project_ids || []).length > 1 && context.requested_operation === 'COMPARE') {
    return 'multi_project_comparison';
  }
  if (context.requested_operation === 'COMPARE') return 'comparison';
  if (context.requested_operation === 'DETECT_ANOMALY') return 'anomaly';
  if (context.requested_operation === 'RANK') return 'ranking';
  if (context.requested_operation === 'TREND') return 'trend';
  if (context.requested_operation === 'AGGREGATE') return 'aggregation';
  if (context.requested_operation === 'ANALYZE') return 'analysis';
  if (['GENERATE_REPORT', 'ANALYZE', 'FILTER', 'DRILL_DOWN'].includes(context.requested_operation)) {
    return 'report';
  }
  return 'unsupported';
};

const buildPlanStages = ({ context = {}, executionMode, body = {} }) => {
  const selectedReference = context.selected_references?.[0] || {};
  const selectedReferences = context.selected_references || [];
  const baseInputs = {
    project_ids: context.selected_project_ids || [],
    form_ids: context.selected_form_ids || [],
    node_scope: {
      scope_type: context.scope_snapshot?.scope_type || null,
      visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
      requested_node_count: Array.isArray(body.requestedNodeIds) ? body.requestedNodeIds.length : 0,
    },
    semantic: {
      status: context.semantic_resolution?.semantic_status || null,
      metrics: context.semantic_resolution?.resolved_metrics || [],
      dimensions: context.semantic_resolution?.resolved_dimensions || [],
      filters: context.semantic_resolution?.resolved_filters || [],
      time_range: context.semantic_resolution?.resolved_time_range || context.resolved_time_range || null,
    },
  };

  if (executionMode === 'aggregation') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'DATA_RETRIEVAL',
        agent_type: 'DATA_RETRIEVAL',
        tool_key: 'get_project_form_aggregation',
        depends_on: [],
        read_only: true,
        operation: 'aggregate_project_form_facts',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          aggregate: body.aggregate || 'auto',
        },
        budgets: {
          max_groups: EXECUTIVE_AGGREGATION_MAX_GROUPS,
          timeout_seconds: getToolDefinition('get_project_form_aggregation')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  if (executionMode === 'multi_project_comparison') {
    return selectedReferences.map((reference, index) => ({
      stage_id: `stage_${index + 1}`,
      stage_type: 'ANALYTICS',
      agent_type: 'ANALYTICS',
      tool_key: 'get_multi_project_form_comparison',
      depends_on: [],
      read_only: true,
      operation: 'fan_out_project_form_aggregation',
      inputs: {
        ...baseInputs,
        project_id: reference.project_id || null,
        project_form_id: reference.project_form_id || null,
        project_title: reference.title || null,
        aggregate: body.aggregate || 'auto',
      },
      budgets: {
        max_groups: EXECUTIVE_AGGREGATION_MAX_GROUPS,
        timeout_seconds: getToolDefinition('get_multi_project_form_comparison')?.timeoutSeconds || 45,
      },
    }));
  }

  if (executionMode === 'ranking') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'ANALYTICS',
        agent_type: 'ANALYTICS',
        tool_key: 'get_project_form_ranking',
        depends_on: [],
        read_only: true,
        operation: 'rank_project_form_groups',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          aggregate: body.aggregate || 'auto',
          ranking_direction: body.rankingDirection || 'auto',
        },
        budgets: {
          max_groups: EXECUTIVE_RANKING_MAX_GROUPS,
          timeout_seconds: getToolDefinition('get_project_form_ranking')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  if (executionMode === 'trend') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'ANALYTICS',
        agent_type: 'ANALYTICS',
        tool_key: 'get_project_form_trend',
        depends_on: [],
        read_only: true,
        operation: 'trend_project_form_metric',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          aggregate: body.aggregate || 'auto',
          grain: body.grain || 'auto',
        },
        budgets: {
          max_periods: EXECUTIVE_TREND_MAX_PERIODS,
          timeout_seconds: getToolDefinition('get_project_form_trend')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  if (executionMode === 'comparison') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'ANALYTICS',
        agent_type: 'ANALYTICS',
        tool_key: 'get_project_form_period_comparison',
        depends_on: [],
        read_only: true,
        operation: 'compare_project_form_periods',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          aggregate: body.aggregate || 'auto',
          comparison_grain: body.comparisonGrain || 'auto',
        },
        budgets: {
          max_periods: 2,
          timeout_seconds: getToolDefinition('get_project_form_period_comparison')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  if (executionMode === 'anomaly') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'ANALYTICS',
        agent_type: 'ANALYTICS',
        tool_key: 'get_project_form_anomalies',
        depends_on: [],
        read_only: true,
        operation: 'detect_project_form_metric_anomalies',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          aggregate: body.aggregate || 'auto',
          grain: body.grain || 'auto',
        },
        budgets: {
          max_periods: EXECUTIVE_TREND_MAX_PERIODS,
          timeout_seconds: getToolDefinition('get_project_form_anomalies')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  if (executionMode === 'report') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'DATA_RETRIEVAL',
        agent_type: 'DATA_RETRIEVAL',
        tool_key: 'get_project_form_report',
        depends_on: [],
        read_only: true,
        operation: 'read_project_form_report_sample',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          search: body.search || null,
        },
        budgets: {
          max_rows: EXECUTIVE_REPORT_MAX_ROWS,
          timeout_seconds: getToolDefinition('get_project_form_report')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  if (executionMode === 'analysis') {
    return [
      {
        stage_id: 'stage_1',
        stage_type: 'ANALYTICS',
        agent_type: 'ANALYTICS',
        tool_key: 'get_project_form_analysis',
        depends_on: [],
        read_only: true,
        operation: 'profile_project_form_dataset',
        inputs: {
          ...baseInputs,
          project_id: selectedReference.project_id || null,
          analysis_types: ['dataset_profile', 'descriptive_statistics'],
        },
        budgets: {
          max_rows: EXECUTIVE_REPORT_MAX_ROWS,
          timeout_seconds: getToolDefinition('get_project_form_analysis')?.timeoutSeconds || 30,
        },
      },
    ];
  }

  return [];
};

const validateExecutionPlan = ({ context = {}, plan = {} }) => {
  const errors = [];
  const warnings = [];
  const allowedReportOperations = new Set(['GENERATE_REPORT', 'ANALYZE', 'FILTER', 'DRILL_DOWN', 'AGGREGATE']);
  const allowedAggregationOperations = new Set(['AGGREGATE']);
  const allowedRankingOperations = new Set(['RANK']);
  const allowedTrendOperations = new Set(['TREND']);
  const allowedComparisonOperations = new Set(['COMPARE']);
  const allowedMultiProjectComparisonOperations = new Set(['COMPARE']);
  const allowedAnomalyOperations = new Set(['DETECT_ANOMALY']);
  const allowedAnalysisOperations = new Set(['ANALYZE', 'GENERATE_REPORT']);

  if (!context.execution_allowed) {
    errors.push({
      code: 'EXECUTION_CONTEXT_BLOCKED',
      message: context.blocking_reasons?.[0] || 'Execution context is blocked',
    });
  }

  const semanticStatus = context.semantic_resolution?.semantic_status;
  const compatibleMultiProjectPlan =
    plan.execution_mode === 'multi_project_comparison' &&
    context.multi_project_compatibility?.compatible &&
    context.multi_project_compatibility?.common_metrics?.length &&
    context.multi_project_compatibility?.common_dimensions?.length &&
    context.semantic_resolution?.resolved_metrics?.length &&
    context.semantic_resolution?.resolved_dimensions?.length;
  if (
    semanticStatus === 'blocked' ||
    ((semanticStatus === 'unresolved' || semanticStatus === 'ambiguous') && !compatibleMultiProjectPlan)
  ) {
    errors.push({
      code: 'SEMANTIC_INTENT_NOT_RESOLVED',
      message: `Semantic status is ${semanticStatus}`,
    });
  }

  if (!context.selected_project_ids?.length) {
    errors.push({
      code: 'PROJECT_FORM_REFERENCE_REQUIRED',
      message: 'A selected project form reference is required for the current Intelligence MVP',
    });
  }

  if ((context.selected_project_ids || []).length > 1) {
    if (!context.multi_project_compatibility?.compatible) {
      errors.push({
        code: 'MULTI_PROJECT_REFERENCES_INCOMPATIBLE',
        message: 'Selected project forms do not share compatible metric/dimension signatures',
      });
    } else if (plan.execution_mode !== 'multi_project_comparison') {
      errors.push({
        code: 'MULTI_PROJECT_EXECUTION_MODE_REQUIRED',
        message: 'Compatible multi-project references must use the multi-project comparison execution mode',
      });
    }
  }

  if (plan.execution_mode === 'unsupported') {
    errors.push({
      code: 'UNSUPPORTED_OPERATION_FOR_MVP',
      message: `${context.requested_operation} is not supported by the current read-only planner`,
    });
  }

  if (plan.execution_mode === 'report' && !allowedReportOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form report tool`,
    });
  }

  if (plan.execution_mode === 'aggregation' && !allowedAggregationOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form aggregation tool`,
    });
  }

  if (plan.execution_mode === 'ranking' && !allowedRankingOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form ranking tool`,
    });
  }

  if (plan.execution_mode === 'trend' && !allowedTrendOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form trend tool`,
    });
  }

  if (plan.execution_mode === 'comparison' && !allowedComparisonOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form period comparison tool`,
    });
  }

  if (
    plan.execution_mode === 'multi_project_comparison' &&
    !allowedMultiProjectComparisonOperations.has(context.requested_operation)
  ) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the multi-project comparison tool`,
    });
  }

  if (plan.execution_mode === 'anomaly' && !allowedAnomalyOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form anomaly tool`,
    });
  }

  if (plan.execution_mode === 'analysis' && !allowedAnalysisOperations.has(context.requested_operation)) {
    errors.push({
      code: 'OPERATION_TOOL_MISMATCH',
      message: `${context.requested_operation} cannot be executed by the project form analysis tool`,
    });
  }

  const seenStageIds = new Set();
  (plan.stages || []).forEach((stage) => {
    if (!stage.stage_id || seenStageIds.has(stage.stage_id)) {
      errors.push({ code: 'INVALID_STAGE_ID', message: `Invalid or duplicate stage id ${stage.stage_id || ''}` });
    }
    seenStageIds.add(stage.stage_id);

    const tool = getToolDefinition(stage.tool_key);
    if (!tool) {
      errors.push({ code: 'UNKNOWN_TOOL', message: `Unknown tool ${stage.tool_key}` });
      return;
    }
    if (!tool.enabled) {
      errors.push({ code: 'TOOL_DISABLED', message: `Tool ${stage.tool_key} is disabled` });
    }
    if (!tool.allowedAgentTypes.includes(stage.agent_type)) {
      errors.push({
        code: 'TOOL_AGENT_TYPE_MISMATCH',
        message: `Tool ${stage.tool_key} cannot run as ${stage.agent_type}`,
      });
    }
    if (!stage.read_only) {
      errors.push({ code: 'WRITE_STAGE_REJECTED', message: `Stage ${stage.stage_id} is not read-only` });
    }
    if (!userHasRequiredToolPermissions({ context, requiredPermissions: tool.requiredPermissions || [] })) {
      errors.push({
        code: 'MISSING_TOOL_PERMISSION',
        message: `Missing permission for ${stage.tool_key}`,
      });
    }
    (stage.depends_on || []).forEach((dependency) => {
      if (!seenStageIds.has(dependency)) {
        errors.push({
          code: 'MISSING_OR_CYCLIC_DEPENDENCY',
          message: `Stage ${stage.stage_id} depends on unavailable stage ${dependency}`,
        });
      }
    });
  });

  const maxDatabaseQueries =
    plan.execution_mode === 'multi_project_comparison'
      ? Math.max(context.budgets.maxDatabaseQueries, (context.selected_project_ids || []).length)
      : context.budgets.maxDatabaseQueries;
  if ((plan.stages || []).length > maxDatabaseQueries) {
    errors.push({
      code: 'DATABASE_QUERY_BUDGET_EXCEEDED',
      message: 'Execution plan exceeds database query budget',
    });
  }

  if (plan.policy?.raw_sql_allowed || plan.policy?.generated_code_allowed || !plan.policy?.read_only) {
    errors.push({
      code: 'PLAN_POLICY_REJECTED',
      message: 'Current planner only allows read-only non-SQL non-generated-code execution',
    });
  }

  if (plan.execution_mode === 'aggregation' && !context.semantic_resolution?.resolved_dimensions?.length) {
    errors.push({
      code: 'DIMENSION_REQUIRED_FOR_AGGREGATION',
      message: 'Aggregation requires one resolved safe dimension',
    });
  }

  if (plan.execution_mode === 'ranking' && !context.semantic_resolution?.resolved_dimensions?.length) {
    errors.push({
      code: 'DIMENSION_REQUIRED_FOR_RANKING',
      message: 'Ranking requires one resolved safe dimension',
    });
  }

  if (plan.execution_mode === 'trend' && !context.semantic_resolution?.resolved_metrics?.length) {
    errors.push({
      code: 'METRIC_REQUIRED_FOR_TREND',
      message: 'Trend analysis requires one resolved safe metric',
    });
  }

  if (plan.execution_mode === 'comparison' && !context.semantic_resolution?.resolved_metrics?.length) {
    errors.push({
      code: 'METRIC_REQUIRED_FOR_COMPARISON',
      message: 'Period comparison requires one resolved safe metric',
    });
  }

  if (plan.execution_mode === 'multi_project_comparison') {
    if (!context.multi_project_compatibility?.common_dimensions?.length) {
      errors.push({
        code: 'DIMENSION_REQUIRED_FOR_MULTI_PROJECT_COMPARISON',
        message: 'Multi-project comparison requires one compatible safe dimension',
      });
    }
    if (!context.multi_project_compatibility?.common_metrics?.length) {
      errors.push({
        code: 'METRIC_REQUIRED_FOR_MULTI_PROJECT_COMPARISON',
        message: 'Multi-project comparison requires one compatible safe metric',
      });
    }
  }

  if (plan.execution_mode === 'anomaly' && !context.semantic_resolution?.resolved_metrics?.length) {
    errors.push({
      code: 'METRIC_REQUIRED_FOR_ANOMALY_DETECTION',
      message: 'Anomaly detection requires one resolved safe metric',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validated_at: new Date().toISOString(),
  };
};

const buildExecutionPlanFromContext = ({ context, body = {}, executionMode = 'auto' }) => {
  const resolvedMode = resolveExecutionMode({ context, requestedMode: executionMode });
  const stages = buildPlanStages({ context, executionMode: resolvedMode, body });
  const plan = {
    plan_id: `plan_${crypto.createHash('sha256').update(context.request_id).digest('hex').slice(0, 24)}`,
    request_id: context.request_id,
    schema_version: EXECUTION_PLAN_SCHEMA_VERSION,
    artifact_version: context.artifact_version,
    operation: context.requested_operation,
    execution_mode: resolvedMode,
    status: 'draft',
    stages,
    dependencies: stages.flatMap((stage) =>
      (stage.depends_on || []).map((dependency) => ({
        from: dependency,
        to: stage.stage_id,
      }))
    ),
    policy: {
      read_only: true,
      raw_sql_allowed: false,
      generated_code_allowed: false,
      production_write_allowed: false,
      require_execution_allowed_context: true,
      require_backend_reference_validation: true,
    },
    budgets: {
      ...context.budgets,
      maxRows:
        resolvedMode === 'trend'
          ? EXECUTIVE_TREND_MAX_PERIODS
          : resolvedMode === 'anomaly'
          ? EXECUTIVE_TREND_MAX_PERIODS
          : resolvedMode === 'ranking'
          ? EXECUTIVE_RANKING_MAX_GROUPS
          : resolvedMode === 'aggregation' || resolvedMode === 'multi_project_comparison'
          ? EXECUTIVE_AGGREGATION_MAX_GROUPS
          : Math.min(context.budgets.maxRows, EXECUTIVE_REPORT_MAX_ROWS),
    },
    audit: {
      request_id: context.request_id,
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      artifact_version: context.artifact_version,
    },
    created_at: new Date().toISOString(),
  };
  const validation = validateExecutionPlan({ context, plan });
  return {
    ...plan,
    status: validation.valid ? 'valid' : 'invalid',
    validation,
  };
};

const createExecutionPlan = async ({ user, body = {} }) => {
  const started = Date.now();
  const context = await createRequestContext({ user, body });
  const plan = buildExecutionPlanFromContext({
    context,
    body,
    executionMode: body.executionMode || 'auto',
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'execution_planner',
    action: plan.validation.valid ? 'execution_plan_validated' : 'execution_plan_rejected',
    status: plan.validation.valid ? 'completed' : 'blocked',
    durationMs: Date.now() - started,
    artifactVersion: context.artifact_version,
    inputReferences: {
      operation: context.requested_operation,
      executionMode: body.executionMode || 'auto',
      references: body.references || [],
    },
    outputReferences: {
      planId: plan.plan_id,
      stageCount: plan.stages.length,
      toolKeys: plan.stages.map((stage) => stage.tool_key),
      validationErrors: plan.validation.errors.map((error) => error.code),
    },
    errorCategory: plan.validation.valid ? null : 'INVALID_EXECUTION_PLAN',
    policyDecision: plan.policy,
  });

  return { context, plan };
};

const executeGeneratedSqlTool = async ({ user, body = {} }) => {
  const started = Date.now();
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;

  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }

  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'generated_sql_tool',
      action: 'generated_sql_execution_blocked',
      status: 'blocked',
      durationMs: Date.now() - started,
      artifactVersion: context.artifact_version,
      inputReferences: {
        references: body.references || [],
        requestedNodeIds: body.requestedNodeIds || [],
      },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: {
        ...context.policy_snapshot,
        rawSqlFromClientAccepted: false,
        generatedSqlRequiresAstValidation: true,
      },
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  if ((context.selected_project_ids || []).length !== 1) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SINGLE_PROJECT_REFERENCE_REQUIRED_FOR_GENERATED_SQL');
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }

  if (!userHasRequiredToolPermissions({ context, requiredPermissions: ['submission:read'] })) {
    throw new ApiError(httpStatus.FORBIDDEN, 'MISSING_TOOL_PERMISSION');
  }

  const execution = await executiveGeneratedSqlExecutor.executeGeneratedSql({
    sql: body.sql,
    parameters: Array.isArray(body.parameters) ? body.parameters : [],
    maxRows: body.maxRows || body.limit,
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'generated_sql_tool',
    action:
      execution.status === 'completed'
        ? 'generated_sql_execution_completed'
        : execution.status === 'failed'
        ? 'generated_sql_execution_failed'
        : 'generated_sql_execution_blocked',
    status: execution.status === 'completed' ? 'completed' : execution.status === 'failed' ? 'failed' : 'blocked',
    durationMs: Date.now() - started,
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      projectFormId: selectedReference.project_form_id,
      selectedProjectIds: context.selected_project_ids,
      selectedFormIds: context.selected_form_ids,
      nodeScopeType: context.scope_snapshot?.scope_type,
      visibleNodeCount: context.scope_snapshot?.visible_node_ids?.length || 0,
    },
    outputReferences: {
      queryFingerprint: execution.queryFingerprint,
      executionStatus: execution.status,
      reason: execution.reason || null,
      rowCount: execution.rowCount || 0,
      fields: execution.fields || [],
      validation: execution.validation,
    },
    errorCategory: execution.status === 'completed' ? null : execution.reason || 'GENERATED_SQL_EXECUTION_BLOCKED',
    policyDecision: {
      ...context.policy_snapshot,
      rawSqlAllowed: false,
      rawSqlFromClientAccepted: false,
      generatedSqlRequiresAstValidation: true,
      generatedSqlExecutionEnabled: executiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities().enabled,
      readOnlyDataAccess: true,
    },
  });

  return {
    context,
    generated_sql_execution: execution,
  };
};

const executeGeneratedPythonTool = async ({ user, body = {} }) => {
  const started = Date.now();
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;

  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }

  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'generated_python_tool',
      action: 'generated_python_execution_blocked',
      status: 'blocked',
      durationMs: Date.now() - started,
      artifactVersion: context.artifact_version,
      inputReferences: {
        references: body.references || [],
        requestedNodeIds: body.requestedNodeIds || [],
      },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: {
        ...context.policy_snapshot,
        generatedCodeRequiresSandbox: true,
        rawCodeStored: false,
        rawDatasetStored: false,
      },
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  if ((context.selected_project_ids || []).length !== 1) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SINGLE_PROJECT_REFERENCE_REQUIRED_FOR_GENERATED_PYTHON');
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }

  if (!userHasRequiredToolPermissions({ context, requiredPermissions: ['submission:read'] })) {
    throw new ApiError(httpStatus.FORBIDDEN, 'MISSING_TOOL_PERMISSION');
  }

  const inputPayloadBytes = assertSandboxInputPayloadWithinLimit(body.inputPayload ?? null);
  const execution = await executiveSandboxRunner.requestSandboxExecution({
    tenantId: context.tenant_id,
    userId: context.user_id,
    requestId: context.request_id,
    artifactVersion: context.artifact_version,
    runtime: 'python',
    code: body.code,
    inputPayload: body.inputPayload ?? null,
    inputManifest: {
      ...(body.inputManifest || {}),
      inputPayloadBytes,
      maxInputPayloadBytes: getSandboxMaxInputBytes(),
      selectedProjectIds: context.selected_project_ids || [],
      selectedFormIds: context.selected_form_ids || [],
      source: 'internal_generated_python_tool',
    },
    limits: body.limits || {},
    metadata: {
      projectId: selectedReference.project_id,
      projectFormId: selectedReference.project_form_id || null,
      nodeScopeType: context.scope_snapshot?.scope_type || null,
      visibleNodeCount: context.scope_snapshot?.visible_node_ids?.length || 0,
    },
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'generated_python_tool',
    action:
      execution.status === 'completed'
        ? 'generated_python_execution_completed'
        : execution.status === 'failed'
        ? 'generated_python_execution_failed'
        : 'generated_python_execution_blocked',
    status: execution.status === 'completed' ? 'completed' : execution.status === 'failed' ? 'failed' : 'blocked',
    durationMs: Date.now() - started,
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      projectFormId: selectedReference.project_form_id,
      selectedProjectIds: context.selected_project_ids,
      selectedFormIds: context.selected_form_ids,
      nodeScopeType: context.scope_snapshot?.scope_type,
      visibleNodeCount: context.scope_snapshot?.visible_node_ids?.length || 0,
      inputManifest: execution.inputManifest || {},
    },
    outputReferences: {
      sandboxExecutionId: execution.sandboxExecutionId,
      executionStatus: execution.status,
      runtime: execution.runtime,
      sandboxProvider: execution.sandboxProvider,
      codeFingerprint: execution.codeFingerprint,
      validation: execution.validationResult,
      errorCategory: execution.errorCategory || null,
    },
    errorCategory: execution.status === 'completed' ? null : execution.errorCategory || 'GENERATED_PYTHON_EXECUTION_BLOCKED',
    policyDecision: {
      ...context.policy_snapshot,
      generatedCodeRequiresSandbox: true,
      sandboxExecutionEnabled: executiveSandboxRunner.getSandboxCapabilities().enabled,
      rawCodeStored: false,
      rawDatasetStored: false,
      readOnlyDataAccess: true,
    },
  });

  return {
    context,
    generated_python_execution: execution,
  };
};

const assertValidExecutionPlan = async ({ context, body = {}, executionMode }) => {
  const plan = buildExecutionPlanFromContext({ context, body, executionMode });
  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'execution_planner',
    action: plan.validation.valid ? 'execution_plan_validated' : 'execution_plan_rejected',
    status: plan.validation.valid ? 'completed' : 'blocked',
    artifactVersion: context.artifact_version,
    inputReferences: {
      operation: context.requested_operation,
      executionMode,
      references: body.references || [],
    },
    outputReferences: {
      planId: plan.plan_id,
      stageCount: plan.stages.length,
      toolKeys: plan.stages.map((stage) => stage.tool_key),
      validationErrors: plan.validation.errors.map((error) => error.code),
    },
    errorCategory: plan.validation.valid ? null : 'INVALID_EXECUTION_PLAN',
    policyDecision: plan.policy,
  });

  if (!plan.validation.valid) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'INVALID_EXECUTION_PLAN', true, '', {
      type: 'execution_plan_invalid',
      request_id: context.request_id,
      plan_id: plan.plan_id,
      errors: plan.validation.errors,
      warnings: plan.validation.warnings,
    });
  }

  return plan;
};

const isPrivilegedTenantWideScope = (context = {}) => {
  const scopeType = context.scope_snapshot?.scope_type;
  return scopeType === 'tenant_all_nodes';
};

const expandContextNodeDescendants = ({ seedNodeRefs = [], visibleNodes = [] }) => {
  const seedSet = new Set(compactArray(seedNodeRefs));
  if (!seedSet.size) return [];
  const byParent = new Map();
  visibleNodes.forEach((node) => {
    if (!node?.node_ref) return;
    const parentRef = node.parent_node_ref || null;
    if (!byParent.has(parentRef)) byParent.set(parentRef, []);
    byParent.get(parentRef).push(node.node_ref);
  });

  const expanded = new Set(seedSet);
  const queue = [...seedSet];
  while (queue.length) {
    const current = queue.shift();
    (byParent.get(current) || []).forEach((childRef) => {
      if (expanded.has(childRef)) return;
      expanded.add(childRef);
      queue.push(childRef);
    });
  }
  return Array.from(expanded);
};

const resolveExactSemanticNodeFilters = (context = {}) => {
  const visibleNodeRefs = new Set(compactArray(context.scope_snapshot?.visible_node_ids || []));
  const exactNodeRefs = compactArray(
    (context.semantic_resolution?.matched_objects?.nodes || [])
      .filter((node) => (node.matched_terms || []).some((term) => String(term || '').includes(' ')))
      .map((node) => node.node_ref)
      .filter((nodeRef) => visibleNodeRefs.has(nodeRef)),
    100
  );
  return expandContextNodeDescendants({
    seedNodeRefs: exactNodeRefs,
    visibleNodes: context.visible_nodes || [],
  });
};

const resolveReportNodeFilters = (context = {}) => {
  const exactSemanticNodeFilters = resolveExactSemanticNodeFilters(context);
  if (exactSemanticNodeFilters.length) return exactSemanticNodeFilters;
  if (isPrivilegedTenantWideScope(context)) return [];
  return compactArray(context.scope_snapshot?.visible_node_ids || [], 5000);
};

const isUnsafeReportColumn = (column = {}) => {
  const text = normalizeTerm([
    column.key,
    column.label,
    column.field_type,
    column.type,
  ].filter(Boolean).join(' '));
  return /\b(email|phone|mobile|avatar|photo|image|file|upload|document|attachment|storage|s3|url|path|password|token|secret)\b/.test(text);
};

const redactUnsafeValue = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return REDACTED_FILE_VALUE;
  if (typeof value === 'object') return REDACTED_FILE_VALUE;
  const text = String(value);
  if (/https?:\/\//i.test(text) || /\bs3[.:/-]/i.test(text) || /\bamazonaws\.com\b/i.test(text)) {
    return REDACTED_VALUE;
  }
  if (text.length > 500) return `${text.slice(0, 500)}...`;
  return value;
};

const sanitizeExecutiveReport = ({ report = {}, context = {}, limit }) => {
  const columns = Array.isArray(report.columns) ? report.columns : [];
  const safeColumns = columns.filter((column) => !isUnsafeReportColumn(column));
  const safeColumnKeys = new Set(safeColumns.map((column) => column.key).filter(Boolean));
  const rows = (Array.isArray(report.rows) ? report.rows : []).slice(0, limit).map((row) => {
    const safeRow = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (key.startsWith('__')) return;
      if (!safeColumnKeys.has(key) && !['sn', 'submission_id', 'status', 'submitted_at', 'nodeid', 'node_name'].includes(key)) {
        return;
      }
      if (isUnsafeReportColumn({ key })) return;
      safeRow[key] = redactUnsafeValue(value);
    });
    return safeRow;
  });

  return {
    total: Number(report.total || 0),
    limit: Number(report.limit || limit),
    offset: Number(report.offset || 0),
    display_order: (Array.isArray(report.display_order) ? report.display_order : []).filter((key) =>
      safeColumnKeys.has(key)
    ),
    summary: report.summary || {},
    report_context: report.report_context || {},
    columns: safeColumns,
    rows,
    evidence: {
      sampled_row_count: rows.length,
      sampled_submission_ids: rows.map((row) => row.submission_id).filter(Boolean).slice(0, 25),
      source_endpoint: '/v1/submission-reports/module-table',
    },
    data_access: {
      request_id: context.request_id,
      artifact_version: context.artifact_version,
      read_only: true,
      raw_sql_allowed: false,
      generated_code_allowed: false,
      tool: 'get_project_form_report',
      semantic_status: context.semantic_resolution?.semantic_status,
      selected_project_ids: context.selected_project_ids || [],
      selected_form_ids: context.selected_form_ids || [],
      resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
      resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
      resolved_filters: context.semantic_resolution?.resolved_filters || [],
      resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
      resolved_time_fields: context.semantic_resolution?.resolved_time_fields || [],
      scope_type: context.scope_snapshot?.scope_type || null,
      visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
      caveats: context.semantic_resolution?.caveats || [],
      assumptions: context.semantic_resolution?.assumptions || [],
    },
  };
};

const getResolvedStatusFilters = (context = {}) =>
  normalizeStatusFilters(
    (context.semantic_resolution?.resolved_filters || [])
      .filter((filter) => filter.type === 'submission_status')
      .flatMap((filter) => filter.values || [])
  );

const getResolvedDimensionValueFilters = (context = {}) =>
  compactArray(
    (context.semantic_resolution?.resolved_filters || [])
      .filter((filter) => filter.type === 'dimension_value')
      .flatMap((filter) => filter.values || []),
    20
  );

const buildSemanticClarificationDetails = ({ context = {}, message = '' }) => {
  const semantic = context.semantic_resolution || {};
  const metricOptions = (semantic.matched_objects?.metrics || []).slice(0, 5).map((item) => ({
    ref: item.field_ref || item.metric_key,
    label: item.label || item.display_name || item.field_ref || item.metric_key,
    matched_terms: item.matched_terms || [],
  }));
  const dimensionOptions = (semantic.matched_objects?.dimensions || []).slice(0, 5).map((item) => ({
    ref: item.field_ref || item.dimension_key,
    label: item.label || item.display_name || item.field_ref || item.dimension_key,
    matched_terms: item.matched_terms || [],
  }));

  return {
    type: 'semantic_clarification_required',
    request_id: context.request_id,
    semantic_status: semantic.semantic_status,
    message,
    unresolved_terms: semantic.unresolved_terms || [],
    ambiguities: semantic.ambiguities || [],
    options: {
      metrics: metricOptions,
      dimensions: dimensionOptions,
    },
    suggested_prompt:
      metricOptions.length || dimensionOptions.length
        ? 'Please choose one of the available metric or dimension options and ask again.'
        : 'Please rephrase with a known metric or dimension from the selected project form.',
  };
};

const resolveAggregateFromMessage = ({ message, requestedAggregate, metricDefinition }) => {
  const explicit = String(requestedAggregate || '').trim().toLowerCase();
  if (['sum', 'avg', 'min', 'max', 'count'].includes(explicit)) return explicit;

  const text = normalizeTerm(message);
  if (/\b(count|number of|how many)\b/.test(text)) return 'count';
  if (/\b(avg|average|mean)\b/.test(text)) return 'avg';
  if (/\b(min|minimum|lowest)\b/.test(text)) return 'min';
  if (/\b(max|maximum|highest)\b/.test(text)) return 'max';
  if (/\b(sum|total)\b/.test(text)) return 'sum';
  return metricDefinition?.aggregation || 'sum';
};

const resolveRankingDirection = ({ message, requestedDirection }) => {
  const explicit = String(requestedDirection || '').trim().toLowerCase();
  if (['asc', 'bottom', 'lowest', 'worst'].includes(explicit)) return 'asc';
  if (['desc', 'top', 'highest', 'best'].includes(explicit)) return 'desc';
  const text = normalizeTerm(message);
  if (/\b(bottom|lowest|least|smallest|worst|underperforming|under performing)\b/.test(text)) return 'asc';
  return 'desc';
};

const resolveTrendGrain = ({ message, requestedGrain }) => {
  const explicit = String(requestedGrain || '').trim().toLowerCase();
  if (['day', 'week', 'month', 'quarter'].includes(explicit)) return explicit;
  const text = normalizeTerm(message);
  if (/\b(daily|day by day|per day|by day)\b/.test(text)) return 'day';
  if (/\b(weekly|week by week|per week|by week)\b/.test(text)) return 'week';
  if (/\b(quarterly|quarter by quarter|per quarter|by quarter)\b/.test(text)) return 'quarter';
  return 'month';
};

const resolveComparisonGrain = ({ message, requestedGrain }) => {
  const explicit = String(requestedGrain || '').trim().toLowerCase();
  if (['day', 'week', 'month', 'quarter', 'year'].includes(explicit)) return explicit;
  const text = normalizeTerm(message);
  if (/\b(day|daily|yesterday)\b/.test(text)) return 'day';
  if (/\b(week|weekly)\b/.test(text)) return 'week';
  if (/\b(quarter|quarterly)\b/.test(text)) return 'quarter';
  if (/\b(year|yearly|annual|annually)\b/.test(text)) return 'year';
  return 'month';
};

const addUtc = (date, { days = 0, months = 0, years = 0 } = {}) =>
  new Date(Date.UTC(
    date.getUTCFullYear() + years,
    date.getUTCMonth() + months,
    date.getUTCDate() + days,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ));

const startOfUtcPeriod = ({ date, grain }) => {
  if (grain === 'year') return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  if (grain === 'quarter') {
    const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1));
  }
  if (grain === 'week') {
    const day = date.getUTCDay() || 7;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1));
  }
  if (grain === 'day') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addPeriod = ({ date, grain, amount }) => {
  if (grain === 'year') return addUtc(date, { years: amount });
  if (grain === 'quarter') return addUtc(date, { months: amount * 3 });
  if (grain === 'week') return addUtc(date, { days: amount * 7 });
  if (grain === 'day') return addUtc(date, { days: amount });
  return addUtc(date, { months: amount });
};

const periodLabel = ({ date, grain, prefix }) => {
  const iso = date.toISOString().slice(0, 10);
  return `${prefix} ${grain} (${iso})`;
};

const resolveComparisonPeriods = ({ message, requestedGrain }) => {
  const grain = resolveComparisonGrain({ message, requestedGrain });
  const now = new Date();
  const currentStart = startOfUtcPeriod({ date: now, grain });
  const nextStart = addPeriod({ date: currentStart, grain, amount: 1 });
  const previousStart = addPeriod({ date: currentStart, grain, amount: -1 });
  const currentEnd = new Date(nextStart.getTime() - 1);
  const previousEnd = new Date(currentStart.getTime() - 1);

  return {
    grain,
    periods: [
      {
        label: periodLabel({ date: currentStart, grain, prefix: 'current' }),
        start: currentStart.toISOString(),
        end: currentEnd.toISOString(),
      },
      {
        label: periodLabel({ date: previousStart, grain, prefix: 'previous' }),
        start: previousStart.toISOString(),
        end: previousEnd.toISOString(),
      },
    ],
  };
};

const fieldIsUnsafeForAggregation = (field = {}) => {
  if (!field) return true;
  if (isUnsafeReportColumn({
    key: field.field_id,
    label: field.label,
    field_type: field.field_type || field.value_type,
  })) {
    return true;
  }
  return ['file', 'image', 'upload', 'profile_image_upload'].includes(
    String(field.field_type || field.value_type || '').toLowerCase()
  );
};

const resolveArtifactFieldForSemanticRef = ({ artifact, projectId, semanticRef, kind }) => {
  const fields = (artifact?.form_fields || []).filter((field) => field.project_id === projectId);
  const directField = fields.find((field) => field.field_ref === semanticRef);
  if (directField) return { field: directField, semanticDefinition: null };

  if (kind === 'metric') {
    const metric = (artifact?.metrics || []).find((item) => item.metric_key === semanticRef);
    if (metric?.source?.field) {
      const field = fields.find(
        (candidate) =>
          candidate.field_id === metric.source.field ||
          candidate.field_key === metric.source.field ||
          candidate.field_ref === metric.source.field
      );
      if (field) return { field, semanticDefinition: metric };
    }
  }

  if (kind === 'dimension') {
    const dimension = (artifact?.dimensions || []).find((item) => item.dimension_key === semanticRef);
    if (dimension?.source?.field) {
      const field = fields.find(
        (candidate) =>
          candidate.field_id === dimension.source.field ||
          candidate.field_key === dimension.source.field ||
          candidate.field_ref === dimension.source.field
      );
      if (field) return { field, semanticDefinition: dimension };
    }
  }

  return { field: null, semanticDefinition: null };
};

const buildAggregationMetadata = ({ context, report, aggregate, metricField, dimensionField }) => ({
  total_groups: report.total_groups,
  limit: report.limit,
  offset: report.offset,
  aggregation: {
    aggregate,
    metric: metricField
      ? {
          field_ref: metricField.field_ref,
          field_key: metricField.field_id,
          label: metricField.label,
          value_type: metricField.value_type,
        }
      : null,
    dimension: {
      field_ref: dimensionField.field_ref,
      field_key: dimensionField.field_id,
      label: dimensionField.label,
      value_type: dimensionField.value_type,
    },
  },
  rows: report.rows,
  evidence: {
    sampled_submission_ids: compactArray(
      (report.rows || []).flatMap((row) => row.sampled_submission_ids || []),
      25
    ),
    source_table: 'form_submission_facts',
    source_join: 'form_submissions',
  },
  data_access: {
    request_id: context.request_id,
    artifact_version: context.artifact_version,
    read_only: true,
    raw_sql_allowed: false,
    generated_code_allowed: false,
    tool: 'get_project_form_aggregation',
    semantic_status: context.semantic_resolution?.semantic_status,
    selected_project_ids: context.selected_project_ids || [],
    selected_form_ids: context.selected_form_ids || [],
    resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
    resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
    resolved_filters: context.semantic_resolution?.resolved_filters || [],
    resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
    scope_type: context.scope_snapshot?.scope_type || null,
    visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
    caveats: context.semantic_resolution?.caveats || [],
    assumptions: context.semantic_resolution?.assumptions || [],
  },
  query_context: report.query_context,
});

const resolveCompatibleProjectField = ({ artifact, projectId, compatibleField }) => {
  const fields = (artifact?.form_fields || []).filter((field) => field.project_id === projectId);
  const match = (compatibleField?.fields || []).find((field) => field.project_id === projectId);
  if (!match) return null;
  return fields.find(
    (field) =>
      field.field_ref === match.field_ref ||
      field.field_id === match.field_id ||
      field.field_key === match.field_id
  );
};

const normalizeMultiProjectAggregationRows = ({ rows = [], project = {} }) =>
  rows.map((row) => ({
    project_id: project.project_id,
    project_form_id: project.project_form_id || null,
    project_title: project.title || project.project_id,
    dimension_value: row.dimension_value,
    aggregate_value: row.aggregate_value,
    submission_count: row.submission_count,
    numeric_value_count: row.numeric_value_count,
    sampled_submission_ids: row.sampled_submission_ids || [],
  }));

const buildMultiProjectComparisonMetadata = ({
  context,
  selectedReferences = [],
  projectResults = [],
  aggregate,
  compatibleMetric,
  compatibleDimension,
}) => {
  const combinedRows = projectResults.flatMap((projectResult) =>
    normalizeMultiProjectAggregationRows({
      rows: projectResult.rows || [],
      project: projectResult,
    })
  );
  return {
    comparison_type: 'multi_project_form_aggregation',
    project_count: selectedReferences.length,
    aggregate,
    metric: compatibleMetric
      ? {
          signature: compatibleMetric.signature,
          label: compatibleMetric.label,
          value_type: compatibleMetric.value_type,
        }
      : null,
    dimension: compatibleDimension
      ? {
          signature: compatibleDimension.signature,
          label: compatibleDimension.label,
          value_type: compatibleDimension.value_type,
        }
      : null,
    projects: projectResults,
    combined_rows: combinedRows,
    evidence: {
      sampled_submission_ids: compactArray(
        combinedRows.flatMap((row) => row.sampled_submission_ids || []),
        25
      ),
      source_table: 'form_submission_facts',
      source_join: 'form_submissions',
      source_tool: 'getModuleReportAggregation',
    },
    data_access: {
      request_id: context.request_id,
      artifact_version: context.artifact_version,
      read_only: true,
      raw_sql_allowed: false,
      generated_code_allowed: false,
      tool: 'get_multi_project_form_comparison',
      semantic_status: context.semantic_resolution?.semantic_status,
      selected_project_ids: context.selected_project_ids || [],
      selected_form_ids: context.selected_form_ids || [],
      resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
      resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
      resolved_filters: context.semantic_resolution?.resolved_filters || [],
      resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
      multi_project_compatibility: {
        status: context.multi_project_compatibility?.status,
        reasons: context.multi_project_compatibility?.reasons || [],
      },
      scope_type: context.scope_snapshot?.scope_type || null,
      visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
      caveats: context.semantic_resolution?.caveats || [],
      assumptions: [
        ...(context.semantic_resolution?.assumptions || []),
        'multi_project_comparison_uses_common_metric_and_dimension_signatures',
      ],
    },
  };
};


const buildRankingMetadata = ({ context, report, aggregate, metricField, dimensionField, rankingDirection }) => ({
  total_groups: report.total_groups,
  limit: report.limit,
  offset: report.offset,
  ranking: {
    direction: rankingDirection === 'asc' ? 'bottom' : 'top',
    order_direction: rankingDirection,
    aggregate,
    metric: metricField
      ? {
          field_ref: metricField.field_ref,
          field_key: metricField.field_id,
          label: metricField.label,
          value_type: metricField.value_type,
        }
      : null,
    dimension: {
      field_ref: dimensionField.field_ref,
      field_key: dimensionField.field_id,
      label: dimensionField.label,
      value_type: dimensionField.value_type,
    },
  },
  rows: (report.rows || []).map((row, index) => ({
    rank: Number(report.offset || 0) + index + 1,
    ...row,
  })),
  evidence: {
    sampled_submission_ids: compactArray(
      (report.rows || []).flatMap((row) => row.sampled_submission_ids || []),
      25
    ),
    source_table: 'form_submission_facts',
    source_join: 'form_submissions',
  },
  data_access: {
    request_id: context.request_id,
    artifact_version: context.artifact_version,
    read_only: true,
    raw_sql_allowed: false,
    generated_code_allowed: false,
    sandbox_used: false,
    tool: 'get_project_form_ranking',
    semantic_status: context.semantic_resolution?.semantic_status,
    selected_project_ids: context.selected_project_ids || [],
    selected_form_ids: context.selected_form_ids || [],
    resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
    resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
    resolved_filters: context.semantic_resolution?.resolved_filters || [],
    resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
    scope_type: context.scope_snapshot?.scope_type || null,
    visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
    caveats: context.semantic_resolution?.caveats || [],
    assumptions: context.semantic_resolution?.assumptions || [],
  },
  query_context: report.query_context,
});

const buildTrendMetadata = ({ context, report, aggregate, metricField, grain }) => ({
  total_periods: report.total_periods,
  limit: report.limit,
  offset: report.offset,
  trend: {
    grain,
    aggregate,
    metric: metricField
      ? {
          field_ref: metricField.field_ref,
          field_key: metricField.field_id,
          label: metricField.label,
          value_type: metricField.value_type,
        }
      : null,
    time_source: report.trend?.time_source || 'form_submissions.created_at',
  },
  rows: (report.rows || []).map((row, index, rows) => {
    const previous = index > 0 ? rows[index - 1] : null;
    const previousValue = previous?.aggregate_value;
    const currentValue = row.aggregate_value;
    const absoluteChange =
      Number.isFinite(Number(currentValue)) && Number.isFinite(Number(previousValue))
        ? Number(currentValue) - Number(previousValue)
        : null;
    const percentChange =
      absoluteChange !== null && Number(previousValue) !== 0
        ? absoluteChange / Number(previousValue)
        : null;
    return {
      ...row,
      sequence: Number(report.offset || 0) + index + 1,
      change_from_previous: absoluteChange,
      percent_change_from_previous: percentChange,
    };
  }),
  evidence: {
    sampled_submission_ids: compactArray(
      (report.rows || []).flatMap((row) => row.sampled_submission_ids || []),
      25
    ),
    source_table: 'form_submission_facts',
    source_join: 'form_submissions',
    time_source: report.trend?.time_source || 'form_submissions.created_at',
  },
  data_access: {
    request_id: context.request_id,
    artifact_version: context.artifact_version,
    read_only: true,
    raw_sql_allowed: false,
    generated_code_allowed: false,
    sandbox_used: false,
    tool: 'get_project_form_trend',
    semantic_status: context.semantic_resolution?.semantic_status,
    selected_project_ids: context.selected_project_ids || [],
    selected_form_ids: context.selected_form_ids || [],
    resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
    resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
    resolved_filters: context.semantic_resolution?.resolved_filters || [],
    resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
    resolved_time_fields: context.semantic_resolution?.resolved_time_fields || [],
    scope_type: context.scope_snapshot?.scope_type || null,
    visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
    caveats: [
      ...(context.semantic_resolution?.caveats || []),
      ...(context.semantic_resolution?.resolved_time_fields?.length
        ? []
        : ['trend_uses_submission_created_at_because_no_project_time_field_was_resolved']),
    ],
    assumptions: context.semantic_resolution?.assumptions || [],
  },
  query_context: report.query_context,
});

const buildComparisonMetadata = ({ context, report, aggregate, metricField, grain }) => ({
  comparison: {
    grain,
    aggregate,
    metric: metricField
      ? {
          field_ref: metricField.field_ref,
          field_key: metricField.field_id,
          label: metricField.label,
          value_type: metricField.value_type,
        }
      : null,
    time_source: report.comparison?.time_source || 'form_submissions.created_at',
  },
  periods: report.periods || [],
  change: report.change || {},
  evidence: {
    sampled_submission_ids: compactArray(
      (report.periods || []).flatMap((period) => period.sampled_submission_ids || []),
      25
    ),
    source_table: 'form_submission_facts',
    source_join: 'form_submissions',
    time_source: report.comparison?.time_source || 'form_submissions.created_at',
  },
  data_access: {
    request_id: context.request_id,
    artifact_version: context.artifact_version,
    read_only: true,
    raw_sql_allowed: false,
    generated_code_allowed: false,
    sandbox_used: false,
    tool: 'get_project_form_period_comparison',
    semantic_status: context.semantic_resolution?.semantic_status,
    selected_project_ids: context.selected_project_ids || [],
    selected_form_ids: context.selected_form_ids || [],
    resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
    resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
    resolved_filters: context.semantic_resolution?.resolved_filters || [],
    resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
    resolved_time_fields: context.semantic_resolution?.resolved_time_fields || [],
    scope_type: context.scope_snapshot?.scope_type || null,
    visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
    caveats: [
      ...(context.semantic_resolution?.caveats || []),
      ...(context.semantic_resolution?.resolved_time_fields?.length
        ? []
        : ['comparison_uses_submission_created_at_because_no_project_time_field_was_resolved']),
    ],
    assumptions: context.semantic_resolution?.assumptions || [],
  },
  query_context: report.query_context,
});

const mean = (values = []) =>
  values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : null;

const standardDeviation = (values = [], avg = null) => {
  if (!values.length) return null;
  const baselineMean = avg === null || avg === undefined ? mean(values) : Number(avg);
  const variance =
    values.reduce((sum, value) => sum + Math.pow(Number(value || 0) - baselineMean, 2), 0) / values.length;
  return Math.sqrt(variance);
};

const classifyAnomalySeverity = ({ zScore, percentChange }) => {
  const absoluteZ = Math.abs(Number(zScore || 0));
  const absolutePercent = Math.abs(Number(percentChange || 0));
  if (absoluteZ >= 3.5 || absolutePercent >= 2) return 'high';
  if (absoluteZ >= 2.5 || absolutePercent >= 1) return 'medium';
  return 'low';
};

const detectAnomaliesFromTrendRows = (rows = []) => {
  const normalizedRows = rows
    .map((row, index) => ({
      ...row,
      sequence: Number(row.sequence || index + 1),
      value: Number(row.aggregate_value || 0),
    }))
    .filter((row) => Number.isFinite(row.value));
  const anomalies = [];

  normalizedRows.forEach((row, index) => {
    const baselineRows = normalizedRows.slice(0, index);
    if (baselineRows.length < 3) return;
    const baselineValues = baselineRows.map((item) => item.value);
    const baselineMean = mean(baselineValues);
    const baselineStddev = standardDeviation(baselineValues, baselineMean);
    const previous = baselineRows[baselineRows.length - 1];
    const absoluteChange = row.value - previous.value;
    const percentChange = previous.value !== 0 ? absoluteChange / previous.value : null;
    const zScore =
      baselineStddev && baselineStddev > 0 ? (row.value - baselineMean) / baselineStddev : 0;
    const isZAnomaly = Math.abs(zScore) >= 2.5;
    const isMovementAnomaly = percentChange !== null && Math.abs(percentChange) >= 1;

    if (!isZAnomaly && !isMovementAnomaly) return;

    anomalies.push({
      period_start: row.period_start || null,
      aggregate_value: row.value,
      submission_count: Number(row.submission_count || 0),
      numeric_value_count: Number(row.numeric_value_count || 0),
      baseline_period_count: baselineRows.length,
      baseline_mean: baselineMean,
      baseline_stddev: baselineStddev || 0,
      z_score: zScore,
      change_from_previous: absoluteChange,
      percent_change_from_previous: percentChange,
      direction: absoluteChange > 0 ? 'spike' : absoluteChange < 0 ? 'drop' : 'flat',
      severity: classifyAnomalySeverity({ zScore, percentChange }),
      sampled_submission_ids: Array.isArray(row.sampled_submission_ids)
        ? row.sampled_submission_ids
        : [],
    });
  });

  return anomalies;
};

const buildAnomalyMetadata = ({ context, report, aggregate, metricField, grain }) => {
  const trend = buildTrendMetadata({ context, report, aggregate, metricField, grain });
  const anomalies = detectAnomaliesFromTrendRows(trend.rows);
  const caveats = [
    ...(trend.data_access?.caveats || []),
    ...(trend.rows.length < 4
      ? ['anomaly_detection_requires_at_least_four_periods_for_statistical_baseline']
      : []),
  ];

  return {
    total_periods: trend.total_periods,
    total_anomalies: anomalies.length,
    anomaly_detection: {
      method: 'rolling_prior_period_baseline',
      minimum_baseline_periods: 3,
      z_score_threshold: 2.5,
      percent_change_threshold: 1,
      aggregate: trend.trend.aggregate,
      grain: trend.trend.grain,
      metric: trend.trend.metric,
      time_source: trend.trend.time_source,
    },
    anomalies,
    trend_rows: trend.rows,
    evidence: {
      ...trend.evidence,
      sampled_submission_ids: compactArray(
        anomalies.flatMap((anomaly) => anomaly.sampled_submission_ids || []),
        25
      ),
    },
    data_access: {
      ...trend.data_access,
      tool: 'get_project_form_anomalies',
      caveats,
    },
    query_context: trend.query_context,
  };
};

const buildRenderedReportArtifact = async ({ kind, context, executionPlan, data }) => {
  const canonicalReport = executiveReportRenderer.buildCanonicalReportModel({
    kind,
    context,
    executionPlan,
    data,
  });
  const requestedFormats = new Set(
    (Array.isArray(context.requested_output_formats) ? context.requested_output_formats : [])
      .map((format) => String(format || '').toLowerCase())
      .filter(Boolean)
  );
  const renderedReport = {
    markdown: (await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'markdown' })).content,
    json: (await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'json' })).content,
  };
  if (requestedFormats.has('csv')) {
    renderedReport.csv = await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'csv' });
  }
  if (requestedFormats.has('xlsx')) {
    renderedReport.xlsx = await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'xlsx' });
  }
  if (requestedFormats.has('html')) {
    renderedReport.html = await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'html' });
  }
  if (requestedFormats.has('pdf')) {
    renderedReport.pdf = await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'pdf' });
  }
  if (requestedFormats.has('docx')) {
    renderedReport.docx = await executiveReportRenderer.renderCanonicalReport(canonicalReport, { format: 'docx' });
  }
  if (renderedReport.csv || renderedReport.xlsx || renderedReport.html || renderedReport.pdf || renderedReport.docx) {
    const exportRenderSnapshot = {
      csv: renderedReport.csv ? { ...renderedReport.csv } : undefined,
      xlsx: renderedReport.xlsx ? { ...renderedReport.xlsx } : undefined,
      html: renderedReport.html ? { ...renderedReport.html } : undefined,
      pdf: renderedReport.pdf ? { ...renderedReport.pdf } : undefined,
      docx: renderedReport.docx ? { ...renderedReport.docx } : undefined,
    };
    const persistedExports = await executiveReportExportService.persistRenderedReportExports({
      tenantId: context.tenant_id,
      userId: context.user_id,
      requestId: context.request_id,
      reportModel: canonicalReport,
      renderedReport: exportRenderSnapshot,
    });
    if (persistedExports.csv) renderedReport.csv = persistedExports.csv;
    if (persistedExports.xlsx) renderedReport.xlsx = persistedExports.xlsx;
    if (persistedExports.html) renderedReport.html = persistedExports.html;
    if (persistedExports.pdf) renderedReport.pdf = persistedExports.pdf;
    if (persistedExports.docx) renderedReport.docx = persistedExports.docx;
  }

  return {
    canonical_report: canonicalReport,
    rendered_report: renderedReport,
  };
};

const isBlankAnalysisValue = (value) =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'string' && value.trim() === '');

const toNumericAnalysisValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
};

const toDateAnalysisValue = (value) => {
  if (!value) return null;
  if (
    typeof value === 'string' &&
    !/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value.trim())
  ) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const inferAnalysisColumnKind = ({ column = {}, values = [] }) => {
  const text = normalizeTerm([column.key, column.label, column.field_type, column.type].filter(Boolean).join(' '));
  if (/\bstatus\b/.test(text)) return 'categorical';
  if (/\b(date|time|created|submitted|updated|month)\b/.test(text)) return 'date';
  if (/\b(number|numeric|currency|amount|total|price|cost|budget|spent|value|score|rate|percent|percentage)\b/.test(text)) {
    return 'numeric';
  }

  const nonBlankValues = values.filter((value) => !isBlankAnalysisValue(value));
  if (!nonBlankValues.length) return 'empty';
  const numericCount = nonBlankValues.filter((value) => toNumericAnalysisValue(value) !== null).length;
  if (numericCount / nonBlankValues.length >= 0.8) return 'numeric';
  const dateCount = nonBlankValues.filter((value) => toDateAnalysisValue(value) !== null).length;
  if (dateCount / nonBlankValues.length >= 0.8) return 'date';
  return 'categorical';
};

const summarizeNumericColumn = ({ values = [] }) => {
  const numbers = values.map(toNumericAnalysisValue).filter((value) => value !== null);
  if (!numbers.length) {
    return {
      count: 0,
      sum: 0,
      avg: null,
      min: null,
      max: null,
    };
  }
  const sum = numbers.reduce((total, value) => total + value, 0);
  return {
    count: numbers.length,
    sum,
    avg: sum / numbers.length,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
};

const summarizeCategoricalColumn = ({ values = [] }) => {
  const counts = new Map();
  values.forEach((value) => {
    if (isBlankAnalysisValue(value)) return;
    const label = String(value).trim().slice(0, 160);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 10);
};

const summarizeDateColumn = ({ values = [] }) => {
  const dates = values.map(toDateAnalysisValue).filter(Boolean).sort();
  return {
    count: dates.length,
    earliest: dates[0] || null,
    latest: dates[dates.length - 1] || null,
  };
};

const buildProjectFormAnalysis = ({ context, report = {} }) => {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const columns = Array.isArray(report.columns) ? report.columns : [];
  const summary = report.summary || {};
  const totalRows = Number(report.total || summary.total_rows || rows.length || 0);
  const sampledRows = rows.length;
  const analysisColumns = columns
    .filter((column) => column?.key && !['sn', 'submission_id', 'user_id'].includes(String(column.key)))
    .slice(0, 40)
    .map((column) => {
      const values = rows.map((row) => row?.[column.key]);
      const blankCount = values.filter(isBlankAnalysisValue).length;
      const kind = inferAnalysisColumnKind({ column, values });
      const base = {
        key: column.key,
        label: column.label || column.key,
        field_type: column.field_type || column.type || null,
        kind,
        sampled_count: sampledRows,
        present_count: sampledRows - blankCount,
        missing_count: blankCount,
        missing_rate: sampledRows ? blankCount / sampledRows : null,
      };
      if (kind === 'numeric') {
        return {
          ...base,
          numeric: summarizeNumericColumn({ values }),
        };
      }
      if (kind === 'date') {
        return {
          ...base,
          date: summarizeDateColumn({ values }),
        };
      }
      return {
        ...base,
        top_values: summarizeCategoricalColumn({ values }),
      };
    });

  const numericColumns = analysisColumns.filter((column) => column.kind === 'numeric');
  const categoricalColumns = analysisColumns.filter((column) => column.kind === 'categorical');
  const dateColumns = analysisColumns.filter((column) => column.kind === 'date');
  const statusMix = {
    submitted: Number(summary.submitted_count || 0),
    approved: Number(summary.approved_count || 0),
    pending: Number(summary.pending_count || 0),
    rejected: Number(summary.rejected_count || 0),
    completed: Number(summary.completed_count || 0),
    failed: Number(summary.failed_count || 0),
  };
  const qualitySignals = [];
  const highMissingColumns = analysisColumns
    .filter((column) => column.missing_rate !== null && column.missing_rate >= 0.5 && sampledRows > 0)
    .slice(0, 5);
  if (highMissingColumns.length) {
    qualitySignals.push({
      type: 'missing_data',
      severity: 'warning',
      message: `${highMissingColumns.length} sampled field(s) are missing in at least half of returned rows.`,
      fields: highMissingColumns.map((column) => column.label),
    });
  }
  if (statusMix.pending > 0) {
    qualitySignals.push({
      type: 'pending_submissions',
      severity: 'notice',
      message: `${statusMix.pending} pending submission(s) may affect final reporting.`,
    });
  }
  if (statusMix.rejected > 0 || statusMix.failed > 0) {
    qualitySignals.push({
      type: 'failed_or_rejected_submissions',
      severity: 'warning',
      message: `${statusMix.rejected + statusMix.failed} rejected/failed submission(s) need review.`,
    });
  }
  if (report.report_context?.hide_identity_columns) {
    qualitySignals.push({
      type: 'identity_hidden',
      severity: 'notice',
      message: 'Identity fields are hidden because this form includes open/public submissions.',
    });
  }
  if (totalRows > sampledRows) {
    qualitySignals.push({
      type: 'bounded_sample',
      severity: 'notice',
      message: `Analysis used ${sampledRows} sampled row(s) from ${totalRows} matching submission(s).`,
    });
  }

  return {
    project: {
      project_ids: context.selected_project_ids || [],
      form_ids: context.selected_form_ids || [],
    },
    dataset_profile: {
      total_rows: totalRows,
      sampled_rows: sampledRows,
      column_count: columns.length,
      analyzed_column_count: analysisColumns.length,
      numeric_column_count: numericColumns.length,
      categorical_column_count: categoricalColumns.length,
      date_column_count: dateColumns.length,
      first_submission_at: summary.first_submission_at || null,
      latest_submission_at: summary.latest_submission_at || null,
      unique_nodes: Number(summary.unique_nodes || 0),
      status_mix: statusMix,
    },
    descriptive_statistics: {
      numeric: numericColumns.map((column) => ({
        key: column.key,
        label: column.label,
        ...column.numeric,
        missing_count: column.missing_count,
      })),
      categorical: categoricalColumns.slice(0, 12).map((column) => ({
        key: column.key,
        label: column.label,
        distinct_sampled_values: column.top_values.length,
        top_values: column.top_values,
        missing_count: column.missing_count,
      })),
      dates: dateColumns.map((column) => ({
        key: column.key,
        label: column.label,
        ...column.date,
        missing_count: column.missing_count,
      })),
    },
    field_profile: analysisColumns,
    quality_signals: qualitySignals,
    recommended_followups: [
      numericColumns.length && categoricalColumns.length
        ? `Ask for ${numericColumns[0].label} by ${categoricalColumns[0].label}.`
        : null,
      dateColumns.length && numericColumns.length
        ? `Ask for a trend of ${numericColumns[0].label} over ${dateColumns[0].label}.`
        : null,
      'Ask for top or bottom groups once ranking tools are enabled.',
      'Ask for a specific month, status, branch, node, or category.',
    ].filter(Boolean),
    evidence: {
      sampled_row_count: sampledRows,
      sampled_submission_ids: rows.map((row) => row.submission_id).filter(Boolean).slice(0, 25),
      source_endpoint: '/v1/submission-reports/module-table',
    },
    data_access: {
      request_id: context.request_id,
      artifact_version: context.artifact_version,
      read_only: true,
      raw_sql_allowed: false,
      generated_code_allowed: false,
      sandbox_used: false,
      tool: 'get_project_form_analysis',
      semantic_status: context.semantic_resolution?.semantic_status,
      selected_project_ids: context.selected_project_ids || [],
      selected_form_ids: context.selected_form_ids || [],
      resolved_metrics: context.semantic_resolution?.resolved_metrics || [],
      resolved_dimensions: context.semantic_resolution?.resolved_dimensions || [],
      resolved_filters: context.semantic_resolution?.resolved_filters || [],
      resolved_time_range: context.semantic_resolution?.resolved_time_range || null,
      scope_type: context.scope_snapshot?.scope_type || null,
      visible_node_count: context.scope_snapshot?.visible_node_ids?.length || 0,
      caveats: context.semantic_resolution?.caveats || [],
      assumptions: context.semantic_resolution?.assumptions || [],
    },
  };
};

const executeProjectFormReport = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'secure_data_access',
      action: 'project_form_report_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'report',
  });

  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_REPORT_DEFAULT_ROWS, 1),
    EXECUTIVE_REPORT_MAX_ROWS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const report = await submissionReportService.getModuleReportTable({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
    end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
    month: body.month || undefined,
    statuses: statusFilters,
    search: body.search || undefined,
    limit,
    offset,
    node_filters: nodeFilters,
  });
  const sanitizedReport = sanitizeExecutiveReport({ report, context, limit });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'secure_data_access',
    action: 'project_form_report_read',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      total: sanitizedReport.total,
      sampledRowCount: sanitizedReport.rows.length,
      columnCount: sanitizedReport.columns.length,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: EXECUTIVE_REPORT_MAX_ROWS,
  },
});


  return {
    context,
    execution_plan: executionPlan,
    report: sanitizedReport,
    ...(await buildRenderedReportArtifact({
      kind: 'report',
      context,
      executionPlan,
      data: sanitizedReport,
    })),
  };
};

const executeProjectFormAnalysis = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'analysis_runtime',
      action: 'project_form_analysis_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'analysis',
  });

  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_REPORT_DEFAULT_ROWS, 1),
    EXECUTIVE_REPORT_MAX_ROWS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const report = await submissionReportService.getModuleReportTable({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
    end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
    month: body.month || undefined,
    statuses: statusFilters,
    search: body.search || undefined,
    limit,
    offset,
    node_filters: nodeFilters,
  });
  const sanitizedReport = sanitizeExecutiveReport({ report, context, limit });
  const analysis = buildProjectFormAnalysis({ context, report: sanitizedReport });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'analysis_runtime',
    action: 'project_form_analysis_completed',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      totalRows: analysis.dataset_profile.total_rows,
      sampledRows: analysis.dataset_profile.sampled_rows,
      analyzedColumnCount: analysis.dataset_profile.analyzed_column_count,
      numericColumnCount: analysis.dataset_profile.numeric_column_count,
      categoricalColumnCount: analysis.dataset_profile.categorical_column_count,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: EXECUTIVE_REPORT_MAX_ROWS,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    analysis,
    ...(await buildRenderedReportArtifact({
      kind: 'analysis',
      context,
      executionPlan,
      data: analysis,
    })),
  };
};

const executeProjectFormTrend = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'analysis_runtime',
      action: 'project_form_trend_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'trend',
  });

  const activeArtifact = await getActiveArtifact({ tenantId: context.tenant_id });
  const artifact = getArtifactPayload(activeArtifact);
  const metricRef = context.semantic_resolution?.resolved_metrics?.[0] || null;
  const { field: metricField, semanticDefinition: metricDefinition } = metricRef
    ? resolveArtifactFieldForSemanticRef({
        artifact,
        projectId: selectedReference.project_id,
        semanticRef: metricRef,
        kind: 'metric',
      })
    : { field: null, semanticDefinition: null };
  const aggregate = resolveAggregateFromMessage({
    message: body.message,
    requestedAggregate: body.aggregate,
    metricDefinition,
  });
  const grain = resolveTrendGrain({
    message: body.message,
    requestedGrain: body.grain,
  });

  if (aggregate !== 'count' && (!metricField || fieldIsUnsafeForAggregation(metricField))) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_METRIC_NOT_RESOLVED');
  }

  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_TREND_DEFAULT_PERIODS, 1),
    EXECUTIVE_TREND_MAX_PERIODS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const report = await submissionReportService.getModuleReportTrend({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    metric_field_key: aggregate === 'count' ? null : metricField.field_id,
    aggregate,
    grain,
    start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
    end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
    month: body.month || undefined,
    statuses: statusFilters,
    search: body.search || undefined,
    limit,
    offset,
    node_filters: nodeFilters,
  });
  const trend = buildTrendMetadata({
    context,
    report,
    aggregate,
    metricField: aggregate === 'count' ? null : metricField,
    grain,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'analysis_runtime',
    action: 'project_form_trend_completed',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      aggregate,
      grain,
      metricFieldRef: metricField?.field_ref || null,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      totalPeriods: trend.total_periods,
      returnedRows: trend.rows.length,
      sampledSubmissionIds: trend.evidence.sampled_submission_ids,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: EXECUTIVE_TREND_MAX_PERIODS,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    trend,
    ...(await buildRenderedReportArtifact({
      kind: 'trend',
      context,
      executionPlan,
      data: trend,
    })),
  };
};

const executeProjectFormPeriodComparison = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'analysis_runtime',
      action: 'project_form_period_comparison_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'comparison',
  });

  const activeArtifact = await getActiveArtifact({ tenantId: context.tenant_id });
  const artifact = getArtifactPayload(activeArtifact);
  const metricRef = context.semantic_resolution?.resolved_metrics?.[0] || null;
  const { field: metricField, semanticDefinition: metricDefinition } = metricRef
    ? resolveArtifactFieldForSemanticRef({
        artifact,
        projectId: selectedReference.project_id,
        semanticRef: metricRef,
        kind: 'metric',
      })
    : { field: null, semanticDefinition: null };
  const aggregate = resolveAggregateFromMessage({
    message: body.message,
    requestedAggregate: body.aggregate,
    metricDefinition,
  });
  if (aggregate !== 'count' && (!metricField || fieldIsUnsafeForAggregation(metricField))) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_METRIC_NOT_RESOLVED');
  }

  const comparison = resolveComparisonPeriods({
    message: body.message,
    requestedGrain: body.comparisonGrain,
  });
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const report = await submissionReportService.getModuleReportPeriodComparison({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    metric_field_key: aggregate === 'count' ? null : metricField.field_id,
    aggregate,
    periods: comparison.periods,
    statuses: statusFilters,
    search: body.search || undefined,
    node_filters: nodeFilters,
  });
  const periodComparison = buildComparisonMetadata({
    context,
    report,
    aggregate,
    metricField: aggregate === 'count' ? null : metricField,
    grain: comparison.grain,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'analysis_runtime',
    action: 'project_form_period_comparison_completed',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      aggregate,
      grain: comparison.grain,
      metricFieldRef: metricField?.field_ref || null,
      nodeFilterCount: nodeFilters.length,
    },
    outputReferences: {
      direction: periodComparison.change.direction,
      sampledSubmissionIds: periodComparison.evidence.sampled_submission_ids,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: 2,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    comparison: periodComparison,
    ...(await buildRenderedReportArtifact({
      kind: 'comparison',
      context,
      executionPlan,
      data: periodComparison,
    })),
  };
};

const executeProjectFormAnomalies = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'analysis_runtime',
      action: 'project_form_anomaly_detection_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'anomaly',
  });

  const activeArtifact = await getActiveArtifact({ tenantId: context.tenant_id });
  const artifact = getArtifactPayload(activeArtifact);
  const metricRef = context.semantic_resolution?.resolved_metrics?.[0] || null;
  const { field: metricField, semanticDefinition: metricDefinition } = metricRef
    ? resolveArtifactFieldForSemanticRef({
        artifact,
        projectId: selectedReference.project_id,
        semanticRef: metricRef,
        kind: 'metric',
      })
    : { field: null, semanticDefinition: null };
  const aggregate = resolveAggregateFromMessage({
    message: body.message,
    requestedAggregate: body.aggregate,
    metricDefinition,
  });
  const grain = resolveTrendGrain({
    message: body.message,
    requestedGrain: body.grain,
  });

  if (aggregate !== 'count' && (!metricField || fieldIsUnsafeForAggregation(metricField))) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_METRIC_NOT_RESOLVED');
  }

  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_TREND_MAX_PERIODS, 4),
    EXECUTIVE_TREND_MAX_PERIODS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const report = await submissionReportService.getModuleReportTrend({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    metric_field_key: aggregate === 'count' ? null : metricField.field_id,
    aggregate,
    grain,
    start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
    end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
    month: body.month || undefined,
    statuses: statusFilters,
    search: body.search || undefined,
    limit,
    offset,
    node_filters: nodeFilters,
  });
  const anomaly = buildAnomalyMetadata({
    context,
    report,
    aggregate,
    metricField: aggregate === 'count' ? null : metricField,
    grain,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'analysis_runtime',
    action: 'project_form_anomaly_detection_completed',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      aggregate,
      grain,
      metricFieldRef: metricField?.field_ref || null,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      totalPeriods: anomaly.total_periods,
      totalAnomalies: anomaly.total_anomalies,
      sampledSubmissionIds: anomaly.evidence.sampled_submission_ids,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: EXECUTIVE_TREND_MAX_PERIODS,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    anomaly,
    ...(await buildRenderedReportArtifact({
      kind: 'anomaly',
      context,
      executionPlan,
      data: anomaly,
    })),
  };
};

const executeProjectFormRanking = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'analysis_runtime',
      action: 'project_form_ranking_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'ranking',
  });

  const activeArtifact = await getActiveArtifact({ tenantId: context.tenant_id });
  const artifact = getArtifactPayload(activeArtifact);
  const metricRef = context.semantic_resolution?.resolved_metrics?.[0] || null;
  const dimensionRef = context.semantic_resolution?.resolved_dimensions?.[0] || null;
  if (!dimensionRef) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'DIMENSION_REQUIRED_FOR_RANKING');
  }

  const { field: metricField, semanticDefinition: metricDefinition } = metricRef
    ? resolveArtifactFieldForSemanticRef({
        artifact,
        projectId: selectedReference.project_id,
        semanticRef: metricRef,
        kind: 'metric',
      })
    : { field: null, semanticDefinition: null };
  const { field: dimensionField } = resolveArtifactFieldForSemanticRef({
    artifact,
    projectId: selectedReference.project_id,
    semanticRef: dimensionRef,
    kind: 'dimension',
  });
  const aggregate = resolveAggregateFromMessage({
    message: body.message,
    requestedAggregate: body.aggregate,
    metricDefinition,
  });
  const rankingDirection = resolveRankingDirection({
    message: body.message,
    requestedDirection: body.rankingDirection,
  });

  if (!dimensionField || fieldIsUnsafeForAggregation(dimensionField)) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_DIMENSION_NOT_RESOLVED');
  }
  if (aggregate !== 'count' && (!metricField || fieldIsUnsafeForAggregation(metricField))) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_METRIC_NOT_RESOLVED');
  }

  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_RANKING_DEFAULT_GROUPS, 1),
    EXECUTIVE_RANKING_MAX_GROUPS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const dimensionValues = getResolvedDimensionValueFilters(context);
  const report = await submissionReportService.getModuleReportAggregation({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    metric_field_key: aggregate === 'count' ? null : metricField.field_id,
    dimension_field_key: dimensionField.field_id,
    aggregate,
    order_direction: rankingDirection,
    start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
    end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
    month: body.month || undefined,
    statuses: statusFilters,
    dimension_values: dimensionValues,
    search: body.search || undefined,
    limit,
    offset,
    node_filters: nodeFilters,
  });
  const ranking = buildRankingMetadata({
    context,
    report,
    aggregate,
    metricField: aggregate === 'count' ? null : metricField,
    dimensionField,
    rankingDirection,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'analysis_runtime',
    action: 'project_form_ranking_completed',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      aggregate,
      rankingDirection,
      metricFieldRef: metricField?.field_ref || null,
      dimensionFieldRef: dimensionField.field_ref,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      totalGroups: ranking.total_groups,
      returnedRows: ranking.rows.length,
      sampledSubmissionIds: ranking.evidence.sampled_submission_ids,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: EXECUTIVE_RANKING_MAX_GROUPS,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    ranking,
    ...(await buildRenderedReportArtifact({
      kind: 'ranking',
      context,
      executionPlan,
      data: ranking,
    })),
  };
};

const executeProjectFormAggregation = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  if (semanticStatus === 'ambiguous' || semanticStatus === 'unresolved' || semanticStatus === 'blocked') {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'secure_data_access',
      action: 'project_form_aggregation_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReference = context.selected_references?.[0];
  if (!selectedReference?.project_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PROJECT_FORM_REFERENCE_REQUIRED');
  }
  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'aggregation',
  });

  const activeArtifact = await getActiveArtifact({ tenantId: context.tenant_id });
  const artifact = getArtifactPayload(activeArtifact);
  const metricRef = context.semantic_resolution?.resolved_metrics?.[0] || null;
  const dimensionRef = context.semantic_resolution?.resolved_dimensions?.[0] || null;
  if (!dimensionRef) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'DIMENSION_REQUIRED_FOR_AGGREGATION');
  }

  const { field: metricField, semanticDefinition: metricDefinition } = metricRef
    ? resolveArtifactFieldForSemanticRef({
        artifact,
        projectId: selectedReference.project_id,
        semanticRef: metricRef,
        kind: 'metric',
      })
    : { field: null, semanticDefinition: null };
  const { field: dimensionField } = resolveArtifactFieldForSemanticRef({
    artifact,
    projectId: selectedReference.project_id,
    semanticRef: dimensionRef,
    kind: 'dimension',
  });
  const aggregate = resolveAggregateFromMessage({
    message: body.message,
    requestedAggregate: body.aggregate,
    metricDefinition,
  });

  if (!dimensionField || fieldIsUnsafeForAggregation(dimensionField)) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_DIMENSION_NOT_RESOLVED');
  }
  if (aggregate !== 'count' && (!metricField || fieldIsUnsafeForAggregation(metricField))) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_METRIC_NOT_RESOLVED');
  }

  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_AGGREGATION_DEFAULT_GROUPS, 1),
    EXECUTIVE_AGGREGATION_MAX_GROUPS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const dimensionValues = getResolvedDimensionValueFilters(context);
  const report = await submissionReportService.getModuleReportAggregation({
    tenant_id: context.tenant_id,
    project_id: selectedReference.project_id,
    metric_field_key: aggregate === 'count' ? null : metricField.field_id,
    dimension_field_key: dimensionField.field_id,
    aggregate,
    start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
    end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
    month: body.month || undefined,
    statuses: statusFilters,
    dimension_values: dimensionValues,
    search: body.search || undefined,
    limit,
    offset,
    node_filters: nodeFilters,
  });
  const aggregation = buildAggregationMetadata({
    context,
    report,
    aggregate,
    metricField: aggregate === 'count' ? null : metricField,
    dimensionField,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'secure_data_access',
    action: 'project_form_aggregation_read',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectId: selectedReference.project_id,
      aggregate,
      metricFieldRef: metricField?.field_ref || null,
      dimensionFieldRef: dimensionField.field_ref,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      totalGroups: aggregation.total_groups,
      sampledSubmissionIds: aggregation.evidence.sampled_submission_ids,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      maxRows: EXECUTIVE_AGGREGATION_MAX_GROUPS,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    aggregation,
    ...(await buildRenderedReportArtifact({
      kind: 'aggregation',
      context,
      executionPlan,
      data: aggregation,
    })),
  };
};

const executeMultiProjectFormComparison = async ({ user, body = {} }) => {
  const context = await createRequestContext({ user, body });
  const semanticStatus = context.semantic_resolution?.semantic_status;
  if (!context.execution_allowed) {
    throw new ApiError(httpStatus.FORBIDDEN, context.blocking_reasons?.[0] || 'EXECUTION_NOT_ALLOWED');
  }
  const compatibleMultiProjectContext =
    context.multi_project_compatibility?.compatible &&
    context.multi_project_compatibility?.common_metrics?.length &&
    context.multi_project_compatibility?.common_dimensions?.length &&
    context.semantic_resolution?.resolved_metrics?.length &&
    context.semantic_resolution?.resolved_dimensions?.length;
  if (
    semanticStatus === 'blocked' ||
    ((semanticStatus === 'unresolved' || semanticStatus === 'ambiguous') && !compatibleMultiProjectContext)
  ) {
    await logAuditEvent({
      requestId: context.request_id,
      tenantId: context.tenant_id,
      userId: context.user_id,
      component: 'secure_data_access',
      action: 'multi_project_comparison_blocked',
      status: 'blocked',
      artifactVersion: context.artifact_version,
      inputReferences: { references: body.references || [], requestedNodeIds: body.requestedNodeIds || [] },
      outputReferences: {
        semanticStatus,
        unresolvedTerms: context.semantic_resolution?.unresolved_terms || [],
        ambiguities: context.semantic_resolution?.ambiguities || [],
      },
      errorCategory: 'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      policyDecision: context.policy_snapshot,
    });
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'UNRESOLVED_OR_AMBIGUOUS_SEMANTIC_INTENT',
      true,
      '',
      buildSemanticClarificationDetails({ context, message: body.message })
    );
  }

  const selectedReferences = context.selected_references || [];
  if (selectedReferences.length < 2) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'MULTI_PROJECT_REFERENCES_REQUIRED');
  }
  if (!context.multi_project_compatibility?.compatible) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'MULTI_PROJECT_REFERENCES_INCOMPATIBLE');
  }

  const executionPlan = await assertValidExecutionPlan({
    context,
    body,
    executionMode: 'multi_project_comparison',
  });

  const activeArtifact = await getActiveArtifact({ tenantId: context.tenant_id });
  const artifact = getArtifactPayload(activeArtifact);
  const compatibleMetric = context.multi_project_compatibility.common_metrics?.[0] || null;
  const compatibleDimension = context.multi_project_compatibility.common_dimensions?.[0] || null;
  if (!compatibleDimension) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'DIMENSION_REQUIRED_FOR_MULTI_PROJECT_COMPARISON');
  }
  if (!compatibleMetric) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'METRIC_REQUIRED_FOR_MULTI_PROJECT_COMPARISON');
  }

  const aggregate = resolveAggregateFromMessage({
    message: body.message,
    requestedAggregate: body.aggregate,
    metricDefinition: compatibleMetric,
  });
  const limit = Math.min(
    Math.max(Number(body.limit) || EXECUTIVE_AGGREGATION_DEFAULT_GROUPS, 1),
    EXECUTIVE_AGGREGATION_MAX_GROUPS
  );
  const offset = Math.max(Number(body.offset) || 0, 0);
  const resolvedTimeRange = context.semantic_resolution?.resolved_time_range || context.resolved_time_range || {};
  const nodeFilters = resolveReportNodeFilters(context);
  const statusFilters = getResolvedStatusFilters(context);
  const dimensionValues = getResolvedDimensionValueFilters(context);

  const projectResults = [];
  for (const reference of selectedReferences) {
    const metricField =
      aggregate === 'count'
        ? null
        : resolveCompatibleProjectField({
            artifact,
            projectId: reference.project_id,
            compatibleField: compatibleMetric,
          });
    const dimensionField = resolveCompatibleProjectField({
      artifact,
      projectId: reference.project_id,
      compatibleField: compatibleDimension,
    });

    if (!dimensionField || fieldIsUnsafeForAggregation(dimensionField)) {
      throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_DIMENSION_NOT_RESOLVED');
    }
    if (aggregate !== 'count' && (!metricField || fieldIsUnsafeForAggregation(metricField))) {
      throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, 'SAFE_METRIC_NOT_RESOLVED');
    }

    const report = await submissionReportService.getModuleReportAggregation({
      tenant_id: context.tenant_id,
      project_id: reference.project_id,
      metric_field_key: aggregate === 'count' ? null : metricField.field_id,
      dimension_field_key: dimensionField.field_id,
      aggregate,
      start_date: body.startDate || body.start_date || resolvedTimeRange.start || undefined,
      end_date: body.endDate || body.end_date || resolvedTimeRange.end || undefined,
      month: body.month || undefined,
      statuses: statusFilters,
      dimension_values: dimensionValues,
      search: body.search || undefined,
      limit,
      offset,
      node_filters: nodeFilters,
    });

    projectResults.push({
      project_id: reference.project_id,
      project_form_id: reference.project_form_id || null,
      title: reference.title || reference.project_id,
      total_groups: report.total_groups,
      returned_rows: (report.rows || []).length,
      limit: report.limit,
      offset: report.offset,
      metric_field: aggregate === 'count'
        ? null
        : {
            field_ref: metricField.field_ref,
            field_key: metricField.field_id,
            label: metricField.label,
            value_type: metricField.value_type,
          },
      dimension_field: {
        field_ref: dimensionField.field_ref,
        field_key: dimensionField.field_id,
        label: dimensionField.label,
        value_type: dimensionField.value_type,
      },
      rows: report.rows || [],
    });
  }

  const comparison = buildMultiProjectComparisonMetadata({
    context,
    selectedReferences,
    projectResults,
    aggregate,
    compatibleMetric,
    compatibleDimension,
  });

  await logAuditEvent({
    requestId: context.request_id,
    tenantId: context.tenant_id,
    userId: context.user_id,
    component: 'secure_data_access',
    action: 'multi_project_form_comparison_read',
    status: 'completed',
    artifactVersion: context.artifact_version,
    inputReferences: {
      projectIds: selectedReferences.map((reference) => reference.project_id),
      aggregate,
      metricSignature: compatibleMetric.signature,
      dimensionSignature: compatibleDimension.signature,
      nodeFilterCount: nodeFilters.length,
      limit,
      offset,
    },
    outputReferences: {
      projectCount: comparison.project_count,
      combinedRowCount: comparison.combined_rows.length,
      sampledSubmissionIds: comparison.evidence.sampled_submission_ids,
      semanticStatus,
    },
    policyDecision: {
      ...context.policy_snapshot,
      readOnlyDataAccess: true,
      rawSqlAllowed: false,
      generatedCodeAllowed: false,
      fanOutQueries: selectedReferences.length,
      maxRows: EXECUTIVE_AGGREGATION_MAX_GROUPS,
    },
  });

  return {
    context,
    execution_plan: executionPlan,
    comparison,
  };
};

const listAuditEvents = async ({ tenantId, requestId, limit = 50 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const query = { tenantId };
  if (requestId) query.requestId = requestId;
  return ExecutiveIntelligenceAuditEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();
};

const getReportExportDownload = async ({ tenantId, user, exportId }) =>
  executiveReportExportService.getExportDownload({ tenantId, user, exportId });

module.exports = {
  CANONICAL_OPERATIONS,
  ERROR_CODES,
  TOOL_REGISTRY,
  getCapabilities,
  getActiveArtifact,
  listArtifactVersions,
  getKnowledgeArtifactStatus,
  listSemanticMemory,
  createSemanticMemory,
  reviewSemanticMemory,
  buildTenantArtifact,
  createRequestContext,
  evaluateMultiProjectCompatibility,
  buildExecutionPlanFromContext,
  validateExecutionPlan,
  createExecutionPlan,
  executeGeneratedSqlTool,
  executeGeneratedPythonTool,
  executeProjectFormReport,
  executeProjectFormAnalysis,
  executeProjectFormTrend,
  executeProjectFormPeriodComparison,
  executeProjectFormAnomalies,
  executeProjectFormRanking,
  executeProjectFormAggregation,
  executeMultiProjectFormComparison,
  getReportExportDownload,
  validateGeneratedSql: executiveGeneratedAnalysisPolicy.validateGeneratedSql,
  executeGeneratedSql: executiveGeneratedSqlExecutor.executeGeneratedSql,
  getGeneratedSqlExecutionCapabilities: executiveGeneratedSqlExecutor.getGeneratedSqlExecutionCapabilities,
  validateGeneratedCode: executiveGeneratedAnalysisPolicy.validateGeneratedCode,
  getSandboxCapabilities: executiveSandboxRunner.getSandboxCapabilities,
  requestSandboxExecution: executiveSandboxRunner.requestSandboxExecution,
  listAuditEvents,
  logAuditEvent,
};
