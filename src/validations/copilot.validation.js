const Joi = require('joi');

const createAction = {
  body: Joi.object().keys({
    actionType: Joi.string().max(100).required(),
    entityType: Joi.string().max(100).required(),
    entityId: Joi.string().max(255).optional().allow('', null),
    payload: Joi.object().optional().default({}),
    idempotencyKey: Joi.string().max(255).optional(),
    correlationId: Joi.string().guid({ version: 'uuidv4' }).optional(),
    approvalToken: Joi.string().max(255).optional(),
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

const listAgentTasks = {
  query: Joi.object().keys({
    status: Joi.string()
      .valid(
        'queued',
        'planning',
        'waiting_approval',
        'executing',
        'completed',
        'failed',
        'escalated',
        'cancelled'
      )
      .optional(),
    source: Joi.string().max(64).optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getAgentTaskById = {
  params: Joi.object().keys({
    taskId: Joi.string().guid({ version: 'uuidv4' }).required(),
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
    correlationId: Joi.string().guid({ version: 'uuidv4' }).optional(),
  }),
};

const createApprovalDecision = {
  body: Joi.object()
    .keys({
      toolName: Joi.string().max(120).optional(),
      actionType: Joi.string().max(100).optional(),
      entityId: Joi.string().max(255).optional().allow('', null),
      payload: Joi.object().optional().default({}),
      approvalToken: Joi.string().max(255).optional(),
      correlationId: Joi.string().guid({ version: 'uuidv4' }).optional(),
      expiresInSec: Joi.number().integer().min(60).max(3600).optional().default(600),
      reason: Joi.string().max(500).optional().allow('', null),
      metadata: Joi.object().optional().default({}),
    })
    .or('toolName', 'actionType'),
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
        publishNow: Joi.boolean().optional(),
        layout: Joi.object()
          .keys({
            style: Joi.string().max(64).optional(),
            wizardMode: Joi.boolean().optional(),
            grid: Joi.object()
              .keys({
                columns: Joi.number().integer().min(1).max(24).optional(),
                columnSpans: Joi.object().optional(),
              })
              .optional(),
            builder: Joi.object().optional(),
          })
          .optional(),
        capabilities: Joi.object().optional(),
        analytics: Joi.object().optional(),
        ui: Joi.object().optional(),
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

const listComplianceSnapshots = {
  query: Joi.object().keys({
    projectId: Joi.string().max(64).optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

// ── Phase 4: Intelligence Gateway ─────────────────────────────────────────────

const listModelRegistry = {
  query: Joi.object().keys({
    enabledOnly: Joi.string().valid('true', 'false').optional(),
  }),
};

const resolveCallPlan = {
  body: Joi.object().keys({
    taskType:        Joi.string().max(64).required(),
    promptKey:       Joi.string().max(120).optional().allow(null, ''),
    variables:       Joi.object().optional().default({}),
    riskLevel:       Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional().default('LOW'),
    fallbackAllowed: Joi.boolean().optional().default(true),
    tenantId:        Joi.string().max(64).optional().allow(null),
  }),
};

const logIntelligenceUsage = {
  body: Joi.object().keys({
    traceId:         Joi.string().max(128).required(),
    modelKey:        Joi.string().max(64).required(),
    stage:           Joi.string().max(64).required(),
    chatTurnLogId:   Joi.number().integer().optional().allow(null),
    intent:          Joi.string().max(100).optional().allow(null),
    inputTokens:     Joi.number().integer().min(0).optional().allow(null),
    outputTokens:    Joi.number().integer().min(0).optional().allow(null),
    latencyMs:       Joi.number().integer().min(0).optional().allow(null),
    status:          Joi.string().valid('success', 'failed', 'timeout').optional().default('success'),
    requestExcerpt:  Joi.string().max(2000).optional().allow(null, ''),
    responseExcerpt: Joi.string().max(2000).optional().allow(null, ''),
    errorMessage:    Joi.string().max(1000).optional().allow(null, ''),
    metadata:        Joi.object().optional().default({}),
  }),
};

const getIntelligenceUsageSummary = {
  query: Joi.object().keys({
    from: Joi.date().iso().optional(),
    to:   Joi.date().iso().optional(),
  }),
};

const listPrompts = {
  query: Joi.object().keys({
    taskType: Joi.string().max(64).optional(),
    status:   Joi.string().valid('draft', 'active', 'deprecated').optional(),
    limit:    Joi.number().integer().min(1).max(200).optional().default(100),
  }),
};

const getPromptVersion = {
  params: Joi.object().keys({
    promptKey: Joi.string().max(120).required(),
    version:   Joi.number().integer().min(1).required(),
  }),
};

const createPromptVersion = {
  body: Joi.object().keys({
    promptKey:           Joi.string().max(120).required(),
    owner:               Joi.string().max(64).optional().default('system'),
    description:         Joi.string().max(500).optional().allow(null, ''),
    systemPrompt:        Joi.string().min(10).required(),
    userPromptTemplate:  Joi.string().optional().allow(null, ''),
    inputVariables:      Joi.array().items(Joi.string()).optional().default([]),
    outputSchema:        Joi.object().optional().default({}),
    modelHint:           Joi.string().max(64).optional().allow(null),
    taskType:            Joi.string().max(64).optional().allow(null),
    status:              Joi.string().valid('draft', 'active').optional().default('draft'),
    evalSet:             Joi.array().items(Joi.object()).optional().default([]),
    changelog:           Joi.string().max(1000).optional().allow(null, ''),
  }),
};

const activatePromptVersion = {
  params: Joi.object().keys({
    promptKey: Joi.string().max(120).required(),
    version:   Joi.number().integer().min(1).required(),
  }),
};

// ── Phase 5: Data Intelligence ─────────────────────────────────────────────────

const getProjectMetrics = {
  params: Joi.object().keys({
    projectId: Joi.string().max(64).required(),
  }),
  query: Joi.object().keys({
    monthLabel: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
    recompute:  Joi.string().valid('true', 'false').optional(),
  }),
};

const listAnomalies = {
  query: Joi.object().keys({
    projectId: Joi.string().max(64).optional(),
    severity:  Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    limit:     Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const generateInsight = {
  body: Joi.object().keys({
    projectId:  Joi.string().max(64).optional().allow(null),
    monthLabel: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
  }),
};

const completeInsight = {
  params: Joi.object().keys({
    insightId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    briefJson: Joi.object().keys({
      headline:            Joi.string().min(1).required(),
      keyInsights:         Joi.array().items(Joi.string()).required(),
      risks:               Joi.array().items(Joi.string()).required(),
      recommendedActions:  Joi.array().items(Joi.string()).required(),
    }).required(),
  }),
};

const failInsight = {
  params: Joi.object().keys({
    insightId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    errorMessage: Joi.string().max(1000).required(),
  }),
};

const listInsights = {
  query: Joi.object().keys({
    projectId: Joi.string().max(64).optional(),
    status:    Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
    limit:     Joi.number().integer().min(1).max(100).optional().default(20),
  }),
};

const getInsightById = {
  params: Joi.object().keys({
    insightId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

// ── Phase 6: RAG Knowledge Layer ──────────────────────────────────────────────

const ingestDocument = {
  body: Joi.object().keys({
    title:         Joi.string().trim().min(1).max(255).required(),
    source:        Joi.string().valid('upload', 's3', 'web', 'internal').optional().default('upload'),
    sourceRef:     Joi.string().max(512).optional().allow(null, ''),
    mimeType:      Joi.string().max(100).optional().default('text/plain'),
    contentText:   Joi.string().min(10).required(),
    ingestionMode: Joi.string().valid('off', 'auto', 'force').optional(),
    accessPolicy:  Joi.object().optional().default({}),
    metadata:      Joi.object().optional().default({}),
  }),
};

const listDocs = {
  query: Joi.object().keys({
    status: Joi.string().valid('pending', 'processing', 'indexed', 'failed').optional(),
    limit:  Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getDoc = {
  params: Joi.object().keys({
    docId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

const deleteDoc = {
  params: Joi.object().keys({
    docId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

const getDocChunks = {
  params: Joi.object().keys({
    docId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(500).optional().default(100),
  }),
};

const searchDocs = {
  body: Joi.object().keys({
    query:     Joi.string().trim().min(3).max(1000).required(),
    topK:      Joi.number().integer().min(1).max(20).optional().default(5),
    projectId: Joi.string().max(64).optional().allow(null),
  }),
};

const reindexDoc = {
  params: Joi.object().keys({
    docId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

// ─── Phase 7: Enterprise Autonomy ─────────────────────────────────────────────

const registerWorkflowDefinition = {
  body: Joi.object().keys({
    tenantId:          Joi.string().max(64).optional().allow(null),
    name:              Joi.string().max(120).required(),
    description:       Joi.string().max(1000).optional().allow('', null),
    triggerType:       Joi.string().valid('schedule','event','manual').required(),
    triggerConfig:     Joi.object().optional().default({}),
    stepsJson:         Joi.array().optional().default([]),
    approvalPoints:    Joi.array().optional().default([]),
    failurePolicy:     Joi.object().optional().default({}),
    retryPolicy:       Joi.object().optional().default({}),
    escalationPolicy:  Joi.object().optional().default({}),
    autonomyLevel:     Joi.number().integer().min(1).max(6).optional().default(3),
    enabled:           Joi.boolean().optional().default(true),
  }),
};

const listWorkflowDefinitions = {
  query: Joi.object().keys({
    enabled: Joi.boolean().optional(),
  }),
};

const startWorkflowRun = {
  params: Joi.object().keys({
    workflowName: Joi.string().max(120).required(),
  }),
  body: Joi.object().keys({
    triggerType:     Joi.string().valid('schedule','event','manual').required(),
    triggerMetadata: Joi.object().optional().default({}),
    taskId:          Joi.string().guid({ version: 'uuidv4' }).optional().allow(null),
  }),
};

const listWorkflowRuns = {
  params: Joi.object().keys({
    workflowName: Joi.string().max(120).required(),
  }),
  query: Joi.object().keys({
    status: Joi.string().valid('running','completed','failed','cancelled').optional(),
    limit:  Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getWorkflowStats = {
  params: Joi.object().keys({
    workflowName: Joi.string().max(120).required(),
  }),
  query: Joi.object().keys({
    days: Joi.number().integer().min(1).max(365).optional().default(30),
  }),
};

const submitFeedback = {
  body: Joi.object().keys({
    taskId:       Joi.string().guid({ version: 'uuidv4' }).optional().allow(null),
    toolCallId:   Joi.string().guid({ version: 'uuidv4' }).optional().allow(null),
    feedbackType: Joi.string()
      .valid('correct','incorrect','partial','unsafe','helpful','not_helpful')
      .required(),
    rating:       Joi.number().integer().min(1).max(5).optional().allow(null),
    comment:      Joi.string().max(2000).optional().allow('', null),
    workflowName: Joi.string().max(120).optional().allow(null),
    metadata:     Joi.object().optional().default({}),
  }),
};

const listFeedback = {
  query: Joi.object().keys({
    taskId:       Joi.string().guid({ version: 'uuidv4' }).optional(),
    workflowName: Joi.string().max(120).optional(),
    limit:        Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getFeedbackSummary = {
  query: Joi.object().keys({
    workflowName: Joi.string().max(120).optional(),
    days:         Joi.number().integer().min(1).max(365).optional().default(30),
  }),
};

const createEvalDataset = {
  body: Joi.object().keys({
    name:                Joi.string().max(120).required(),
    workflowName:        Joi.string().max(120).optional().allow(null),
    intent:              Joi.string().max(120).optional().allow(null),
    inputJson:           Joi.object().required(),
    expectedOutputJson:  Joi.object().required(),
    description:         Joi.string().max(1000).optional().allow('', null),
    enabled:             Joi.boolean().optional().default(true),
  }),
};

const listEvalDatasets = {
  query: Joi.object().keys({
    workflowName: Joi.string().max(120).optional(),
    enabled:      Joi.boolean().optional(),
  }),
};

const recordEvalResult = {
  params: Joi.object().keys({
    datasetId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    taskId:           Joi.string().guid({ version: 'uuidv4' }).optional().allow(null),
    passed:           Joi.boolean().required(),
    actualOutputJson: Joi.object().optional().default({}),
    score:            Joi.number().min(0).max(1).optional().allow(null),
    failureReason:    Joi.string().max(2000).optional().allow('', null),
    modelUsed:        Joi.string().max(120).optional().allow(null),
    latencyMs:        Joi.number().integer().min(0).optional().allow(null),
  }),
};

const getEvalStats = {
  query: Joi.object().keys({
    workflowName: Joi.string().max(120).optional(),
    days:         Joi.number().integer().min(1).max(365).optional().default(30),
  }),
};

const createPlaybook = {
  body: Joi.object().keys({
    name:                  Joi.string().max(120).required(),
    incidentType:          Joi.string().max(120).required(),
    description:           Joi.string().max(1000).optional().allow('', null),
    stepsJson:             Joi.array().optional().default([]),
    severity:              Joi.string().valid('low','medium','high','critical').optional().default('medium'),
    autoTriggerConditions: Joi.object().optional().default({}),
    enabled:               Joi.boolean().optional().default(true),
  }),
};

const listPlaybooks = {
  query: Joi.object().keys({
    incidentType: Joi.string().max(120).optional(),
    enabled:      Joi.boolean().optional(),
  }),
};

const openIncident = {
  body: Joi.object().keys({
    incidentType: Joi.string().max(120).required(),
    title:        Joi.string().max(255).required(),
    description:  Joi.string().max(5000).optional().allow('', null),
    severity:     Joi.string().valid('low','medium','high','critical').optional().default('medium'),
    contextJson:  Joi.object().optional().default({}),
    playbookId:   Joi.string().guid({ version: 'uuidv4' }).optional().allow(null),
    taskId:       Joi.string().guid({ version: 'uuidv4' }).optional().allow(null),
  }),
};

const acknowledgeIncident = {
  params: Joi.object().keys({
    incidentId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

const resolveIncident = {
  params: Joi.object().keys({
    incidentId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    resolutionNotes: Joi.string().max(5000).optional().allow('', null),
  }),
};

const listIncidents = {
  query: Joi.object().keys({
    status:   Joi.string()
      .valid('open','acknowledged','investigating','contained','resolved','post_mortem')
      .optional(),
    severity: Joi.string().valid('low','medium','high','critical').optional(),
    limit:    Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const getIncidentById = {
  params: Joi.object().keys({
    incidentId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
};

const updateIncidentStatus = {
  params: Joi.object().keys({
    incidentId: Joi.string().guid({ version: 'uuidv4' }).required(),
  }),
  body: Joi.object().keys({
    status: Joi.string()
      .valid('open','acknowledged','investigating','contained','resolved','post_mortem')
      .required(),
  }),
};

module.exports = {
  createAction,
  reverseAction,
  getActionById,
  getFeed,
  listAgentTasks,
  getAgentTaskById,
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
  createApprovalDecision,
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
  listComplianceSnapshots,
  listModelRegistry,
  resolveCallPlan,
  logIntelligenceUsage,
  getIntelligenceUsageSummary,
  listPrompts,
  getPromptVersion,
  createPromptVersion,
  activatePromptVersion,
  getProjectMetrics,
  listAnomalies,
  generateInsight,
  completeInsight,
  failInsight,
  listInsights,
  getInsightById,
  ingestDocument,
  listDocs,
  getDoc,
  deleteDoc,
  getDocChunks,
  searchDocs,
  reindexDoc,
  // Phase 7
  registerWorkflowDefinition,
  listWorkflowDefinitions,
  startWorkflowRun,
  listWorkflowRuns,
  getWorkflowStats,
  submitFeedback,
  listFeedback,
  getFeedbackSummary,
  createEvalDataset,
  listEvalDatasets,
  recordEvalResult,
  getEvalStats,
  createPlaybook,
  listPlaybooks,
  openIncident,
  acknowledgeIncident,
  resolveIncident,
  listIncidents,
  getIncidentById,
  updateIncidentStatus,
};
