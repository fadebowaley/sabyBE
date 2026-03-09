const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const copilotProjectRulesService = require('./copilotProjectRules.service');
const copilotMetricEngineService = require('./copilotMetricEngine.service');
const { scoreRule, resolveStatus, evaluateVerdict } = require('./copilotRuleScoring.util');

const toDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date value');
  }
  return date;
};

const getDefaultPeriod = () => {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start, end };
};

const metricRecommendation = (metric, verdict) => {
  if (verdict === 'pass') return null;
  const map = {
    submission_success_rate:
      'Review failed submissions by node and validate form completion/training quality.',
    submission_rejection_rate:
      'Audit rejection reasons and enforce pre-submission validation checkpoints.',
    approval_rate:
      'Reduce approval bottlenecks by reviewing workflow ownership and SLA escalations.',
    median_submission_latency_minutes:
      'Improve response time by tightening assignment ownership and deadline reminders.',
    p95_action_completion_minutes:
      'Investigate slowest 5% actions and remove queue/process bottlenecks.',
    outbox_dead_letter_rate:
      'Inspect DLQ causes and fix non-retryable payload/validation errors.',
    open_action_items_overdue:
      'Clear overdue items with node-level ownership and escalation.',
    action_reversal_rate:
      'Reduce reversals by strengthening validation and approval checks before execution.',
  };
  return map[metric] || 'Review this metric trend and enforce corrective actions at node and workflow levels.';
};

const analyzeProjectRules = async ({
  tenantId,
  projectId,
  periodStart,
  periodEnd,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!projectId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
  }

  const defaults = getDefaultPeriod();
  const start = toDate(periodStart, defaults.start);
  const end = toDate(periodEnd, defaults.end);
  if (start > end) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'periodStart must be <= periodEnd');
  }

  const rulesRow = await copilotProjectRulesService.getActiveRules({
    tenantId,
    projectId,
  });
  const rulesJson = rulesRow.rules_json || {};
  const ruleList = Array.isArray(rulesJson.rules) ? rulesJson.rules : [];
  if (ruleList.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No active rules configured');
  }

  const kpiMap = await copilotMetricEngineService.collectRuleAwareMetrics({
    tenantId,
    projectId,
    periodStart: start,
    periodEnd: end,
    rules: ruleList,
  });

  const ruleResults = ruleList.map((rule) => {
    const enabled = rule.enabled !== false;
    const metric = kpiMap[rule.metric] || null;
    const value =
      metric && metric.value != null ? Number(metric.value) : Number.NaN;
    const target = Number(rule.target);
    const warning = Number(rule.warning);
    const critical = Number(rule.critical);
    const rawScore = scoreRule({
      direction: rule.direction,
      value,
      target,
      critical,
    });
    const weight = Number(rule.weight || 0);
    const weightedScore = enabled ? Number(((rawScore * weight) / 100).toFixed(2)) : 0;
    const { verdict, reason } = evaluateVerdict({
      direction: rule.direction,
      value,
      target,
      warning,
    });
    const recommendation = metricRecommendation(rule.metric, verdict);

    return {
      key: rule.key,
      metric: rule.metric,
      metricSource: metric?.source || 'unknown',
      enabled,
      direction: rule.direction,
      weight,
      unit: metric?.unit || rule.unit || null,
      value: Number.isFinite(value) ? Number(value.toFixed(2)) : null,
      target,
      warning,
      critical,
      score: Number(rawScore.toFixed(2)),
      weightedScore,
      verdict: enabled ? verdict : 'skipped',
      reason: enabled ? reason : 'Rule is disabled',
      recommendation: enabled ? recommendation : null,
    };
  });

  const enabledResults = ruleResults.filter((r) => r.enabled);
  const totals = enabledResults.reduce(
    (acc, row) => {
      acc[row.verdict] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
  const overallScore = Number(
    enabledResults.reduce((sum, row) => sum + Number(row.weightedScore || 0), 0).toFixed(2)
  );
  const overallStatus = resolveStatus(overallScore, rulesJson?.scoring?.statusBands);

  const priorityRecommendations = enabledResults
    .filter((row) => row.verdict !== 'pass' && row.recommendation)
    .sort((a, b) => Number(b.weightedScore || 0) - Number(a.weightedScore || 0))
    .slice(0, 5)
    .map((row) => ({
      ruleKey: row.key,
      metric: row.metric,
      verdict: row.verdict,
      recommendation: row.recommendation,
    }));

  const summary = `Project ${projectId} is currently ${overallStatus} (${overallScore}/100): ${totals.pass} pass, ${totals.warn} warn, ${totals.fail} fail.`;

  return {
    tenantId,
    projectId,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    rulesVersion: rulesRow.version,
    overallStatus,
    overallScore,
    totals,
    metrics: kpiMap,
    rules: ruleResults,
    summary,
    recommendations: priorityRecommendations,
  };
};

module.exports = {
  analyzeProjectRules,
};
