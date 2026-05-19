'use strict';

/**
 * Operational Metrics Service — Phase 5
 *
 * Unified compute layer that assembles all scored operational facts for a
 * tenant/project/period into a single metric map, then persists each metric
 * as a row in copilot.project_kpi_snapshots (UPSERT).
 *
 * Metric sources (in order of authority):
 *   1. Built-in KPIs from copilotMetricEngine (submission rates, latency, DLQ)
 *   2. Compliance data from event_compliance_tracking + compliance_run_snapshots
 *   3. Action item health (overdue counts, resolution rates)
 *   4. Model cost spend (from model_usage_logs)
 *
 * Each metric is normalised to { name, value, unit } before being written.
 * Returns the full metric map so callers (anomaly detection, insight generator)
 * can work from memory without a second DB round-trip.
 */

const { postgresPool }         = require('../config/postgres');
const { collectBuiltInKpis }   = require('./copilotMetricEngine.service');
const logger                   = require('../config/logger');

// ─── Period helpers ───────────────────────────────────────────────────────────

/** Returns the ISO start of the given month string (YYYY-MM-01 UTC). */
function monthStart(monthLabel) {
  return new Date(`${monthLabel}T00:00:00Z`).toISOString();
}

/** Returns the ISO end-of-month timestamp for a YYYY-MM label. */
function monthEnd(monthLabel) {
  const [year, month] = monthLabel.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
}

/** Returns YYYY-MM for a Date object (defaults to current month). */
function currentMonthLabel(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ─── Compliance metrics ───────────────────────────────────────────────────────

async function loadComplianceMetrics({ tenantId, projectId, monthLabel }) {
  const month = `${monthLabel}-01`;

  // Aggregate from event_compliance_tracking for the month
  const sql = `
    SELECT
      COUNT(*)::int                                          AS total_nodes,
      COUNT(*) FILTER (WHERE compliance_status = 'compliant')::int  AS compliant_nodes,
      COUNT(*) FILTER (WHERE compliance_status = 'partial')::int    AS partial_nodes,
      COUNT(*) FILTER (WHERE compliance_status = 'incomplete')::int AS incomplete_nodes,
      COALESCE(AVG(completeness_percentage), 0)             AS avg_completeness_pct
    FROM event_compliance_tracking
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3::date
  `;
  let rows = [];
  try {
    const result = await postgresPool.query(sql, [tenantId, projectId, month]);
    rows = result.rows;
  } catch (err) {
    if (err.code !== '42P01') throw err;
    logger.warn('[OperationalMetrics] event_compliance_tracking not found, skipping compliance metrics');
    return {};
  }

  const r = rows[0] || {};
  const total = Number(r.total_nodes || 0);
  const compliant = Number(r.compliant_nodes || 0);

  return {
    compliance_rate: {
      value: total > 0 ? (compliant / total) * 100 : 0,
      unit: 'percent',
    },
    compliance_incomplete_nodes: {
      value: Number(r.incomplete_nodes || 0),
      unit: 'count',
    },
    compliance_partial_nodes: {
      value: Number(r.partial_nodes || 0),
      unit: 'count',
    },
    compliance_avg_completeness: {
      value: Number(r.avg_completeness_pct || 0),
      unit: 'percent',
    },
    compliance_total_nodes: {
      value: total,
      unit: 'count',
    },
  };
}

// ─── Action item health metrics ───────────────────────────────────────────────

async function loadActionItemMetrics({ tenantId, periodStart, periodEnd }) {
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::int               AS open_count,
      COUNT(*) FILTER (WHERE status = 'done')::int               AS done_count,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int          AS cancelled_count,
      COUNT(*) FILTER (WHERE due_at < NOW() AND status IN ('open','in_progress','snoozed'))::int
                                                                  AS overdue_count,
      COUNT(*)::int                                               AS total_count
    FROM copilot.action_items
    WHERE tenant_id = $1
      AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
  `;
  const { rows } = await postgresPool.query(sql, [tenantId, periodStart, periodEnd]);
  const r = rows[0] || {};
  const total = Number(r.total_count || 0);
  const done  = Number(r.done_count  || 0);

  return {
    action_item_resolution_rate: {
      value: total > 0 ? (done / total) * 100 : 0,
      unit: 'percent',
    },
    action_item_overdue_count: {
      value: Number(r.overdue_count || 0),
      unit: 'count',
    },
    action_item_open_count: {
      value: Number(r.open_count || 0),
      unit: 'count',
    },
    action_item_total: {
      value: total,
      unit: 'count',
    },
  };
}

// ─── Model cost spend ─────────────────────────────────────────────────────────

async function loadModelCostMetrics({ tenantId, periodStart, periodEnd }) {
  const sql = `
    SELECT
      COALESCE(SUM(estimated_cost_usd), 0)  AS total_cost_usd,
      COUNT(*)::int                          AS total_calls,
      COALESCE(SUM(total_tokens), 0)         AS total_tokens
    FROM copilot.model_usage_logs
    WHERE tenant_id = $1
      AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
      AND invocation_status = 'success'
  `;
  const { rows } = await postgresPool.query(sql, [tenantId, periodStart, periodEnd]);
  const r = rows[0] || {};

  return {
    model_cost_usd: {
      value: Number(r.total_cost_usd || 0),
      unit: 'usd',
    },
    model_call_count: {
      value: Number(r.total_calls || 0),
      unit: 'count',
    },
    model_token_count: {
      value: Number(r.total_tokens || 0),
      unit: 'count',
    },
  };
}

// ─── Snapshot writer ──────────────────────────────────────────────────────────

async function saveKpiSnapshot({ tenantId, projectId, metricName, metricValue, metricUnit, bucketStart, bucketEnd, dimensions }) {
  const sql = `
    INSERT INTO copilot.project_kpi_snapshots
      (tenant_id, project_id, metric_name, metric_value, metric_unit,
       bucket_start, bucket_end, dimensions_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (tenant_id, project_id, metric_name, bucket_start, bucket_end)
    DO UPDATE SET
      metric_value   = EXCLUDED.metric_value,
      metric_unit    = EXCLUDED.metric_unit,
      dimensions_json = EXCLUDED.dimensions_json
  `;
  await postgresPool.query(sql, [
    tenantId, projectId, metricName,
    metricValue, metricUnit,
    bucketStart, bucketEnd,
    JSON.stringify(dimensions || {}),
  ]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute all operational metrics for a project/period and persist snapshots.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.projectId
 * @param {string} [opts.monthLabel]   — YYYY-MM; defaults to current month
 * @returns {Promise<Record<string, {value:number, unit:string}>>} metric map
 */
async function computeAndSaveMetrics({ tenantId, projectId, monthLabel }) {
  const label       = monthLabel || currentMonthLabel();
  const periodStart = monthStart(label);
  const periodEnd   = monthEnd(label);

  // Gather all metric sources in parallel
  const [builtIn, compliance, actionItems, modelCost] = await Promise.all([
    collectBuiltInKpis({ tenantId, projectId, periodStart, periodEnd }).catch((err) => {
      logger.warn('[OperationalMetrics] Built-in KPIs failed, skipping', { err: err.message });
      return {};
    }),
    loadComplianceMetrics({ tenantId, projectId, monthLabel: label }),
    loadActionItemMetrics({ tenantId, periodStart, periodEnd }),
    loadModelCostMetrics({ tenantId, periodStart, periodEnd }),
  ]);

  // Merge all sources — later sources do NOT overwrite built-in KPIs
  const metrics = {
    ...builtIn,
    ...compliance,
    ...actionItems,
    ...modelCost,
  };

  // Persist each metric as a snapshot row (UPSERT)
  await Promise.all(
    Object.entries(metrics).map(([name, { value, unit }]) =>
      saveKpiSnapshot({
        tenantId,
        projectId,
        metricName:  name,
        metricValue: value,
        metricUnit:  unit || 'number',
        bucketStart: periodStart,
        bucketEnd:   periodEnd,
        dimensions:  { monthLabel: label },
      }).catch((err) => {
        logger.warn('[OperationalMetrics] Snapshot write failed', { metric: name, err: err.message });
      })
    )
  );

  logger.info('[OperationalMetrics] Metrics computed and saved', {
    tenantId, projectId, monthLabel: label, metricCount: Object.keys(metrics).length,
  });

  return metrics;
}

/**
 * Load the latest KPI snapshots for a project from the database.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.projectId
 * @param {string} [opts.monthLabel]
 * @returns {Promise<Array>}
 */
async function getLatestSnapshots({ tenantId, projectId, monthLabel }) {
  const label = monthLabel || currentMonthLabel();
  const sql = `
    SELECT
      metric_name, metric_value, metric_unit,
      bucket_start, bucket_end, dimensions_json, created_at
    FROM copilot.project_kpi_snapshots
    WHERE tenant_id = $1
      AND project_id = $2
      AND dimensions_json->>'monthLabel' = $3
    ORDER BY metric_name
  `;
  const { rows } = await postgresPool.query(sql, [tenantId, projectId, label]);
  return rows;
}

/**
 * Load N previous months of a single metric for trend comparison.
 *
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.projectId
 * @param {string} opts.metricName
 * @param {number} [opts.lookbackMonths]   — how many prior months to fetch (default 3)
 * @returns {Promise<Array<{monthLabel:string, value:number, unit:string}>>}
 */
async function getMetricHistory({ tenantId, projectId, metricName, lookbackMonths = 3 }) {
  const sql = `
    SELECT
      dimensions_json->>'monthLabel' AS month_label,
      metric_value,
      metric_unit
    FROM copilot.project_kpi_snapshots
    WHERE tenant_id = $1
      AND project_id = $2
      AND metric_name = $3
    ORDER BY bucket_start DESC
    LIMIT $4
  `;
  const { rows } = await postgresPool.query(sql, [tenantId, projectId, metricName, lookbackMonths]);
  return rows.map(r => ({
    monthLabel: r.month_label,
    value:      Number(r.metric_value),
    unit:       r.metric_unit,
  }));
}

module.exports = {
  computeAndSaveMetrics,
  getLatestSnapshots,
  getMetricHistory,
  currentMonthLabel,
  monthStart,
  monthEnd,
};
