#!/usr/bin/env node
/* eslint-disable no-await-in-loop */
/* eslint-disable no-console */

/**
 * Catalog project form fields into Postgres for analytics.
 *
 * - Creates the form_field_catalog table (if missing)
 * - Scans all projectforms documents from MongoDB
 * - Upserts field metadata, aliases, and inferred transformations
 */

const { Pool } = require('pg');
const mongoose = require('mongoose');
const config = require('../src/config/config');

require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function normaliseAlias(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim();
}

function inferTransformations(fieldType = '', properties = {}) {
  const label = (properties.label || '').toLowerCase();
  const transforms = new Set(['raw']);
  const type = (fieldType || '').toLowerCase();

  if (['number', 'slider', 'rating'].includes(type)) {
    transforms.add('sum');
    transforms.add('avg');
    transforms.add('min');
    transforms.add('max');
    transforms.add('numeric_bucket');
  }

  if (
    type === 'date' ||
    type === 'datepicker' ||
    label.includes('date of birth') ||
    label.includes('dob') ||
    label.includes('birth')
  ) {
    transforms.add('date');
    transforms.add('age_years');
  }

  if (['dropdown', 'radio', 'checkbox'].includes(type)) {
    transforms.add('categorical');
  }

  if (type === 'checkbox' && properties.multiple) {
    transforms.add('multi_select_count');
  }

  if (type === 'phone') {
    transforms.add('phone_normalised');
  }

  if (type === 'email') {
    transforms.add('lowercase');
  }

  return Array.from(transforms);
}

function buildAliases(element, label) {
  const aliases = new Set();
  const props = element.properties || {};
  [
    element.id,
    element.name,
    element.fieldKey,
    props.key,
    props.name,
    props.identifier,
    label,
  ].forEach((value) => {
    const alias = normaliseAlias(value);
    if (alias) {
      aliases.add(alias);
    }
  });

  if (Array.isArray(props.aliases)) {
    props.aliases.forEach((alias) => {
      const normalised = normaliseAlias(alias);
      if (normalised) {
        aliases.add(normalised);
      }
    });
  }

  return Array.from(aliases);
}

async function createCatalogTable(pool) {
  const createTableSQL = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS form_field_catalog (
      catalog_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      project_id VARCHAR NOT NULL,
      tenant_id VARCHAR,
      form_id VARCHAR,
      field_id VARCHAR,
      field_key VARCHAR NOT NULL,
      field_label TEXT,
      field_type TEXT,
      is_required BOOLEAN DEFAULT FALSE,
      options JSONB DEFAULT '[]'::jsonb,
      aliases JSONB DEFAULT '[]'::jsonb,
      transformations JSONB DEFAULT '[]'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      catalog_version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS form_field_catalog_project_field_idx
      ON form_field_catalog (project_id, field_key);
  `;

  await pool.query(createTableSQL);
}

function safeJson(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch (error) {
    return JSON.stringify(fallback);
  }
}

async function upsertField(pool, record) {
  const {
    project_id,
    tenant_id,
    form_id,
    field_id,
    field_key,
    field_label,
    field_type,
    is_required,
    options,
    aliases,
    transformations,
    metadata,
  } = record;

  const optionsJson = safeJson(options, []);
  const aliasesJson = safeJson(aliases, []);
  const transformationsJson = safeJson(transformations, []);
  const metadataJson = safeJson(metadata, {});

  const sql = `
    INSERT INTO form_field_catalog (
      catalog_id,
      project_id,
      tenant_id,
      form_id,
      field_id,
      field_key,
      field_label,
      field_type,
      is_required,
      options,
      aliases,
      transformations,
      metadata,
      catalog_version,
      created_at,
      updated_at
    )
    VALUES (
      uuid_generate_v4(),
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb,
      1, NOW(), NOW()
    )
    ON CONFLICT (project_id, field_key)
    DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      form_id = EXCLUDED.form_id,
      field_id = EXCLUDED.field_id,
      field_label = EXCLUDED.field_label,
      field_type = EXCLUDED.field_type,
      is_required = EXCLUDED.is_required,
      options = EXCLUDED.options,
      aliases = EXCLUDED.aliases,
      transformations = EXCLUDED.transformations,
      metadata = EXCLUDED.metadata,
      updated_at = NOW();
  `;

  const values = [
    project_id,
    tenant_id,
    form_id,
    field_id,
    field_key,
    field_label,
    field_type,
    is_required,
    optionsJson,
    aliasesJson,
    transformationsJson,
    metadataJson,
  ];

  await pool.query(sql, values);
}

async function catalogForms() {
  const pool = new Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    ssl: false,
  });

  try {
    log('\n🗄️  Connecting to PostgreSQL...', colors.blue);
    await pool.query('SELECT 1');
    log('✅ PostgreSQL connection established', colors.green);

    log('\n📋 Ensuring catalog table exists...', colors.blue);
    await createCatalogTable(pool);
    log('✅ form_field_catalog ready', colors.green);

    log('\n🌐 Connecting to MongoDB...', colors.blue);
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    log('✅ MongoDB connection established', colors.green);

    const collection = mongoose.connection.db.collection('projectforms');
    const totalForms = await collection.countDocuments();
    log(`\n📦 Found ${totalForms} project forms to process`, colors.cyan);

    const cursor = collection.find({});
    let processedForms = 0;
    let upsertedFields = 0;

    while (await cursor.hasNext()) {
      const form = await cursor.next();
      processedForms += 1;

      const projectId = form.projectId || form.configuration?.projectId;
      if (!projectId) {
        log(
          `⚠️  Skipping form without projectId (Mongo _id: ${form._id})`,
          colors.yellow
        );
      } else {
        const tenantId = form.tenantId || form.configuration?.tenantId || null;
        const formId = form._id ? String(form._id) : null;
        const elements = Array.isArray(form.elements) ? form.elements : [];

        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index];
          const properties = element.properties || {};
          const label =
            properties.label || element.title || `Question ${index + 1}`;
          const fieldKey = element.id || element.name || `field_${index + 1}`;
          const optionsRaw = Array.isArray(properties.options)
            ? properties.options
            : [];
          const options = optionsRaw
            .map((option) => {
              if (option == null) {
                return null;
              }
              if (typeof option === 'object') {
                const labelOption =
                  option.label ||
                  option.text ||
                  option.name ||
                  option.value ||
                  null;
                return {
                  label: labelOption,
                  value: option.value || labelOption,
                };
              }
              return option;
            })
            .filter((option) => option !== null);
          const aliases = buildAliases(element, label);
          const transformations = inferTransformations(
            element.type,
            properties
          );

          const metadata = {
            placeholder: properties.placeholder || null,
            description: properties.description || null,
            order: index,
            elementId: element.id || null,
            elementMongoId: element._id ? String(element._id) : null,
            columnSpan:
              form.columnSpans && element.id
                ? form.columnSpans[element.id]
                : null,
            rawProperties: properties,
          };

          const record = {
            project_id: projectId,
            tenant_id: tenantId,
            form_id: formId,
            field_id: element._id ? String(element._id) : null,
            field_key: fieldKey,
            field_label: label,
            field_type: element.type || null,
            is_required: Boolean(properties.required),
            options,
            aliases,
            transformations,
            metadata,
          };

          await upsertField(pool, record);
          upsertedFields += 1;
        }
      }
    }

    log(
      `\n✅ Catalogued ${processedForms} forms and ${upsertedFields} fields`,
      colors.green
    );
  } catch (error) {
    log('\n❌ Catalog script failed', colors.red);
    log(error.stack || error.message, colors.red);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
    await pool.end().catch(() => {});
    log('\n👋 Connections closed', colors.cyan);
  }
}

if (require.main === module) {
  catalogForms();
}

module.exports = { catalogForms };
