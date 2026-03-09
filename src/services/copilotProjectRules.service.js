const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const ALLOWED_FACT_AGGREGATES = new Set([
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'count_distinct',
  'ratio',
]);
const ALLOWED_FACT_SCOPES = new Set(['self', 'family']);
const ALLOWED_FACT_FILTER_OPS = new Set([
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
]);

const validateMetricSpecFilters = (metricSpec, index) => {
  const scope = String(metricSpec.scope || metricSpec?.node?.scope || 'self').trim().toLowerCase();
  if (scope && !ALLOWED_FACT_SCOPES.has(scope)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `rules.rules[${index}].metricSpec.scope must be one of: ${Array.from(ALLOWED_FACT_SCOPES).join(', ')}`
    );
  }

  const nodeId = metricSpec.nodeId || metricSpec?.node?.id || metricSpec?.node?.nodeId;
  if (nodeId != null && String(nodeId).trim() === '') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `rules.rules[${index}].metricSpec.nodeId cannot be empty`
    );
  }

  const filters = metricSpec.filters;
  if (filters == null) return;
  if (!Array.isArray(filters)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `rules.rules[${index}].metricSpec.filters must be an array`
    );
  }

  filters.forEach((filter, fIndex) => {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.filters[${fIndex}] must be an object`
      );
    }
    const fieldKey = String(filter.fieldKey || '').trim();
    if (!fieldKey) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.filters[${fIndex}].fieldKey is required`
      );
    }
    const op = String(filter.op || 'eq').trim().toLowerCase();
    if (!ALLOWED_FACT_FILTER_OPS.has(op)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.filters[${fIndex}].op must be one of: ${Array.from(ALLOWED_FACT_FILTER_OPS).join(', ')}`
      );
    }
    if (!Object.prototype.hasOwnProperty.call(filter, 'value')) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.filters[${fIndex}].value is required`
      );
    }
    if (op === 'in' && !Array.isArray(filter.value)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.filters[${fIndex}].value must be an array when op=in`
      );
    }
  });
};

const validateMetricSpec = (rule, index) => {
  const metricSpec = rule.metricSpec;
  if (metricSpec == null) return;
  if (!metricSpec || typeof metricSpec !== 'object' || Array.isArray(metricSpec)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `rules.rules[${index}].metricSpec must be an object`
    );
  }

  const source = String(metricSpec.source || '').trim();
  if (source !== 'fact') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `rules.rules[${index}].metricSpec.source currently supports only "fact"`
    );
  }

  const aggregate = String(metricSpec.aggregate || '').trim();
  if (!ALLOWED_FACT_AGGREGATES.has(aggregate)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `rules.rules[${index}].metricSpec.aggregate must be one of: ${Array.from(ALLOWED_FACT_AGGREGATES).join(', ')}`
    );
  }

  if (aggregate === 'ratio') {
    const numerator = metricSpec.numerator || {};
    const denominator = metricSpec.denominator || {};
    const numAgg = String(numerator.aggregate || '').trim();
    const denAgg = String(denominator.aggregate || '').trim();
    if (!ALLOWED_FACT_AGGREGATES.has(numAgg) || numAgg === 'ratio') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.numerator.aggregate is invalid`
      );
    }
    if (!ALLOWED_FACT_AGGREGATES.has(denAgg) || denAgg === 'ratio') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metricSpec.denominator.aggregate is invalid`
      );
    }
  }

  validateMetricSpecFilters(metricSpec, index);
};

const ensureRulesJsonValid = (rulesJson) => {
  if (!rulesJson || typeof rulesJson !== 'object' || Array.isArray(rulesJson)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'rules must be an object');
  }

  const rules = Array.isArray(rulesJson.rules) ? rulesJson.rules : null;
  if (!rules || rules.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'rules.rules must be a non-empty array'
    );
  }

  const seenKeys = new Set();
  const seenMetrics = new Set();
  let enabledWeightSum = 0;

  rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object') {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}] must be an object`
      );
    }

    const key = String(rule.key || '').trim();
    const metric = String(rule.metric || '').trim();
    const direction = String(rule.direction || '').trim();
    const weight = Number(rule.weight);
    const target = Number(rule.target);
    const warning = Number(rule.warning);
    const critical = Number(rule.critical);
    const enabled = rule.enabled !== false;
    validateMetricSpec(rule, index);

    if (!key) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].key is required`
      );
    }
    if (!metric) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].metric is required`
      );
    }
    if (seenKeys.has(key)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Duplicate rule key detected: ${key}`
      );
    }
    if (seenMetrics.has(metric)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Duplicate rule metric detected: ${metric}`
      );
    }
    seenKeys.add(key);
    seenMetrics.add(metric);

    if (!['higher_is_better', 'lower_is_better'].includes(direction)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].direction must be higher_is_better or lower_is_better`
      );
    }

    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}].weight must be > 0 and <= 100`
      );
    }

    if (!Number.isFinite(target) || !Number.isFinite(warning) || !Number.isFinite(critical)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}] target/warning/critical must be numbers`
      );
    }

    if (direction === 'higher_is_better') {
      if (!(critical <= warning && warning <= target)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `rules.rules[${index}] requires critical <= warning <= target for higher_is_better`
        );
      }
    } else if (!(critical >= warning && warning >= target)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `rules.rules[${index}] requires critical >= warning >= target for lower_is_better`
      );
    }

    if (enabled) {
      enabledWeightSum += weight;
    }
  });

  if (Math.abs(enabledWeightSum - 100) > 0.0001) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Enabled rule weights must sum to 100 (got ${enabledWeightSum})`
    );
  }
};

const createRulesVersion = async ({
  tenantId,
  projectId,
  rulesJson,
  createdBy,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!projectId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
  }

  ensureRulesJsonValid(rulesJson);

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    const nextVersionResult = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM copilot.project_rules
       WHERE tenant_id = $1 AND project_id = $2`,
      [tenantId, projectId]
    );
    const nextVersion = Number(nextVersionResult.rows[0]?.next_version || 1);

    await client.query(
      `UPDATE copilot.project_rules
       SET active = FALSE,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND project_id = $2
         AND active = TRUE`,
      [tenantId, projectId]
    );

    const insertResult = await client.query(
      `INSERT INTO copilot.project_rules (
         tenant_id, project_id, version, rules_json, active, created_by
       ) VALUES ($1, $2, $3, $4::jsonb, TRUE, $5)
       RETURNING id, tenant_id, project_id, version, rules_json, active, created_by, created_at, updated_at`,
      [tenantId, projectId, nextVersion, JSON.stringify(rulesJson), createdBy || null]
    );

    await client.query('COMMIT');
    return insertResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getActiveRules = async ({ tenantId, projectId }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!projectId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
  }

  const result = await postgresPool.query(
    `SELECT id, tenant_id, project_id, version, rules_json, active, created_by, created_at, updated_at
     FROM copilot.project_rules
     WHERE tenant_id = $1
       AND project_id = $2
       AND active = TRUE
     ORDER BY version DESC
     LIMIT 1`,
    [tenantId, projectId]
  );

  if (!result.rows[0]) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Active project rules not found');
  }

  return result.rows[0];
};

const listRuleVersions = async ({ tenantId, projectId }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!projectId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
  }

  const result = await postgresPool.query(
    `SELECT id, tenant_id, project_id, version, rules_json, active, created_by, created_at, updated_at
     FROM copilot.project_rules
     WHERE tenant_id = $1
       AND project_id = $2
     ORDER BY version DESC`,
    [tenantId, projectId]
  );

  return result.rows;
};

const activateRuleVersion = async ({ tenantId, projectId, version }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!projectId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'projectId is required');
  }
  if (!Number.isInteger(Number(version)) || Number(version) <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'version must be a positive integer');
  }

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    const targetResult = await client.query(
      `SELECT id, tenant_id, project_id, version, rules_json, active, created_by, created_at, updated_at
       FROM copilot.project_rules
       WHERE tenant_id = $1
         AND project_id = $2
         AND version = $3
       LIMIT 1`,
      [tenantId, projectId, Number(version)]
    );

    if (!targetResult.rows[0]) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Rule version not found');
    }

    await client.query(
      `UPDATE copilot.project_rules
       SET active = FALSE,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND project_id = $2
         AND active = TRUE`,
      [tenantId, projectId]
    );

    const activateResult = await client.query(
      `UPDATE copilot.project_rules
       SET active = TRUE,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND project_id = $2
         AND version = $3
       RETURNING id, tenant_id, project_id, version, rules_json, active, created_by, created_at, updated_at`,
      [tenantId, projectId, Number(version)]
    );

    await client.query('COMMIT');
    return activateResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createRulesVersion,
  getActiveRules,
  listRuleVersions,
  activateRuleVersion,
  __private: {
    ensureRulesJsonValid,
  },
};
