#!/usr/bin/env node

/**
 * Comprehensive backfill script for levels, structures, and nodes to Postgres.
 * 
 * This script:
 * 1. Backfills all nodes (which includes level and structure data in node_dimension)
 * 2. Ensures all levels and structures referenced by nodes are properly synced
 * 
 * Usage:
 *   node sabyBackend/scripts/backfill_levels_structures_nodes.js [userEmail] [tenantId]
 * 
 * Examples:
 *   # Backfill all tenants
 *   node scripts/backfill_levels_structures_nodes.js
 * 
 *   # Backfill for specific user (by email)
 *   node scripts/backfill_levels_structures_nodes.js isreal@sotsm.org
 * 
 *   # Backfill for specific tenant (by tenantId)
 *   node scripts/backfill_levels_structures_nodes.js "" 0gmUVnDgpY
 * 
 * Environment variables:
 *   - NODE_SYNC_BATCH_SIZE: Batch size for processing (default: 250)
 */

/* eslint-disable no-console */
const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const config = require('../src/config/config');
const { postgresPool, closePool } = require('../src/config/postgres');
const logger = require('../src/config/logger');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');
const User = require('../src/models/user.model');
const { upsertNodeDimension } = require('../src/services/nodeSync.service');

const BATCH_SIZE = config.nodeSync?.batchSize || Number(process.env.NODE_SYNC_BATCH_SIZE) || 250;

// Get tenantId from command line arguments (email or tenantId)
const getUserEmail = process.argv[2] || null;
const getTenantId = process.argv[3] || null;

/**
 * Log summary of MongoDB data
 */
async function logMongoSummary(tenantId = null) {
  console.log('\n📊 MongoDB Data Summary:');
  console.log('─'.repeat(50));
  
  const levelFilter = tenantId ? { deletedAt: null, tenantId } : { deletedAt: null };
  const structureFilter = tenantId ? { deletedAt: null, tenantId } : { deletedAt: null };
  const nodeFilter = tenantId ? { deletedAt: null, tenantId } : { deletedAt: null };
  
  const levelCount = await Level.countDocuments(levelFilter);
  const structureCount = await Structures.countDocuments(structureFilter);
  const nodeCount = await Nodes.countDocuments(nodeFilter);
  
  console.log(`  Levels: ${levelCount}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
  console.log(`  Structures: ${structureCount}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
  console.log(`  Nodes: ${nodeCount}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
  
  // Get unique tenants
  const tenantLevels = await Level.distinct('tenantId', { deletedAt: null });
  const tenantStructures = await Structures.distinct('tenantId', { deletedAt: null });
  const tenantNodes = await Nodes.distinct('tenantId', { deletedAt: null });
  const allTenants = [...new Set([...tenantLevels, ...tenantStructures, ...tenantNodes])];
  
  console.log(`  Unique Tenants: ${allTenants.length}`);
  if (tenantId) {
    console.log(`  Filtering by tenant: ${tenantId}`);
  }
  console.log('─'.repeat(50));
}

/**
 * Log summary of Postgres node_dimension data
 */
async function logPostgresSummary(tenantId = null) {
  console.log('\n📊 Postgres node_dimension Summary:');
  console.log('─'.repeat(50));
  
  try {
    const countQuery = tenantId
      ? 'SELECT COUNT(*)::bigint AS count FROM node_dimension WHERE tenant_id = $1'
      : 'SELECT COUNT(*)::bigint AS count FROM node_dimension';
    const countParams = tenantId ? [tenantId] : [];
    
    const { rows: countRows } = await postgresPool.query(countQuery, countParams);
    const totalNodes = Number(countRows[0].count);
    
    const tenantQuery = tenantId
      ? 'SELECT COUNT(DISTINCT tenant_id)::bigint AS count FROM node_dimension WHERE tenant_id = $1'
      : 'SELECT COUNT(DISTINCT tenant_id)::bigint AS count FROM node_dimension';
    const { rows: tenantRows } = await postgresPool.query(tenantQuery, countParams);
    const uniqueTenants = Number(tenantRows[0].count);
    
    const levelQuery = tenantId
      ? 'SELECT COUNT(DISTINCT level_id)::bigint AS count FROM node_dimension WHERE level_id IS NOT NULL AND tenant_id = $1'
      : 'SELECT COUNT(DISTINCT level_id)::bigint AS count FROM node_dimension WHERE level_id IS NOT NULL';
    const { rows: levelRows } = await postgresPool.query(levelQuery, countParams);
    const uniqueLevels = Number(levelRows[0].count);
    
    const structureQuery = tenantId
      ? 'SELECT COUNT(DISTINCT structure_id)::bigint AS count FROM node_dimension WHERE structure_id IS NOT NULL AND tenant_id = $1'
      : 'SELECT COUNT(DISTINCT structure_id)::bigint AS count FROM node_dimension WHERE structure_id IS NOT NULL';
    const { rows: structureRows } = await postgresPool.query(structureQuery, countParams);
    const uniqueStructures = Number(structureRows[0].count);
    
    console.log(`  Total Nodes: ${totalNodes}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    console.log(`  Unique Tenants: ${uniqueTenants}`);
    console.log(`  Unique Levels (referenced): ${uniqueLevels}`);
    console.log(`  Unique Structures (referenced): ${uniqueStructures}`);
    console.log('─'.repeat(50));
  } catch (error) {
    console.error('  ⚠️  Could not query Postgres:', error.message);
  }
}

/**
 * Backfill all nodes (which includes level and structure data)
 */
async function backfillNodes(tenantId = null) {
  console.log('\n🔁 Starting node_dimension backfill...');
  console.log('   (This will sync level and structure data as part of each node)');
  
  const nodeFilter = tenantId ? { deletedAt: null, tenantId } : { deletedAt: null };
  const total = await Nodes.countDocuments(nodeFilter);
  if (total === 0) {
    console.log(`   ℹ️  No nodes found${tenantId ? ` for tenant ${tenantId}` : ''}. Nothing to backfill.`);
    return { processed: 0, total: 0 };
  }
  
  console.log(`   📦 Nodes to process: ${total}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
  
  let processed = 0;
  let errors = 0;
  const cursor = Nodes.find(nodeFilter).cursor();
  
  const batch = [];
  for await (const doc of cursor) {
    batch.push(doc);
    
    if (batch.length >= BATCH_SIZE) {
      const results = await Promise.allSettled(
        batch.map((node) => upsertNodeDimension(node))
      );
      
      const batchErrors = results.filter((r) => r.status === 'rejected').length;
      errors += batchErrors;
      
      processed += batch.length;
      const percentage = ((processed / total) * 100).toFixed(1);
      console.log(
        `   ✅ Processed ${processed}/${total} nodes (${percentage}%)${batchErrors > 0 ? ` - ${batchErrors} errors` : ''}`
      );
      
      batch.length = 0;
    }
  }
  
  // Process remaining batch
  if (batch.length) {
    const results = await Promise.allSettled(
      batch.map((node) => upsertNodeDimension(node))
    );
    
    const batchErrors = results.filter((r) => r.status === 'rejected').length;
    errors += batchErrors;
    
    processed += batch.length;
  }
  
  if (errors > 0) {
    console.log(`   ⚠️  Completed with ${errors} errors`);
  } else {
    console.log('   ✅ Node backfill complete!');
  }
  
  return { processed, total, errors };
}

/**
 * Verify data consistency between MongoDB and Postgres
 */
async function verifyConsistency(tenantId = null) {
  console.log('\n🔍 Verifying data consistency...');
  
  const nodeFilter = tenantId ? { deletedAt: null, tenantId } : { deletedAt: null };
  const mongoNodeCount = await Nodes.countDocuments(nodeFilter);
  
  try {
    const query = tenantId
      ? 'SELECT COUNT(*)::bigint AS count FROM node_dimension WHERE tenant_id = $1'
      : 'SELECT COUNT(*)::bigint AS count FROM node_dimension';
    const params = tenantId ? [tenantId] : [];
    
    const { rows } = await postgresPool.query(query, params);
    const pgNodeCount = Number(rows[0].count);
    
    if (mongoNodeCount === pgNodeCount) {
      console.log(`   ✅ Node counts match: ${mongoNodeCount} (MongoDB) = ${pgNodeCount} (Postgres)${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    } else {
      console.log(`   ⚠️  Node count mismatch: ${mongoNodeCount} (MongoDB) vs ${pgNodeCount} (Postgres)${tenantId ? ` (tenant: ${tenantId})` : ''}`);
      console.log(`   💡 Difference: ${Math.abs(mongoNodeCount - pgNodeCount)} nodes`);
    }
  } catch (error) {
    console.error('   ❌ Could not verify consistency:', error.message);
  }
}

/**
 * Get tenantId from user email or use provided tenantId
 * Must be called AFTER MongoDB connection
 */
async function getTenantIdForBackfill() {
  if (getTenantId) {
    console.log(`📋 Using provided tenantId: ${getTenantId}`);
    return getTenantId;
  }
  
  if (getUserEmail) {
    console.log(`🔍 Looking up user by email: ${getUserEmail}`);
    const user = await User.findOne({ email: getUserEmail.toLowerCase().trim() });
    if (!user) {
      throw new Error(`User not found with email: ${getUserEmail}`);
    }
    if (!user.tenantId) {
      throw new Error(`User ${getUserEmail} does not have a tenantId`);
    }
    console.log(`✅ Found user: ${user.email} (tenantId: ${user.tenantId})`);
    return user.tenantId;
  }
  
  return null; // Backfill all tenants
}

/**
 * Main backfill function
 */
async function backfill() {
  if (getUserEmail || getTenantId) {
    console.log(`🚀 Starting backfill${getUserEmail ? ` for user: ${getUserEmail}` : ` for tenant: ${getTenantId}`}...\n`);
  } else {
    console.log('🚀 Starting comprehensive backfill for all tenants...\n');
  }
  
  // Connect to MongoDB FIRST
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log('✅ Connected to MongoDB');
  
  // Now get tenantId (after MongoDB connection)
  const tenantId = await getTenantIdForBackfill();
  
  if (tenantId) {
    console.log(`📋 Filtering by tenantId: ${tenantId}\n`);
  }
  
  // Log summaries
  await logMongoSummary(tenantId);
  await logPostgresSummary(tenantId);
  
  // Backfill nodes (which includes level/structure data)
  const result = await backfillNodes(tenantId);
  
  // Verify consistency
  await verifyConsistency(tenantId);
  
  // Final summary
  console.log('\n📊 Final Summary:');
  console.log('─'.repeat(50));
  await logPostgresSummary(tenantId);
  console.log(`\n🎉 Backfill complete! Processed ${result.processed} nodes.`);
  
  if (result.errors > 0) {
    console.log(`⚠️  ${result.errors} errors occurred during processing.`);
  }
}

/**
 * Run the backfill
 */
async function run() {
  try {
    await backfill();
  } catch (error) {
    logger.error(`[Backfill] Failed: ${error.message}`);
    console.error('\n❌ Backfill failed:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    await closePool();
    console.log('\n✅ Connections closed');
  }
}

if (require.main === module) {
  run();
}

module.exports = { backfill, logMongoSummary, logPostgresSummary, verifyConsistency };


