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
const { closePool } = require('../src/config/postgres');
const logger = require('../src/config/logger');
require('../src/models/level.model');
require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');
const {
  ensureNodeDimensionTable,
  backfillMissingNodeDimensions,
} = require('../src/services/nodeSync.service');

const BATCH_SIZE = config.nodeSync.batchSize || 250;
const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

async function backfill() {
  console.log('🔁 Starting node_dimension backfill...');

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  await ensureNodeDimensionTable();

  const tenantId = getArg('--tenant');
  const batchSizeArg = Number(getArg('--batch'));
  const batchSize = Number.isFinite(batchSizeArg) && batchSizeArg > 0 ? batchSizeArg : BATCH_SIZE;

  const total = await Nodes.countDocuments({
    ...(tenantId ? { tenantId } : {}),
    deletedAt: null,
  });
  console.log(`📦 Active nodes in scope: ${total}`);

  const result = await backfillMissingNodeDimensions({
    tenantId,
    batchSize,
  });
  console.log('✅ Backfill result:');
  console.table([result]);

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
