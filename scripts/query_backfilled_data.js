#!/usr/bin/env node

/**
 * Query Postgres node_dimension table to see backfilled data
 * Usage: node scripts/query_backfilled_data.js [tenantId]
 */

const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../.env') });
const config = require('../src/config/config');
const { postgresPool } = require('../src/config/postgres');
const Level = require('../src/models/level.model');

async function queryMongoLevels(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('MONGODB LEVELS');
  console.log('='.repeat(80));
  
  const levels = await Level.find({ deletedAt: null }).sort({ rank: 1 }).lean();
  console.log(`\n📋 Total Levels in MongoDB: ${levels.length}\n`);
  
  // Group by tenant
  const byTenant = {};
  levels.forEach(level => {
    const tenant = level.tenantId || 'NO_TENANT';
    if (!byTenant[tenant]) {
      byTenant[tenant] = [];
    }
    byTenant[tenant].push(level);
  });
  
  Object.keys(byTenant).sort().forEach(tId => {
    console.log(`\n📊 TENANT: ${tId}`);
    console.log(`   Levels: ${byTenant[tId].length}\n`);
    byTenant[tId].forEach((level, i) => {
      console.log(`  ${i+1}. [ID: ${level._id}] ${level.name || 'N/A'}`);
      console.log(`     Rank: ${level.rank ?? 'N/A'} | Created: ${new Date(level.createdAt).toLocaleString()}`);
    });
  });
}

async function queryPostgresData(tenantId) {
  console.log('\n' + '='.repeat(80));
  console.log('POSTGRES NODE_DIMENSION DATA');
  console.log('='.repeat(80));
  
  if (tenantId) {
    console.log(`\n📊 TENANT: ${tenantId}\n`);
    
    // Get summary
    const summary = await postgresPool.query(
      `SELECT 
        COUNT(*) as total_nodes,
        COUNT(DISTINCT level_id) as unique_levels,
        COUNT(DISTINCT structure_id) as unique_structures
      FROM node_dimension 
      WHERE tenant_id = $1`,
      [tenantId]
    );
    console.log('📊 SUMMARY:');
    console.log(`  Total Nodes: ${summary.rows[0].total_nodes}`);
    console.log(`  Unique Levels: ${summary.rows[0].unique_levels}`);
    console.log(`  Unique Structures: ${summary.rows[0].unique_structures}`);
    
    // Get levels
    const levels = await postgresPool.query(
      `SELECT DISTINCT level_id, level_name 
       FROM node_dimension 
       WHERE tenant_id = $1 AND level_id IS NOT NULL
       ORDER BY level_name`,
      [tenantId]
    );
    console.log(`\n📋 LEVELS (referenced by nodes):`);
    levels.rows.forEach((l, i) => {
      console.log(`  ${i+1}. [ID: ${l.level_id}] ${l.level_name || 'N/A'}`);
    });
    
    // Get structures
    const structures = await postgresPool.query(
      `SELECT DISTINCT structure_id, structure_name 
       FROM node_dimension 
       WHERE tenant_id = $1 AND structure_id IS NOT NULL
       ORDER BY structure_name`,
      [tenantId]
    );
    console.log(`\n🏗️  STRUCTURES (referenced by nodes):`);
    structures.rows.forEach((s, i) => {
      console.log(`  ${i+1}. [ID: ${s.structure_id}] ${s.structure_name || 'N/A'}`);
    });
  } else {
    // Get all tenants summary
    const tenants = await postgresPool.query(
      `SELECT 
        tenant_id,
        COUNT(*) as total_nodes,
        COUNT(DISTINCT level_id) as unique_levels,
        COUNT(DISTINCT structure_id) as unique_structures
      FROM node_dimension 
      GROUP BY tenant_id
      ORDER BY tenant_id`
    );
    
    console.log('\n📊 ALL TENANTS SUMMARY:\n');
    tenants.rows.forEach(tenant => {
      console.log(`📊 TENANT: ${tenant.tenant_id}`);
      console.log(`   Nodes: ${tenant.total_nodes} | Levels: ${tenant.unique_levels} | Structures: ${tenant.unique_structures}`);
      
      // Get levels for this tenant
      postgresPool.query(
        `SELECT DISTINCT level_id, level_name 
         FROM node_dimension 
         WHERE tenant_id = $1 AND level_id IS NOT NULL
         ORDER BY level_name`,
        [tenant.tenant_id]
      ).then(result => {
        const levelNames = result.rows.map(l => l.level_name).join(', ');
        console.log(`   Levels: ${levelNames || 'None'}\n`);
      });
    });
  }
}

async function main() {
  const tenantId = process.argv[2] || null;
  
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');
    
    // Query MongoDB levels
    await queryMongoLevels(tenantId);
    
    // Query Postgres data
    await queryPostgresData(tenantId);
    
    console.log('\n' + '='.repeat(80));
    console.log('NOTE: node_dimension only contains levels/structures that are');
    console.log('referenced by nodes. New levels without assigned nodes will not appear.');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    await postgresPool.end();
    console.log('\n✅ Connections closed');
  }
}

if (require.main === module) {
  main();
}

module.exports = { queryMongoLevels, queryPostgresData };

