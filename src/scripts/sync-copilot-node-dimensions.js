#!/usr/bin/env node

/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../config/config');
const logger = require('../config/logger');
const { postgresPool } = require('../config/postgres');
const nodeDimensionSyncService = require('../services/copilotNodeDimensionSync.service');

const parseArg = (name) => {
  const idx = process.argv.findIndex((arg) => arg === name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const run = async () => {
  const tenantId = parseArg('--tenantId');

  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  logger.info('[NodeDimSync] Mongo connected');

  if (tenantId) {
    const result = await nodeDimensionSyncService.syncTenantNodeHierarchy(tenantId);
    console.log(JSON.stringify(result, null, 2));
  } else {
    const result = await nodeDimensionSyncService.syncAllTenantsNodeHierarchy();
    console.log(JSON.stringify(result, null, 2));
  }
};

run()
  .catch((error) => {
    console.error('[NodeDimSync] Failed:', error?.message || error);
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

