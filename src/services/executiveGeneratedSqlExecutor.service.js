const crypto = require('crypto');
const { postgresPool } = require('../config/postgres');
const generatedAnalysisPolicy = require('./executiveGeneratedAnalysisPolicy.service');

const DEFAULT_STATEMENT_TIMEOUT_MS = 10000;
const DEFAULT_LOCK_TIMEOUT_MS = 2000;
const DEFAULT_MAX_ROWS = 1000;
const HARD_MAX_ROWS = 5000;

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

  const client = await postgresPool.connect();
  const startedAt = Date.now();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '${capabilities.statementTimeoutMs}ms'`);
    await client.query(`SET LOCAL lock_timeout = '${capabilities.lockTimeoutMs}ms'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${capabilities.statementTimeoutMs + 1000}ms'`);

    const result = await client.query(validation.boundedSql, parameters);
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
};
