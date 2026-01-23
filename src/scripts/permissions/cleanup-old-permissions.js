const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Permission = require('../../models/permission.model');
const Role = require('../../models/role.model');
const config = require('../../config/config');
const logger = require('../../config/logger');

/**
 * Cleanup Old Format Permissions Script
 * 
 * This script:
 * 1. Verifies new format permissions exist
 * 2. Migrates roles to use new format permissions
 * 3. Deletes old format permissions
 * 
 * Usage:
 *   node src/scripts/permissions/cleanup-old-permissions.js [--dry-run] [--backup]
 */

// Load permission mapping
const MAPPING_FILE = path.join(__dirname, 'permission-mapping-simple.json');
let PERMISSION_MAPPING = {};

if (fs.existsSync(MAPPING_FILE)) {
  PERMISSION_MAPPING = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  logger.info(`✅ Loaded ${Object.keys(PERMISSION_MAPPING).length} permission mappings`);
} else {
  logger.warn(`⚠️  Mapping file not found. Run generate-mapping.js first.`);
  process.exit(1);
}

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
 * Normalize permission name (map old to new)
 */
const normalizePermission = (oldName) => {
  return PERMISSION_MAPPING[oldName] || oldName;
};

/**
 * Migrate roles to use new format permissions
 */
const migrateRoles = async (dryRun = false) => {
  logger.info('\n🔄 Migrating roles to new format permissions...');
  
  const roles = await Role.find({}).populate('permissions');
  let migratedCount = 0;
  let totalMapped = 0;
  let totalUnmapped = 0;
  
  for (const role of roles) {
    const oldPermissionNames = role.permissions.map(p => p.name);
    const newPermissionNames = oldPermissionNames.map(name => normalizePermission(name));
    const uniqueNewNames = [...new Set(newPermissionNames)];
    
    // Find new permission IDs
    const newPermissions = await Permission.find({
      name: { $in: uniqueNewNames }
    });
    
    const foundNames = newPermissions.map(p => p.name);
    const missing = uniqueNewNames.filter(name => !foundNames.includes(name));
    
    if (missing.length > 0) {
      logger.warn(`⚠️  Role "${role.name}" has unmapped permissions: ${missing.join(', ')}`);
      totalUnmapped += missing.length;
    }
    
    const mappedCount = foundNames.length;
    totalMapped += mappedCount;
    
    if (!dryRun && newPermissions.length > 0) {
      role.permissions = newPermissions.map(p => p._id);
      await role.save();
      migratedCount++;
      logger.info(`✅ Migrated role "${role.name}": ${mappedCount} permissions`);
    } else if (dryRun) {
      logger.info(`💡 Would migrate role "${role.name}": ${mappedCount} permissions`);
    }
  }
  
  logger.info(`\n📊 Role Migration Stats:`);
  logger.info(`   Roles processed: ${roles.length}`);
  logger.info(`   Roles ${dryRun ? 'would be ' : ''}migrated: ${migratedCount}`);
  logger.info(`   Total permissions mapped: ${totalMapped}`);
  logger.info(`   Total unmapped permissions: ${totalUnmapped}`);
  
  return { migratedCount, totalMapped, totalUnmapped };
};

/**
 * Delete old format permissions
 */
const deleteOldPermissions = async (dryRun = false) => {
  logger.info('\n🗑️  Deleting old format permissions...');
  
  // Find old format permissions (action:resource format)
  const oldFormatPattern = /^(view|create|update|delete|read|manage):/;
  const oldPermissions = await Permission.find({
    name: { $regex: oldFormatPattern }
  });
  
  logger.info(`📊 Found ${oldPermissions.length} old format permissions`);
  
  if (oldPermissions.length === 0) {
    logger.info('✅ No old format permissions found');
    return 0;
  }
  
  // Show sample
  logger.info('\n📋 Sample old format permissions to delete:');
  oldPermissions.slice(0, 10).forEach(p => {
    logger.info(`   - ${p.name}`);
  });
  if (oldPermissions.length > 10) {
    logger.info(`   ... and ${oldPermissions.length - 10} more`);
  }
  
  if (dryRun) {
    logger.info('\n💡 Dry run - permissions not deleted');
    return oldPermissions.length;
  }
  
  const oldNames = oldPermissions.map(p => p.name);
  const result = await Permission.deleteMany({ name: { $in: oldNames } });
  
  logger.info(`✅ Deleted ${result.deletedCount} old format permissions`);
  
  return result.deletedCount;
};

/**
 * Create backup of permissions
 */
const createBackup = async () => {
  logger.info('\n💾 Creating backup...');
  
  const permissions = await Permission.find({});
  const roles = await Role.find({}).populate('permissions');
  
  const backup = {
    timestamp: new Date().toISOString(),
    permissions: permissions.map(p => ({
      name: p.name,
      resource: p.resource,
      action: p.action,
      path: p.path,
      method: p.method,
    })),
    roles: roles.map(r => ({
      name: r.name,
      permissionNames: r.permissions.map(p => p.name),
    })),
  };
  
  const backupPath = path.join(__dirname, `permissions-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  
  logger.info(`✅ Backup created: ${backupPath}`);
  logger.info(`   Permissions: ${backup.permissions.length}`);
  logger.info(`   Roles: ${backup.roles.length}`);
  
  return backupPath;
};

/**
 * Main cleanup function
 */
const cleanupOldPermissions = async ({ dryRun = false, backup = false }) => {
  await connectToDB();
  
  try {
    // Step 1: Create backup if requested
    if (backup) {
      await createBackup();
    }
    
    // Step 2: Migrate roles
    const migrationStats = await migrateRoles(dryRun);
    
    // Step 3: Delete old permissions
    const deletedCount = await deleteOldPermissions(dryRun);
    
    // Step 4: Final verification
    const finalCount = await Permission.countDocuments({});
    const newFormatCount = await Permission.countDocuments({
      name: { $regex: /^(admin|user|node|role|apikey|app|payment|storage|level|structure|projectform|event|inmail|capture|collection|data|department|program|settings|statement|submission|report|whatsapp|telegramwebapp|tenantconfig|userformsettings|storagefolder|eventconfig|eventcalendar|eventcompliance|projectformsubmission|permreport|permsubmission|analyticsreport|baselineintelligence|baselineanalysisconfig|baselinejobs|compliance|compliancereport|customfieldconfig|exportreport|notificationreport|rollupreport|submissionreport|trendanalysis|unifiedsubmission|validationreport|waitlist|apikeyapproval):/ }
    });
    const oldFormatCount = await Permission.countDocuments({
      name: { $regex: /^(view|create|update|delete|read|manage):/ }
    });
    
    logger.info('\n📊 Final Status:');
    logger.info(`   Total permissions: ${finalCount}`);
    logger.info(`   New format (resource:action): ${newFormatCount}`);
    logger.info(`   Old format (action:resource): ${oldFormatCount}`);
    
    if (dryRun) {
      logger.info('\n💡 Dry run complete - no changes made');
      logger.info('💡 Run without --dry-run to apply changes');
    } else {
      logger.info('\n✅ Cleanup complete!');
    }
    
    await mongoose.disconnect();
    
    return {
      migrationStats,
      deletedCount,
      finalCount,
      newFormatCount,
      oldFormatCount,
    };
  } catch (error) {
    logger.error('❌ Cleanup failed:', error);
    await mongoose.disconnect();
    throw error;
  }
};

// Main execution
if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  const dryRun = args['dry-run'] || args.dryRun || false;
  const backup = args.backup || false;
  
  cleanupOldPermissions({ dryRun, backup })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupOldPermissions, migrateRoles, deleteOldPermissions };

