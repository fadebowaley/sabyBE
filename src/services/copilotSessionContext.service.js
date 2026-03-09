const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const ensureTenantAndUser = ({ tenantId, userId }) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }
  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }
};

const getSessionContext = async ({ tenantId, userId }) => {
  ensureTenantAndUser({ tenantId, userId });
  const result = await postgresPool.query(
    `SELECT id, tenant_id, user_id, current_project_id, current_node_id, recent_entities, context_json, last_intent, last_used_at, created_at, updated_at
     FROM copilot.session_context
     WHERE tenant_id = $1
       AND user_id = $2
     LIMIT 1`,
    [tenantId, userId]
  );
  return (
    result.rows[0] || {
      id: null,
      tenant_id: tenantId,
      user_id: userId,
      current_project_id: null,
      current_node_id: null,
      recent_entities: [],
      context_json: {},
      last_intent: null,
      last_used_at: null,
      created_at: null,
      updated_at: null,
    }
  );
};

const upsertSessionContext = async ({
  tenantId,
  userId,
  currentProjectId,
  currentNodeId,
  recentEntities,
  context,
  lastIntent,
}) => {
  ensureTenantAndUser({ tenantId, userId });
  const result = await postgresPool.query(
    `INSERT INTO copilot.session_context (
       tenant_id, user_id, current_project_id, current_node_id, recent_entities, context_json, last_intent, last_used_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NOW())
     ON CONFLICT (tenant_id, user_id)
     DO UPDATE SET
       current_project_id = COALESCE(EXCLUDED.current_project_id, copilot.session_context.current_project_id),
       current_node_id = COALESCE(EXCLUDED.current_node_id, copilot.session_context.current_node_id),
       recent_entities = CASE
         WHEN EXCLUDED.recent_entities IS NULL THEN copilot.session_context.recent_entities
         ELSE EXCLUDED.recent_entities
       END,
       context_json = CASE
         WHEN EXCLUDED.context_json IS NULL THEN copilot.session_context.context_json
         ELSE EXCLUDED.context_json
       END,
       last_intent = COALESCE(EXCLUDED.last_intent, copilot.session_context.last_intent),
       last_used_at = NOW(),
       updated_at = NOW()
     RETURNING id, tenant_id, user_id, current_project_id, current_node_id, recent_entities, context_json, last_intent, last_used_at, created_at, updated_at`,
    [
      tenantId,
      userId,
      currentProjectId || null,
      currentNodeId || null,
      JSON.stringify(recentEntities || []),
      JSON.stringify(context || {}),
      lastIntent || null,
    ]
  );
  return result.rows[0];
};

const getFocusState = async ({ tenantId, userId, focusType }) => {
  ensureTenantAndUser({ tenantId, userId });
  const values = [tenantId, userId];
  let where = 'WHERE tenant_id = $1 AND user_id = $2';
  if (focusType) {
    values.push(focusType);
    where += ` AND focus_type = $${values.length}`;
  }

  const result = await postgresPool.query(
    `SELECT id, tenant_id, user_id, focus_type, focus_entity_id, focus_json, expires_at, created_at, updated_at
     FROM copilot.user_focus_state
     ${where}
     ORDER BY updated_at DESC`,
    values
  );

  if (focusType) {
    return result.rows[0] || null;
  }
  return result.rows;
};

const upsertFocusState = async ({
  tenantId,
  userId,
  focusType,
  focusEntityId,
  focusJson,
  expiresAt,
}) => {
  ensureTenantAndUser({ tenantId, userId });
  if (!focusType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'focusType is required');
  }

  const result = await postgresPool.query(
    `INSERT INTO copilot.user_focus_state (
       tenant_id, user_id, focus_type, focus_entity_id, focus_json, expires_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (tenant_id, user_id, focus_type)
     DO UPDATE SET
       focus_entity_id = EXCLUDED.focus_entity_id,
       focus_json = EXCLUDED.focus_json,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()
     RETURNING id, tenant_id, user_id, focus_type, focus_entity_id, focus_json, expires_at, created_at, updated_at`,
    [
      tenantId,
      userId,
      focusType,
      focusEntityId || null,
      JSON.stringify(focusJson || {}),
      expiresAt || null,
    ]
  );
  return result.rows[0];
};

const clearFocusState = async ({ tenantId, userId, focusType }) => {
  ensureTenantAndUser({ tenantId, userId });
  if (!focusType) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'focusType is required');
  }
  const result = await postgresPool.query(
    `DELETE FROM copilot.user_focus_state
     WHERE tenant_id = $1
       AND user_id = $2
       AND focus_type = $3
     RETURNING id`,
    [tenantId, userId, focusType]
  );
  return { removed: result.rowCount > 0 };
};

module.exports = {
  getSessionContext,
  upsertSessionContext,
  getFocusState,
  upsertFocusState,
  clearFocusState,
};
