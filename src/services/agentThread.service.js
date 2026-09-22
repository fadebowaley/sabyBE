const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');

/**
 * Agent gateway history/threads (Phase 5). Durable tenant-scoped session
 * storage in the `copilot` schema: `copilot.agent_threads` and
 * `copilot.agent_messages`.
 */

let _tableEnsured = false;

const nextId = () => `thr_${crypto.randomBytes(9).toString('hex')}`;

const ensureTables = async () => {
  if (_tableEnsured) return;
  try {
    await postgresPool.query('CREATE SCHEMA IF NOT EXISTS copilot;');
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS copilot.agent_threads (
        thread_id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(128) NOT NULL,
        user_id VARCHAR(128) NOT NULL,
        title VARCHAR(512) NOT NULL DEFAULT 'New conversation',
        engine_session_id VARCHAR(128),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_agent_threads_tenant ON copilot.agent_threads (tenant_id, updated_at DESC);
    `);
    await postgresPool.query(`
      CREATE TABLE IF NOT EXISTS copilot.agent_messages (
        id BIGSERIAL PRIMARY KEY,
        thread_id VARCHAR(64) NOT NULL REFERENCES copilot.agent_threads(thread_id) ON DELETE CASCADE,
        tenant_id VARCHAR(128) NOT NULL,
        role VARCHAR(32) NOT NULL,
        content TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        model VARCHAR(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON copilot.agent_messages (thread_id, id ASC);
    `);
    _tableEnsured = true;
  } catch (error) {
    logger.warn(`[AgentThreadService] Could not verify chat tables: ${error.message}`);
  }
};

const createThread = async ({ tenantId, userId, title = 'New conversation', engineSessionId = null }) => {
  if (!tenantId || !userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and userId are required.');
  }
  await ensureTables();
  const threadId = nextId();
  await postgresPool.query(
    `INSERT INTO copilot.agent_threads (thread_id, tenant_id, user_id, title, engine_session_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb);`,
    [threadId, String(tenantId), String(userId), String(title || 'New conversation'), engineSessionId, '{}']
  );
  return getThread({ tenantId, threadId });
};

const getThread = async ({ tenantId, threadId }) => {
  if (!tenantId || !threadId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and threadId are required.');
  }
  await ensureTables();
  const res = await postgresPool.query(
    `SELECT thread_id, tenant_id, user_id, title, engine_session_id, metadata, created_at, updated_at
     FROM copilot.agent_threads
     WHERE tenant_id = $1 AND thread_id = $2
     LIMIT 1;`,
    [String(tenantId), String(threadId)]
  );
  const row = res.rows[0];
  if (!row) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Thread not found.');
  }
  return {
    threadId: row.thread_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    title: row.title,
    engineSessionId: row.engine_session_id,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const listThreads = async ({ tenantId, userId, page = 1, limit = 20 }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required.');
  }
  await ensureTables();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const params = [String(tenantId), safeLimit, offset];
  const res = await postgresPool.query(
    `SELECT thread_id, tenant_id, user_id, title, engine_session_id, metadata, created_at, updated_at
     FROM copilot.agent_threads
     WHERE tenant_id = $1
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3;`,
    params
  );
  const countRes = await postgresPool.query(
    `SELECT count(*)::int AS total FROM copilot.agent_threads WHERE tenant_id = $1;`,
    [String(tenantId)]
  );

  return {
    items: res.rows.map((row) => ({
      threadId: row.thread_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      title: row.title,
      engineSessionId: row.engine_session_id,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: Number(countRes.rows[0]?.total || 0),
      totalPages: Math.ceil(Number(countRes.rows[0]?.total || 0) / safeLimit),
    },
  };
};

const listMessages = async ({ tenantId, threadId, limit = 100 }) => {
  if (!tenantId || !threadId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and threadId are required.');
  }
  await ensureTables();
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  const res = await postgresPool.query(
    `SELECT id, thread_id, role, content, input_tokens, output_tokens, model, created_at
     FROM copilot.agent_messages
     WHERE tenant_id = $1 AND thread_id = $2
     ORDER BY id ASC
     LIMIT $3;`,
    [String(tenantId), String(threadId), safeLimit]
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    model: row.model,
    createdAt: row.created_at,
  }));
};

const getThreadWithMessages = async ({ tenantId, threadId, limit }) => {
  const thread = await getThread({ tenantId, threadId });
  const messages = await listMessages({ tenantId, threadId, limit });
  return { ...thread, messages };
};

const updateThreadTitle = async ({ tenantId, threadId, title }) => {
  if (!tenantId || !threadId || !title) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId, threadId and title are required.');
  }
  await ensureTables();
  await postgresPool.query(
    `UPDATE copilot.agent_threads SET title = $3, updated_at = now() WHERE tenant_id = $1 AND thread_id = $2;`,
    [String(tenantId), String(threadId), String(title)]
  );
  return getThread({ tenantId, threadId });
};

const appendMessage = async ({
  tenantId,
  threadId,
  role,
  content,
  inputTokens = 0,
  outputTokens = 0,
  model = null,
}) => {
  if (!tenantId || !threadId || !role || content === undefined) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId, threadId, role and content are required.');
  }
  await ensureTables();
  const res = await postgresPool.query(
    `INSERT INTO copilot.agent_messages (thread_id, tenant_id, role, content, input_tokens, output_tokens, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id;`,
    [String(threadId), String(tenantId), role, String(content), Math.max(0, Number(inputTokens) || 0), Math.max(0, Number(outputTokens) || 0), model]
  );
  await postgresPool.query(
    `UPDATE copilot.agent_threads SET updated_at = now() WHERE tenant_id = $1 AND thread_id = $2;`,
    [String(tenantId), String(threadId)]
  );
  return String(res.rows[0]?.id);
};

const setEngineSessionId = async ({ tenantId, threadId, engineSessionId }) => {
  if (!tenantId || !threadId || !engineSessionId) return null;
  await ensureTables();
  await postgresPool.query(
    `UPDATE copilot.agent_threads SET engine_session_id = $3, updated_at = now() WHERE tenant_id = $1 AND thread_id = $2;`,
    [String(tenantId), String(threadId), String(engineSessionId)]
  );
  return getThread({ tenantId, threadId });
};

const deleteThread = async ({ tenantId, threadId }) => {
  if (!tenantId || !threadId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and threadId are required.');
  }
  await ensureTables();
  await getThread({ tenantId, threadId }); // 404 when missing
  await postgresPool.query(
    `DELETE FROM copilot.agent_threads WHERE tenant_id = $1 AND thread_id = $2;`,
    [String(tenantId), String(threadId)]
  );
  return { deleted: true, threadId };
};

module.exports = {
  createThread,
  getThread,
  listThreads,
  listMessages,
  getThreadWithMessages,
  updateThreadTitle,
  appendMessage,
  setEngineSessionId,
  deleteThread,
};