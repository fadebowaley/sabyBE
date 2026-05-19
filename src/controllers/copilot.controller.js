const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const copilotActionService = require('../services/copilotAction.service');
const copilotAuditExportService = require('../services/copilotAuditExport.service');
const copilotProjectRulesService = require('../services/copilotProjectRules.service');
const copilotProjectScoreboardService = require('../services/copilotProjectScoreboard.service');
const copilotProjectRuleAnalysisService = require('../services/copilotProjectRuleAnalysis.service');
const copilotNodeComparisonService = require('../services/copilotNodeComparison.service');
const copilotNodeRankingService = require('../services/copilotNodeRanking.service');
const copilotToolRuntimeService = require('../services/copilotToolRuntime.service');
const copilotApprovalService = require('../services/copilotApproval.service');
const agentTaskService = require('../services/agentTask.service');
const complianceAgentService = require('../services/complianceAgent.service');
const copilotSessionContextService = require('../services/copilotSessionContext.service');
const copilotEntityResolverService = require('../services/copilotEntityResolver.service');
const copilotProjectWizardService = require('../services/copilotProjectWizard.service');
const copilotOnboardingService = require('../services/copilotOnboarding.service');
const copilotOnboardingJobService = require('../services/copilotOnboardingJob.service');
const { queueOnboardingImportJob } = require('../queues/onboardingImport.queue');
const modelRouterService         = require('../services/modelRouter.service');
const promptRegistryService      = require('../services/promptRegistry.service');
const intelligenceGatewayService = require('../services/intelligenceGateway.service');
const operationalMetricsService  = require('../services/operationalMetrics.service');
const anomalyDetectionService    = require('../services/anomalyDetection.service');
const executiveInsightService    = require('../services/executiveInsight.service');
// Phase 6 — RAG / Knowledge Layer
const docIngestionService        = require('../services/docIngestion.service');
const docRetrieverService        = require('../services/docRetriever.service');
// Phase 7 — Enterprise Autonomy
const workflowDefsService        = require('../services/workflowDefinitions.service');
const agentFeedbackService       = require('../services/agentFeedback.service');
const agentEvalService           = require('../services/agentEval.service');
const incidentPlaybookService    = require('../services/incidentPlaybook.service');
const { postgresPool }           = require('../config/postgres');
const logger                     = require('../config/logger');

const resolveUserId = (user = {}) => user.id || user._id || user.userId || null;

// Seed the three worker schedules for a tenant on first onboarding. Idempotent.
const AGENT_WORKFLOWS = [
  { name: 'compliance_monitor', cron: '0 2 * * *' },
  { name: 'data_intelligence',  cron: '0 3 * * *' },
  { name: 'agent_eval',         cron: '0 4 * * *' },
];
async function seedAgentSchedulesForTenant(tenantId) {
  for (const wf of AGENT_WORKFLOWS) {
    await postgresPool.query(
      `INSERT INTO copilot.agent_schedules
         (tenant_id, workflow_name, trigger_type, cron_expression, scope_json, enabled, next_run_at, created_by)
       VALUES ($1, $2, 'schedule', $3, '{"interval_hours":24}'::jsonb, TRUE, NOW(), 'onboarding')
       ON CONFLICT DO NOTHING`,
      [tenantId, wf.name, wf.cron]
    );
  }
}
const escapeCsv = (value) => {
  const v = value == null ? '' : String(value);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
};
const toCsv = (rows = []) => rows.map((row) => row.map(escapeCsv).join(',')).join('\n');

const resolveRoleId = (user = {}) => user.roleId || user.role || null;

const resolveRoleIds = (user = {}) => {
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    return user.roles;
  }
  const singleRole = resolveRoleId(user);
  return singleRole ? [singleRole] : [];
};

const createAction = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotActionService.createAction({
    tenantId,
    actorUserId,
    actorRoleIds: resolveRoleIds(req.user),
    actionType: req.body.actionType,
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    payload: req.body.payload,
    idempotencyKey:
      req.body.idempotencyKey ||
      req.headers['x-idempotency-key'] ||
      req.headers['idempotency-key'],
    correlationId:
      req.body.correlationId ||
      req.headers['x-correlation-id'] ||
      req.headers['correlation-id'] ||
      null,
    approvalToken: req.body.approvalToken || null,
    source: req.body.source || 'api',
    priority: req.body.priority || 0,
  });

  res.status(httpStatus.ACCEPTED).send({
    message: result.deduped
      ? 'Action already accepted for this idempotency key'
      : 'Action accepted and queued',
    deduped: result.deduped,
    event: result.event,
  });
});

const reverseAction = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotActionService.reverseAction({
    tenantId,
    actorUserId,
    actorRoleIds: resolveRoleIds(req.user),
    eventId: req.params.eventId,
    reason: req.body.reason,
    idempotencyKey:
      req.body.idempotencyKey ||
      req.headers['x-idempotency-key'] ||
      req.headers['idempotency-key'],
  });

  res.status(httpStatus.ACCEPTED).send({
    message: result.deduped
      ? 'Reverse action already accepted for this idempotency key'
      : 'Reverse action accepted and queued',
    deduped: result.deduped,
    event: result.event,
  });
});

const getActionById = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const event = await copilotActionService.getActionById(
    tenantId,
    req.params.eventId
  );
  res.status(httpStatus.OK).send(event);
});

const getFeed = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const roleId = resolveRoleId(req.user);
  const roleIds = resolveRoleIds(req.user);
  const items = await copilotActionService.getFeed({
    tenantId,
    userId,
    roleId,
    roleIds,
    status: req.query.status,
    limit: req.query.limit,
  });
  res.status(httpStatus.OK).send({
    total: items.length,
    results: items,
  });
});

const listAgentTasks = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const tasks = await agentTaskService.listTasks({
    tenantId,
    status: req.query.status,
    source: req.query.source,
    limit: req.query.limit,
  });

  res.status(httpStatus.OK).send({
    total: tasks.length,
    results: tasks,
  });
});

const getAgentTaskById = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const task = await agentTaskService.getTaskById({
    tenantId,
    taskId: req.params.taskId,
  });
  res.status(httpStatus.OK).send(task);
});

const updateActionItemStatus = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const item = await copilotActionService.updateActionItemStatus({
    tenantId,
    actionItemId: req.params.actionItemId,
    status: req.body.status,
    changedBy: userId,
    reason: req.body.reason,
    metadata: req.body.metadata || {},
  });

  res.status(httpStatus.OK).send(item);
});

const createAuditExportJob = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const requestedBy = resolveUserId(req.user);
  const job = await copilotAuditExportService.createAuditExportJob({
    tenantId,
    requestedBy,
    exportType: req.body.exportType,
    filters: req.body.filters || {},
  });

  res.status(httpStatus.ACCEPTED).send({
    message: 'Audit export job queued',
    job,
  });
});

const listAuditExportJobs = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const jobs = await copilotAuditExportService.listAuditExportJobs({
    tenantId,
    status: req.query.status,
    limit: req.query.limit,
  });

  res.status(httpStatus.OK).send({
    total: jobs.length,
    results: jobs,
  });
});

const getAuditExportJobById = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const job = await copilotAuditExportService.getAuditExportJobById({
    tenantId,
    jobId: req.params.jobId,
  });

  res.status(httpStatus.OK).send(job);
});

const createProjectRules = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const createdBy = resolveUserId(req.user);
  const rules = await copilotProjectRulesService.createRulesVersion({
    tenantId,
    projectId: req.params.projectId,
    rulesJson: req.body.rules,
    createdBy,
  });

  res.status(httpStatus.CREATED).send(rules);
});

const getProjectRules = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const rules = await copilotProjectRulesService.getActiveRules({
    tenantId,
    projectId: req.params.projectId,
  });
  res.status(httpStatus.OK).send(rules);
});

const listProjectRuleVersions = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const versions = await copilotProjectRulesService.listRuleVersions({
    tenantId,
    projectId: req.params.projectId,
  });
  res.status(httpStatus.OK).send({
    total: versions.length,
    results: versions,
  });
});

const activateProjectRuleVersion = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const rules = await copilotProjectRulesService.activateRuleVersion({
    tenantId,
    projectId: req.params.projectId,
    version: Number(req.params.version),
  });
  res.status(httpStatus.OK).send(rules);
});

const recomputeProjectScoreboard = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const now = new Date();
  const defaultPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const scoreboard = await copilotProjectScoreboardService.computeScoreboard({
    tenantId,
    projectId,
    periodStart: req.body?.periodStart || defaultPeriodStart,
    periodEnd: req.body?.periodEnd || now,
    computedBy: resolveUserId(req.user) || 'api',
  });

  res.status(httpStatus.OK).send(scoreboard);
});

const getProjectScoreboard = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const scoreboard =
    await copilotProjectScoreboardService.getLatestScoreboard({
      tenantId,
      projectId,
    });
  res.status(httpStatus.OK).send(scoreboard);
});

const getProjectScoreboardHistory = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const items = await copilotProjectScoreboardService.getScoreboardHistory({
    tenantId,
    projectId,
    from: req.query.from,
    to: req.query.to,
    limit: req.query.limit,
  });
  res.status(httpStatus.OK).send({
    total: items.length,
    results: items,
  });
});

const getProjectRulesAnalysis = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const analysis = await copilotProjectRuleAnalysisService.analyzeProjectRules({
    tenantId,
    projectId,
    periodStart: req.query.from,
    periodEnd: req.query.to,
  });
  res.status(httpStatus.OK).send(analysis);
});

const compareProjectNodes = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const result = await copilotNodeComparisonService.compareNodePerformance({
    tenantId,
    projectId,
    leftNodeId: req.query.leftNodeId,
    rightNodeId: req.query.rightNodeId,
    leftScope: req.query.leftScope,
    rightScope: req.query.rightScope,
    enforceSameLevel: req.query.enforceSameLevel === 'true',
    periodStart: req.query.from,
    periodEnd: req.query.to,
  });
  res.status(httpStatus.OK).send(result);
});

const getProjectNodeRankings = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const result = await copilotNodeRankingService.listProjectNodeRankings({
    tenantId,
    projectId,
    scope: req.query.scope,
    direction: req.query.direction,
    metric: req.query.metric,
    limit: req.query.limit,
    all: req.query.all === 'true',
    includeZero: req.query.includeZero === 'true',
    periodStart: req.query.from,
    periodEnd: req.query.to,
  });
  res.status(httpStatus.OK).send(result);
});

const exportProjectNodeComparison = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const result = await copilotNodeComparisonService.compareNodePerformance({
    tenantId,
    projectId,
    leftNodeId: req.query.leftNodeId,
    rightNodeId: req.query.rightNodeId,
    leftScope: req.query.leftScope,
    rightScope: req.query.rightScope,
    enforceSameLevel: req.query.enforceSameLevel === 'true',
    periodStart: req.query.from,
    periodEnd: req.query.to,
  });

  const format = String(req.query.format || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return res.status(httpStatus.BAD_REQUEST).send({
      message: 'Unsupported export format. Use csv or json.',
    });
  }
  if (format === 'json') {
    return res.status(httpStatus.OK).send(result);
  }

  const left = result?.comparison?.left || {};
  const right = result?.comparison?.right || {};
  const leftMetrics = left.metrics || {};
  const rightMetrics = right.metrics || {};
  const metricKeys = Array.from(
    new Set([...Object.keys(leftMetrics), ...Object.keys(rightMetrics)])
  );

  const rows = [
    ['type', 'key', 'left', 'right'],
    ['meta', 'projectId', projectId, projectId],
    ['meta', 'leftNode', left.nodeName || left.nodeId || '', ''],
    ['meta', 'rightNode', right.nodeName || right.nodeId || '', ''],
    ['result', 'winner', result?.result?.winner || '', ''],
    ['result', 'primaryMetric', result?.result?.primaryMetric || '', ''],
    ['result', 'summary', result?.result?.summary || '', ''],
  ];
  metricKeys.forEach((k) => {
    rows.push(['metric', k, leftMetrics[k] ?? '', rightMetrics[k] ?? '']);
  });
  (result?.recommendations || []).forEach((rec, idx) => {
    rows.push(['recommendation', String(idx + 1), rec, '']);
  });

  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="node-comparison-${projectId}.csv"`
  );
  return res.status(httpStatus.OK).send(csv);
});

const exportProjectNodeRankings = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const projectId = req.params.projectId;
  const result = await copilotNodeRankingService.listProjectNodeRankings({
    tenantId,
    projectId,
    scope: req.query.scope,
    direction: req.query.direction,
    metric: req.query.metric,
    limit: req.query.limit,
    all: req.query.all === 'true',
    includeZero: req.query.includeZero === 'true',
    periodStart: req.query.from,
    periodEnd: req.query.to,
  });

  const format = String(req.query.format || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'json') {
    return res.status(httpStatus.BAD_REQUEST).send({
      message: 'Unsupported export format. Use csv or json.',
    });
  }
  if (format === 'json') {
    return res.status(httpStatus.OK).send(result);
  }

  const rows = [
    [
      'rank',
      'nodeId',
      'nodeName',
      'levelName',
      'scope',
      'direction',
      'metric',
      'metricValue',
      'submissionCount',
      'contributorCount',
      'factCount',
      'sumCandidateTotal',
      'numericTotal',
      'numericAverage',
    ],
  ];
  (result?.rankings || []).forEach((r) => {
    rows.push([
      r.rank,
      r.nodeId,
      r.nodeName,
      r.levelName,
      result.scope,
      result.direction,
      result.metric,
      r[result.metric],
      r.submissionCount,
      r.contributorCount,
      r.factCount,
      r.sumCandidateTotal,
      r.numericTotal,
      r.numericAverage,
    ]);
  });
  const csv = toCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="node-rankings-${projectId}.csv"`
  );
  return res.status(httpStatus.OK).send(csv);
});

const listTools = catchAsync(async (req, res) => {
  const tools = await copilotToolRuntimeService.listTools({
    enabledOnly: req.query.enabledOnly !== 'false',
  });
  res.status(httpStatus.OK).send({
    total: tools.length,
    results: tools,
  });
});

const callTool = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const roleIds = resolveRoleIds(req.user);
  const isOwner = Boolean(req.user?.isOwner || req.user?.isSuper);

  const result = await copilotToolRuntimeService.executeToolCall({
    tenantId,
    userId,
    roleIds,
    isOwner,
    toolName: req.params.toolName,
    payload: req.body.payload || {},
    lockKey: req.body.lockKey,
    lockTtlSec: req.body.lockTtlSec,
    approvalToken: req.body.approvalToken,
    correlationId:
      req.body.correlationId ||
      req.headers['x-correlation-id'] ||
      req.headers['correlation-id'] ||
      null,
  });

  res.status(httpStatus.OK).send(result);
});

const createApprovalDecision = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const approval = await copilotApprovalService.createApprovalDecision({
    tenantId,
    requestedByUserId: userId,
    approvedByUserId: userId,
    toolName: req.body.toolName || null,
    actionType: req.body.actionType || null,
    entityId: req.body.entityId || null,
    payload: req.body.payload || {},
    approvalToken: req.body.approvalToken || null,
    traceId:
      req.body.correlationId ||
      req.headers['x-correlation-id'] ||
      req.headers['correlation-id'] ||
      null,
    expiresInSec: req.body.expiresInSec,
    reason: req.body.reason || null,
    metadata: req.body.metadata || {},
  });

  res.status(httpStatus.CREATED).send({
    id: approval.id,
    approvalToken: approval.approval_token,
    status: approval.status,
    traceId: approval.trace_id,
    expiresAt: approval.expires_at,
    approvedAt: approval.approved_at,
  });
});

const queueHumanApproval = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const approval = await copilotApprovalService.createHumanApprovalRequest({
    tenantId,
    requestedByUserId: userId,
    toolName: req.body.toolName || null,
    actionType: req.body.actionType || null,
    entityId: req.body.entityId || null,
    payload: req.body.payload || {},
    traceId:
      req.body.correlationId ||
      req.headers['x-correlation-id'] ||
      req.headers['correlation-id'] ||
      null,
    reason: req.body.reason || null,
    metadata: req.body.metadata || {},
  });

  // Queue a notification to tenant admins about the pending request
  try {
    const notificationQueueService = require('../services/notificationQueue.service');
    await notificationQueueService.queueCustomNotification({
      type: 'human_approval_requested',
      tenantId,
      requestedByUserId: userId,
      actionType: req.body.actionType,
      approvalToken: approval.approval_token,
      subject: `Action approval required: ${req.body.actionType || 'unknown'}`,
      message:
        `User ${userId} has requested approval for action "${req.body.actionType || 'unknown'}". ` +
        `Reference: ${approval.approval_token}. ` +
        `Log in to Saby to approve or reject this request.`,
    });
  } catch { /* non-fatal — notification failure should not block the queue response */ }

  res.status(httpStatus.ACCEPTED).send({
    approvalToken: approval.approval_token,
    status: approval.status,
    message: 'Your request has been submitted for approval. You will be notified when it is processed.',
    reference: approval.approval_token,
  });
});

const listPendingApprovals = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const items = await copilotApprovalService.listPendingHumanApprovals({ tenantId, limit });
  res.status(httpStatus.OK).send({ items, total: items.length });
});

const approveDecision = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const approvedByUserId = resolveUserId(req.user);
  const { approvalToken } = req.params;
  const { reason = null } = req.body;

  const row = await copilotApprovalService.approveHumanDecision({
    tenantId,
    approvalToken,
    approvedByUserId,
    reason,
  });
  if (!row) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Approval request not found or already acted on');
  }
  res.status(httpStatus.OK).send({
    approvalToken: row.approval_token,
    status: row.status,
    approvedAt: row.approved_at,
    message: 'Approved. The requested action will now be executed.',
  });
});

const rejectDecision = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const rejectedByUserId = resolveUserId(req.user);
  const { approvalToken } = req.params;
  const { reason = null } = req.body;

  const row = await copilotApprovalService.rejectHumanDecision({
    tenantId,
    approvalToken,
    rejectedByUserId,
    reason,
  });
  if (!row) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Approval request not found or already acted on');
  }
  res.status(httpStatus.OK).send({
    approvalToken: row.approval_token,
    status: row.status,
    message: 'Request rejected.',
  });
});

const listToolCallLogs = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const logs = await copilotToolRuntimeService.listToolCallLogs({
    tenantId,
    toolName: req.query.toolName,
    status: req.query.status,
    limit: req.query.limit,
  });

  res.status(httpStatus.OK).send({
    total: logs.length,
    results: logs,
  });
});

const getSessionContext = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const context = await copilotSessionContextService.getSessionContext({
    tenantId,
    userId,
  });
  res.status(httpStatus.OK).send(context);
});

const updateSessionContext = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const context = await copilotSessionContextService.upsertSessionContext({
    tenantId,
    userId,
    currentProjectId: req.body.currentProjectId,
    currentNodeId: req.body.currentNodeId,
    recentEntities: req.body.recentEntities,
    context: req.body.context,
    lastIntent: req.body.lastIntent,
  });
  res.status(httpStatus.OK).send(context);
});

const getFocusState = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const focus = await copilotSessionContextService.getFocusState({
    tenantId,
    userId,
    focusType: req.query.focusType,
  });
  res.status(httpStatus.OK).send(focus);
});

const updateFocusState = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const focus = await copilotSessionContextService.upsertFocusState({
    tenantId,
    userId,
    focusType: req.body.focusType,
    focusEntityId: req.body.focusEntityId,
    focusJson: req.body.focus,
    expiresAt: req.body.expiresAt,
  });
  res.status(httpStatus.OK).send(focus);
});

const clearFocusState = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const result = await copilotSessionContextService.clearFocusState({
    tenantId,
    userId,
    focusType: req.query.focusType,
  });
  res.status(httpStatus.OK).send(result);
});

const searchEntities = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const items = await copilotEntityResolverService.searchEntities({
    tenantId,
    query: req.body.query,
    entityTypes: req.body.entityTypes,
    actionType: req.body.actionType,
    limit: req.body.limit,
  });
  res.status(httpStatus.OK).send({
    total: items.length,
    results: items,
  });
});

const resolveEntityReference = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotEntityResolverService.resolveEntityReference({
    tenantId,
    entityType: req.body.entityType,
    value: req.body.value,
    actionType: req.body.actionType,
    limit: req.body.limit,
    actorUserId,
    source: 'resolve_api',
  });
  res.status(httpStatus.OK).send(result);
});

const generateProjectWizardDraft = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotProjectWizardService.generateProjectWizardDraft({
    tenantId,
    actorUserId,
    prompt: req.body.prompt,
    projectName: req.body.projectName,
    options: req.body.options || {},
  });
  res.status(httpStatus.OK).send(result);
});

const finalizeProjectWizardDraft = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotProjectWizardService.finalizeProjectWizardDraft({
    tenantId,
    actorUserId,
    draft: req.body.draft,
    publish: req.body.publish === true,
    publishOptions: req.body.publishOptions || {},
  });
  res.status(httpStatus.CREATED).send(result);
});

const saveProjectWizardDraft = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotProjectWizardService.saveProjectWizardDraft({
    tenantId,
    actorUserId,
    draft: req.body.draft,
    summary: req.body.summary || {},
    prompt: req.body.prompt || null,
  });
  res.status(httpStatus.OK).send(result);
});

const getProjectWizardDraft = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotProjectWizardService.getProjectWizardDraft({
    tenantId,
    actorUserId,
  });
  res.status(httpStatus.OK).send(result);
});

const clearProjectWizardDraft = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const result = await copilotProjectWizardService.clearProjectWizardDraft({
    tenantId,
    actorUserId,
  });
  res.status(httpStatus.OK).send(result);
});

const importOnboardingCsv = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const dryRun = req.body?.dryRun !== false;
  const result = dryRun
    ? await copilotOnboardingService.validateOnboardingCsvDryRun({
        tenantId,
        csvText: req.body.csvText,
      })
    : await copilotOnboardingService.importOnboardingCsv({
        tenantId,
        csvText: req.body.csvText,
        actorUser: req.user,
      });
  res.status(httpStatus.OK).send(result);
});

const createOnboardingJob = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const file = req.file;
  if (!file) {
    res.status(httpStatus.BAD_REQUEST).send({
      code: httpStatus.BAD_REQUEST,
      message: 'CSV file is required (field: file)',
    });
    return;
  }

  const modeRaw = String(req.body?.mode || 'import').toLowerCase();
  const mode = modeRaw === 'dry_run' ? 'dry_run' : 'import';
  const threadId =
    req.body?.threadId && String(req.body.threadId).trim()
      ? String(req.body.threadId).trim()
      : null;
  const idempotencyKey =
    req.body?.idempotencyKey ||
    req.headers['x-idempotency-key'] ||
    req.headers['idempotency-key'] ||
    null;

  const created = await copilotOnboardingJobService.createOnboardingJob({
    tenantId,
    actorUserId,
    threadId,
    mode,
    file,
    idempotencyKey,
  });
  const { job, deduped } = created;

  if (!deduped) {
    await copilotOnboardingJobService.markOnboardingJobQueued({
      tenantId,
      jobId: job.id,
      actorUserId,
    });
    await queueOnboardingImportJob({
      jobId: job.id,
      tenantId,
      actorUser: req.user || {},
    });
    // Ensure worker schedules exist for this tenant (no-op if already seeded)
    seedAgentSchedulesForTenant(tenantId).catch((err) =>
      logger.warn('[Onboarding] Failed to seed agent schedules', { tenantId, err: err.message })
    );
  }

  res.status(httpStatus.ACCEPTED).send({
    ok: true,
    message: deduped
      ? 'Onboarding upload already accepted for this idempotency key'
      : 'Onboarding upload accepted',
    deduped: Boolean(deduped),
    job: {
      ...job,
      ...(deduped
        ? {}
        : {
            status: 'queued',
            stage: 'queued',
            progress_pct: 5,
          }),
    },
  });
});

const getOnboardingJobById = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const includeEvents = req.query.includeEvents !== 'false';
  const eventLimit = req.query.eventLimit;
  const job = await copilotOnboardingJobService.getOnboardingJobById({
    tenantId,
    jobId: req.params.jobId,
    includeEvents,
    eventLimit,
  });
  res.status(httpStatus.OK).send({
    ok: true,
    job,
  });
});

const listOnboardingJobs = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const jobs = await copilotOnboardingJobService.listOnboardingJobs({
    tenantId,
    threadId: req.query.threadId || null,
    status: req.query.status || null,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  res.status(httpStatus.OK).send({
    ok: true,
    total: jobs.length,
    results: jobs,
  });
});

const cancelOnboardingJob = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorUserId = resolveUserId(req.user);
  const cancelled = await copilotOnboardingJobService.cancelOnboardingJob({
    tenantId,
    jobId: req.params.jobId,
    cancelledBy: actorUserId,
    reason: req.body?.reason || 'Cancelled by user',
  });
  res.status(httpStatus.OK).send({
    ok: true,
    message: cancelled?.alreadyTerminal
      ? 'Job is already in a terminal state'
      : 'Onboarding job cancelled',
    job: cancelled,
  });
});

const streamOnboardingJobEvents = async (req, res) => {
  const tenantId = req.user?.tenantId;
  const jobId = req.params.jobId;
  const eventLimit = req.query.eventLimit;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  let timer = null;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    res.end();
  };

  const emitSnapshot = async () => {
    try {
      const job = await copilotOnboardingJobService.getOnboardingJobById({
        tenantId,
        jobId,
        includeEvents: true,
        eventLimit,
      });
      send('job', {
        id: job.id,
        status: job.status,
        stage: job.stage,
        progressPct: Number(job.progress_pct || 0),
        summary: job.summary_json || {},
        errors: job.error_json || {},
        events: job.events || [],
        totalRows: Number(job.total_rows || 0),
        processedRows: Number(job.processed_rows || 0),
      });
      if (
        ['completed', 'failed', 'cancelled'].includes(
          String(job.status || '').toLowerCase()
        )
      ) {
        send('done', { id: job.id, status: job.status });
        close();
      }
    } catch (error) {
      send('error', { message: error.message || 'Failed to stream job status' });
      close();
    }
  };

  req.on('close', close);
  req.on('end', close);

  send('connected', { ok: true, jobId });
  await emitSnapshot();
  if (closed) return;

  timer = setInterval(() => {
    emitSnapshot().catch(() => null);
  }, 2000);
};

const triggerComplianceAgentRun = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const result = await complianceAgentService.runComplianceMonitor({ tenantId });
  res.status(httpStatus.OK).send(result);
});

const listComplianceSnapshots = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const snapshots = await complianceAgentService.listComplianceSnapshots({
    tenantId,
    projectId: req.query.projectId,
    limit: req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: snapshots.length, results: snapshots });
});

// ── Phase 5: Data Intelligence ────────────────────────────────────────────────

const getProjectMetrics = catchAsync(async (req, res) => {
  const tenantId   = req.user?.tenantId;
  const projectId  = req.params.projectId;
  const monthLabel = req.query.monthLabel;
  const recompute  = req.query.recompute === 'true';

  if (recompute) {
    const metrics = await operationalMetricsService.computeAndSaveMetrics({
      tenantId, projectId, monthLabel,
    });
    return res.status(httpStatus.OK).send({ recomputed: true, metrics });
  }

  const snapshots = await operationalMetricsService.getLatestSnapshots({
    tenantId, projectId, monthLabel,
  });
  res.status(httpStatus.OK).send({ total: snapshots.length, results: snapshots });
});

const listAnomalies = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const anomalies = await anomalyDetectionService.listAnomalies({
    tenantId,
    projectId: req.query.projectId,
    severity:  req.query.severity,
    limit:     req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: anomalies.length, results: anomalies });
});

/**
 * GET /copilot/intelligence/alerts/stream
 *
 * Server-Sent Events endpoint that pushes merged anomaly + incident data to
 * the connected client every POLL_INTERVAL_MS (default 10 s). The client
 * receives diffs — only the most recent snapshot is sent; the client is
 * responsible for merging/displaying.
 *
 * Events:
 *   connected  — {ok, tenantId}               — sent once on connect
 *   alerts     — {anomalies, incidents,        — sent on each poll tick
 *                 criticalCount, fetchedAt}
 *   error      — {message}                    — fatal; stream ends
 *
 * The frontend should replace the existing 60-s client-side polling with
 * this SSE stream. The stream keeps the connection alive with a comment
 * ping every 20 s so proxies don't close it prematurely.
 */
const ALERTS_POLL_INTERVAL_MS = 10_000; // 10 s
const ALERTS_HIGH_SEVERITY    = new Set(['high', 'critical']);

const streamAlerts = async (req, res) => {
  const tenantId = req.user?.tenantId;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();

  const send = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  let pollTimer  = null;
  let pingTimer  = null;

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(pollTimer);
    clearInterval(pingTimer);
    if (!res.writableEnded) res.end();
  };

  const emitAlerts = async () => {
    if (closed) return;
    try {
      const [anomalies, incidents] = await Promise.all([
        anomalyDetectionService.listAnomalies({ tenantId, limit: 50 }),
        incidentPlaybookService.listIncidents({ tenantId, status: 'open', limit: 50 }),
      ]);

      const criticalAnomalies = anomalies.filter((a) =>
        ALERTS_HIGH_SEVERITY.has(String(a.severity || '').toLowerCase())
      );
      const criticalIncidents = incidents.filter((i) =>
        ALERTS_HIGH_SEVERITY.has(String(i.severity || '').toLowerCase())
      );

      send('alerts', {
        anomalies,
        incidents,
        criticalAnomalies,
        criticalIncidents,
        criticalCount: criticalAnomalies.length + criticalIncidents.length,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('[streamAlerts] Poll failed', { tenantId, err: err.message });
      send('error', { message: 'Failed to fetch alerts' });
      close();
    }
  };

  req.on('close', close);
  req.on('end',   close);

  send('connected', { ok: true, tenantId });
  await emitAlerts(); // immediate first push
  if (closed) return;

  pollTimer = setInterval(() => emitAlerts().catch(() => null), ALERTS_POLL_INTERVAL_MS);
  // Keep-alive comment ping every 20 s
  pingTimer = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 20_000);
};

const generateInsight = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorId  = resolveUserId(req.user);
  const result = await executiveInsightService.queueInsightGeneration({
    tenantId,
    actorId,
    projectId:  req.body.projectId  || null,
    monthLabel: req.body.monthLabel || null,
  });
  res.status(httpStatus.ACCEPTED).send(result);
});

const completeInsight = catchAsync(async (req, res) => {
  const tenantId  = req.user?.tenantId;
  const insightId = req.params.insightId;
  // Verify this insight belongs to the tenant
  const insight = await executiveInsightService.getInsightById({ tenantId, insightId });
  if (!insight) return res.status(httpStatus.NOT_FOUND).send({ message: 'Insight not found' });

  const updated = await executiveInsightService.completeInsight({
    insightId,
    briefJson: req.body.briefJson,
  });
  res.status(httpStatus.OK).send(updated);
});

const failInsight = catchAsync(async (req, res) => {
  const tenantId  = req.user?.tenantId;
  const insightId = req.params.insightId;
  const insight = await executiveInsightService.getInsightById({ tenantId, insightId });
  if (!insight) return res.status(httpStatus.NOT_FOUND).send({ message: 'Insight not found' });

  const updated = await executiveInsightService.failInsight({
    insightId,
    errorMessage: req.body.errorMessage,
  });
  res.status(httpStatus.OK).send(updated);
});

const listInsights = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const insights = await executiveInsightService.listInsights({
    tenantId,
    projectId: req.query.projectId,
    status:    req.query.status,
    limit:     req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: insights.length, results: insights });
});

const getInsightById = catchAsync(async (req, res) => {
  const tenantId  = req.user?.tenantId;
  const insightId = req.params.insightId;
  const insight = await executiveInsightService.getInsightById({ tenantId, insightId });
  if (!insight) return res.status(httpStatus.NOT_FOUND).send({ message: 'Insight not found' });
  res.status(httpStatus.OK).send(insight);
});

// ── Phase 4: Intelligence Gateway ─────────────────────────────────────────────

const listModelRegistry = catchAsync(async (req, res) => {
  const enabledOnly = req.query.enabledOnly !== 'false';
  const models = await modelRouterService.listModelRegistry({ enabledOnly });
  res.status(httpStatus.OK).send({ total: models.length, results: models });
});

const resolveCallPlan = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorId  = resolveUserId(req.user);
  const plan = await intelligenceGatewayService.resolveCallPlan({
    tenantId,
    actorId,
    taskType:        req.body.taskType,
    promptKey:       req.body.promptKey,
    variables:       req.body.variables,
    riskLevel:       req.body.riskLevel,
    fallbackAllowed: req.body.fallbackAllowed,
  });
  res.status(httpStatus.OK).send(plan);
});

const logIntelligenceUsage = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const actorId  = resolveUserId(req.user);
  const result = await intelligenceGatewayService.recordUsage({
    tenantId,
    actorId,
    ...req.body,
  });
  res.status(httpStatus.CREATED).send(result);
});

const getIntelligenceUsageSummary = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const summary = await intelligenceGatewayService.getUsageSummary({
    tenantId,
    from: req.query.from,
    to:   req.query.to,
  });
  res.status(httpStatus.OK).send(summary);
});

const listPrompts = catchAsync(async (req, res) => {
  const prompts = await promptRegistryService.listPrompts({
    taskType: req.query.taskType,
    status:   req.query.status,
    limit:    req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: prompts.length, results: prompts });
});

const getPromptVersion = catchAsync(async (req, res) => {
  const prompt = await promptRegistryService.getPromptVersion(
    req.params.promptKey,
    parseInt(req.params.version, 10)
  );
  if (!prompt) return res.status(httpStatus.NOT_FOUND).send({ message: 'Prompt version not found' });
  res.status(httpStatus.OK).send(prompt);
});

const createPromptVersion = catchAsync(async (req, res) => {
  const createdBy = resolveUserId(req.user);
  const prompt = await promptRegistryService.createPromptVersion({
    ...req.body,
    createdBy,
  });
  res.status(httpStatus.CREATED).send(prompt);
});

const activatePromptVersion = catchAsync(async (req, res) => {
  const prompt = await promptRegistryService.activatePromptVersion(
    req.params.promptKey,
    parseInt(req.params.version, 10)
  );
  res.status(httpStatus.OK).send(prompt);
});

// ─── Phase 6 — RAG / Knowledge Layer ─────────────────────────────────────────

const ingestDoc = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const result = await docIngestionService.ingestDocument({ tenantId, ...req.body });
  res.status(httpStatus.CREATED).send(result);
});

const listDocs = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const docs = await docIngestionService.listDocs({
    tenantId,
    status: req.query.status,
    limit:  req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: docs.length, results: docs });
});

const getDoc = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const doc = await docIngestionService.getDoc({ tenantId, docId: req.params.docId });
  if (!doc) return res.status(httpStatus.NOT_FOUND).send({ message: 'Document not found' });
  res.status(httpStatus.OK).send(doc);
});

const deleteDoc = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  await docIngestionService.deleteDoc({ tenantId, docId: req.params.docId });
  res.status(httpStatus.NO_CONTENT).send();
});

const getDocChunks = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const chunks = await docIngestionService.getDocChunks({
    tenantId,
    docId: req.params.docId,
    limit: req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: chunks.length, results: chunks });
});

const searchDocs = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { query, topK, projectId } = req.body;
  const { chunks, contextString, hasContext } = await docRetrieverService.resolveRagContext({
    tenantId,
    query,
    topK,
    projectId,
  });
  res.status(httpStatus.OK).send({ hasContext, total: chunks.length, results: chunks, contextString });
});

const reindexDoc = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const doc = await docIngestionService.getDoc({ tenantId, docId: req.params.docId });
  if (!doc) return res.status(httpStatus.NOT_FOUND).send({ message: 'Document not found' });

  await docIngestionService.writeChunks({ docId: doc.id, tenantId, contentText: doc.content_text });
  await docIngestionService.queueEmbeddingJob({ docId: doc.id, tenantId });
  res.status(httpStatus.ACCEPTED).send({ message: 'Re-index queued', docId: doc.id });
});

// ─── Phase 7 — Enterprise Autonomy ────────────────────────────────────────────

const registerWorkflowDefinition = catchAsync(async (req, res) => {
  const createdBy = resolveUserId(req.user);
  const def = await workflowDefsService.registerWorkflowDefinition({ ...req.body, createdBy });
  res.status(httpStatus.OK).send(def);
});

const listWorkflowDefinitions = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const enabled = req.query.enabled !== undefined ? req.query.enabled : undefined;
  const defs = await workflowDefsService.listWorkflowDefinitions({ tenantId, enabled });
  res.status(httpStatus.OK).send({ total: defs.length, results: defs });
});

const startWorkflowRun = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { workflowName } = req.params;
  const run = await workflowDefsService.startWorkflowRun({ workflowName, tenantId, ...req.body });
  res.status(httpStatus.CREATED).send(run);
});

const listWorkflowRuns = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { workflowName } = req.params;
  const runs = await workflowDefsService.listWorkflowRuns({
    tenantId, workflowName, status: req.query.status, limit: req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: runs.length, results: runs });
});

const getWorkflowStats = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { workflowName } = req.params;
  const stats = await workflowDefsService.getWorkflowStats({
    tenantId, workflowName, days: req.query.days,
  });
  res.status(httpStatus.OK).send(stats);
});

const submitFeedback = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const submittedBy = resolveUserId(req.user);
  const fb = await agentFeedbackService.submitFeedback({ tenantId, submittedBy, ...req.body });
  res.status(httpStatus.CREATED).send(fb);
});

const listFeedback = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const fb = await agentFeedbackService.listFeedback({
    tenantId,
    taskId:       req.query.taskId,
    workflowName: req.query.workflowName,
    limit:        req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: fb.length, results: fb });
});

const getFeedbackSummary = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const summary = await agentFeedbackService.getFeedbackSummary({
    tenantId,
    workflowName: req.query.workflowName,
    days:         req.query.days,
  });
  res.status(httpStatus.OK).send(summary);
});

const createEvalDataset = catchAsync(async (req, res) => {
  const ds = await agentEvalService.createEvalDataset(req.body);
  res.status(httpStatus.CREATED).send(ds);
});

const listEvalDatasets = catchAsync(async (req, res) => {
  const ds = await agentEvalService.listEvalDatasets({
    workflowName: req.query.workflowName,
    enabled:      req.query.enabled,
  });
  res.status(httpStatus.OK).send({ total: ds.length, results: ds });
});

const recordEvalResult = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const result = await agentEvalService.recordEvalResult({
    datasetId: req.params.datasetId,
    tenantId,
    ...req.body,
  });
  res.status(httpStatus.CREATED).send(result);
});

const getEvalStats = catchAsync(async (req, res) => {
  const stats = await agentEvalService.getEvalStats({
    workflowName: req.query.workflowName,
    days:         req.query.days,
  });
  res.status(httpStatus.OK).send(stats);
});

const createPlaybook = catchAsync(async (req, res) => {
  const pb = await incidentPlaybookService.createPlaybook(req.body);
  res.status(httpStatus.CREATED).send(pb);
});

const listPlaybooks = catchAsync(async (req, res) => {
  const pbs = await incidentPlaybookService.listPlaybooks({
    incidentType: req.query.incidentType,
    enabled:      req.query.enabled,
  });
  res.status(httpStatus.OK).send({ total: pbs.length, results: pbs });
});

const openIncident = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const incident = await incidentPlaybookService.openIncident({ tenantId, ...req.body });
  res.status(httpStatus.CREATED).send(incident);
});

const acknowledgeIncident = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = resolveUserId(req.user);
  const incident = await incidentPlaybookService.acknowledgeIncident({
    incidentId: req.params.incidentId, tenantId, userId,
  });
  res.status(httpStatus.OK).send(incident);
});

const resolveIncident = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const resolvedBy = resolveUserId(req.user);
  const incident = await incidentPlaybookService.resolveIncident({
    incidentId: req.params.incidentId, tenantId, resolvedBy,
    resolutionNotes: req.body.resolutionNotes,
  });
  res.status(httpStatus.OK).send(incident);
});

const listIncidents = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const incidents = await incidentPlaybookService.listIncidents({
    tenantId,
    status:   req.query.status,
    severity: req.query.severity,
    limit:    req.query.limit,
  });
  res.status(httpStatus.OK).send({ total: incidents.length, results: incidents });
});

const getIncidentById = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const incident = await incidentPlaybookService.getIncidentById({
    tenantId, incidentId: req.params.incidentId,
  });
  if (!incident) return res.status(httpStatus.NOT_FOUND).send({ message: 'Incident not found' });
  res.status(httpStatus.OK).send(incident);
});

const updateIncidentStatus = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const incident = await incidentPlaybookService.updateIncidentStatus({
    incidentId: req.params.incidentId, tenantId, status: req.body.status,
  });
  res.status(httpStatus.OK).send(incident);
});

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
  createApprovalDecision,
  queueHumanApproval,
  listPendingApprovals,
  approveDecision,
  rejectDecision,
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
  createOnboardingJob,
  listOnboardingJobs,
  cancelOnboardingJob,
  getOnboardingJobById,
  streamOnboardingJobEvents,
  triggerComplianceAgentRun,
  listComplianceSnapshots,
  // Phase 5
  getProjectMetrics,
  listAnomalies,
  streamAlerts,
  generateInsight,
  completeInsight,
  failInsight,
  listInsights,
  getInsightById,
  listModelRegistry,
  resolveCallPlan,
  logIntelligenceUsage,
  getIntelligenceUsageSummary,
  listPrompts,
  getPromptVersion,
  createPromptVersion,
  activatePromptVersion,
  // Phase 6
  ingestDoc,
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
