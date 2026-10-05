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

const createThread = async ({
  tenantId,
  userId,
  threadId = null,
  title = 'New conversation',
  engineSessionId = null,
  metadata = {},
}) => {
  if (!tenantId || !userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId and userId are required.');
  }
  await ensureTables();
  const id = threadId ? String(threadId).slice(0, 64) : nextId();

  // Cross-tenant guard: verify that existing thread does not belong to another tenant
  const existing = await postgresPool.query(
    `SELECT tenant_id FROM copilot.agent_threads WHERE thread_id = $1 LIMIT 1;`,
    [id]
  );
  if (existing.rows[0] && existing.rows[0].tenant_id !== String(tenantId)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Cross-tenant access violation: thread belongs to another tenant.'
    );
  }

  await postgresPool.query(
    `INSERT INTO copilot.agent_threads (thread_id, tenant_id, user_id, title, engine_session_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (thread_id) DO UPDATE SET 
       tenant_id = EXCLUDED.tenant_id,
       updated_at = now(),
       title = CASE WHEN copilot.agent_threads.title = 'New conversation' OR copilot.agent_threads.title IS NULL OR copilot.agent_threads.title = '' THEN EXCLUDED.title ELSE copilot.agent_threads.title END,
       metadata = copilot.agent_threads.metadata || EXCLUDED.metadata;`,
    [id, String(tenantId), String(userId), String(title || 'New conversation'), engineSessionId, JSON.stringify(metadata || {})]
  );
  return getThread({ tenantId, threadId: id });
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
  let userClause = '';
  if (userId) {
    params.push(String(userId));
    userClause = ` AND t.user_id = $${params.length}`;
  }

  const res = await postgresPool.query(
    `SELECT 
       t.thread_id, t.tenant_id, t.user_id,
       CASE 
         WHEN t.title = 'New conversation' OR t.title IS NULL OR t.title = ''
         THEN COALESCE(
           (SELECT SUBSTRING(content FROM 1 FOR 60) FROM copilot.agent_messages WHERE thread_id = t.thread_id AND role = 'user' ORDER BY id ASC LIMIT 1),
           t.title
         )
         ELSE t.title
       END AS title,
       COALESCE(
         t.metadata->>'preview',
         (SELECT SUBSTRING(content FROM 1 FOR 120) FROM copilot.agent_messages WHERE thread_id = t.thread_id ORDER BY id DESC LIMIT 1),
         ''
       ) AS preview,
       t.engine_session_id, t.metadata, t.created_at, t.updated_at
     FROM copilot.agent_threads t
     WHERE t.tenant_id = $1${userClause}
     ORDER BY t.updated_at DESC
     LIMIT $2 OFFSET $3;`,
    params
  );
  const countParams = [String(tenantId)];
  let countUserClause = '';
  if (userId) {
    countParams.push(String(userId));
    countUserClause = ` AND user_id = $${countParams.length}`;
  }
  const countRes = await postgresPool.query(
    `SELECT count(*)::int AS total FROM copilot.agent_threads WHERE tenant_id = $1${countUserClause};`,
    countParams
  );

  return {
    items: res.rows.map((row) => ({
      threadId: row.thread_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      title: row.title || 'Untitled chat',
      preview: row.preview || '',
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
    text: row.content,
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

  const trimmedSnippet = String(content).slice(0, 120);
  const titleSnippet = String(content).slice(0, 60);

  await postgresPool.query(
    `UPDATE copilot.agent_threads 
     SET updated_at = now(),
         title = CASE WHEN $5 = 'user' AND (title = 'New conversation' OR title IS NULL OR title = '') THEN $3 ELSE title END,
         metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{preview}', to_jsonb($4::text))
     WHERE tenant_id = $1 AND thread_id = $2;`,
    [String(tenantId), String(threadId), titleSnippet, trimmedSnippet, role]
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