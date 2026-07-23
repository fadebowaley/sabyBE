const Joi = require('joi');

const submissionStatus = Joi.string().valid(
  'submitted',
  'pending',
  'approved',
  'rejected',
  'completed',
  'failed'
);

const projectFormReference = Joi.object().keys({
  type: Joi.string().valid('project_form').required(),
  projectId: Joi.string().max(128).required(),
  projectFormId: Joi.string().max(128).optional().allow('', null),
  title: Joi.string().max(240).optional().allow('', null),
});

const semanticMemoryType = Joi.string().valid(
  'glossary_term',
  'synonym',
  'metric_alias',
  'dataset_mapping',
  'reporting_rule'
);

const semanticMemoryApprovalStatus = Joi.string().valid('pending', 'approved', 'rejected', 'archived');

const semanticMemoryTargetType = Joi.string().valid(
  'metric',
  'dimension',
  'field',
  'project',
  'form',
  'dataset',
  'node',
  'level',
  'structure',
  'reporting_rule',
  'general'
);

const rebuildKnowledgeArtifact = {
  body: Joi.object().keys({
    activate: Joi.boolean().optional().default(true),
  }),
};

const listKnowledgeArtifactVersions = {
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
  }),
};

const listSemanticMemory = {
  query: Joi.object().keys({
    type: semanticMemoryType.optional(),
    approvalStatus: semanticMemoryApprovalStatus.optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const createSemanticMemory = {
  body: Joi.object().keys({
    type: semanticMemoryType.required(),
    term: Joi.string().trim().min(2).max(160).required(),
    definition: Joi.string().trim().max(1200).optional().allow('', null),
    aliases: Joi.array().items(Joi.string().trim().min(1).max(120)).max(25).optional().default([]),
    targetType: semanticMemoryTargetType.optional().default('general'),
    targetRef: Joi.string().trim().max(240).optional().allow('', null),
    targetLabel: Joi.string().trim().max(240).optional().allow('', null),
    confidence: Joi.number().min(0).max(1).optional().default(0),
    evidence: Joi.array()
      .items(
        Joi.object().keys({
          type: Joi.string().trim().max(80).optional(),
          value: Joi.string().trim().max(500).required(),
          source: Joi.string().trim().max(160).optional(),
        })
      )
      .max(10)
      .optional()
      .default([]),
    source: Joi.string().valid('admin', 'user_correction', 'conversation', 'import', 'system_suggestion').optional().default('admin'),
    metadata: Joi.object().optional().default({}),
  }),
};

const reviewSemanticMemory = {
  params: Joi.object().keys({
    memoryId: Joi.string().pattern(/^sem_[A-Za-z0-9_-]{8,40}$/).required(),
  }),
  body: Joi.object().keys({
    approvalStatus: semanticMemoryApprovalStatus.required(),
    reviewNote: Joi.string().trim().max(1000).optional().allow('', null),
  }),
};

const createRequestContext = {
  body: Joi.object().keys({
    message: Joi.string().max(8000).required(),
    conversationId: Joi.string().max(128).optional().allow('', null),
    references: Joi.array().items(projectFormReference).max(10).optional().default([]),
    requestedNodeIds: Joi.array().items(Joi.string().max(128)).max(50).optional().default([]),
    outputFormats: Joi.array()
      .items(Joi.string().valid('chat', 'markdown', 'json', 'csv', 'xlsx', 'html', 'pdf', 'docx', 'pptx'))
      .max(8)
      .optional(),
    timeRange: Joi.object()
      .keys({
        start: Joi.date().iso().optional().allow(null),
        end: Joi.date().iso().optional().allow(null),
        timezone: Joi.string().max(80).optional(),
      })
      .optional()
      .allow(null),
    conversationContext: Joi.object().optional().default({}),
  }),
};

const createExecutionPlan = {
  body: createRequestContext.body.keys({
    executionMode: Joi.string()
      .valid('auto', 'report', 'aggregation', 'analysis', 'ranking', 'trend', 'comparison', 'multi_project_comparison', 'anomaly')
      .optional()
      .default('auto'),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    month: Joi.string().pattern(/^\d{4}-\d{2}(-01)?$/).optional(),
    status: submissionStatus.optional(),
    statuses: Joi.array().items(submissionStatus).max(6).optional(),
    search: Joi.string().allow('').max(200).optional(),
    aggregate: Joi.string().valid('sum', 'avg', 'min', 'max', 'count').optional(),
    rankingDirection: Joi.string().valid('top', 'bottom', 'asc', 'desc', 'highest', 'lowest', 'best', 'worst').optional(),
    grain: Joi.string().valid('day', 'week', 'month', 'quarter').optional(),
    comparisonGrain: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').optional(),
    dimensionValues: Joi.array().items(Joi.string().trim().min(1).max(120)).max(20).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional(),
  }),
};

const executeGeneratedSqlTool = {
  body: createRequestContext.body.keys({
    sql: Joi.string().trim().min(1).max(20000).required(),
    parameters: Joi.array().items(Joi.any()).max(50).optional().default([]),
    maxRows: Joi.number().integer().min(1).max(5000).optional(),
    limit: Joi.number().integer().min(1).max(5000).optional(),
  }),
};

const executeGeneratedPythonTool = {
  body: createRequestContext.body.keys({
    code: Joi.string().trim().min(1).max(20000).required(),
    inputPayload: Joi.alternatives().try(Joi.object(), Joi.array(), Joi.string(), Joi.number(), Joi.boolean(), Joi.valid(null)).optional(),
    inputManifest: Joi.object().optional().default({}),
    limits: Joi.object()
      .keys({
        timeoutSeconds: Joi.number().integer().min(1).max(120).optional(),
        memoryMb: Joi.number().integer().min(128).max(2048).optional(),
        maxOutputBytes: Joi.number().integer().min(1024).max(10 * 1024 * 1024).optional(),
        maxOutputFiles: Joi.number().integer().min(0).max(5).optional(),
      })
      .optional()
      .default({}),
  }),
};

const executeProjectFormReport = {
  body: createRequestContext.body.keys({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    month: Joi.string().pattern(/^\d{4}-\d{2}(-01)?$/).optional(),
    status: submissionStatus.optional(),
    statuses: Joi.array().items(submissionStatus).max(6).optional(),
    search: Joi.string().allow('').max(200).optional(),
    limit: Joi.number().integer().min(1).max(100).optional().default(75),
    offset: Joi.number().integer().min(0).optional().default(0),
  }),
};

const executeProjectFormAggregation = {
  body: executeProjectFormReport.body.keys({
    aggregate: Joi.string().valid('sum', 'avg', 'min', 'max', 'count').optional(),
    dimensionValues: Joi.array().items(Joi.string().trim().min(1).max(120)).max(20).optional(),
    limit: Joi.number().integer().min(1).max(50).optional().default(25),
  }),
};

const executeMultiProjectFormComparison = {
  body: executeProjectFormAggregation.body.keys({
    references: Joi.array().items(projectFormReference).min(2).max(10).required(),
    limit: Joi.number().integer().min(1).max(50).optional().default(25),
  }),
};

const executeProjectFormAnalysis = {
  body: executeProjectFormReport.body.keys({
    limit: Joi.number().integer().min(1).max(100).optional().default(75),
  }),
};

const executeProjectFormRanking = {
  body: executeProjectFormReport.body.keys({
    aggregate: Joi.string().valid('sum', 'avg', 'min', 'max', 'count').optional(),
    rankingDirection: Joi.string().valid('top', 'bottom', 'asc', 'desc', 'highest', 'lowest', 'best', 'worst').optional(),
    dimensionValues: Joi.array().items(Joi.string().trim().min(1).max(120)).max(20).optional(),
    limit: Joi.number().integer().min(1).max(25).optional().default(10),
  }),
};

const executeProjectFormTrend = {
  body: executeProjectFormReport.body.keys({
    aggregate: Joi.string().valid('sum', 'avg', 'min', 'max', 'count').optional(),
    grain: Joi.string().valid('day', 'week', 'month', 'quarter').optional(),
    limit: Joi.number().integer().min(1).max(60).optional().default(24),
  }),
};

const executeProjectFormPeriodComparison = {
  body: executeProjectFormReport.body.keys({
    aggregate: Joi.string().valid('sum', 'avg', 'min', 'max', 'count').optional(),
    comparisonGrain: Joi.string().valid('day', 'week', 'month', 'quarter', 'year').optional(),
  }),
};

const executeProjectFormAnomalies = {
  body: executeProjectFormReport.body.keys({
    aggregate: Joi.string().valid('sum', 'avg', 'min', 'max', 'count').optional(),
    grain: Joi.string().valid('day', 'week', 'month', 'quarter').optional(),
    limit: Joi.number().integer().min(4).max(60).optional().default(60),
  }),
};

const listAuditEvents = {
  query: Joi.object().keys({
    requestId: Joi.string().max(128).optional(),
    limit: Joi.number().integer().min(1).max(200).optional().default(50),
  }),
};

const downloadReportExport = {
  params: Joi.object().keys({
    exportId: Joi.string().pattern(/^ei_export_[A-Za-z0-9_-]{8,40}$/).required(),
  }),
};

module.exports = {
  rebuildKnowledgeArtifact,
  listKnowledgeArtifactVersions,
  listSemanticMemory,
  createSemanticMemory,
  reviewSemanticMemory,
  createRequestContext,
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
  downloadReportExport,
  listAuditEvents,
};
