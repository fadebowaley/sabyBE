const { postgresPool } = require('../config/postgres');

const FACT_AGGREGATES = new Set(['sum', 'avg', 'min', 'max', 'count', 'count_distinct']);

const normalizeMetricSpec = (rule = {}) => {
  if (rule.metricSpec && typeof rule.metricSpec === 'object') {
    return { ...rule.metricSpec };
  }
  const metricText = String(rule.metric || '').trim();
  if (!metricText.startsWith('fact:')) return null;

  const parts = metricText.split(':').map((p) => p.trim());
  if (parts.length < 3) return null;
  const aggregate = parts[1];
  const fieldKey = parts[2] || null;
  if (!FACT_AGGREGATES.has(aggregate)) return null;
  return {
    source: 'fact',
    aggregate,
    fieldKey,
    unit: rule.unit || (aggregate.includes('count') ? 'count' : 'number'),
  };
};

const safePct = (num, den) => (den > 0 ? (num / den) * 100 : 0);

const collectBuiltInKpis = async ({ tenantId, projectId, periodStart, periodEnd }) => {
  const values = [tenantId, projectId, periodStart, periodEnd];

  let totalSubmissions = 0;
  let success = 0;
  let approved = 0;
  let rejected = 0;

  try {
    const submissionsResult = await postgresPool.query(
      `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'success')::int AS success,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM form_submissions
       WHERE tenant_id = $1
         AND project_id = $2
         AND created_at >= $3::timestamptz
         AND created_at <= $4::timestamptz`,
      values
    );
    const submissions = submissionsResult.rows[0] || {};
    totalSubmissions = Number(submissions.total || 0);
    success = Number(submissions.success || 0);
    approved = Number(submissions.approved || 0);
    rejected = Number(submissions.rejected || 0);
  } catch (error) {
    if (error?.code !== '42P01') {
      throw error;
    }

    const fallbackResult = await postgresPool.query(
      `SELECT
         COUNT(*) FILTER (WHERE action_type = 'submit_data')::int AS total,
         COUNT(*) FILTER (WHERE action_type = 'approve_submission')::int AS approved,
         COUNT(*) FILTER (WHERE action_type = 'reject_submission')::int AS rejected
       FROM copilot.action_events
       WHERE tenant_id = $1
         AND (
           (entity_type = 'project' AND entity_id = $2)
           OR COALESCE(payload_json->>'projectId', payload_json->>'project_id') = $2
         )
         AND created_at >= $3::timestamptz
         AND created_at <= $4::timestamptz`,
      values
    );
    const fallback = fallbackResult.rows[0] || {};
    totalSubmissions = Number(fallback.total || 0);
    approved = Number(fallback.approved || 0);
    rejected = Number(fallback.rejected || 0);
    success = Math.max(totalSubmissions - rejected, 0);
  }

  const actionDurationResult = await postgresPool.query(
    `WITH durations AS (
       SELECT EXTRACT(EPOCH FROM (completed_at - created_at)) / 60.0 AS minutes
       FROM copilot.action_events
       WHERE tenant_id = $1
         AND (
           (entity_type = 'project' AND entity_id = $2)
           OR COALESCE(payload_json->>'projectId', payload_json->>'project_id') = $2
         )
         AND status = 'completed'
         AND completed_at IS NOT NULL
         AND created_at >= $3::timestamptz
         AND created_at <= $4::timestamptz
     )
     SELECT
       COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutes), 0) AS median_minutes,
       COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY minutes), 0) AS p95_minutes
     FROM durations`,
    values
  );
  const actionDuration = actionDurationResult.rows[0] || {};

  const outboxResult = await postgresPool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'processed')::int AS processed,
       COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter
     FROM copilot.action_outbox
     WHERE created_at >= $1::timestamptz
       AND created_at <= $2::timestamptz`,
    [periodStart, periodEnd]
  );
  const outbox = outboxResult.rows[0] || {};

  const overdueResult = await postgresPool.query(
    `SELECT COUNT(*)::int AS overdue
     FROM copilot.action_items
     WHERE tenant_id = $1
       AND status IN ('open', 'in_progress', 'snoozed')
       AND due_at IS NOT NULL
       AND due_at < NOW()`,
    [tenantId]
  );

  const reversalResult = await postgresPool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'reversed')::int AS reversed,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM copilot.action_events
     WHERE tenant_id = $1
       AND (
         (entity_type = 'project' AND entity_id = $2)
         OR COALESCE(payload_json->>'projectId', payload_json->>'project_id') = $2
       )
       AND created_at >= $3::timestamptz
       AND created_at <= $4::timestamptz`,
    values
  );
  const reversal = reversalResult.rows[0] || {};

  return {
    submission_success_rate: {
      value: safePct(success, totalSubmissions),
      unit: 'percent',
      source: 'builtin',
    },
    submission_rejection_rate: {
      value: safePct(rejected, totalSubmissions),
      unit: 'percent',
      source: 'builtin',
    },
    approval_rate: {
      value: safePct(approved, approved + rejected),
      unit: 'percent',
      source: 'builtin',
    },
    median_submission_latency_minutes: {
      value: Number(actionDuration.median_minutes || 0),
      unit: 'minutes',
      source: 'builtin',
    },
    p95_action_completion_minutes: {
      value: Number(actionDuration.p95_minutes || 0),
      unit: 'minutes',
      source: 'builtin',
    },
    outbox_dead_letter_rate: {
      value: safePct(Number(outbox.dead_letter || 0), Number(outbox.processed || 0) + Number(outbox.dead_letter || 0)),
      unit: 'percent',
      source: 'builtin',
    },
    open_action_items_overdue: {
      value: Number(overdueResult.rows[0]?.overdue || 0),
      unit: 'count',
      source: 'builtin',
    },
    action_reversal_rate: {
      value: safePct(Number(reversal.reversed || 0), Number(reversal.completed || 0)),
      unit: 'percent',
      source: 'builtin',
    },
  };
};

const resolveAggregateSql = (aggregate) => {
  switch (aggregate) {
    case 'sum':
      return 'COALESCE(SUM(value_numeric), 0)::numeric';
    case 'avg':
      return 'COALESCE(AVG(value_numeric), 0)::numeric';
    case 'min':
      return 'COALESCE(MIN(value_numeric), 0)::numeric';
    case 'max':
      return 'COALESCE(MAX(value_numeric), 0)::numeric';
    case 'count':
      return 'COUNT(DISTINCT submission_id)::numeric';
    case 'count_distinct':
      return 'COUNT(DISTINCT value_normalised)::numeric';
    default:
      return null;
  }
};

const pushValue = (values, value) => {
  values.push(value);
  return `$${values.length}`;
};

const buildConditionSql = (condition, values, alias = 'cf') => {
  const fieldKey = String(condition?.fieldKey || '').trim();
  const op = String(condition?.op || 'eq').trim().toLowerCase();
  const rawValue = condition?.value;
  if (!fieldKey) return null;

  const parts = [`${alias}.field_key = ${pushValue(values, fieldKey)}`];

  if (['gt', 'gte', 'lt', 'lte'].includes(op)) {
    const n = Number(rawValue);
    if (!Number.isFinite(n)) return null;
    const comparator =
      op === 'gt' ? '>' : op === 'gte' ? '>=' : op === 'lt' ? '<' : '<=';
    parts.push(`${alias}.value_numeric ${comparator} ${pushValue(values, n)}`);
    return parts.join(' AND ');
  }

  if (op === 'contains') {
    parts.push(`${alias}.value_text ILIKE ${pushValue(values, `%${String(rawValue || '').trim()}%`)}`);
    return parts.join(' AND ');
  }

  if (op === 'in' && Array.isArray(rawValue) && rawValue.length > 0) {
    const numericValues = rawValue.map((v) => Number(v));
    const isNumericList = numericValues.every((v) => Number.isFinite(v));
    if (isNumericList) {
      parts.push(`${alias}.value_numeric = ANY(${pushValue(values, numericValues)}::numeric[])`);
    } else {
      const textValues = rawValue.map((v) => String(v).trim().toLowerCase());
      parts.push(
        `COALESCE(${alias}.value_normalised, LOWER(${alias}.value_text), '') = ANY(${pushValue(values, textValues)}::text[])`
      );
    }
    return parts.join(' AND ');
  }

  if (typeof rawValue === 'boolean') {
    const p = pushValue(values, rawValue);
    parts.push(
      op === 'ne'
        ? `${alias}.value_boolean IS DISTINCT FROM ${p}`
        : `${alias}.value_boolean IS NOT DISTINCT FROM ${p}`
    );
    return parts.join(' AND ');
  }

  const asNumber = Number(rawValue);
  if (Number.isFinite(asNumber)) {
    parts.push(
      op === 'ne'
        ? `${alias}.value_numeric <> ${pushValue(values, asNumber)}`
        : `${alias}.value_numeric = ${pushValue(values, asNumber)}`
    );
    return parts.join(' AND ');
  }

  const textValue = String(rawValue || '').trim().toLowerCase();
  parts.push(
    op === 'ne'
      ? `COALESCE(${alias}.value_normalised, LOWER(${alias}.value_text), '') <> ${pushValue(values, textValue)}`
      : `COALESCE(${alias}.value_normalised, LOWER(${alias}.value_text), '') = ${pushValue(values, textValue)}`
  );
  return parts.join(' AND ');
};

const applyMetricFilters = ({ where, values, metricSpec }) => {
  const nodeId =
    metricSpec?.nodeId || metricSpec?.node?.id || metricSpec?.node?.nodeId || null;
  const scope = String(
    metricSpec?.scope || metricSpec?.node?.scope || 'self'
  ).toLowerCase();

  if (nodeId) {
    if (scope === 'family') {
      const p = pushValue(values, String(nodeId));
      where.push(
        `node_id IN (
          SELECT descendant_node_id
          FROM copilot.node_closure nc
          WHERE nc.tenant_id = $1
            AND nc.ancestor_node_id = ${p}
        )`
      );
    } else {
      where.push(`node_id = ${pushValue(values, String(nodeId))}`);
    }
  }

  const filters = Array.isArray(metricSpec?.filters) ? metricSpec.filters : [];
  filters.forEach((condition, idx) => {
    const alias = `cf${idx + 1}`;
    const conditionSql = buildConditionSql(condition, values, alias);
    if (!conditionSql) return;
    where.push(
      `EXISTS (
        SELECT 1
        FROM form_submission_facts ${alias}
        WHERE ${alias}.submission_id = form_submission_facts.submission_id
          AND ${alias}.tenant_id = form_submission_facts.tenant_id
          AND ${alias}.project_id = form_submission_facts.project_id
          AND ${conditionSql}
      )`
    );
  });
};

const aggregateFactMetric = async ({
  tenantId,
  projectId,
  periodStart,
  periodEnd,
  metricSpec,
}) => {
  if (!metricSpec || String(metricSpec.source) !== 'fact') return null;

  if (metricSpec.aggregate === 'ratio') {
    const inheritedFilters = {
      nodeId: metricSpec?.nodeId || metricSpec?.node?.id || null,
      scope: metricSpec?.scope || metricSpec?.node?.scope || null,
      filters: Array.isArray(metricSpec?.filters) ? metricSpec.filters : [],
    };
    const numerator = await aggregateFactMetric({
      tenantId,
      projectId,
      periodStart,
      periodEnd,
      metricSpec: { source: 'fact', ...inheritedFilters, ...metricSpec.numerator },
    });
    const denominator = await aggregateFactMetric({
      tenantId,
      projectId,
      periodStart,
      periodEnd,
      metricSpec: { source: 'fact', ...inheritedFilters, ...metricSpec.denominator },
    });
    const den = Number(denominator?.value || 0);
    const num = Number(numerator?.value || 0);
    return {
      value: den > 0 ? num / den : 0,
      unit: metricSpec.unit || 'ratio',
      source: 'fact',
      meta: {
        numerator: numerator?.meta || null,
        denominator: denominator?.meta || null,
      },
    };
  }

  const aggregate = String(metricSpec.aggregate || '').trim().toLowerCase();
  const aggregateSql = resolveAggregateSql(aggregate);
  if (!aggregateSql) return null;

  const where = [
    'tenant_id = $1',
    'project_id = $2',
    'created_at >= $3::timestamptz',
    'created_at <= $4::timestamptz',
  ];
  const values = [tenantId, projectId, periodStart, periodEnd];

  const fieldKey = metricSpec.fieldKey ? String(metricSpec.fieldKey).trim() : null;
  if (fieldKey) {
    values.push(fieldKey);
    where.push(`field_key = $${values.length}`);
  }
  applyMetricFilters({ where, values, metricSpec });

  try {
    const result = await postgresPool.query(
      `SELECT ${aggregateSql} AS metric_value
       FROM form_submission_facts
       WHERE ${where.join(' AND ')}`,
      values
    );
    return {
      value: Number(result.rows[0]?.metric_value || 0),
      unit: metricSpec.unit || (aggregate.includes('count') ? 'count' : 'number'),
      source: 'fact',
      meta: {
        aggregate,
        fieldKey,
      },
    };
  } catch (error) {
    if (error?.code === '42P01') {
      return {
        value: 0,
        unit: metricSpec.unit || 'number',
        source: 'fact',
        meta: {
          aggregate,
          fieldKey,
          unavailable: 'form_submission_facts table not found',
        },
      };
    }
    throw error;
  }
};

const collectRuleAwareMetrics = async ({
  tenantId,
  projectId,
  periodStart,
  periodEnd,
  rules = [],
}) => {
  const metrics = await collectBuiltInKpis({
    tenantId,
    projectId,
    periodStart,
    periodEnd,
  });

  // eslint-disable-next-line no-restricted-syntax
  for (const rule of rules) {
    const metricName = String(rule.metric || '').trim();
    if (!metricName || metrics[metricName]) continue;

    const metricSpec = normalizeMetricSpec(rule);
    if (!metricSpec) continue;

    // eslint-disable-next-line no-await-in-loop
    const factMetric = await aggregateFactMetric({
      tenantId,
      projectId,
      periodStart,
      periodEnd,
      metricSpec,
    });
    if (factMetric) {
      metrics[metricName] = factMetric;
    }
  }

  return metrics;
};

module.exports = {
  collectBuiltInKpis,
  collectRuleAwareMetrics,
  __private: {
    normalizeMetricSpec,
    aggregateFactMetric,
  },
};
