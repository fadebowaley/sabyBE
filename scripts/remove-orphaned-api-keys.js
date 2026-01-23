/**
 * Script to Remove API Keys with No Creator (Orphaned Keys)
 *
 * This script:
 * 1. Finds all API keys where createdBy is null/undefined
 * 2. Creates a backup of keys to be deleted
 * 3. Deletes orphaned API keys
 * 4. Logs all operations
 *
 * Usage:
 *   DRY_RUN=true node scripts/remove-orphaned-api-keys.js  # Preview only
 *   node scripts/remove-orphaned-api-keys.js                 # Actually delete
 */

const mongoose = require('mongoose');
// Support both scripts/ and root execution
let configPath = '../src/config/config';
let modelsPath = '../src/models';
let loggerPath = '../src/config/logger';
try {
  require.resolve(configPath);
} catch (e) {
  // If running from /app/, use ./src instead
  configPath = './src/config/config';
  modelsPath = './src/models';
  loggerPath = './src/config/logger';
}
const config = require(configPath);
const { ApiKey, ApiKeyApproval } = require(modelsPath);
const logger = require(loggerPath);
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

/**
 * Find all API keys with no creator
 */
async function findOrphanedApiKeys() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Finding API Keys with No Creator (Orphaned Keys)');
  console.log('='.repeat(80));

  try {
    // Get all API keys with createdBy populated
    const allApiKeys = await ApiKey.find({})
      .populate('createdBy', 'firstname lastname email isOwner')
      .lean();

    console.log(`\n📊 Total API keys in database: ${allApiKeys.length}`);

    const orphanedKeys = [];
    const keysWithCreator = [];

    for (const key of allApiKeys) {
      const creator = key.createdBy;

      if (!creator) {
        orphanedKeys.push({
          keyId: key._id.toString(),
          label: key.label,
          category: key.category,
          environment: key.environment,
          isActive: key.isActive,
          approvalStatus: key.approvalStatus,
          createdAt: key.createdAt,
          tenantId: key.tenantId ? key.tenantId.toString() : 'unknown',
        });
      } else {
        keysWithCreator.push(key);
      }
    }

    console.log(`✅ Keys with creator: ${keysWithCreator.length}`);
    console.log(`❌ Orphaned keys (no creator): ${orphanedKeys.length}`);

    if (orphanedKeys.length > 0) {
      console.log('\n📋 Orphaned API Keys to be Deleted:');
      console.log('='.repeat(80));

      orphanedKeys.forEach((key, idx) => {
        console.log(`\n${idx + 1}. Key ID: ${key.keyId}`);
        console.log(`   Label: ${key.label}`);
        console.log(`   Category: ${key.category}`);
        console.log(`   Environment: ${key.environment}`);
        console.log(
          `   Status: ${key.isActive ? 'Active' : 'Inactive'} (${
            key.approvalStatus
          })`
        );
        console.log(`   Tenant ID: ${key.tenantId}`);
        console.log(`   Created at: ${key.createdAt}`);
      });

      // Group by tenant
      const byTenant = {};
      orphanedKeys.forEach((key) => {
        const tenantId = key.tenantId;
        if (!byTenant[tenantId]) {
          byTenant[tenantId] = {
            tenantId,
            count: 0,
            keys: [],
          };
        }
        byTenant[tenantId].count++;
        byTenant[tenantId].keys.push(key);
      });

      console.log('\n📊 Orphaned Keys by Tenant:');
      console.log('='.repeat(80));
      Object.values(byTenant)
        .sort((a, b) => b.count - a.count)
        .forEach((tenant, idx) => {
          console.log(
            `\n${idx + 1}. Tenant: ${tenant.tenantId} - ${tenant.count} keys`
          );
        });
    }

    return {
      total: allApiKeys.length,
      withCreator: keysWithCreator.length,
      orphaned: orphanedKeys.length,
      orphanedKeys,
    };
  } catch (error) {
    console.error('❌ Error finding orphaned API keys:', error);
    throw error;
  }
}

/**
 * Create backup of keys to be deleted
 */
async function createBackup(orphanedKeys) {
  if (orphanedKeys.length === 0) {
    console.log('\n✅ No keys to backup (no orphaned keys found)');
    return null;
  }

  // Support both scripts/ and root execution
  let backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
    } catch (e) {
      // If can't create, try ./backups
      backupDir = path.join(__dirname, './backups');
      try {
        fs.mkdirSync(backupDir, { recursive: true });
      } catch (e2) {
        // Fallback to /tmp for container environments
        backupDir = '/tmp/backups';
        try {
          fs.mkdirSync(backupDir, { recursive: true });
        } catch (e3) {
          // Last resort: use current directory
          backupDir = process.cwd();
        }
      }
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(
    backupDir,
    `orphaned-api-keys-backup-${timestamp}.json`
  );

  const backupData = {
    timestamp: new Date().toISOString(),
    totalKeys: orphanedKeys.length,
    keys: orphanedKeys,
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`\n💾 Backup created: ${backupFile}`);

  return backupFile;
}

/**
 * Delete orphaned API keys
 */
async function deleteOrphanedKeys(orphanedKeys) {
  if (orphanedKeys.length === 0) {
    console.log('\n✅ No keys to delete');
    return { deleted: [], errors: [] };
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🗑️  Deleting ${orphanedKeys.length} Orphaned API Keys`);
  console.log('='.repeat(80));

  const deleted = [];
  const errors = [];

  for (const keyInfo of orphanedKeys) {
    try {
      const keyId = keyInfo.keyId;

      if (DRY_RUN) {
        console.log(`[DRY RUN] Would delete: ${keyId} - ${keyInfo.label}`);
        deleted.push(keyId);
      } else {
        // Delete associated approval requests first
        await ApiKeyApproval.deleteMany({ apiKey: keyId });

        // Delete the API key
        const result = await ApiKey.deleteOne({ _id: keyId });

        if (result.deletedCount > 0) {
          console.log(`✅ Deleted: ${keyId} - ${keyInfo.label}`);
          deleted.push(keyId);
        } else {
          console.log(`⚠️  Key not found: ${keyId}`);
          errors.push({ keyId, error: 'Key not found' });
        }
      }
    } catch (error) {
      console.error(`❌ Error deleting key ${keyInfo.keyId}:`, error.message);
      errors.push({ keyId: keyInfo.keyId, error: error.message });
    }
  }

  return { deleted, errors };
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔧 API KEY CLEANUP: Remove Orphaned Keys (No Creator)');
    console.log('='.repeat(80));
    console.log(
      `Mode: ${
        DRY_RUN ? '🔍 DRY RUN (Preview Only)' : '⚠️  LIVE (Will Delete Keys)'
      }`
    );
    console.log('='.repeat(80));

    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find orphaned keys
    const results = await findOrphanedApiKeys();

    if (results.orphaned === 0) {
      console.log('\n✅ No orphaned API keys found. Nothing to delete.');
      await mongoose.disconnect();
      return;
    }

    // Create backup
    const backupFile = await createBackup(results.orphanedKeys);

    // Confirm before deletion (unless dry run)
    if (!DRY_RUN) {
      console.log('\n' + '='.repeat(80));
      console.log('⚠️  WARNING: About to delete orphaned API keys!');
      console.log('='.repeat(80));
      console.log(`Total keys to delete: ${results.orphaned}`);
      console.log(`Backup saved to: ${backupFile}`);
      console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...');

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Delete keys
    const deleteResults = await deleteOrphanedKeys(results.orphanedKeys);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total API keys: ${results.total}`);
    console.log(`✅ Keys with creator (kept): ${results.withCreator}`);
    console.log(
      `${DRY_RUN ? '🔍 Would delete' : '🗑️  Deleted'}: ${
        deleteResults.deleted.length
      }`
    );
    console.log(`❌ Errors: ${deleteResults.errors.length}`);

    if (backupFile) {
      console.log(`💾 Backup: ${backupFile}`);
    }

    if (deleteResults.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      deleteResults.errors.forEach((err) => {
        console.log(`   - ${err.keyId}: ${err.error}`);
      });
    }

    console.log('\n✅ Cleanup completed!\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Fatal error during cleanup:', error);
    console.error('   Stack:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run script
main();
