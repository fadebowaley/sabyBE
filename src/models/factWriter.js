const { postgresPool } = require('../config/postgres');

async function createFactsTableIfNeeded() {
  const ddl = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS form_submission_facts (
      fact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      submission_id UUID NOT NULL,
      tenant_id VARCHAR(64),
      project_id VARCHAR(64),
      form_id VARCHAR(64),
      node_id VARCHAR(64),
      user_id VARCHAR(64),
      source VARCHAR(32) DEFAULT 'unknown',
      field_key VARCHAR(128) NOT NULL,
      field_label TEXT,
      field_type TEXT,
      value_text TEXT,
      value_numeric NUMERIC,
      value_boolean BOOLEAN,
      value_date TIMESTAMPTZ,
      value_json JSONB,
      value_sum_candidate NUMERIC,
      value_years NUMERIC,
      value_months NUMERIC,
      value_category TEXT,
      value_bucket TEXT,
      value_array_length INTEGER,
      value_normalised TEXT,
      month_bucket DATE,
      day_bucket DATE,
      week_bucket DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS form_submission_facts_submission_idx
      ON form_submission_facts (submission_id);

    CREATE INDEX IF NOT EXISTS form_submission_facts_project_idx
      ON form_submission_facts (project_id, month_bucket);

    CREATE UNIQUE INDEX IF NOT EXISTS form_submission_facts_unique_field
      ON form_submission_facts (submission_id, field_key);

    CREATE INDEX IF NOT EXISTS form_submission_facts_day_idx
      ON form_submission_facts (day_bucket);

    CREATE INDEX IF NOT EXISTS form_submission_facts_week_idx
      ON form_submission_facts (week_bucket);
  `;

  await postgresPool.query(ddl);
}

async function insertFacts(facts) {
  if (!Array.isArray(facts) || facts.length === 0) {
    return;
  }

  const columns = [
    'submission_id',
    'tenant_id',
    'project_id',
    'form_id',
    'node_id',
    'user_id',
    'source',
    'field_key',
    'field_label',
    'field_type',
    'value_text',
    'value_numeric',
    'value_boolean',
    'value_date',
    'value_json',
    'value_sum_candidate',
    'value_years',
    'value_months',
    'value_category',
    'value_bucket',
    'value_array_length',
    'value_normalised',
    'month_bucket',
    'day_bucket',
    'week_bucket',
  ];

  const values = [];
  const placeholders = [];

  facts.forEach((fact, index) => {
    const rowIndex = index * columns.length;
    const rowPlaceholders = columns
      .map((_, columnIndex) => `$${rowIndex + columnIndex + 1}`)
      .join(', ');
    placeholders.push(`(${rowPlaceholders})`);

    values.push(
      fact.submission_id,
      fact.tenant_id,
      fact.project_id,
      fact.form_id,
      fact.node_id,
      fact.user_id,
      fact.source,
      fact.field_key,
      fact.field_label,
      fact.field_type,
      fact.value_text,
      fact.value_numeric,
      fact.value_boolean,
      fact.value_date,
      fact.value_json,
      fact.value_sum_candidate,
      fact.value_years,
      fact.value_months,
      fact.value_category,
      fact.value_bucket,
      fact.value_array_length,
      fact.value_normalised,
      fact.month_bucket,
      fact.day_bucket,
      fact.week_bucket
    );
  });

  const upsertColumns = columns.filter(
    (column) => !['submission_id', 'field_key'].includes(column)
  );

  const updateAssignments = upsertColumns
    .map((column) => `${column} = EXCLUDED.${column}`)
    .concat('updated_at = NOW()')
    .join(', ');

  const insertSQL = `
    INSERT INTO form_submission_facts (
      ${columns.join(', ')}
    )
    VALUES
    ${placeholders.join(', ')}
    ON CONFLICT (submission_id, field_key)
    DO UPDATE SET ${updateAssignments}
  `;

  await postgresPool.query(insertSQL, values);
}

module.exports = {
  createFactsTableIfNeeded,
  insertFacts,
};
