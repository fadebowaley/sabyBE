const Joi = require('joi');

const createAction = {
  body: Joi.object().keys({
    actionType: Joi.string().max(100).required(),
    entityType: Joi.string().max(100).required(),
    entityId: Joi.string().max(255).optional().allow('', null),
    payload: Joi.object().optional().default({}),
    idempotencyKey: Joi.string().max(255).optional(),
    source: Joi.string().max(64).optional().default('api'),
    priority: Joi.number().integer().min(0).max(100).optional().default(0),
  }),
};

const reverseAction = {
  params: Joi.object().keys({
    eventId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500).optional().allow(''),
    idempotencyKey: Joi.string().max(255).optional(),
  }),
};

const getActionById = {
  params: Joi.object().keys({
    eventId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

const getFeed = {
  query: Joi.object().keys({
    status: Joi.string()
      .valid('open', 'in_progress', 'snoozed', 'done', 'cancelled')
      .optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const updateActionItemStatus = {
  params: Joi.object().keys({
    actionItemId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid('open', 'in_progress', 'snoozed', 'done', 'cancelled')
      .required(),
    reason: Joi.string().max(500).optional().allow(''),
    metadata: Joi.object().optional().default({}),
  }),
};

const createAuditExportJob = {
  body: Joi.object().keys({
    exportType: Joi.string().max(64).required(),
    filters: Joi.object().optional().default({}),
  }),
};

const listAuditExportJobs = {
  query: Joi.object().keys({
    status: Joi.string()
      .valid('queued', 'processing', 'completed', 'failed', 'cancelled')
      .optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getAuditExportJobById = {
  params: Joi.object().keys({
    jobId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

const createProjectRules = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  body: Joi.object().keys({
    rules: Joi.object().required(),
  }),
};

const getProjectRules = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
};

const listProjectRuleVersions = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
};

const activateProjectRuleVersion = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
    version: Joi.number().integer().min(1).required(),
  }),
};

const recomputeProjectScoreboard = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  body: Joi.object().keys({
    periodStart: Joi.date().iso().optional(),
    periodEnd: Joi.date().iso().optional(),
  }),
};

const getProjectScoreboard = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
};

const getProjectScoreboardHistory = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(30),
  }),
};

const getProjectRulesAnalysis = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
  }),
};

const compareProjectNodes = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    leftNodeId: Joi.string().max(64).required(),
    rightNodeId: Joi.string().max(64).required(),
    leftScope: Joi.string().valid('self', 'family').optional(),
    rightScope: Joi.string().valid('self', 'family').optional(),
    enforceSameLevel: Joi.string().valid('true', 'false').optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
  }),
};

const getProjectNodeRankings = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    scope: Joi.string().valid('self', 'family').optional(),
    direction: Joi.string().valid('top', 'bottom').optional(),
    metric: Joi.string()
      .valid(
        'submissionCount',
        'contributorCount',
        'factCount',
        'sumCandidateTotal',
        'numericTotal',
        'numericAverage'
      )
      .optional(),
    limit: Joi.number().integer().min(1).max(5000).optional(),
    all: Joi.string().valid('true', 'false').optional(),
    includeZero: Joi.string().valid('true', 'false').optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
  }),
};

const exportProjectNodeComparison = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    leftNodeId: Joi.string().max(64).required(),
    rightNodeId: Joi.string().max(64).required(),
    leftScope: Joi.string().valid('self', 'family').optional(),
    rightScope: Joi.string().valid('self', 'family').optional(),
    enforceSameLevel: Joi.string().valid('true', 'false').optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
    format: Joi.string().valid('csv', 'json').optional(),
  }),
};

const exportProjectNodeRankings = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    scope: Joi.string().valid('self', 'family').optional(),
    direction: Joi.string().valid('top', 'bottom').optional(),
    metric: Joi.string()
      .valid(
        'submissionCount',
        'contributorCount',
        'factCount',
        'sumCandidateTotal',
        'numericTotal',
        'numericAverage'
      )
      .optional(),
    limit: Joi.number().integer().min(1).max(5000).optional(),
    all: Joi.string().valid('true', 'false').optional(),
    includeZero: Joi.string().valid('true', 'false').optional(),
    from: Joi.date().iso().optional(),
    to: Joi.date().iso().optional(),
    format: Joi.string().valid('csv', 'json').optional(),
  }),
};

const listTools = {
  query: Joi.object().keys({
    enabledOnly: Joi.string().valid('true', 'false').optional(),
  }),
};

const callTool = {
  params: Joi.object().keys({
    toolName: Joi.string().max(120).required(),
  }),
  body: Joi.object().keys({
    payload: Joi.object().optional().default({}),
    lockKey: Joi.string().max(255).optional(),
    lockTtlSec: Joi.number().integer().min(1).max(3600).optional(),
    approvalToken: Joi.string().max(500).optional(),
  }),
};

const listToolCallLogs = {
  query: Joi.object().keys({
    toolName: Joi.string().max(120).optional(),
    status: Joi.string().valid('success', 'failed', 'timeout', 'blocked').optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getSessionContext = {
  query: Joi.object().keys({}),
};

const updateSessionContext = {
  body: Joi.object().keys({
    currentProjectId: Joi.string().max(64).optional().allow('', null),
    currentNodeId: Joi.string().max(255).optional().allow('', null),
    recentEntities: Joi.array().items(Joi.object()).optional(),
    context: Joi.object().optional(),
    lastIntent: Joi.string().max(100).optional().allow('', null),
  }),
};

const getFocusState = {
  query: Joi.object().keys({
    focusType: Joi.string().max(64).optional(),
  }),
};

const updateFocusState = {
  body: Joi.object().keys({
    focusType: Joi.string().max(64).required(),
    focusEntityId: Joi.string().max(255).optional().allow('', null),
    focus: Joi.object().optional().default({}),
    expiresAt: Joi.date().iso().optional().allow(null),
  }),
};

const clearFocusState = {
  query: Joi.object().keys({
    focusType: Joi.string().max(64).required(),
  }),
};

const searchEntities = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(1).max(200).required(),
    entityTypes: Joi.array()
      .items(Joi.string().valid('user', 'role', 'node', 'project', 'permission'))
      .optional(),
    actionType: Joi.string().trim().max(100).optional(),
    limit: Joi.number().integer().min(1).max(25).optional().default(8),
  }),
};

const resolveEntityReference = {
  body: Joi.object().keys({
    entityType: Joi.string()
      .valid('user', 'role', 'node', 'project', 'permission')
      .required(),
    value: Joi.string().trim().min(1).max(255).required(),
    actionType: Joi.string().trim().max(100).optional(),
    limit: Joi.number().integer().min(1).max(25).optional().default(5),
  }),
};

const generateProjectWizardDraft = {
  body: Joi.object().keys({
    prompt: Joi.string().trim().min(5).max(5000).required(),
    projectName: Joi.string().trim().max(120).optional(),
    options: Joi.object()
      .keys({
        tags: Joi.array().items(Joi.string().trim()).optional(),
        additionalTags: Joi.array().items(Joi.string().trim()).optional(),
        accessibility: Joi.array()
          .items(Joi.string().valid('api', 'embedded', 'javascript', 'mobile'))
          .optional(),
        security: Joi.string().valid('public', 'private').optional(),
        style: Joi.string().max(64).optional(),
        wizardMode: Joi.boolean().optional(),
        includePerm: Joi.boolean().optional(),
        permEnabled: Joi.boolean().optional(),
        includeWorkflow: Joi.boolean().optional(),
        workflowEnabled: Joi.boolean().optional(),
        publishNow: Joi.boolean().optional(),
        permSettings: Joi.object().optional(),
        workflows: Joi.array().items(Joi.object()).optional(),
        userSettings: Joi.object().optional(),
      })
      .optional(),
  }),
};

const finalizeProjectWizardDraft = {
  body: Joi.object().keys({
    draft: Joi.object().required(),
    publish: Joi.boolean().optional(),
    publishOptions: Joi.object()
      .keys({
        startDate: Joi.string().isoDate().optional(),
        endDate: Joi.string().isoDate().optional(),
        monthsToGenerate: Joi.number().integer().min(1).max(36).optional(),
        allowBackdating: Joi.boolean().optional(),
      })
      .optional(),
  }),
};

const saveProjectWizardDraft = {
  body: Joi.object().keys({
    draft: Joi.object().required(),
    summary: Joi.object().optional().default({}),
    prompt: Joi.string().trim().max(5000).optional().allow('', null),
  }),
};

const getProjectWizardDraft = {
  query: Joi.object().keys({}),
};

const clearProjectWizardDraft = {
  query: Joi.object().keys({}),
};

const importOnboardingCsv = {
  body: Joi.object().keys({
    dryRun: Joi.boolean().optional().default(true),
    csvText: Joi.string().trim().min(10).required(),
  }),
};

const getOnboardingJobById = {
  params: Joi.object().keys({
    jobId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required(),
  }),
  query: Joi.object().keys({
    includeEvents: Joi.string().valid('true', 'false').optional(),
    eventLimit: Joi.number().integer().min(1).max(200).optional(),
  }),
};

const listOnboardingJobs = {
  query: Joi.object().keys({
    threadId: Joi.string().max(128).optional(),
    status: Joi.string()
      .valid('uploaded', 'queued', 'validating', 'importing', 'completed', 'failed', 'cancelled')
      .optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(20),
    offset: Joi.number().integer().min(0).optional().default(0),
  }),
};

const cancelOnboardingJob = {
  params: Joi.object().keys({
    jobId: Joi.string().guid({ version: ['uuidv4', 'uuidv5'] }).required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().max(500).optional().allow(''),
  }),
};

module.exports = {
  createAction,
  reverseAction,
  getActionById,
  getFeed,
  updateActionItemStatus,
  createAuditExportJob,
  listAuditExportJobs,
  getAuditExportJobById,
  createProjectRules,
  getProjectRules,
  listProjectRuleVersions,
  activateProjectRuleVersion,
  recomputeProjectScoreboard,
  getProjectScoreboard,
  getProjectScoreboardHistory,
  getProjectRulesAnalysis,
  compareProjectNodes,
  getProjectNodeRankings,
  exportProjectNodeComparison,
  exportProjectNodeRankings,
  listTools,
  callTool,
  listToolCallLogs,
  getSessionContext,
  updateSessionContext,
  getFocusState,
  updateFocusState,
  clearFocusState,
  searchEntities,
  resolveEntityReference,
  generateProjectWizardDraft,
  finalizeProjectWizardDraft,
  saveProjectWizardDraft,
  getProjectWizardDraft,
  clearProjectWizardDraft,
  importOnboardingCsv,
  listOnboardingJobs,
  cancelOnboardingJob,
  getOnboardingJobById,
};
