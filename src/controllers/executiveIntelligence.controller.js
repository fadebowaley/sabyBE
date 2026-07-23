const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const executiveIntelligenceService = require('../services/executiveIntelligence.service');

const resolveUserId = (user = {}) =>
  String(user.id || user._id || user.userId || '').trim() || null;

const assertCanManageArtifact = (user = {}) => {
  if (user.isOwner || user.isSuper || user.isAdmin || user.isSaby) return;
  throw new ApiError(
    httpStatus.FORBIDDEN,
    'Only workspace owners, admins, or Saby operators can rebuild intelligence artifacts'
  );
};

const assertInternalIntelligenceTool = (req, toolLabel = 'Intelligence internal tool') => {
  const expected =
    process.env.EXECUTIVE_INTELLIGENCE_INTERNAL_TOOL_SECRET ||
    process.env.EXECUTIVE_INTELLIGENCE_SQL_TOOL_SECRET ||
    process.env.COPILOT_INTERNAL_TOOL_SECRET ||
    '';
  if (!expected) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      `${toolLabel} secret is not configured`
    );
  }

  const provided = String(req.get('x-saby-internal-tool-secret') || '').trim();
  if (provided !== expected) {
    throw new ApiError(httpStatus.FORBIDDEN, `${toolLabel} is internal only`);
  }
};

const reportArtifacts = (result = {}) => ({
  canonical_report: result.canonical_report || null,
  rendered_report: result.rendered_report || null,
});

const getCapabilities = catchAsync(async (_req, res) => {
  res.status(httpStatus.OK).send({
    success: true,
    data: executiveIntelligenceService.getCapabilities(),
  });
});

const getKnowledgeArtifact = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const artifact = await executiveIntelligenceService.getActiveArtifact({
    tenantId,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: artifact || null,
    message: artifact
      ? 'Active tenant knowledge artifact retrieved'
      : 'No active tenant knowledge artifact has been built',
  });
});

const listKnowledgeArtifactVersions = catchAsync(async (req, res) => {
  const versions = await executiveIntelligenceService.listArtifactVersions({
    tenantId: req.user?.tenantId,
    limit: req.query.limit,
  });

  res.status(httpStatus.OK).send({
    success: true,
    total: versions.length,
    results: versions,
  });
});

const getKnowledgeArtifactStatus = catchAsync(async (req, res) => {
  assertCanManageArtifact(req.user);
  const status = await executiveIntelligenceService.getKnowledgeArtifactStatus({
    tenantId: req.user?.tenantId,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: status,
  });
});

const rebuildKnowledgeArtifact = catchAsync(async (req, res) => {
  assertCanManageArtifact(req.user);
  const artifact = await executiveIntelligenceService.buildTenantArtifact({
    tenantId: req.user.tenantId,
    builtBy: resolveUserId(req.user),
    activate: req.body.activate !== false,
  });

  res.status(httpStatus.CREATED).send({
    success: true,
    data: artifact,
    message: 'Tenant knowledge artifact rebuilt',
  });
});

const listSemanticMemory = catchAsync(async (req, res) => {
  assertCanManageArtifact(req.user);
  const results = await executiveIntelligenceService.listSemanticMemory({
    tenantId: req.user?.tenantId,
    type: req.query.type,
    approvalStatus: req.query.approvalStatus,
    limit: req.query.limit,
  });

  res.status(httpStatus.OK).send({
    success: true,
    total: results.length,
    results,
  });
});

const createSemanticMemory = catchAsync(async (req, res) => {
  assertCanManageArtifact(req.user);
  const record = await executiveIntelligenceService.createSemanticMemory({
    tenantId: req.user?.tenantId,
    userId: resolveUserId(req.user),
    body: req.body,
  });

  res.status(httpStatus.CREATED).send({
    success: true,
    data: record,
    message: 'Semantic memory record created for approval-gated Intelligence learning',
  });
});

const reviewSemanticMemory = catchAsync(async (req, res) => {
  assertCanManageArtifact(req.user);
  const record = await executiveIntelligenceService.reviewSemanticMemory({
    tenantId: req.user?.tenantId,
    userId: resolveUserId(req.user),
    memoryId: req.params.memoryId,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: record,
    message: 'Semantic memory review decision saved',
  });
});

const createRequestContext = catchAsync(async (req, res) => {
  const context = await executiveIntelligenceService.createRequestContext({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.CREATED).send({
    success: true,
    data: context,
  });
});

const createExecutionPlan = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.createExecutionPlan({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.CREATED).send({
    success: true,
    data: result.plan,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    message: result.plan.validation.valid
      ? 'Execution plan created and validated'
      : 'Execution plan created but rejected by validator',
  });
});

const executeGeneratedSqlTool = catchAsync(async (req, res) => {
  assertInternalIntelligenceTool(req, 'Generated SQL tool');
  const result = await executiveIntelligenceService.executeGeneratedSqlTool({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: result.generated_sql_execution.status === 'completed',
    data: result.generated_sql_execution,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    message:
      result.generated_sql_execution.status === 'completed'
        ? 'Generated SQL executed through controlled Intelligence tool'
        : 'Generated SQL was not executed by controlled Intelligence policy',
  });
});

const executeGeneratedPythonTool = catchAsync(async (req, res) => {
  assertInternalIntelligenceTool(req, 'Generated Python tool');
  const result = await executiveIntelligenceService.executeGeneratedPythonTool({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: result.generated_python_execution.status === 'completed',
    data: result.generated_python_execution,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    message:
      result.generated_python_execution.status === 'completed'
        ? 'Generated Python executed through isolated Intelligence sandbox'
        : 'Generated Python was not executed by controlled Intelligence policy',
  });
});

const executeProjectFormReport = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormReport({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.report,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form report retrieved through secure Intelligence data access',
  });
});

const executeProjectFormAnalysis = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormAnalysis({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.analysis,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form analysis completed through deterministic Intelligence runtime',
  });
});

const executeProjectFormRanking = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormRanking({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.ranking,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form ranking completed through deterministic Intelligence runtime',
  });
});

const executeProjectFormTrend = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormTrend({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.trend,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form trend completed through deterministic Intelligence runtime',
  });
});

const executeProjectFormPeriodComparison = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormPeriodComparison({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.comparison,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form period comparison completed through deterministic Intelligence runtime',
  });
});

const executeProjectFormAnomalies = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormAnomalies({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.anomaly,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form anomaly detection completed through deterministic Intelligence runtime',
  });
});

const executeProjectFormAggregation = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeProjectFormAggregation({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.aggregation,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    ...reportArtifacts(result),
    message: 'Project form aggregation retrieved through secure Intelligence data access',
  });
});

const executeMultiProjectFormComparison = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.executeMultiProjectFormComparison({
    user: req.user,
    body: req.body,
  });

  res.status(httpStatus.OK).send({
    success: true,
    data: result.comparison,
    context: {
      request_id: result.context.request_id,
      artifact_version: result.context.artifact_version,
      execution_allowed: result.context.execution_allowed,
      semantic_status: result.context.semantic_resolution?.semantic_status,
      scope_type: result.context.scope_snapshot?.scope_type,
      selected_project_ids: result.context.selected_project_ids,
      selected_form_ids: result.context.selected_form_ids,
    },
    execution_plan: {
      plan_id: result.execution_plan.plan_id,
      status: result.execution_plan.status,
      execution_mode: result.execution_plan.execution_mode,
      tool_keys: result.execution_plan.stages.map((stage) => stage.tool_key),
      validation: result.execution_plan.validation,
    },
    message: 'Multi-project form comparison completed through deterministic Intelligence fan-out',
  });
});

const listAuditEvents = catchAsync(async (req, res) => {
  const events = await executiveIntelligenceService.listAuditEvents({
    tenantId: req.user.tenantId,
    requestId: req.query.requestId,
    limit: req.query.limit,
  });

  res.status(httpStatus.OK).send({
    success: true,
    total: events.length,
    results: events,
  });
});

const downloadReportExport = catchAsync(async (req, res) => {
  const result = await executiveIntelligenceService.getReportExportDownload({
    tenantId: req.user.tenantId,
    user: req.user,
    exportId: req.params.exportId,
  });

  res.status(httpStatus.OK).send(result);
});

module.exports = {
  getCapabilities,
  getKnowledgeArtifact,
  listKnowledgeArtifactVersions,
  getKnowledgeArtifactStatus,
  rebuildKnowledgeArtifact,
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
