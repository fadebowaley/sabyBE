const { postgresPool } = require('../config/postgres');
const config = require('../config/config');
const logger = require('../config/logger');
const { executeActionEvent } = require('../services/copilotCommandHandler.service');

const POLL_MS = Number(config.copilot?.workerIntervalMs || 3000);
const BATCH_SIZE = Number(config.copilot?.workerBatchSize || 20);
const WORKER_ID = `copilot-worker-${process.pid}`;

const deriveStateFromAction = (actionType) => {
  const stateMap = {
    create_user: 'active',
    deactivate_user: 'inactive',
    reactivate_user: 'active',
    delete_user: 'deleted',
    submit_data: 'submitted',
    approve_submission: 'approved',
    reject_submission: 'rejected',
    reopen_submission: 'reopened',
    create_task: 'open',
    complete_task: 'done',
  };
  return stateMap[actionType] || 'completed';
};

const processOutboxRecord = async (record) => {
  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');

    const eventResult = await client.query(
      `SELECT *
       FROM copilot.action_events
       WHERE id = $1
       FOR UPDATE`,
      [record.event_id]
    );

    if (eventResult.rows.length === 0) {
      throw new Error(`Action event not found for outbox record ${record.id}`);
    }

    const event = eventResult.rows[0];
    const projectedState = deriveStateFromAction(event.action_type);
    const executionResult = await executeActionEvent(event);
    const resolvedEntityId = executionResult?.entityId || event.entity_id || null;

    if (!executionResult || executionResult.handled === false) {
      throw new Error(
        `No execution handler implemented for action_type=${event.action_type}`
      );
    }

    await client.query(
      `UPDATE copilot.action_events
       SET status = 'executing',
           executed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [event.id]
    );

    if (event.entity_type && resolvedEntityId) {
      await client.query(
        `INSERT INTO copilot.action_state (
           tenant_id, entity_type, entity_id, last_action_event_id, current_state, state_json, version
         )
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         ON CONFLICT (tenant_id, entity_type, entity_id)
         DO UPDATE SET
           last_action_event_id = EXCLUDED.last_action_event_id,
           current_state = EXCLUDED.current_state,
           state_json = EXCLUDED.state_json,
           version = copilot.action_state.version + 1,
           updated_at = NOW()`,
        [
          event.tenant_id,
          event.entity_type,
          resolvedEntityId,
          event.id,
          projectedState,
          {
            actionType: event.action_type,
            source: event.source,
            payload: event.payload_json,
            executionResult,
            executedAt: new Date().toISOString(),
          },
        ]
      );
    }

    await client.query(
      `UPDATE copilot.action_events
       SET status = 'completed',
           entity_id = COALESCE(NULLIF($2, ''), entity_id),
           result_json = $3::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [event.id, resolvedEntityId, executionResult || {}]
    );

    const closableItems = await client.query(
      `SELECT id, status
       FROM copilot.action_items
       WHERE source_event_id = $1
         AND status IN ('open', 'in_progress', 'snoozed')
       FOR UPDATE`,
      [event.id]
    );

    await client.query(
      `UPDATE copilot.action_items
       SET status = 'done',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE source_event_id = $1
         AND status IN ('open', 'in_progress', 'snoozed')`,
      [event.id]
    );

    for (let i = 0; i < closableItems.rows.length; i += 1) {
      const item = closableItems.rows[i];
      // Record immutable status history for task timeline/audit.
      // eslint-disable-next-line no-await-in-loop
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
         ) VALUES ($1, $2, $3, 'done', NULL, $4, $5, NOW())`,
        [
          item.id,
          event.tenant_id,
          item.status,
          'Completed by copilot action worker',
          { sourceEventId: event.id, actionType: event.action_type },
        ]
      );
    }

    await client.query(
      `UPDATE copilot.action_outbox
       SET status = 'processed',
           processed_at = NOW(),
           locked_by = NULL,
           locked_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [record.id]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');

    const retries = record.retry_count + 1;
    const isTerminalBusinessError =
      Number(error?.statusCode || 0) >= 400 &&
      Number(error?.statusCode || 0) < 500;
    const shouldDeadLetter = isTerminalBusinessError || retries >= record.max_retries;

    if (shouldDeadLetter) {
      await postgresPool.query(
        `UPDATE copilot.action_outbox
         SET status = 'dead_letter',
             retry_count = $2,
             last_error = $3,
             locked_by = NULL,
             locked_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [record.id, retries, error.message]
      );

      await postgresPool.query(
        `INSERT INTO copilot.action_dlq (outbox_id, event_id, tenant_id, reason, payload_json, retry_count)
         SELECT o.id, o.event_id, e.tenant_id, $2, o.payload_json, $3
         FROM copilot.action_outbox o
         JOIN copilot.action_events e ON e.id = o.event_id
         WHERE o.id = $1`,
        [record.id, error.message, retries]
      );
    } else {
      await postgresPool.query(
        `UPDATE copilot.action_outbox
         SET status = 'pending',
             retry_count = $2,
             next_retry_at = NOW() + ($3::text || ' seconds')::interval,
             last_error = $4,
             locked_by = NULL,
             locked_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [record.id, retries, Math.min(retries * 15, 300), error.message]
      );
    }

    await postgresPool.query(
      `UPDATE copilot.action_events
       SET status = 'failed',
           error_message = $2,
           result_json = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [
        record.event_id,
        error.message,
        {
          error: error.message,
          statusCode: Number(error?.statusCode || 500),
          retryCount: retries,
          deadLettered: shouldDeadLetter,
        },
      ]
    );

    logger.error(
      `[CopilotWorker] Failed to process outbox ${record.id}: ${error.message}`
    );
  } finally {
    client.release();
  }
};

const claimPendingOutbox = async () => {
  const claimed = await postgresPool.query(
    `WITH picked AS (
      SELECT id
      FROM copilot.action_outbox
      WHERE status = 'pending'
        AND next_retry_at <= NOW()
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE copilot.action_outbox o
    SET status = 'processing',
        locked_by = $2,
        locked_at = NOW(),
        updated_at = NOW()
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.id, o.event_id, o.retry_count, o.max_retries`,
    [BATCH_SIZE, WORKER_ID]
  );

  return claimed.rows;
};

const createCopilotActionWorker = () => {
  let closed = false;
  let tickInFlight = false;
  let timer = null;

  const tick = async () => {
    if (closed || tickInFlight) return;
    tickInFlight = true;
    try {
      const batch = await claimPendingOutbox();
      if (batch.length > 0) {
        logger.info(`[CopilotWorker] Claimed ${batch.length} outbox records`);
      }
      for (let index = 0; index < batch.length; index += 1) {
        const record = batch[index];
        // Process sequentially for deterministic state updates.
        // This can be parallelized later if needed.
        // eslint-disable-next-line no-await-in-loop
        await processOutboxRecord(record);
      }
    } catch (error) {
      logger.error(`[CopilotWorker] Tick failed: ${error.message}`);
    } finally {
      tickInFlight = false;
    }
  };

  timer = setInterval(() => {
    tick();
  }, POLL_MS);
  timer.unref();

  logger.info(
    `[CopilotWorker] Started (interval=${POLL_MS}ms, batch=${BATCH_SIZE}, id=${WORKER_ID})`
  );

  return {
    close: async () => {
      closed = true;
      if (timer) clearInterval(timer);
      logger.info('[CopilotWorker] Stopped');
    },
  };
};

module.exports = {
  createCopilotActionWorker,
  __private: {
    deriveStateFromAction,
    processOutboxRecord,
    claimPendingOutbox,
  },
};
