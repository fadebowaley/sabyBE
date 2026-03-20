const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const copilotActionService = require('../services/copilotAction.service');
const copilotAuditExportService = require('../services/copilotAuditExport.service');
const copilotProjectRulesService = require('../services/copilotProjectRules.service');
const copilotProjectScoreboardService = require('../services/copilotProjectScoreboard.service');
const copilotProjectRuleAnalysisService = require('../services/copilotProjectRuleAnalysis.service');
const copilotNodeComparisonService = require('../services/copilotNodeComparison.service');
const copilotNodeRankingService = require('../services/copilotNodeRanking.service');
const copilotToolRuntimeService = require('../services/copilotToolRuntime.service');
const copilotSessionContextService = require('../services/copilotSessionContext.service');
const copilotEntityResolverService = require('../services/copilotEntityResolver.service');
const copilotProjectWizardService = require('../services/copilotProjectWizard.service');
const copilotOnboardingService = require('../services/copilotOnboarding.service');
const copilotOnboardingJobService = require('../services/copilotOnboardingJob.service');
const { queueOnboardingImportJob } = require('../queues/onboardingImport.queue');

const resolveUserId = (user = {}) => user.id || user._id || user.userId || null;
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

  const result = await copilotToolRuntimeService.executeToolCall({
    tenantId,
    userId,
    roleIds,
    toolName: req.params.toolName,
    payload: req.body.payload || {},
    lockKey: req.body.lockKey,
    lockTtlSec: req.body.lockTtlSec,
    approvalToken: req.body.approvalToken,
  });

  res.status(httpStatus.OK).send(result);
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
  createOnboardingJob,
  listOnboardingJobs,
  cancelOnboardingJob,
  getOnboardingJobById,
  streamOnboardingJobEvents,
};
