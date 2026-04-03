#!/usr/bin/env node
/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const { closePool } = require('../config/postgres');
const {
  ensureNodeDimensionTable,
  backfillMissingNodeDimensions,
} = require('../services/nodeSync.service');

const getArg = (flag) => {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
};

const run = async () => {
  const tenantId = getArg('--tenant');
  const batchSize = Number(getArg('--batch')) || config.nodeSync?.batchSize || 250;

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    await ensureNodeDimensionTable();
    const result = await backfillMissingNodeDimensions({
      tenantId,
      batchSize,
    });
    console.table([result]);
  } catch (error) {
    console.error('❌ backfill-node-dimensions failed:', error.message || error);
    process.exitCode = 1;
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_error) {}
    try {
      await closePool();
    } catch (_error) {}
  }
};

run();
