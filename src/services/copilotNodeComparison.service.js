const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const ALLOWED_SCOPE = new Set(['self', 'family']);

const toDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date value');
  }
  return date;
};

const toNumber = (value, decimals = 2) => Number(Number(value || 0).toFixed(decimals));

const normalizeScope = (value, fallback = 'self') => {
  const scope = String(value || fallback).toLowerCase();
  if (!ALLOWED_SCOPE.has(scope)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid scope: ${value}`);
  }
  return scope;
};

const buildComparisonRecommendations = ({
  leftNodeName,
  rightNodeName,
  winner,
  primaryMetric,
  leftMetrics,
  rightMetrics,
}) => {
  const recs = [];

  if (
    Number(leftMetrics.submissionCount || 0) === 0 &&
    Number(rightMetrics.submissionCount || 0) === 0
  ) {
    recs.push(
      'No submission activity in selected period. Verify project publish state, submission channels, and date filter.'
    );
    recs.push(
      'Run family scope comparison to confirm whether activity exists at child-node level.'
    );
    return recs;
  }

  if (winner !== 'tie') {
    const leader = winner === 'left' ? leftNodeName : rightNodeName;
    const lagger = winner === 'left' ? rightNodeName : leftNodeName;
    recs.push(
      `${lagger}: review ${leader} execution pattern for ${primaryMetric} and replicate assignment/approval cadence.`
    );
  }

  if (Number(leftMetrics.contributorCount || 0) !== Number(rightMetrics.contributorCount || 0)) {
    const leftC = Number(leftMetrics.contributorCount || 0);
    const rightC = Number(rightMetrics.contributorCount || 0);
    if (leftC < rightC) {
      recs.push(`${leftNodeName}: increase active contributor coverage for this project window.`);
    } else {
      recs.push(`${rightNodeName}: increase active contributor coverage for this project window.`);
    }
  }

  if (Number(leftMetrics.numericPoints || 0) === 0 || Number(rightMetrics.numericPoints || 0) === 0) {
    recs.push(
      'Numeric KPI points are limited on one side. Validate form fields and data typing for comparable metrics.'
    );
  }

  return recs.slice(0, 3);
};

const resolveNode = async ({ client, tenantId, nodeId }) => {
  const result = await client.query(
    `SELECT node_id, node_name, parent_node_id, level_id, level_name, level_rank, structure_id, structure_name
     FROM copilot.node_dimension
     WHERE tenant_id = $1 AND node_id = $2`,
    [tenantId, nodeId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, `Node not found: ${nodeId}`);
  }
  return result.rows[0];
};

const resolveNodeSet = async ({ client, tenantId, rootNodeId, scope }) => {
  if (scope === 'self') return [rootNodeId];

  const result = await client.query(
    `SELECT descendant_node_id
     FROM copilot.node_closure
     WHERE tenant_id = $1
       AND ancestor_node_id = $2`,
    [tenantId, rootNodeId]
  );
  if (result.rows.length === 0) return [rootNodeId];
  return result.rows.map((row) => row.descendant_node_id);
};

const aggregateNodeSet = async ({
  client,
  tenantId,
  projectId,
  nodeIds,
  periodStart,
  periodEnd,
}) => {
  const values = [tenantId, projectId, nodeIds];
  let periodSql = '';
  if (periodStart && periodEnd) {
    values.push(periodStart.toISOString(), periodEnd.toISOString());
    periodSql =
      ' AND created_at >= $4::timestamptz AND created_at <= $5::timestamptz';
  }

  const result = await client.query(
    `SELECT
       COUNT(DISTINCT submission_id)::int AS submission_count,
       COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS contributor_count,
       COUNT(*)::int AS fact_count,
       COALESCE(SUM(value_sum_candidate), 0)::numeric AS sum_candidate_total,
       COALESCE(SUM(value_numeric), 0)::numeric AS numeric_total,
       COALESCE(AVG(value_numeric), 0)::numeric AS numeric_avg,
       COUNT(*) FILTER (WHERE value_numeric IS NOT NULL)::int AS numeric_points
     FROM form_submission_facts
     WHERE tenant_id = $1
       AND project_id = $2
       AND node_id = ANY($3::varchar[])${periodSql}`,
    values
  );
  const row = result.rows[0] || {};
  return {
    submissionCount: Number(row.submission_count || 0),
    contributorCount: Number(row.contributor_count || 0),
    factCount: Number(row.fact_count || 0),
    sumCandidateTotal: toNumber(row.sum_candidate_total),
    numericTotal: toNumber(row.numeric_total),
    numericAverage: toNumber(row.numeric_avg),
    numericPoints: Number(row.numeric_points || 0),
  };
};

const compareNodePerformance = async ({
  tenantId,
  projectId,
  leftNodeId,
  rightNodeId,
  leftScope = 'self',
  rightScope = 'self',
  enforceSameLevel = false,
  periodStart,
  periodEnd,
}) => {
  if (!tenantId) throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  if (!projectId) throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
  if (!leftNodeId || !rightNodeId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'leftNodeId and rightNodeId are required'
    );
  }

  const normalizedLeftScope = normalizeScope(leftScope);
  const normalizedRightScope = normalizeScope(rightScope);
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

  const client = await postgresPool.connect();
  try {
    const [leftNode, rightNode] = await Promise.all([
      resolveNode({ client, tenantId, nodeId: leftNodeId }),
      resolveNode({ client, tenantId, nodeId: rightNodeId }),
    ]);

    if (enforceSameLevel && leftNode.level_rank !== rightNode.level_rank) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Nodes are not on same level (${leftNode.level_name || 'unknown'} vs ${
          rightNode.level_name || 'unknown'
        })`
      );
    }

    const [leftNodeSet, rightNodeSet] = await Promise.all([
      resolveNodeSet({
        client,
        tenantId,
        rootNodeId: leftNode.node_id,
        scope: normalizedLeftScope,
      }),
      resolveNodeSet({
        client,
        tenantId,
        rootNodeId: rightNode.node_id,
        scope: normalizedRightScope,
      }),
    ]);

    const [leftMetrics, rightMetrics] = await Promise.all([
      aggregateNodeSet({
        client,
        tenantId,
        projectId,
        nodeIds: leftNodeSet,
        periodStart: start,
        periodEnd: end,
      }),
      aggregateNodeSet({
        client,
        tenantId,
        projectId,
        nodeIds: rightNodeSet,
        periodStart: start,
        periodEnd: end,
      }),
    ]);

    const primaryMetric =
      leftMetrics.sumCandidateTotal !== 0 || rightMetrics.sumCandidateTotal !== 0
        ? 'sumCandidateTotal'
        : 'submissionCount';
    const leftPrimary = Number(leftMetrics[primaryMetric] || 0);
    const rightPrimary = Number(rightMetrics[primaryMetric] || 0);
    const delta = toNumber(leftPrimary - rightPrimary);
    const base = Math.max(Math.abs(rightPrimary), 1);
    const deltaPct = toNumber((delta / base) * 100);
    const winner =
      leftPrimary === rightPrimary
        ? 'tie'
        : leftPrimary > rightPrimary
          ? 'left'
          : 'right';

    const summary =
      winner === 'tie'
        ? `${leftNode.node_name} and ${rightNode.node_name} are tied on ${primaryMetric}.`
        : `${winner === 'left' ? leftNode.node_name : rightNode.node_name} is leading on ${primaryMetric} by ${Math.abs(
            delta
          )}.`;
    const recommendations = buildComparisonRecommendations({
      leftNodeName: leftNode.node_name,
      rightNodeName: rightNode.node_name,
      winner,
      primaryMetric,
      leftMetrics,
      rightMetrics,
    });

    return {
      tenantId,
      projectId,
      period: start
        ? { start: start.toISOString(), end: end.toISOString() }
        : { start: null, end: null },
      comparison: {
        left: {
          nodeId: leftNode.node_id,
          nodeName: leftNode.node_name,
          levelName: leftNode.level_name,
          levelRank: leftNode.level_rank,
          scope: normalizedLeftScope,
          nodeSetSize: leftNodeSet.length,
          metrics: leftMetrics,
        },
        right: {
          nodeId: rightNode.node_id,
          nodeName: rightNode.node_name,
          levelName: rightNode.level_name,
          levelRank: rightNode.level_rank,
          scope: normalizedRightScope,
          nodeSetSize: rightNodeSet.length,
          metrics: rightMetrics,
        },
      },
      result: {
        primaryMetric,
        winner,
        delta,
        deltaPercentVsRight: deltaPct,
        summary,
      },
      recommendations,
    };
  } finally {
    client.release();
  }
};

module.exports = {
  compareNodePerformance,
};
