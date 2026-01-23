const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Permission = require('../../models/permission.model');
const Role = require('../../models/role.model');
const config = require('../../config/config');
const logger = require('../../config/logger');
const { generateOptimizedPermissions } = require('./generate-optimized');

/**
 * Comprehensive Permission Regeneration and Update Script
 *
 * This script:
 * 1. Regenerates optimized permissions from routes (new format: resource:action)
 * 2. Normalizes resource names to lowercase (matching frontend format)
 * 3. Removes all old format permissions
 * 4. Seeds new format permissions
 * 5. Updates frontend permissions config with all backend resources
 *
 * Usage:
 *   node src/scripts/permissions/regenerate-and-update-permissions.js [--dry-run] [--backup]
 */

/**
 * Normalize resource name to lowercase (matching frontend format)
 * Handles camelCase conversion: apiKey -> apikey, apiKeyApproval -> apikeyapproval
 */
const normalizeResourceName = (resource) => {
  if (!resource || typeof resource !== 'string') {
    return resource;
  }

  // Convert camelCase to lowercase
  // apiKey -> apikey
  // apiKeyApproval -> apikeyapproval
  // eventCalendar -> eventcalendar
  return resource
    .replace(/([A-Z])/g, (match) => match.toLowerCase())
    .toLowerCase();
};

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
 * Create backup of permissions and roles
 */
const createBackup = async () => {
  logger.info('\n💾 Creating backup...');

  const permissions = await Permission.find({});
  const roles = await Role.find({}).populate('permissions');

  const backup = {
    timestamp: new Date().toISOString(),
    permissions: permissions.map((p) => ({
      name: p.name,
      resource: p.resource,
      action: p.action,
      path: p.path,
      method: p.method,
    })),
    roles: roles.map((r) => ({
      name: r.name,
      permissionNames: r.permissions.map((p) => p.name),
    })),
  };

  const backupPath = path.join(
    __dirname,
    `permissions-backup-${Date.now()}.json`
  );
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  logger.info(`✅ Backup created: ${backupPath}`);
  logger.info(`   Permissions: ${backup.permissions.length}`);
  logger.info(`   Roles: ${backup.roles.length}`);

  return backupPath;
};

/**
 * Normalize permissions in optimized snapshot (convert resource names to lowercase)
 */
const normalizeOptimizedSnapshot = (snapshotPath) => {
  logger.info(`\n🔄 Normalizing optimized snapshot...`);

  const snapshotData = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  logger.info(`📊 Found ${snapshotData.length} permissions in snapshot`);

  const normalized = snapshotData.map((perm) => {
    const normalizedResource = normalizeResourceName(perm.resource);
    const normalizedName = `${normalizedResource}:${perm.action}`;

    return {
      ...perm,
      name: normalizedName,
      resource: normalizedResource,
    };
  });

  // Write normalized snapshot
  const normalizedPath = path.join(
    __dirname,
    'optimized-snapshot-normalized.json'
  );
  fs.writeFileSync(normalizedPath, JSON.stringify(normalized, null, 2));
  logger.info(`✅ Normalized snapshot written to ${normalizedPath}`);

  // Show resource mapping
  const resourceMap = new Map();
  snapshotData.forEach((perm) => {
    const normalized = normalizeResourceName(perm.resource);
    if (!resourceMap.has(normalized)) {
      resourceMap.set(normalized, new Set());
    }
    resourceMap.get(normalized).add(perm.resource);
  });

  logger.info(`\n📋 Resource normalization mapping:`);
  Array.from(resourceMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 20)
    .forEach(([normalized, originals]) => {
      const originalsArray = Array.from(originals);
      if (originalsArray.length === 1 && originalsArray[0] === normalized) {
        // No change
      } else {
        logger.info(`   ${normalized} <- ${originalsArray.join(', ')}`);
      }
    });

  return normalized;
};

/**
 * Delete all old format permissions
 */
const deleteOldPermissions = async (dryRun = false) => {
  logger.info('\n🗑️  Deleting old format permissions...');

  // Find old format permissions (action:resource format)
  const oldFormatPattern = /^(view|create|update|delete|read|manage|get):/;
  const oldPermissions = await Permission.find({
    name: { $regex: oldFormatPattern },
  });

  logger.info(`📊 Found ${oldPermissions.length} old format permissions`);

  if (oldPermissions.length === 0) {
    logger.info('✅ No old format permissions found');
    return 0;
  }

  // Show sample
  logger.info('\n📋 Sample old format permissions to delete:');
  oldPermissions.slice(0, 10).forEach((p) => {
    logger.info(`   - ${p.name}`);
  });
  if (oldPermissions.length > 10) {
    logger.info(`   ... and ${oldPermissions.length - 10} more`);
  }

  if (dryRun) {
    logger.info('\n💡 Dry run - permissions not deleted');
    return oldPermissions.length;
  }

  const oldNames = oldPermissions.map((p) => p.name);
  const result = await Permission.deleteMany({ name: { $in: oldNames } });

  logger.info(`✅ Deleted ${result.deletedCount} old format permissions`);

  return result.deletedCount;
};

/**
 * Seed normalized permissions to database
 */
const seedNormalizedPermissions = async (
  normalizedPermissions,
  dryRun = false
) => {
  logger.info('\n📥 Seeding normalized permissions...');

  const existing = await Permission.find({});
  const existingNames = new Set(existing.map((p) => p.name));

  const newPermissions = normalizedPermissions.filter(
    (p) => !existingNames.has(p.name)
  );
  logger.info(`✅ ${newPermissions.length} new permissions to seed`);
  logger.info(
    `⏭️  ${
      normalizedPermissions.length - newPermissions.length
    } permissions already exist`
  );

  if (newPermissions.length === 0) {
    logger.info(
      '⚠️  No new permissions to seed. All permissions already exist.'
    );
    return { inserted: 0, skipped: normalizedPermissions.length };
  }

  if (dryRun) {
    logger.info('\n💡 Dry run - permissions not seeded');
    logger.info(`📋 Sample permissions that would be seeded:`);
    newPermissions.slice(0, 10).forEach((p, i) => {
      logger.info(`   ${i + 1}. ${p.name} (${p.resource}:${p.action})`);
    });
    if (newPermissions.length > 10) {
      logger.info(`   ... and ${newPermissions.length - 10} more`);
    }
    return { inserted: 0, skipped: normalizedPermissions.length };
  }

  try {
    const inserted = await Permission.insertMany(
      newPermissions.map((p) => ({
        name: p.name,
        resource: p.resource,
        action: p.action,
        path: p.path || '/',
        method: p.method || 'GET',
        description: p.description || `${p.action} ${p.resource} resources`,
        isWildcard: p.isWildcard || false,
        isAdminLevel: p.isAdminLevel || false,
      })),
      { ordered: false }
    );

    logger.info(`✅ Successfully seeded ${inserted.length} new permissions`);

    // Show sample
    logger.info('\n📋 Sample of seeded permissions:');
    inserted.slice(0, 10).forEach((p, i) => {
      logger.info(`   ${i + 1}. ${p.name} (${p.resource}:${p.action})`);
    });
    if (inserted.length > 10) {
      logger.info(`   ... and ${inserted.length - 10} more`);
    }

    return {
      inserted: inserted.length,
      skipped: normalizedPermissions.length - inserted.length,
    };
  } catch (error) {
    if (error.writeErrors) {
      const duplicateCount = error.writeErrors.filter(
        (e) => e.code === 11000
      ).length;
      const successCount = error.result.insertedCount;
      logger.warn(
        `⚠️  ${duplicateCount} permissions were duplicates (skipped)`
      );
      logger.info(`✅ Successfully seeded ${successCount} new permissions`);
      return { inserted: successCount, skipped: duplicateCount };
    } else {
      logger.error('❌ Error seeding permissions:', error);
      throw error;
    }
  }
};

/**
 * Update frontend permissions config with all backend resources
 */
const updateFrontendConfig = (normalizedPermissions, dryRun = false) => {
  logger.info('\n🔄 Updating frontend permissions config...');

  // Get unique resources from normalized permissions
  const uniqueResources = [
    ...new Set(normalizedPermissions.map((p) => p.resource)),
  ].sort();
  logger.info(`📊 Found ${uniqueResources.length} unique resources`);

  // Load backend owner resource bundle
  const ownerResourcePath = path.join(__dirname, 'ownerResource.json');
  const ownerResourceBundle = JSON.parse(
    fs.readFileSync(ownerResourcePath, 'utf8')
  ).ownerResourceBundle;
  logger.info(
    `📊 Backend owner bundle has ${ownerResourceBundle.length} resources`
  );

  // Load frontend config
  const frontendConfigPath = path.join(
    __dirname,
    '../../../sabyFrontend/apps/isomorphic/src/config/permissions.config.json'
  );

  if (!fs.existsSync(frontendConfigPath)) {
    logger.warn(`⚠️  Frontend config not found at ${frontendConfigPath}`);
    logger.warn(`   Skipping frontend config update`);
    return;
  }

  const frontendConfig = JSON.parse(
    fs.readFileSync(frontendConfigPath, 'utf8')
  );

  // Update ownerResourceBundle to match backend
  logger.info(`\n📋 Updating ownerResourceBundle:`);
  logger.info(
    `   Before: ${frontendConfig.ownerResourceBundle.length} resources`
  );
  logger.info(`   After: ${ownerResourceBundle.length} resources`);

  // Show differences
  const frontendResources = new Set(frontendConfig.ownerResourceBundle);
  const backendResources = new Set(ownerResourceBundle);

  const missing = ownerResourceBundle.filter((r) => !frontendResources.has(r));
  const extra = frontendConfig.ownerResourceBundle.filter(
    (r) => !backendResources.has(r)
  );

  if (missing.length > 0) {
    logger.info(`\n➕ Resources to add to frontend:`);
    missing.forEach((r) => logger.info(`   - ${r}`));
  }

  if (extra.length > 0) {
    logger.info(`\n➖ Resources in frontend but not in backend:`);
    extra.forEach((r) => logger.info(`   - ${r}`));
  }

  // Generate permission groups for missing resources
  const newPermissionGroups = {};
  missing.forEach((resource) => {
    newPermissionGroups[resource] = {
      view: `${resource}:read`,
      create: `${resource}:create`,
      update: `${resource}:update`,
      delete: `${resource}:delete`,
      manage: `${resource}:manage`,
    };
  });

  // Update frontend config
  if (!dryRun) {
    frontendConfig.ownerResourceBundle = ownerResourceBundle;

    // Merge new permission groups
    frontendConfig.permissionGroups = {
      ...frontendConfig.permissionGroups,
      ...newPermissionGroups,
    };

    // Write updated config
    fs.writeFileSync(
      frontendConfigPath,
      JSON.stringify(frontendConfig, null, 2)
    );
    logger.info(`\n✅ Frontend config updated: ${frontendConfigPath}`);
  } else {
    logger.info(`\n💡 Dry run - frontend config not updated`);
  }
};

/**
 * Main function
 */
const regenerateAndUpdate = async ({ dryRun = false, backup = false }) => {
  await connectToDB();

  try {
    // Step 1: Create backup if requested
    if (backup) {
      await createBackup();
    }

    // Step 2: Generate optimized permissions
    logger.info('\n🔄 Step 1: Generating optimized permissions from routes...');
    const snapshotPath = path.join(__dirname, 'optimized-snapshot.json');

    // Calculate routes directory - relative to sabyBackend folder
    // Script is at: sabyBackend/src/scripts/permissions/regenerate-and-update-permissions.js
    // Routes are at: sabyBackend/src/routes
    const backendRoot = path.resolve(__dirname, '../..'); // Go up to sabyBackend
    const routesDir = path.join(backendRoot, 'src/routes');

    logger.info(`   Routes directory: ${routesDir}`);

    await generateOptimizedPermissions({
      routesDir: routesDir,
      snapshotPath,
      shouldSeed: false, // We'll seed after normalization
      dryRun: false, // Always generate snapshot
    });

    // Step 3: Normalize resource names (to lowercase)
    logger.info('\n🔄 Step 2: Normalizing resource names to lowercase...');
    const normalizedPermissions = normalizeOptimizedSnapshot(snapshotPath);

    // Step 4: Delete old format permissions
    logger.info('\n🔄 Step 3: Deleting old format permissions...');
    const deletedCount = await deleteOldPermissions(dryRun);

    // Step 5: Seed normalized permissions
    logger.info('\n🔄 Step 4: Seeding normalized permissions...');
    const seedStats = await seedNormalizedPermissions(
      normalizedPermissions,
      dryRun
    );

    // Step 6: Update frontend config
    logger.info('\n🔄 Step 5: Updating frontend permissions config...');
    updateFrontendConfig(normalizedPermissions, dryRun);

    // Step 7: Final verification
    logger.info('\n📊 Final Status:');
    const finalCount = await Permission.countDocuments({});
    const newFormatCount = await Permission.countDocuments({
      name: {
        $regex:
          /^[a-z]+[A-Z]?[a-z]*:(read|create|update|delete|manage|import|export|assign|restore|activate|deactivate|move|upload|download|share|copy|publish|archive|submit|process|complete|cancel|refund|regenerate|deleteAll|toggleStatus|assignRole|sendMessage|forgotPassword|resetPassword|verify|refresh|send|draft|retry|public|private|permissions|status|auth)/,
      },
    });
    const oldFormatCount = await Permission.countDocuments({
      name: { $regex: /^(view|create|update|delete|read|manage|get):/ },
    });

    logger.info(`   Total permissions: ${finalCount}`);
    logger.info(
      `   New format (resource:action, lowercase): ${newFormatCount}`
    );
    logger.info(`   Old format (action:resource): ${oldFormatCount}`);
    logger.info(`   Permissions seeded: ${seedStats.inserted}`);
    logger.info(`   Permissions skipped (duplicates): ${seedStats.skipped}`);
    logger.info(`   Old permissions deleted: ${deletedCount}`);

    // Get unique resources
    const uniqueResources = await Permission.distinct('resource');
    logger.info(`   Unique resources: ${uniqueResources.length}`);

    if (dryRun) {
      logger.info('\n💡 Dry run complete - no changes made');
      logger.info('💡 Run without --dry-run to apply changes');
    } else {
      logger.info('\n✅ Permission regeneration and update complete!');
    }

    await mongoose.disconnect();

    return {
      finalCount,
      newFormatCount,
      oldFormatCount,
      seedStats,
      deletedCount,
      uniqueResources: uniqueResources.length,
    };
  } catch (error) {
    logger.error('❌ Regeneration failed:', error);
    await mongoose.disconnect();
    throw error;
  }
};

// Main execution
if (require.main === module) {
  const args = require('minimist')(process.argv.slice(2));
  const dryRun = args['dry-run'] || args.dryRun || false;
  const backup = args.backup || false;

  regenerateAndUpdate({ dryRun, backup })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Regeneration failed:', error);
      process.exit(1);
    });
}

module.exports = { regenerateAndUpdate, normalizeResourceName };
