const crypto = require('crypto');
const { parse, toSql } = require('pgsql-ast-parser');
const { postgresPool } = require('../config/postgres');
const generatedAnalysisPolicy = require('./executiveGeneratedAnalysisPolicy.service');

const DEFAULT_STATEMENT_TIMEOUT_MS = 10000;
const DEFAULT_LOCK_TIMEOUT_MS = 2000;
const DEFAULT_MAX_ROWS = 1000;
const HARD_MAX_ROWS = 5000;

const TENANT_PARAM_OFFSET = 1;

/**
 * Walk an AST node tree and shift all parameter references by `offset`.
 * $1 → $2, $2 → $3, etc.  This makes room for tenant_id to occupy $1.
 */
const shiftParameterReferences = (node, offset) => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'parameter' && typeof node.name === 'string') {
    const match = node.name.match(/^\$(\d+)$/);
    if (match) {
      node.name = `$${Number(match[1]) + offset}`;
    }
  }
  Object.values(node).forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => shiftParameterReferences(item, offset));
    } else if (value && typeof value === 'object') {
      shiftParameterReferences(value, offset);
    }
  });
};

/**
 * Collect `tenant_id` filter targets: every physical table reference that
 * matches an allowed source, paired with the SELECT node that owns its
 * FROM/JOIN clause.  The actor tracks the current owner as it descends so
 * CTE bindings and derived-table subqueries receive their own filters.
 *
 * Returns an array of `{ tableRef, selectNode }` pairs.
 */
const collectTenantTargets = (node, allowedSources, targets = [], owner = null) => {
  if (!node || typeof node !== 'object') return targets;

  if (node.type === 'select') {
    const currentOwner = node;
    (node.from || []).forEach((from) =>
      collectTenantTargets(from, allowedSources, targets, currentOwner)
    );
    collectTenantTargets(node.where, allowedSources, targets, currentOwner);
  }

  if (node.type === 'table') {
    const tableName = String(node.name?.name || '').toLowerCase();
    if (tableName && allowedSources.has(tableName) && owner) {
      targets.push({ tableRef: node, selectNode: owner });
    }
  }

  if (node.type === 'join') {
    collectTenantTargets(node.base, allowedSources, targets, owner);
    collectTenantTargets(node.joins || node.join, allowedSources, targets, owner);
  }

  if (node.type === 'with') {
    (node.bind || []).forEach((binding) =>
      collectTenantTargets(binding.statement, allowedSources, targets, null)
    );
    collectTenantTargets(node.in, allowedSources, targets, owner);
  }

  // Fall through so sub-nodes (WHERE expressions, subqueries, CTE bodies)
  // are scanned even when the parent is not a select/with/table/join.
  if (!['select', 'table', 'join', 'with'].includes(node.type)) {
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((item) => collectTenantTargets(item, allowedSources, targets, owner));
      } else if (value && typeof value === 'object') {
        collectTenantTargets(value, allowedSources, targets, owner);
      }
    });
  }

  return targets;
};

/**
 * Build a `{alias}.tenant_id = $1` binary expression for injection into a
 * table reference's owning SELECT.  Uses the table alias when present to
 * avoid ambiguous column references in multi-table joins.
 */
const buildTenantFilter = (tableRef, paramIndex) => {
  const alias = tableRef.name?.alias || tableRef.alias;
  return {
    type: 'binary',
    op: '=',
    left: { type: 'ref', name: 'tenant_id', table: alias ? { name: alias } : undefined },
    right: { type: 'parameter', name: `$${paramIndex}` },
  };
};

const isNodeWithWhere = (node) => node && typeof node === 'object' && (node.type === 'select' || node.type === 'with');

const nodeWhereTarget = (node) => {
  if (node.type === 'with') return node.in;
  return node;
};

/**
 * Add a condition to the owning SELECT's WHERE clause (AND semantics).
 * With-statements delegate to their inner statement.
 */
const mergeWhereClause = (selectNode, condition) => {
  const target = nodeWhereTarget(selectNode);
  if (!target.where) {
    target.where = condition;
    return;
  }
  target.where = {
    type: 'binary',
    op: 'AND',
    left: target.where,
    right: condition,
  };
};

/**
 * Inject `tenant_id = $1` into every allowed-table reference found in the
 * SQL AST.  Existing parameter references are shifted to $2+ so $1 is the
 * tenant id.  Returns the rewritten SQL and the parameter payload to run.
 *
 * @param {string} sql     - AST-validated read-only SQL
 * @param {string} tenantId - The tenant to scope to
 * @param {Set<string>} allowedSources - Normalised table names eligible for injection
 * @returns {{ boundedSql: string, params: Array }|null}
 */
const injectTenantFilter = (sql, tenantId, allowedSources) => {
  let statements;
  try {
    statements = parse(sql);
  } catch {
    return null;
  }

  if (!Array.isArray(statements) || statements.length !== 1) return null;

  const statement = statements[0];
  const targets = collectTenantTargets(statement, allowedSources);
  if (targets.length === 0) return null;

  // Shift existing parameter references BEFORE injecting so $1 stays
  // available for the tenant_id filter and existing params move to $2+.
  shiftParameterReferences(statement, TENANT_PARAM_OFFSET);

  for (const { tableRef, selectNode } of targets) {
    mergeWhereClause(selectNode, buildTenantFilter(tableRef, TENANT_PARAM_OFFSET));
  }

  let boundedSql;
  try {
    boundedSql = toSql.statement(statement);
  } catch {
    return null;
  }

  return { boundedSql, params: [tenantId] };
};

const isGeneratedSqlExecutionEnabled = () =>
  String(process.env.EXECUTIVE_INTELLIGENCE_SQL_EXECUTION_ENABLED || 'false').toLowerCase() === 'true';

const clampInteger = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.floor(number), min), max);
};

const fingerprintSql = (sql) =>
  `sha256:${crypto.createHash('sha256').update(String(sql || '').replace(/\s+/g, ' ').trim()).digest('hex')}`;

const redactValidation = (validation) => ({
  ok: Boolean(validation?.ok),
  code: validation?.code,
  message: validation?.message,
  astValidated: Boolean(validation?.astValidated),
  readOnly: Boolean(validation?.readOnly),
  maxRows: validation?.maxRows,
  limit: validation?.limit,
  sources: validation?.sources || [],
  functions: validation?.functions || [],
});

const getGeneratedSqlExecutionCapabilities = () => ({
  enabled: isGeneratedSqlExecutionEnabled(),
  rawClientSqlAllowed: false,
  generatedSqlExecutionAllowed: isGeneratedSqlExecutionEnabled(),
  requiresAstValidation: true,
  requiresApprovedSources: true,
  readOnlyTransaction: true,
  statementTimeoutMs: clampInteger(
    process.env.EXECUTIVE_INTELLIGENCE_SQL_STATEMENT_TIMEOUT_MS,
    DEFAULT_STATEMENT_TIMEOUT_MS,
    1000,
    60000
  ),
  lockTimeoutMs: clampInteger(
    process.env.EXECUTIVE_INTELLIGENCE_SQL_LOCK_TIMEOUT_MS,
    DEFAULT_LOCK_TIMEOUT_MS,
    250,
    10000
  ),
  maxRows: clampInteger(process.env.EXECUTIVE_INTELLIGENCE_SQL_MAX_ROWS, DEFAULT_MAX_ROWS, 1, HARD_MAX_ROWS),
  approvedSources: generatedAnalysisPolicy.DEFAULT_ALLOWED_SQL_SOURCES,
});

const executeGeneratedSql = async ({ sql, parameters = [], allowedSources, maxRows, requestId, tenantId, userId } = {}) => {
  const capabilities = getGeneratedSqlExecutionCapabilities();
  const effectiveMaxRows = clampInteger(maxRows, capabilities.maxRows, 1, Math.min(capabilities.maxRows, HARD_MAX_ROWS));
  const validation = generatedAnalysisPolicy.validateGeneratedSql(sql, {
    allowedSources,
    maxRows: effectiveMaxRows,
  });

  const queryFingerprint = validation.ok ? fingerprintSql(validation.normalizedSql) : fingerprintSql(sql || '');
  const baseResponse = {
    requestId: requestId || null,
    tenantId: tenantId || null,
    userId: userId || null,
    queryFingerprint,
    validation: redactValidation(validation),
    rawSqlReturned: false,
    rawClientSqlAllowed: false,
    readOnly: true,
  };

  if (!validation.ok) {
    return {
      ...baseResponse,
      status: 'blocked',
      reason: validation.code || 'SQL_VALIDATION_FAILED',
      message: validation.message || 'Generated SQL failed validation',
    };
  }

  if (!capabilities.enabled) {
    return {
      ...baseResponse,
      status: 'blocked',
      reason: 'SQL_EXECUTION_DISABLED',
      message: 'Generated SQL execution is disabled by server policy',
    };
  }

  if (!Array.isArray(parameters)) {
    return {
      ...baseResponse,
      status: 'blocked',
      reason: 'SQL_PARAMETERS_INVALID',
      message: 'Generated SQL parameters must be an array',
    };
  }

  // AST tenant injection: rewrite the validated SQL to inject
  // tenant_id = $1 into every allowed-table reference, shifting
  // existing parameter references by +1 so tenant isolation is
  // enforced at the SQL layer in addition to the executor.
  const injectionSources = new Set(
    (validation.sources || []).map((s) => s.toLowerCase())
  );
  const injection = injectTenantFilter(validation.boundedSql, tenantId, injectionSources);
  const finalSql = injection ? injection.boundedSql : validation.boundedSql;
  const finalParams = injection ? [...injection.params, ...parameters] : parameters;

  const client = await postgresPool.connect();
  const startedAt = Date.now();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${capabilities.statementTimeoutMs}ms'`);
    await client.query(`SET LOCAL lock_timeout = '${capabilities.lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${capabilities.statementTimeoutMs + 1000}ms'`);

    const result = await client.query(finalSql, finalParams);
    await client.query('COMMIT');

    return {
      ...baseResponse,
      status: 'completed',
      rowCount: result.rowCount,
      rows: result.rows || [],
      fields: (result.fields || []).map((field) => ({ name: field.name, dataTypeID: field.dataTypeID })),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Preserve the original query error; rollback failure is only diagnostic.
    }

    return {
      ...baseResponse,
      status: 'failed',
      reason: error.code || 'SQL_EXECUTION_FAILED',
      message: error.message,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    client.release();
  }
};

module.exports = {
  executeGeneratedSql,
  getGeneratedSqlExecutionCapabilities,
  isGeneratedSqlExecutionEnabled,
  fingerprintSql,
  injectTenantFilter,
};
