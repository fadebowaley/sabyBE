#!/usr/bin/env node

/**
 * Backfill script to populate node_dimension table from MongoDB nodes.
 *
 * Usage:
 *   node sabyBackend/scripts/backfill_node_dimension.js
 */

/* eslint-disable no-console */
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const config = require('../src/config/config');
const { postgresPool, closePool } = require('../src/config/postgres');
const logger = require('../src/config/logger');
require('../src/models/level.model');
require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');
const { upsertNodeDimension } = require('../src/services/nodeSync.service');

const BATCH_SIZE = config.nodeSync.batchSize || 250;

async function backfill() {
  console.log('🔁 Starting node_dimension backfill...');

  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const total = await Nodes.countDocuments({ deletedAt: null });
  console.log(`📦 Nodes to process: ${total}`);

  let processed = 0;
  let cursor = Nodes.find({ deletedAt: null }).cursor();

  const batch = [];
  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      await Promise.all(batch.map((node) => upsertNodeDimension(node)));
      processed += batch.length;
      console.log(
        `✅ Processed ${processed}/${total} nodes (${(
          (processed / total) *
          100
        ).toFixed(1)}%)`
      );
      batch.length = 0;
    }
  }

  if (batch.length) {
    await Promise.all(batch.map((node) => upsertNodeDimension(node)));
    processed += batch.length;
  }

  console.log('🎉 Node dimension backfill complete!');
}

async function run() {
  try {
    await backfill();
  } catch (error) {
    logger.error(`[NodeBackfill] Failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    await closePool();
  }
}

if (require.main === module) {
  run();
}
