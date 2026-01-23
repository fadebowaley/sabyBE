#!/usr/bin/env node

/**
 * Backfill script for form_submission_facts.
 *
 * Iterates through Postgres form_submissions in batches, generates analytics
 * facts for each submission, and upserts them into form_submission_facts.
 *
 * Usage:
 *   node sabyBackend/scripts/backfill_submission_facts.js
 */

/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax */
const { postgresPool } = require('../src/config/postgres');
const SubmissionModel = require('../src/models/submission.model');
const SubmissionCatalogService = require('../src/services/submissionCatalog.service');
const {
  createFactsTableIfNeeded,
  insertFacts,
} = require('../src/models/factWriter');

const BATCH_SIZE = Number(process.env.FACT_BACKFILL_BATCH_SIZE || 250);

async function getSubmissionCount() {
  const { rows } = await postgresPool.query(
    'SELECT COUNT(*)::bigint AS count FROM form_submissions'
  );
  return Number(rows[0].count);
}

async function fetchBatch(lastId) {
  if (!lastId) {
    return postgresPool.query(
      `
        SELECT *
        FROM form_submissions
        ORDER BY id
        LIMIT $1
      `,
      [BATCH_SIZE]
    );
  }

  return postgresPool.query(
    `
      SELECT *
      FROM form_submissions
      WHERE id > $1
      ORDER BY id
      LIMIT $2
    `,
    [lastId, BATCH_SIZE]
  );
}

async function backfill() {
  console.log('🔁 Starting form_submission_facts backfill...');
  await createFactsTableIfNeeded();

  const totalSubmissions = await getSubmissionCount();
  if (totalSubmissions === 0) {
    console.log('ℹ️  No submissions found. Nothing to backfill.');
    return;
  }
  console.log(`📦 Submissions to process: ${totalSubmissions}`);

  let processed = 0;
  let lastId = null;

  while (processed < totalSubmissions) {
    const { rows } = await fetchBatch(lastId);
    if (!rows.length) {
      break;
    }

    const factsBuffer = [];

    for (const submission of rows) {
      try {
        const catalog = await SubmissionCatalogService.getCatalogByProject(
          submission.project_id
        );
        const facts = await SubmissionModel.buildFactsFromSubmission(
          submission,
          catalog
        );
        if (facts.length) {
          factsBuffer.push(...facts);
        }
      } catch (err) {
        console.error(
          `❌ Failed to process submission ${submission.id}: ${err.message}`
        );
      }
    }

    if (factsBuffer.length) {
      try {
        await insertFacts(factsBuffer);
      } catch (err) {
        console.error(`❌ Failed to insert facts batch: ${err.message}`);
      }
    }

    processed += rows.length;
    lastId = rows[rows.length - 1].id;

    console.log(
      `✅ Processed ${processed}/${totalSubmissions} submissions (${(
        (processed / totalSubmissions) *
        100
      ).toFixed(1)}%)`
    );

    if (processed >= totalSubmissions) {
      break;
    }
  }

  console.log('🎉 Backfill complete!');
}

async function run() {
  try {
    await backfill();
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await postgresPool.end();
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  backfill,
};
