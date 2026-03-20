const { postgresPool } = require('../config/postgres');

const REQUIRED_TABLES = [
  'copilot.action_events',
  'copilot.action_outbox',
  'copilot.action_dlq',
  'copilot.action_catalog',
];

const REQUIRED_COLUMNS = [
  {
    schema: 'copilot',
    table: 'action_events',
    column: 'result_json',
  },
];

const assertCopilotSchemaReady = async () => {
  const missingTables = [];
  for (let i = 0; i < REQUIRED_TABLES.length; i += 1) {
    const tableName = REQUIRED_TABLES[i];
    // eslint-disable-next-line no-await-in-loop
    const result = await postgresPool.query(
      `SELECT to_regclass($1)::text AS table_name`,
      [tableName]
    );
    if (!result.rows[0]?.table_name) {
      missingTables.push(tableName);
    }
  }

  const missingColumns = [];
  for (let i = 0; i < REQUIRED_COLUMNS.length; i += 1) {
    const def = REQUIRED_COLUMNS[i];
    // eslint-disable-next-line no-await-in-loop
    const result = await postgresPool.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = $2
         AND column_name = $3`,
      [def.schema, def.table, def.column]
    );
    if (result.rows.length === 0) {
      missingColumns.push(`${def.schema}.${def.table}.${def.column}`);
    }
  }

  if (missingTables.length || missingColumns.length) {
    const details = [
      missingTables.length ? `missing tables: ${missingTables.join(', ')}` : null,
      missingColumns.length
        ? `missing columns: ${missingColumns.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('; ');

    throw new Error(
      `Copilot schema check failed (${details}). Apply DB migrations before starting workers (e.g. src/scripts/migrations/016_add_action_event_result_json.sql).`
    );
  }

  return { ok: true };
};

module.exports = {
  assertCopilotSchemaReady,
};
