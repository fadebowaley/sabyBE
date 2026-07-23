#!/usr/bin/env node

/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const { postgresPool } = require('../config/postgres');
const ProjectForm = require('../models/projectForm.model');
const fieldCatalogService = require('../services/fieldCatalog.service');
const {
  buildFlatFinancialFields,
  buildInvoiceSnapshot,
  buildPaymentSnapshot,
} = require('../services/submissionFinancialFields.service');

const parseArg = (name) => {
  const index = process.argv.findIndex((arg) => arg === name);
  return index === -1 ? null : process.argv[index + 1] || null;
};

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const hasEnabledCapability = (value) => Boolean(value?.enabled || value?.active);

const buildFilters = ({ tenantId, projectId }, alias = '') => {
  const clauses = [];
  const values = [];
  const prefix = alias ? `${alias}.` : '';

  if (tenantId) {
    values.push(tenantId);
    clauses.push(`${prefix}tenant_id = $${values.length}`);
  }
  if (projectId) {
    values.push(projectId);
    clauses.push(`${prefix}project_id = $${values.length}`);
  }

  return { clauses, values };
};

const resyncFinancialCatalogs = async ({ tenantId, projectId }) => {
  const query = {
    deletedAt: null,
    $or: [
      { 'capabilities.transaction.payment.enabled': true },
      { 'capabilities.transaction.payment.active': true },
      { 'capabilities.transaction.invoice.enabled': true },
      { 'capabilities.transaction.invoice.active': true },
    ],
  };
  if (tenantId) query.tenantId = tenantId;
  if (projectId) query.projectId = projectId;

  const forms = await ProjectForm.find(query);
  let synced = 0;

  for (const form of forms) {
    const transaction = asObject(form.capabilities?.transaction);
    if (
      !hasEnabledCapability(transaction.payment) &&
      !hasEnabledCapability(transaction.invoice)
    ) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await fieldCatalogService.syncCatalogFromForm(form);
    synced += 1;
  }

  return synced;
};

const backfillSubmissionRows = async ({ tenantId, projectId }) => {
  const { clauses, values } = buildFilters({ tenantId, projectId });
  clauses.push(`status != 'deleted'`);
  clauses.push(`(data ? '__payment' OR data ? '__invoice' OR meta ? 'transaction')`);

  const selectResult = await postgresPool.query(
    `
      SELECT id, data, meta
      FROM form_submissions
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at ASC
    `,
    values
  );

  let updated = 0;
  for (const row of selectResult.rows) {
    const data = asObject(row.data);
    const meta = asObject(row.meta);
    const transaction = asObject(meta.transaction);
    const invoice =
      buildInvoiceSnapshot(data.__invoice) ||
      buildInvoiceSnapshot(transaction.invoiceSnapshot) ||
      buildInvoiceSnapshot(asObject(data.__payment).invoice);
    const payment =
      Object.keys(asObject(data.__payment)).length > 0
        ? asObject(data.__payment)
        : buildPaymentSnapshot({ transaction, invoice });
    const projection = {
      ...buildFlatFinancialFields({ invoice, payment }),
      ...(invoice ? { __invoice: invoice } : {}),
      ...(payment ? { __payment: payment } : {}),
    };

    if (!Object.keys(projection).length) continue;

    // eslint-disable-next-line no-await-in-loop
    await postgresPool.query(
      `
        UPDATE form_submissions
        SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb,
            updated_at = NOW()
        WHERE id = $2
      `,
      [JSON.stringify(projection), row.id]
    );
    updated += 1;
  }

  return updated;
};

const run = async () => {
  const tenantId = parseArg('--tenantId');
  const projectId = parseArg('--projectId');

  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const syncedCatalogs = await resyncFinancialCatalogs({ tenantId, projectId });
  const updatedSubmissions = await backfillSubmissionRows({ tenantId, projectId });

  console.log(
    JSON.stringify(
      {
        tenantId,
        projectId,
        syncedCatalogs,
        updatedSubmissions,
      },
      null,
      2
    )
  );
};

run()
  .catch((error) => {
    console.error('[FinancialSubmissionBackfill] Failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (_) {
      // noop
    }
    try {
      await postgresPool.end();
    } catch (_) {
      // noop
    }
  });
