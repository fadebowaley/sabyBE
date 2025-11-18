#!/usr/bin/env node

/**
 * NodeSync smoke test:
 * 1. Creates a level + structure for the saby tenant
 * 2. Starts node sync
 * 3. Inserts, updates, and deletes a node
 * 4. Confirms node_dimension table mirrors the changes
 *
 * Run with NODE_SYNC_ENABLED=true to exercise the change stream path:
 *   NODE_SYNC_ENABLED=true node scripts/test_nodesync.js
 */

/* eslint-disable no-console */
const mongoose = require('mongoose');
const config = require('../src/config/config');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');
const User = require('../src/models/user.model');
const { postgresPool } = require('../src/config/postgres');
const {
  startNodeSync,
  stopNodeSync,
} = require('../src/services/nodeSync.service');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runNodeSyncTest() {
  console.log('🔁 Starting NodeSync smoke test...');
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('✅ Connected to MongoDB');

  const sabyUser = await User.findOne({ isSaby: true });
  if (!sabyUser) {
    throw new Error('No saby user found (isSaby=true)');
  }

  const tenantId = sabyUser.tenantId;
  console.log(`👤 Using saby tenant: ${tenantId}`);

  const timestamp = Date.now();
  const levelName = `NodeSync Test Level ${timestamp}`;
  const structureName = `NodeSync Test Structure ${timestamp}`;
  const nodeName = `NodeSync Test Node ${timestamp}`;

  console.log('🧱 Creating level + structure scaffolding...');
  const level = await Level.create({
    name: levelName,
    description: 'NodeSync test level',
    rank: 1000 + (timestamp % 1000),
    tenantId,
  });

  const structure = await Structures.create({
    name: structureName,
    type: 'administrative',
    level: level._id,
    tenantId,
  });

  console.log('⚙️  Starting NodeSync change stream...');
  await startNodeSync();
  // give change stream a moment to initialize
  await sleep(500);

  console.log('📌 Creating test node...');
  const node = await Nodes.create({
    name: nodeName,
    level: level._id,
    structure: structure._id,
    tenantId,
    isMain: true,
    address: '123 Test St',
    city: 'Test City',
    country: 'Test Country',
  });

  await sleep(1500);
  const selectSql =
    'SELECT node_id, node_name, structure_name, level_name, tenant_id FROM node_dimension WHERE node_id = $1';
  let result = await postgresPool.query(selectSql, [node._id.toString()]);
  console.log('📊 After insert (should be 1 row):', result.rows);

  console.log('✏️  Updating node name...');
  const updatedName = `${nodeName} Updated`;
  node.name = updatedName;
  await node.save();
  await sleep(1500);
  result = await postgresPool.query(selectSql, [node._id.toString()]);
  console.log('📊 After update (name should change):', result.rows);

  console.log('🗑️  Deleting node...');
  await Nodes.deleteOne({ _id: node._id });
  await sleep(1500);
  result = await postgresPool.query(selectSql, [node._id.toString()]);
  console.log('📊 After delete (should be empty):', result.rows);

  console.log('🧹 Cleaning up level + structure...');
  await Structures.deleteOne({ _id: structure._id });
  await Level.deleteOne({ _id: level._id });

  await stopNodeSync();
  await mongoose.disconnect();
  await postgresPool.end();
  console.log('✅ NodeSync smoke test completed');
}

if (require.main === module) {
  runNodeSyncTest().catch(async (error) => {
    console.error('❌ NodeSync test failed:', error);
    try {
      await stopNodeSync();
      await mongoose.disconnect();
      await postgresPool.end();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    process.exit(1);
  });
}

module.exports = runNodeSyncTest;
