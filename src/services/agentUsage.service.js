const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');

/**
 * Agent gateway usage meter (Phase 5). Runtime accounting for every agent run
 * in `copilot.usage_events`: tokens in/out, model calls, tool calls, retries,
 * subagent calls, duration and estimated cost. The agent never reasons about
 * its own billing balance.
 */

let _tableEnsured = false;

// Estimated provider pricing in USD per 1M tokens (defaults when unknown).
const COST_PER_MILLION = {
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'deepseek-chat': { input: 0.27, output: 1.1 },
  default: { input: 1, output: 3 },
};

const estimateCostCents = (model, inputTokens, outputTokens) => {
  const pricing = COST_PER_MILLION[model] || COST_PER_MILLION.default;
  const input = Math.max(0, Number(inputTokens) || 0);
  const output = Math.max(0, Number(outputTokens) || 0);
  const dollars = (input / 1e6) * pricing.input + (output / 1e6) * pricing.output;
  return Math.round(dollars * 100);
};

const ensureTable = async () => {
  if (_tableEnsured) return;
  try {
    await postgresPool.query('CREATE SCHEMA IF NOT EXISTS copilot;');
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS copilot.usage_events (
        id BIGSERIAL PRIMARY KEY,
        run_id VARCHAR(128) NOT NULL,
        tenant_id VARCHAR(128) NOT NULL,
        user_id VARCHAR(128),
        thread_id VARCHAR(64),
        model VARCHAR(128),
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        model_calls INTEGER NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0,
        subagent_calls INTEGER NOT NULL DEFAULT 0,
        retries INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
        quota_consumed INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON copilot.usage_events (tenant_id, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_run ON copilot.usage_events (run_id);
    `);
    _tableEnsured = true;
  } catch (error) {
    logger.warn(`[AgentUsageService] Could not verify usage_events table: ${error.message}`);
  }
};

const recordUsage = async ({
  runId,
  tenantId,
  userId = null,
  threadId = null,
  model = null,
  inputTokens = 0,
  outputTokens = 0,
  modelCalls = 0,
  toolCalls = 0,
  subagentCalls = 0,
  retries = 0,
  durationMs = 0,
  quotaConsumed = 0,
  metadata = {},
}) => {
  if (!runId || !tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'runId and tenantId are required.');
  }
  await ensureTable();
  const estimatedCostCents = estimateCostCents(model, inputTokens, outputTokens);
  const res = await postgresPool.query(
    `INSERT INTO copilot.usage_events (
       run_id, tenant_id, user_id, thread_id, model,
       input_tokens, output_tokens, model_calls, tool_calls, subagent_calls, retries,
       duration_ms, estimated_cost_cents, quota_consumed, metadata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
     ON CONFLICT (run_id) DO UPDATE
     SET input_tokens = EXCLUDED.input_tokens,
         output_tokens = EXCLUDED.output_tokens,
         model_calls = EXCLUDED.model_calls,
         tool_calls = EXCLUDED.tool_calls,
         subagent_calls = EXCLUDED.subagent_calls,
         retries = EXCLUDED.retries,
         duration_ms = EXCLUDED.duration_ms,
         estimated_cost_cents = EXCLUDED.estimated_cost_cents,
         quota_consumed = EXCLUDED.quota_consumed,
         metadata = EXCLUDED.metadata;
    `,
    [
      String(runId),
      String(tenantId),
      userId ? String(userId) : null,
      threadId ? String(threadId) : null,
      model,
      Math.max(0, Number(inputTokens) || 0),
      Math.max(0, Number(outputTokens) || 0),
      Math.max(0, Number(modelCalls) || 0),
      Math.max(0, Number(toolCalls) || 0),
      Math.max(0, Number(subagentCalls) || 0),
      Math.max(0, Number(retries) || 0),
      Math.max(0, Number(durationMs) || 0),
      estimatedCostCents,
      Math.max(0, Number(quotaConsumed) || 0),
      JSON.stringify(metadata || {}),
    ]
  );

  const row = res.rows[0];
  return {
    runId,
    tenantId,
    model,
    inputTokens: Math.max(0, Number(inputTokens) || 0),
    outputTokens: Math.max(0, Number(outputTokens) || 0),
    modelCalls: Math.max(0, Number(modelCalls) || 0),
    toolCalls: Math.max(0, Number(toolCalls) || 0),
    subagentCalls: Math.max(0, Number(subagentCalls) || 0),
    retries: Math.max(0, Number(retries) || 0),
    durationMs: Math.max(0, Number(durationMs) || 0),
    estimatedCostCents,
    quotaConsumed: Math.max(0, Number(quotaConsumed) || 0),
    recorded: true,
  };
};

const summarizeUsage = async ({ tenantId, since = null }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }
  await ensureTable();
  const params = [String(tenantId)];
  let where = 'WHERE tenant_id = $1';
  if (since) {
    params.push(since);
    where += ' AND created_at >= $2';
  }

  const res = await postgresPool.query(
    `SELECT
       count(*)::int AS runs,
       COALESCE(sum(input_tokens), 0)::int AS input_tokens,
       COALESCE(sum(output_tokens), 0)::int AS output_tokens,
       COALESCE(sum(tool_calls), 0)::int AS tool_calls,
       COALESCE(sum(subagent_calls), 0)::int AS subagent_calls,
       COALESCE(sum(retries), 0)::int AS retries,
       COALESCE(sum(duration_ms), 0)::int AS duration_ms,
       COALESCE(sum(estimated_cost_cents), 0)::int AS estimated_cost_cents,
       COALESCE(sum(quota_consumed), 0)::int AS quota_consumed
     FROM copilot.usage_events
     ${where};`,
    params
  );
  const row = res.rows[0] || {};
  const totalTokens = Number(row.input_tokens || 0) + Number(row.output_tokens || 0);

  const byModelRes = await postgresPool.query(
    `SELECT model, count(*)::int AS runs,
            COALESCE(sum(input_tokens), 0)::int AS input_tokens,
            COALESCE(sum(output_tokens), 0)::int AS output_tokens
     FROM copilot.usage_events
     ${where}
     GROUP BY model
     ORDER BY runs DESC;`,
    params
  );

  return {
    runs: Number(row.runs || 0),
    totalTokens,
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    toolCalls: Number(row.tool_calls || 0),
    subagentCalls: Number(row.subagent_calls || 0),
    retries: Number(row.retries || 0),
    durationMs: Number(row.duration_ms || 0),
    estimatedCostCents: Number(row.estimated_cost_cents || 0),
    quotaConsumed: Number(row.quota_consumed || 0),
    byModel: byModelRes.rows.map((r) => ({
      model: r.model,
      runs: Number(r.runs),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
    })),
  };
};

const listUsage = async ({ tenantId, page = 1, limit = 25 }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }
  await ensureTable();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
  const offset = (safePage - 1) * safeLimit;
  const res = await postgresPool.query(
    `SELECT id, run_id, tenant_id, user_id, thread_id, model, input_tokens, output_tokens,
            model_calls, tool_calls, subagent_calls, retries, duration_ms,
            estimated_cost_cents, quota_consumed, metadata, created_at
     FROM copilot.usage_events
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3;`,
    [String(tenantId), safeLimit, offset]
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    runId: row.run_id,
    threadId: row.thread_id,
    model: row.model,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    modelCalls: Number(row.model_calls),
    toolCalls: Number(row.tool_calls),
    subagentCalls: Number(row.subagent_calls),
    retries: Number(row.retries),
    durationMs: Number(row.duration_ms),
    estimatedCostCents: Number(row.estimated_cost_cents),
    quotaConsumed: Number(row.quota_consumed),
    createdAt: row.created_at,
  }));
};

module.exports = {
  estimateCostCents,
  recordUsage,
  summarizeUsage,
  listUsage,
};