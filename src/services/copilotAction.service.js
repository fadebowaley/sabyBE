const httpStatus = require('http-status');
const crypto = require('crypto');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const DEFAULT_FEED_LIMIT = 50;
const ACTION_ITEM_STATUS_TRANSITIONS = {
  open: ['in_progress', 'snoozed', 'done', 'cancelled'],
  in_progress: ['snoozed', 'done', 'cancelled'],
  snoozed: ['open', 'in_progress', 'done', 'cancelled'],
  done: [],
  cancelled: [],
};

const getActionCatalog = async (actionType) => {
  const result = await postgresPool.query(
    `SELECT action_type, entity_type, can_reverse, reverse_action_type, requires_approval
     FROM copilot.action_catalog
     WHERE action_type = $1`,
    [actionType]
  );
  return result.rows[0] || null;
};

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const keyValues = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`
  );
  return `{${keyValues.join(',')}}`;
};

const hashRequestPayload = (payload) =>
  crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');

const normalizeRoleIds = (actorRoleIds) => {
  if (!actorRoleIds) return [];
  if (Array.isArray(actorRoleIds)) {
    return actorRoleIds.filter(Boolean).map(String);
  }
  return [String(actorRoleIds)];
};

const enforceActionPermission = async ({
  client,
  tenantId,
  actionType,
  actorUserId,
  actorRoleIds,
  permissionColumn,
}) => {
  const scopedCountResult = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM copilot.action_permissions
     WHERE tenant_id = $1
       AND action_type = $2`,
    [tenantId, actionType]
  );

  const scopedCount = Number(scopedCountResult.rows[0]?.count || 0);
  if (scopedCount === 0) {
    return;
  }

  const roleIds = normalizeRoleIds(actorRoleIds);
  const matchesResult = await client.query(
    `SELECT allow_execute, allow_reverse
     FROM copilot.action_permissions
     WHERE tenant_id = $1
       AND action_type = $2
       AND (
         ($3::text IS NOT NULL AND user_id = $3)
         OR (array_length($4::text[], 1) IS NOT NULL AND role_id = ANY($4::text[]))
       )`,
    [tenantId, actionType, actorUserId || null, roleIds]
  );

  const matches = matchesResult.rows;
  const permitted = matches.some((row) => Boolean(row[permissionColumn]));

  if (!permitted) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `Not permitted to execute action: ${actionType}`
    );
  }
};

const createAction = async ({
  tenantId,
  actorUserId,
  actorRoleIds,
  actionType,
  entityType,
  entityId,
  payload = {},
  idempotencyKey,
  source = 'api',
  priority = 0,
  enforceRbac = true,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const catalog = await getActionCatalog(actionType);
  if (!catalog) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Unknown action type: ${actionType}`
    );
  }

  if (catalog.entity_type !== entityType) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Action ${actionType} is only allowed for entity type ${catalog.entity_type}`
    );
  }

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    if (enforceRbac) {
      await enforceActionPermission({
        client,
        tenantId,
        actionType,
        actorUserId,
        actorRoleIds,
        permissionColumn: 'allow_execute',
      });
    }

    const requestHash = hashRequestPayload({
      actionType,
      entityType,
      entityId: entityId || null,
      payload,
      source,
      priority,
    });

    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT ae.*, ai.request_hash
         FROM copilot.action_idempotency ai
         JOIN copilot.action_events ae ON ae.id = ai.action_event_id
         WHERE ai.tenant_id = $1 AND ai.idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].request_hash !== requestHash) {
          throw new ApiError(
            httpStatus.CONFLICT,
            `Idempotency key reuse with different payload: ${idempotencyKey}`
          );
        }
        await client.query('COMMIT');
        return { event: existing.rows[0], deduped: true };
      }
    }

    const eventResult = await client.query(
      `INSERT INTO copilot.action_events (
        tenant_id, actor_user_id, action_type, entity_type, entity_id,
        payload_json, status, idempotency_key, source, priority,
        created_at, queued_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,'queued',$7,$8,$9,NOW(),NOW(),NOW()
      )
      RETURNING *`,
      [
        tenantId,
        actorUserId || null,
        actionType,
        entityType,
        entityId || null,
        payload,
        idempotencyKey || null,
        source,
        priority,
      ]
    );
    const event = eventResult.rows[0];

    await client.query(
      `INSERT INTO copilot.action_outbox (
        event_id, topic, payload_json, status, next_retry_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'pending', NOW(), NOW(), NOW())`,
      [event.id, `action.execute.${actionType}`, payload]
    );

    if (idempotencyKey) {
      await client.query(
        `INSERT INTO copilot.action_idempotency (
          tenant_id, idempotency_key, action_type, request_hash, action_event_id, status, response_snapshot
        ) VALUES ($1, $2, $3, $4, $5, 'accepted', $6)
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
        [
          tenantId,
          idempotencyKey,
          actionType,
          requestHash,
          event.id,
          { eventId: event.id, status: event.status },
        ]
      );
    }

    await client.query(
      `INSERT INTO copilot.action_items (
        tenant_id, source_event_id, entity_type, entity_id, priority, status,
        assigned_user_id, title, summary, action_hook, metadata
      ) VALUES (
        $1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10
      )`,
      [
        tenantId,
        event.id,
        entityType,
        entityId || null,
        priority,
        actorUserId || null,
        `Action requested: ${actionType}`,
        `Queued action ${actionType} for processing`,
        { tool: actionType, entityType, entityId },
        { actionType, source },
      ]
    );

    await client.query('COMMIT');
    return { event, deduped: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const reverseAction = async ({
  tenantId,
  actorUserId,
  actorRoleIds,
  eventId,
  reason,
  idempotencyKey,
  enforceRbac = true,
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    const originalResult = await client.query(
      `SELECT ae.*, ac.can_reverse, ac.reverse_action_type
       FROM copilot.action_events ae
       LEFT JOIN copilot.action_catalog ac ON ac.action_type = ae.action_type
       WHERE ae.id = $1 AND ae.tenant_id = $2
       FOR UPDATE`,
      [eventId, tenantId]
    );

    if (originalResult.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Action event not found');
    }

    const original = originalResult.rows[0];
    if (!original.can_reverse || !original.reverse_action_type) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Action ${original.action_type} cannot be reversed`
      );
    }

    if (enforceRbac) {
      await enforceActionPermission({
        client,
        tenantId,
        actionType: original.action_type,
        actorUserId,
        actorRoleIds,
        permissionColumn: 'allow_reverse',
      });
    }

    const requestHash = hashRequestPayload({
      originalEventId: original.id,
      originalActionType: original.action_type,
      reverseActionType: original.reverse_action_type,
      reason: reason || null,
    });

    if (idempotencyKey) {
      const existing = await client.query(
        `SELECT ae.*, ai.request_hash
         FROM copilot.action_idempotency ai
         JOIN copilot.action_events ae ON ae.id = ai.action_event_id
         WHERE ai.tenant_id = $1 AND ai.idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].request_hash !== requestHash) {
          throw new ApiError(
            httpStatus.CONFLICT,
            `Idempotency key reuse with different payload: ${idempotencyKey}`
          );
        }
        await client.query('COMMIT');
        return { event: existing.rows[0], deduped: true };
      }
    }

    const reversePayload = {
      reason: reason || null,
      originalEventId: original.id,
      originalActionType: original.action_type,
      originalPayload: original.payload_json,
    };

    const reverseEventResult = await client.query(
      `INSERT INTO copilot.action_events (
        tenant_id, actor_user_id, action_type, entity_type, entity_id, payload_json,
        status, idempotency_key, source, priority, causation_id, created_at, queued_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,'queued',$7,'api',$8,$9,NOW(),NOW(),NOW()
      )
      RETURNING *`,
      [
        tenantId,
        actorUserId || null,
        original.reverse_action_type,
        original.entity_type,
        original.entity_id,
        reversePayload,
        idempotencyKey || null,
        original.priority || 0,
        original.id,
      ]
    );
    const reverseEvent = reverseEventResult.rows[0];

    await client.query(
      `INSERT INTO copilot.action_outbox (
        event_id, topic, payload_json, status, next_retry_at, created_at, updated_at
      ) VALUES ($1, $2, $3, 'pending', NOW(), NOW(), NOW())`,
      [
        reverseEvent.id,
        `action.execute.${original.reverse_action_type}`,
        reversePayload,
      ]
    );

    await client.query(
      `INSERT INTO copilot.action_compensations (
        original_event_id, compensating_event_id, reason, requested_by_user_id, status
      ) VALUES ($1, $2, $3, $4, 'requested')`,
      [original.id, reverseEvent.id, reason || null, actorUserId || null]
    );

    await client.query(
      `UPDATE copilot.action_events
       SET status = 'reversal_requested', updated_at = NOW()
       WHERE id = $1`,
      [original.id]
    );

    if (idempotencyKey) {
      await client.query(
        `INSERT INTO copilot.action_idempotency (
          tenant_id, idempotency_key, action_type, request_hash, action_event_id, status, response_snapshot
        ) VALUES ($1, $2, $3, $4, $5, 'accepted', $6)
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
        [
          tenantId,
          idempotencyKey,
          reverseEvent.action_type,
          requestHash,
          reverseEvent.id,
          { eventId: reverseEvent.id, status: reverseEvent.status },
        ]
      );
    }

    await client.query('COMMIT');
    return { event: reverseEvent, deduped: false };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getActionById = async (tenantId, eventId) => {
  const result = await postgresPool.query(
    `SELECT *
     FROM copilot.action_events
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, eventId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Action event not found');
  }

  const event = result.rows[0];
  if (event.status !== 'queued') {
    return event;
  }

  // Safety reconciliation:
  // If an outbox record has already dead-lettered, the API should not keep returning
  // queued forever. This prevents client-side "timeout/still processing" loops.
  const driftResult = await postgresPool.query(
    `SELECT status, last_error
     FROM copilot.action_outbox
     WHERE event_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [eventId]
  );
  const outbox = driftResult.rows[0];
  if (!outbox || outbox.status !== 'dead_letter') {
    return event;
  }

  const reconciled = await postgresPool.query(
    `UPDATE copilot.action_events
     SET status = 'failed',
         error_message = COALESCE($2, error_message),
         result_json = COALESCE(result_json, '{}'::jsonb) || jsonb_build_object(
           'error',
           COALESCE($2, error_message, 'Action moved to dead_letter'),
           'deadLettered',
           true
         ),
         updated_at = NOW()
     WHERE tenant_id = $1
       AND id = $3
       AND status = 'queued'
     RETURNING *`,
    [tenantId, outbox.last_error || null, eventId]
  );

  return reconciled.rows[0] || event;
};

const getFeed = async ({
  tenantId,
  userId,
  roleId,
  roleIds,
  status,
  limit = DEFAULT_FEED_LIMIT,
}) => {
  const normalizedRoleIds = normalizeRoleIds(roleIds || roleId);
  const values = [tenantId, userId || null, normalizedRoleIds];
  let where = `
    tenant_id = $1
    AND (
      assigned_user_id = $2
      OR (array_length($3::text[], 1) IS NOT NULL AND assigned_role_id = ANY($3::text[]))
      OR (assigned_user_id IS NULL AND assigned_role_id IS NULL)
    )`;

  if (status) {
    values.push(status);
    where += ` AND status = $${values.length}`;
  } else {
    values.push('open');
    where += ` AND status = $${values.length}`;
  }

  values.push(limit);
  const result = await postgresPool.query(
    `SELECT *
     FROM copilot.action_items
     WHERE ${where}
     ORDER BY priority DESC, due_at ASC NULLS LAST, created_at DESC
     LIMIT $${values.length}`,
    values
  );

  return result.rows;
};

const recordExistingAction = async (params) => {
  try {
    return await createAction({
      ...params,
      enforceRbac: false,
    });
  } catch (error) {
    logger.warn(
      `[CopilotActionService] Skipped action log (${params.actionType}): ${error.message}`
    );
    return null;
  }
};

const getActionItemById = async (tenantId, actionItemId) => {
  const result = await postgresPool.query(
    `SELECT *
     FROM copilot.action_items
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, actionItemId]
  );
  if (result.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Action item not found');
  }
  return result.rows[0];
};

const updateActionItemStatus = async ({
  tenantId,
  actionItemId,
  status,
  changedBy,
  reason,
  metadata = {},
}) => {
  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'tenantId is required');
  }

  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    const itemResult = await client.query(
      `SELECT *
       FROM copilot.action_items
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, actionItemId]
    );

    if (itemResult.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Action item not found');
    }

    const item = itemResult.rows[0];
    const oldStatus = item.status;
    const nextStatus = status;

    if (oldStatus === nextStatus) {
      await client.query('COMMIT');
      return item;
    }

    const allowed = ACTION_ITEM_STATUS_TRANSITIONS[oldStatus] || [];
    if (!allowed.includes(nextStatus)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid action item status transition: ${oldStatus} -> ${nextStatus}`
      );
    }

    const completedAtClause =
      nextStatus === 'done' || nextStatus === 'cancelled' ? 'NOW()' : 'NULL';

    const updatedResult = await client.query(
      `UPDATE copilot.action_items
       SET status = $3,
           completed_at = ${completedAtClause},
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, actionItemId, nextStatus]
    );

    await client.query(
      `INSERT INTO copilot.action_item_history (
        action_item_id,
        tenant_id,
        old_status,
        new_status,
        changed_by,
        change_reason,
        metadata,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        actionItemId,
        tenantId,
        oldStatus,
        nextStatus,
        changedBy || null,
        reason || null,
        metadata,
      ]
    );

    await client.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createAction,
  reverseAction,
  getActionById,
  getFeed,
  getActionItemById,
  updateActionItemStatus,
  recordExistingAction,
};
