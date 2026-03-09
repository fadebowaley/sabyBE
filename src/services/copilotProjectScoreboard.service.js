const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');
const copilotProjectRulesService = require('./copilotProjectRules.service');
const copilotMetricEngineService = require('./copilotMetricEngine.service');
const {
  DEFAULT_STATUS_BANDS,
  scoreRule,
  resolveStatus,
} = require('./copilotRuleScoring.util');

const toDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date value');
  }
  return date.toISOString().slice(0, 10);
};

const collectKpis = async ({ tenantId, projectId, periodStart, periodEnd }) =>
  copilotMetricEngineService.collectBuiltInKpis({
    tenantId,
    projectId,
    periodStart,
    periodEnd,
  });

const computeScoreboard = async ({
  tenantId,
  projectId,
  periodStart,
  periodEnd,
  computedBy = 'worker',
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!projectId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
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
    periodStart,
    periodEnd,
    rules: ruleList,
  });

  const bucketStart = toDateOnly(periodStart);
  const bucketEnd = toDateOnly(periodEnd);
  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    // Persist KPI snapshots for this computation window.
    // eslint-disable-next-line no-restricted-syntax
    for (const [metricName, metricData] of Object.entries(kpiMap)) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO copilot.project_kpi_snapshots (
           tenant_id, project_id, metric_name, metric_value, metric_unit, bucket_start, bucket_end, dimensions_json
         ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, '{}'::jsonb)
         ON CONFLICT (tenant_id, project_id, metric_name, bucket_start, bucket_end)
         DO UPDATE SET
           metric_value = EXCLUDED.metric_value,
           metric_unit = EXCLUDED.metric_unit`,
        [
          tenantId,
          projectId,
          metricName,
          Number(metricData.value || 0),
          metricData.unit || null,
          `${bucketStart}T00:00:00.000Z`,
          `${bucketEnd}T23:59:59.999Z`,
        ]
      );
    }

    const rulesBreakdown = ruleList.map((rule) => {
      const metric = kpiMap[rule.metric] || { value: 0, unit: rule.unit || null };
      const ruleScore = scoreRule({
        direction: rule.direction,
        value: Number(metric.value || 0),
        target: Number(rule.target),
        critical: Number(rule.critical),
      });
      const weight = Number(rule.weight || 0);
      return {
        key: rule.key,
        metric: rule.metric,
        direction: rule.direction,
        weight,
        target: Number(rule.target),
        warning: Number(rule.warning),
        critical: Number(rule.critical),
        value: Number(metric.value || 0),
        unit: metric.unit || rule.unit || null,
        score: Number(ruleScore.toFixed(2)),
        weighted_score: Number(((ruleScore * weight) / 100).toFixed(2)),
      };
    });

    const totalScore = Number(
      rulesBreakdown
        .reduce((sum, r) => sum + Number(r.weighted_score || 0), 0)
        .toFixed(2)
    );
    const statusBands = rulesJson?.scoring?.statusBands || DEFAULT_STATUS_BANDS;
    const scoreStatus = resolveStatus(totalScore, statusBands);

    const scoreboardResult = await client.query(
      `INSERT INTO copilot.project_scoreboard (
         tenant_id, project_id, period_start, period_end, score_status, score, kpis_json, computed_by, last_computed_at
       ) VALUES ($1, $2, $3::date, $4::date, $5, $6, $7::jsonb, $8, NOW())
       ON CONFLICT (tenant_id, project_id, period_start, period_end)
       DO UPDATE SET
         score_status = EXCLUDED.score_status,
         score = EXCLUDED.score,
         kpis_json = EXCLUDED.kpis_json,
         computed_by = EXCLUDED.computed_by,
         last_computed_at = NOW(),
         updated_at = NOW()
       RETURNING id, tenant_id, project_id, period_start, period_end, score_status, score, kpis_json, computed_by, last_computed_at, created_at, updated_at`,
      [
        tenantId,
        projectId,
        bucketStart,
        bucketEnd,
        scoreStatus,
        totalScore,
        JSON.stringify({
          rulesVersion: rulesRow.version,
          metrics: kpiMap,
          rules: rulesBreakdown,
        }),
        computedBy,
      ]
    );

    await client.query('COMMIT');
    return scoreboardResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getLatestScoreboard = async ({ tenantId, projectId }) => {
  const result = await postgresPool.query(
    `SELECT id, tenant_id, project_id, period_start, period_end, score_status, score, kpis_json, computed_by, last_computed_at, created_at, updated_at
     FROM copilot.project_scoreboard
     WHERE tenant_id = $1
       AND project_id = $2
     ORDER BY period_end DESC
     LIMIT 1`,
    [tenantId, projectId]
  );

  if (!result.rows[0]) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Project scoreboard not found');
  }
  return result.rows[0];
};

const getScoreboardHistory = async ({ tenantId, projectId, from, to, limit = 30 }) => {
  const values = [tenantId, projectId];
  let where = 'WHERE tenant_id = $1 AND project_id = $2';

  if (from) {
    values.push(toDateOnly(from));
    where += ` AND period_start >= $${values.length}::date`;
  }
  if (to) {
    values.push(toDateOnly(to));
    where += ` AND period_end <= $${values.length}::date`;
  }

  values.push(Math.min(Math.max(Number(limit) || 30, 1), 200));

  const result = await postgresPool.query(
    `SELECT id, tenant_id, project_id, period_start, period_end, score_status, score, kpis_json, computed_by, last_computed_at, created_at, updated_at
     FROM copilot.project_scoreboard
     ${where}
     ORDER BY period_end DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
};

module.exports = {
  collectKpis,
  computeScoreboard,
  getLatestScoreboard,
  getScoreboardHistory,
  __private: {
    scoreRule,
    resolveStatus,
  },
};
