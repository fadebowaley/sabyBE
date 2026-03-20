#!/usr/bin/env node

const { postgresPool, closePool } = require('../config/postgres');

const main = async () => {
  const result = await postgresPool.query(
    `SELECT
       e.id AS event_id,
       e.tenant_id,
       e.action_type,
       e.status AS event_status,
       o.status AS outbox_status,
       o.last_error,
       e.created_at
     FROM copilot.action_events e
     JOIN copilot.action_outbox o ON o.event_id = e.id
     WHERE e.status = 'queued'
       AND o.status = 'dead_letter'
     ORDER BY e.created_at DESC
     LIMIT 100`
  );

  if (result.rows.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[copilot-drift] OK: no queued/dead_letter drift found');
    return;
  }

  // eslint-disable-next-line no-console
  console.error(
    `[copilot-drift] FAIL: ${result.rows.length} queued events are dead-lettered in outbox`
  );
  result.rows.forEach((row) => {
    // eslint-disable-next-line no-console
    console.error(
      `- ${row.event_id} tenant=${row.tenant_id} action=${row.action_type} error=${row.last_error || 'n/a'}`
    );
  });
  process.exitCode = 2;
};

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[copilot-drift] error:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
