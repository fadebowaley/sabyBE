'use strict';

/**
 * Anomaly Detection Service — Phase 5
 *
 * Compares current-period metrics against historical baselines and flags
 * significant deviations as anomaly records in copilot.metric_anomalies.
 *
 * Severity thresholds (deviation from rolling average):
 *   < 15%  → ignored
 *   15–30% → low
 *   30–50% → medium
 *   50–75% → high
 *   > 75%  → critical
 *
 * For metrics where a higher value is GOOD (e.g. compliance_rate), a large
 * negative deviation is the concern. For metrics where a higher value is BAD
 * (e.g. action_item_overdue_count), a large positive deviation is the concern.
 * The `direction` map below encodes this; the sign of the deviation is flipped
 * for BAD-high metrics before comparing to thresholds.
 */

const { postgresPool }    = require('../config/postgres');
const { getMetricHistory } = require('./operationalMetrics.service');
const logger               = require('../config/logger');

// Metrics where a large positive deviation is the BAD direction
const HIGH_IS_BAD = new Set([
  'action_item_overdue_count',
  'action_item_open_count',
  'compliance_incomplete_nodes',
  'compliance_partial_nodes',
  'outbox_dead_letter_rate',
  'submission_rejection_rate',
  'action_reversal_rate',
  'model_cost_usd',
]);

const SEVERITY_THRESHOLDS = [
  { minPct: 75, severity: 'critical' },
  { minPct: 50, severity: 'high' },
  { minPct: 30, severity: 'medium' },
  { minPct: 15, severity: 'low' },
];

function classifySeverity(deviationPct) {
  const abs = Math.abs(deviationPct);
  for (const { minPct, severity } of SEVERITY_THRESHOLDS) {
    if (abs >= minPct) return severity;
  }
  return null; // below noise floor — ignore
}

/**
 * Compute the rolling average of historical values.
 * Returns null when history is empty.
 */
function rollingAverage(history) {
  if (!history.length) return null;
  const sum = history.reduce((s, h) => s + h.value, 0);
  return sum / history.length;
}

/**
 * Detect anomalies in a current metric map by comparing against historical data.
 * Writes flagged anomalies to copilot.metric_anomalies and resolves stale ones.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.projectId
 * @param {Record<string, {value:number, unit:string}>} opts.currentMetrics   — from computeAndSaveMetrics()
 * @param {string} opts.periodStart — ISO timestamp
 * @param {string} opts.periodEnd   — ISO timestamp
 * @param {number} [opts.lookbackMonths]   — periods for baseline (default 3)
 * @returns {Promise<Array<{metricName:string, severity:string, deviationPct:number}>>}
 */
async function detectAnomalies({
  tenantId, projectId, currentMetrics, periodStart, periodEnd, lookbackMonths = 3,
}) {
  const flagged = [];

  for (const [metricName, { value: currentValue }] of Object.entries(currentMetrics)) {
    // Skip non-numeric or zero baselines to avoid division-by-zero noise
    if (!Number.isFinite(currentValue)) continue;

    let history;
    try {
      history = await getMetricHistory({ tenantId, projectId, metricName, lookbackMonths });
    } catch (err) {
      logger.warn('[AnomalyDetection] History fetch failed', { metricName, err: err.message });
      continue;
    }

    const baseline = rollingAverage(history);
    if (baseline === null || baseline === 0) continue;

    const rawDeviation = ((currentValue - baseline) / Math.abs(baseline)) * 100;

    // For HIGH_IS_BAD metrics, a positive deviation is the problem
    // For others (HIGH_IS_GOOD), a negative deviation is the problem
    const signedDeviation = HIGH_IS_BAD.has(metricName) ? rawDeviation : -rawDeviation;

    const severity = classifySeverity(signedDeviation);
    if (!severity) continue;

    const anomaly = {
      metricName,
      currentValue,
      baselineValue: baseline,
      deviationPct:  Math.round(rawDeviation * 100) / 100,
      severity,
    };
    flagged.push(anomaly);

    await upsertAnomaly({
      tenantId, projectId,
      metricName, currentValue,
      baselineValue: baseline,
      deviationPct:  anomaly.deviationPct,
      severity,
      periodStart, periodEnd,
    });
  }

  // Resolve anomalies that are no longer firing
  await resolveStaleAnomalies({ tenantId, projectId, activemetricNames: flagged.map(f => f.metricName), periodStart });

  logger.info('[AnomalyDetection] Detection complete', {
    tenantId, projectId, flaggedCount: flagged.length,
    critical: flagged.filter(f => f.severity === 'critical').length,
    high:     flagged.filter(f => f.severity === 'high').length,
  });

  return flagged;
}

async function upsertAnomaly({ tenantId, projectId, metricName, currentValue, baselineValue, deviationPct, severity, periodStart, periodEnd }) {
  const sql = `
    INSERT INTO copilot.metric_anomalies
      (tenant_id, project_id, metric_name, current_value, baseline_value,
       deviation_pct, severity, period_start, period_end, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}')
    ON CONFLICT DO NOTHING
  `;
  await postgresPool.query(sql, [
    tenantId, projectId, metricName,
    currentValue, baselineValue, deviationPct,
    severity, periodStart, periodEnd,
  ]);
}

async function resolveStaleAnomalies({ tenantId, projectId, activemetricNames, periodStart }) {
  if (!activemetricNames.length) return;
  const sql = `
    UPDATE copilot.metric_anomalies
    SET resolved_at = now(), updated_at = now()
    WHERE tenant_id = $1
      AND COALESCE(project_id, '') = $2
      AND period_start = $3::timestamptz
      AND resolved_at IS NULL
      AND metric_name <> ALL($4)
  `;
  await postgresPool.query(sql, [tenantId, projectId || '', periodStart, activemetricNames]);
}

/**
 * List unresolved anomalies for a tenant, ordered by severity then recency.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.projectId]
 * @param {string} [opts.severity]
 * @param {number} [opts.limit]
 * @returns {Promise<Array>}
 */
async function listAnomalies({ tenantId, projectId, severity, limit = 50 } = {}) {
  const conditions = ['tenant_id = $1', 'resolved_at IS NULL'];
  const values = [tenantId];
  let idx = 2;

  if (projectId) { conditions.push(`project_id = $${idx++}`); values.push(projectId); }
  if (severity)  { conditions.push(`severity = $${idx++}`);   values.push(severity); }
  values.push(limit);

  const sql = `
    SELECT
      id, tenant_id, project_id, metric_name,
      current_value, baseline_value, deviation_pct, severity,
      period_start, period_end, created_at
    FROM copilot.metric_anomalies
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT $${idx}
  `;
  const { rows } = await postgresPool.query(sql, values);
  return rows;
}

module.exports = {
  detectAnomalies,
  listAnomalies,
  classifySeverity,
  rollingAverage,
};
