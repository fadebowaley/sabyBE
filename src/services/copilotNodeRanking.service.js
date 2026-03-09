const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const ALLOWED_SCOPE = new Set(['self', 'family']);
const ALLOWED_DIRECTION = new Set(['top', 'bottom']);
const ALLOWED_METRICS = new Set([
  'submissionCount',
  'contributorCount',
  'factCount',
  'sumCandidateTotal',
  'numericTotal',
  'numericAverage',
]);

const toDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date value');
  }
  return date;
};

const normalize = (value, allowed, fallback, label) => {
  const normalized = String(value || fallback).toLowerCase();
  if (!allowed.has(normalized)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid ${label}: ${value}`);
  }
  return normalized;
};

const toNumber = (value, decimals = 2) => Number(Number(value || 0).toFixed(decimals));

const listProjectNodeRankings = async ({
  tenantId,
  projectId,
  scope = 'self',
  direction = 'top',
  metric = 'submissionCount',
  limit = 5,
  all = false,
  includeZero = false,
  periodStart,
  periodEnd,
}) => {
  if (!tenantId) throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  if (!projectId) throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');

  const normalizedScope = normalize(scope, ALLOWED_SCOPE, 'self', 'scope');
  const normalizedDirection = normalize(direction, ALLOWED_DIRECTION, 'top', 'direction');
  if (!ALLOWED_METRICS.has(metric)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid metric: ${metric}`);
  }

  const parsedLimit = Math.max(1, Math.min(Number(limit || 5), 5000));
  const start = toDate(periodStart, null);
  const end = toDate(periodEnd, null);
  if ((start && !end) || (!start && end)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Both periodStart and periodEnd must be provided together'
    );
  }
  if (start && end && start > end) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'periodStart must be <= periodEnd');
  }

  const values = [tenantId, projectId];
  const periodSql = start && end
    ? (() => {
        values.push(start.toISOString(), end.toISOString());
        return ' AND f.created_at >= $3::timestamptz AND f.created_at <= $4::timestamptz';
      })()
    : '';

  const baseSql =
    normalizedScope === 'family'
      ? `
      SELECT
        nd.node_id,
        nd.node_name,
        nd.level_name,
        nd.level_rank,
        COUNT(DISTINCT f.submission_id) AS submission_count,
        COUNT(DISTINCT f.user_id) FILTER (WHERE f.user_id IS NOT NULL) AS contributor_count,
        COUNT(f.*) AS fact_count,
        COALESCE(SUM(f.value_sum_candidate), 0)::numeric AS sum_candidate_total,
        COALESCE(SUM(f.value_numeric), 0)::numeric AS numeric_total,
        COALESCE(AVG(f.value_numeric), 0)::numeric AS numeric_avg
      FROM copilot.node_dimension nd
      LEFT JOIN copilot.node_closure nc
        ON nc.tenant_id = nd.tenant_id
       AND nc.ancestor_node_id = nd.node_id
      LEFT JOIN form_submission_facts f
        ON f.tenant_id = nd.tenant_id
       AND f.project_id = $2
       AND f.node_id = nc.descendant_node_id${periodSql}
      WHERE nd.tenant_id = $1
        AND COALESCE(nd.is_active, true) = true
      GROUP BY nd.node_id, nd.node_name, nd.level_name, nd.level_rank`
      : `
      SELECT
        nd.node_id,
        nd.node_name,
        nd.level_name,
        nd.level_rank,
        COUNT(DISTINCT f.submission_id) AS submission_count,
        COUNT(DISTINCT f.user_id) FILTER (WHERE f.user_id IS NOT NULL) AS contributor_count,
        COUNT(f.*) AS fact_count,
        COALESCE(SUM(f.value_sum_candidate), 0)::numeric AS sum_candidate_total,
        COALESCE(SUM(f.value_numeric), 0)::numeric AS numeric_total,
        COALESCE(AVG(f.value_numeric), 0)::numeric AS numeric_avg
      FROM copilot.node_dimension nd
      LEFT JOIN form_submission_facts f
        ON f.tenant_id = nd.tenant_id
       AND f.project_id = $2
       AND f.node_id = nd.node_id${periodSql}
      WHERE nd.tenant_id = $1
        AND COALESCE(nd.is_active, true) = true
      GROUP BY nd.node_id, nd.node_name, nd.level_name, nd.level_rank`;

  const result = await postgresPool.query(baseSql, values);
  const rows = (result.rows || []).map((row) => ({
    nodeId: row.node_id,
    nodeName: row.node_name,
    levelName: row.level_name,
    levelRank: row.level_rank != null ? Number(row.level_rank) : null,
    submissionCount: Number(row.submission_count || 0),
    contributorCount: Number(row.contributor_count || 0),
    factCount: Number(row.fact_count || 0),
    sumCandidateTotal: toNumber(row.sum_candidate_total),
    numericTotal: toNumber(row.numeric_total),
    numericAverage: toNumber(row.numeric_avg),
  }));

  const filtered = includeZero ? rows : rows.filter((r) => Number(r[metric] || 0) > 0);
  const sorted = filtered.sort((a, b) => {
    const aVal = Number(a[metric] || 0);
    const bVal = Number(b[metric] || 0);
    if (aVal === bVal) {
      return String(a.nodeName || '').localeCompare(String(b.nodeName || ''));
    }
    return normalizedDirection === 'top' ? bVal - aVal : aVal - bVal;
  });

  const selected = all ? sorted : sorted.slice(0, parsedLimit);
  const limited = selected.map((row, idx) => ({
    rank: idx + 1,
    ...row,
  }));

  return {
    tenantId,
    projectId,
    scope: normalizedScope,
    direction: normalizedDirection,
    metric,
    period: start
      ? { start: start.toISOString(), end: end.toISOString() }
      : { start: null, end: null },
    totalEvaluated: rows.length,
    totalRanked: filtered.length,
    all: Boolean(all),
    rankings: limited,
  };
};

module.exports = {
  listProjectNodeRankings,
};
