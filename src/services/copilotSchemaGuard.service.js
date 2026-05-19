const { postgresPool } = require('../config/postgres');

const REQUIRED_TABLES = [
  'copilot.action_events',
  'copilot.action_outbox',
  'copilot.action_dlq',
  'copilot.action_catalog',
  'copilot.tool_registry',
  'copilot.tool_call_logs',
  'copilot.policy_decision_logs',
  'copilot.approval_decisions',
  'copilot.agent_tasks',
  'copilot.agent_task_steps',
  'copilot.agent_tool_calls',
  'copilot.agent_errors',
  'copilot.agent_schedules',
  'copilot.agent_escalations',
];

const REQUIRED_COLUMNS = [
  {
    schema: 'copilot',
    table: 'action_events',
    column: 'result_json',
  },
  {
    schema: 'copilot',
    table: 'tool_registry',
    column: 'risk_level',
  },
  {
    schema: 'copilot',
    table: 'tool_registry',
    column: 'input_schema_json',
  },
  {
    schema: 'copilot',
    table: 'tool_registry',
    column: 'output_schema_json',
  },
  {
    schema: 'copilot',
    table: 'tool_registry',
    column: 'idempotency_key_required',
  },
  {
    schema: 'copilot',
    table: 'agent_tasks',
    column: 'workflow_name',
  },
  {
    schema: 'copilot',
    table: 'agent_task_steps',
    column: 'action_event_id',
  },
  {
    schema: 'copilot',
    table: 'agent_tool_calls',
    column: 'policy_decision_json',
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
      missingTables.length
        ? `missing tables: ${missingTables.join(', ')}`
        : null,
      missingColumns.length
        ? `missing columns: ${missingColumns.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('; ');

    throw new Error(
      `Copilot schema check failed (${details}). Apply DB migrations before starting workers (e.g. src/scripts/migrations/016_add_action_event_result_json.sql, 020_harden_copilot_tool_policy.sql, 021_add_copilot_approval_decisions.sql, and 022_create_agent_workflow_tables.sql).`
    );
  }

  return { ok: true };
};

module.exports = {
  assertCopilotSchemaReady,
};
