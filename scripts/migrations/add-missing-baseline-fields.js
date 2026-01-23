/**
 * Migration Script: Add Missing Baseline Intelligence Fields
 * 
 * This script adds the following fields to support the redesigned Baseline Intelligence dashboard:
 * 
 * User Model:
 * - profile.officeTitle (String) - For office titles like "Pastor", "HOD", "Bishop", "Deacon"
 * 
 * Node Model:
 * - profile.averageAttendance (Number) - Average attendance per node
 * - profile.averageIncome (Decimal128) - Average income/revenue per node
 * 
 * Usage:
 *   node scripts/migrations/add-missing-baseline-fields.js [--tenantId=<tenantId>]
 * 
 * Options:
 *   --tenantId: Optional. If provided, only updates users/nodes for that tenant.
 *               If not provided, updates all tenants.
 */

const mongoose = require('mongoose');
const config = require('../../src/config/config');
const logger = require('../../src/config/logger');

// MongoDB connection
const connectDB = async () => {
  try {
    let mongoUrl = config.mongoose.url;
    
    // Replace 'mongodb' with 'localhost' if running from host (not in Docker)
    if (mongoUrl.includes('mongodb://mongodb:') && process.env.NODE_ENV !== 'docker') {
      mongoUrl = mongoUrl.replace('mongodb://mongodb:', 'mongodb://localhost:');
    }
    
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('✅ Connected to MongoDB');
  } catch (error) {
    logger.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const migrateUsers = async (tenantId = null) => {
  try {
    const User = mongoose.model('User');
    
    const query = tenantId ? { tenantId } : {};
    const users = await User.find(query);
    
    logger.info(`📊 Found ${users.length} users to migrate${tenantId ? ` for tenant ${tenantId}` : ''}`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const user of users) {
      // Check if officeTitle already exists
      if (user.profile && user.profile.officeTitle !== undefined) {
        skipped++;
        continue;
      }
      
      // Initialize profile if it doesn't exist
      if (!user.profile) {
        user.profile = {};
      }
      
      // Add officeTitle field (null for existing records)
      user.profile.officeTitle = null;
      
      // Mark profile as modified
      user.markModified('profile');
      
      await user.save();
      updated++;
      
      if (updated % 100 === 0) {
        logger.info(`  ✅ Updated ${updated} users...`);
      }
    }
    
    logger.info(`✅ User migration complete: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('❌ Error migrating users:', error);
    throw error;
  }
};

const migrateNodes = async (tenantId = null) => {
  try {
    const Node = mongoose.model('Nodes');
    
    const query = tenantId ? { tenantId } : {};
    const nodes = await Node.find(query);
    
    logger.info(`📊 Found ${nodes.length} nodes to migrate${tenantId ? ` for tenant ${tenantId}` : ''}`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const node of nodes) {
      // Check if fields already exist
      if (
        node.profile &&
        node.profile.averageAttendance !== undefined &&
        node.profile.averageIncome !== undefined
      ) {
        skipped++;
        continue;
      }
      
      // Initialize profile if it doesn't exist
      if (!node.profile) {
        node.profile = {};
      }
      
      // Add averageAttendance field (0 for existing records)
      if (node.profile.averageAttendance === undefined) {
        node.profile.averageAttendance = 0;
      }
      
      // Add averageIncome field (0 for existing records)
      if (node.profile.averageIncome === undefined) {
        node.profile.averageIncome = mongoose.Types.Decimal128.fromString('0');
      }
      
      // Mark profile as modified
      node.markModified('profile');
      
      await node.save();
      updated++;
      
      if (updated % 100 === 0) {
        logger.info(`  ✅ Updated ${updated} nodes...`);
      }
    }
    
    logger.info(`✅ Node migration complete: ${updated} updated, ${skipped} skipped`);
    return { updated, skipped };
  } catch (error) {
    logger.error('❌ Error migrating nodes:', error);
    throw error;
  }
};

const main = async () => {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    let tenantId = null;
    
    for (const arg of args) {
      if (arg.startsWith('--tenantId=')) {
        tenantId = arg.split('=')[1];
      }
    }
    
    logger.info('🚀 Starting migration: Add Missing Baseline Intelligence Fields');
    if (tenantId) {
      logger.info(`   Tenant ID: ${tenantId}`);
    } else {
      logger.info('   All tenants will be migrated');
    }
    
    // Connect to database
    await connectDB();
    
    // Migrate users
    logger.info('\n📝 Migrating users...');
    const userResults = await migrateUsers(tenantId);
    
    // Migrate nodes
    logger.info('\n📝 Migrating nodes...');
    const nodeResults = await migrateNodes(tenantId);
    
    // Summary
    logger.info('\n📊 Migration Summary:');
    logger.info(`   Users: ${userResults.updated} updated, ${userResults.skipped} skipped`);
    logger.info(`   Nodes: ${nodeResults.updated} updated, ${nodeResults.skipped} skipped`);
    logger.info('\n✅ Migration completed successfully!');
    
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration
if (require.main === module) {
  main();
}

module.exports = { migrateUsers, migrateNodes };

