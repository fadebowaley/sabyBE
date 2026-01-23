const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Permission = require('../../models/permission.model');
const config = require('../../config/config');
const logger = require('../../config/logger');

/**
 * Seed Optimized Permissions Script
 * 
 * Seeds new optimized permissions from optimized-snapshot.json to MongoDB
 * 
 * Usage:
 *   node src/scripts/permissions/seed-optimized-permissions.js [--delete-old]
 */

/**
 * MongoDB connection
 */
const connectToDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');
  } catch (err) {
    logger.error('❌ Error connecting to MongoDB:', err);
    process.exit(1);
  }
};

/**
 * Seed optimized permissions from snapshot file
 */
const seedOptimizedPermissions = async (deleteOld = false) => {
  await connectToDB();

  // Load optimized snapshot
  const snapshotPath = path.join(__dirname, 'optimized-snapshot.json');
  
  if (!fs.existsSync(snapshotPath)) {
    logger.error(`❌ Snapshot file not found: ${snapshotPath}`);
    logger.error('💡 Run generate-optimized.js first to generate the snapshot');
    process.exit(1);
  }

  logger.info(`📖 Reading optimized snapshot from ${snapshotPath}...`);
  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  logger.info(`📊 Found ${snapshotData.length} permissions in snapshot`);

  // Get existing permissions
  const existing = await Permission.find({});
  const existingNames = new Set(existing.map(p => p.name));
  logger.info(`📊 Found ${existing.length} existing permissions in database`);

  // Filter out permissions that already exist
  const newPermissions = snapshotData.filter(p => !existingNames.has(p.name));
  logger.info(`✅ ${newPermissions.length} new permissions to seed`);
  logger.info(`⏭️  ${snapshotData.length - newPermissions.length} permissions already exist`);

  if (newPermissions.length === 0) {
    logger.info('⚠️  No new permissions to seed. All permissions already exist.');
    await mongoose.disconnect();
    return;
  }

  // Insert new permissions
  try {
    const inserted = await Permission.insertMany(
      newPermissions.map(p => ({
        name: p.name,
        resource: p.resource,
        action: p.action,
        path: p.path || '/',
        method: p.method || 'ALL',
        description: p.description || `${p.action} ${p.resource} resources`,
        isWildcard: p.isWildcard || false,
        isAdminLevel: p.isAdminLevel || false,
      })),
      { ordered: false }
    );
    
    logger.info(`✅ Successfully seeded ${inserted.length} new permissions`);
    
    // Show sample of seeded permissions
    logger.info('\n📋 Sample of seeded permissions:');
    inserted.slice(0, 10).forEach((p, i) => {
      logger.info(`   ${i + 1}. ${p.name} (${p.resource}:${p.action})`);
    });
    if (inserted.length > 10) {
      logger.info(`   ... and ${inserted.length - 10} more`);
    }
  } catch (error) {
    if (error.writeErrors) {
      const duplicateCount = error.writeErrors.filter(e => e.code === 11000).length;
      const successCount = error.result.insertedCount;
      logger.warn(`⚠️  ${duplicateCount} permissions were duplicates (skipped)`);
      logger.info(`✅ Successfully seeded ${successCount} new permissions`);
    } else {
      logger.error('❌ Error seeding permissions:', error);
      throw error;
    }
  }

  // Optionally delete old format permissions
  if (deleteOld) {
    logger.info('\n🗑️  Deleting old format permissions...');
    
    // Find old format permissions (action:resource format)
    const oldFormatPattern = /^(view|create|update|delete|read|manage):/;
    const oldPermissions = await Permission.find({
      name: { $regex: oldFormatPattern }
    });
    
    logger.info(`📊 Found ${oldPermissions.length} old format permissions`);
    
    if (oldPermissions.length > 0) {
      const oldNames = oldPermissions.map(p => p.name);
      await Permission.deleteMany({ name: { $in: oldNames } });
      logger.info(`✅ Deleted ${oldPermissions.length} old format permissions`);
    } else {
      logger.info('⚠️  No old format permissions found to delete');
    }
  } else {
    logger.info('\n💡 Old permissions not deleted (use --delete-old to remove them)');
  }

  // Final count
  const finalCount = await Permission.countDocuments({});
  logger.info(`\n📊 Final permission count: ${finalCount}`);
  
  const newFormatCount = await Permission.countDocuments({
    name: { $regex: /^[a-z]+[A-Z]?[a-z]*:(read|create|update|delete|manage|import|export|assign|restore|activate|deactivate|move|upload|download|share|copy|publish|archive|submit|process|complete|cancel|refund|regenerate|deleteAll|toggleStatus|assignRole|sendMessage|forgotPassword|resetPassword|verify|refresh|send|draft|retry|public|private|permissions|status|auth)/ }
  });
  const oldFormatCount = await Permission.countDocuments({
    name: { $regex: /^(view|create|update|delete|read|manage):/ }
  });
  
  logger.info(`   New format (resource:action): ${newFormatCount}`);
  logger.info(`   Old format (action:resource): ${oldFormatCount}`);

  await mongoose.disconnect();
  logger.info('\n✅ Seeding complete!');
};

// Main execution
if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  const deleteOld = args['delete-old'] || args.deleteOld || false;

  seedOptimizedPermissions(deleteOld)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedOptimizedPermissions };

