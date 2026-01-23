/**
 * Script to Remove API Keys Created by Non-Owner Users
 *
 * This script:
 * 1. Finds all API keys created by users who are NOT isOwner
 * 2. Creates a backup of keys to be deleted
 * 3. Deletes unauthorized API keys
 * 4. Logs all operations
 *
 * Usage:
 *   DRY_RUN=true node scripts/remove-non-owner-api-keys.js  # Preview only
 *   node scripts/remove-non-owner-api-keys.js                 # Actually delete
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
const { ApiKey, User, ApiKeyApproval } = require(modelsPath);
const logger = require(loggerPath);
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';

/**
 * Find all API keys created by non-owner users
 */
async function findNonOwnerApiKeys() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 Finding API Keys Created by Non-Owner Users');
  console.log('='.repeat(80));

  try {
    // Get all API keys with createdBy populated
    const allApiKeys = await ApiKey.find({})
      .populate('createdBy', 'firstname lastname email isOwner isSaby isSuper')
      .lean();

    console.log(`\n📊 Total API keys in database: ${allApiKeys.length}`);

    const nonOwnerKeys = [];
    const ownerKeys = [];
    const keysWithNoCreator = [];

    for (const key of allApiKeys) {
      const creator = key.createdBy;

      if (!creator) {
        keysWithNoCreator.push(key);
        continue;
      }

      const isOwner = creator.isOwner === true;

      if (isOwner) {
        ownerKeys.push({
          keyId: key._id.toString(),
          label: key.label,
          category: key.category,
          environment: key.environment,
          isActive: key.isActive,
          approvalStatus: key.approvalStatus,
          createdBy: `${creator.firstname} ${creator.lastname} (${creator.email})`,
          createdAt: key.createdAt,
        });
      } else {
        nonOwnerKeys.push({
          keyId: key._id.toString(),
          label: key.label,
          category: key.category,
          environment: key.environment,
          isActive: key.isActive,
          approvalStatus: key.approvalStatus,
          createdBy: `${creator.firstname} ${creator.lastname} (${creator.email})`,
          creatorId: creator._id.toString(),
          creatorEmail: creator.email,
          isOwner: creator.isOwner,
          isSaby: creator.isSaby,
          isSuper: creator.isSuper,
          createdAt: key.createdAt,
        });
      }
    }

    console.log(`\n✅ Owner keys (will be kept): ${ownerKeys.length}`);
    console.log(`❌ Non-owner keys (will be deleted): ${nonOwnerKeys.length}`);
    console.log(`⚠️  Keys with no creator: ${keysWithNoCreator.length}`);

    if (nonOwnerKeys.length > 0) {
      console.log('\n📋 API Keys to be Deleted:');
      console.log('='.repeat(80));

      nonOwnerKeys.forEach((key, idx) => {
        console.log(`\n${idx + 1}. Key ID: ${key.keyId}`);
        console.log(`   Label: ${key.label}`);
        console.log(`   Category: ${key.category}`);
        console.log(`   Environment: ${key.environment}`);
        console.log(
          `   Status: ${key.isActive ? 'Active' : 'Inactive'} (${
            key.approvalStatus
          })`
        );
        console.log(`   Created by: ${key.createdBy}`);
        console.log(
          `   Creator roles: isOwner=${key.isOwner}, isSaby=${key.isSaby}, isSuper=${key.isSuper}`
        );
        console.log(`   Created at: ${key.createdAt}`);
      });

      // Group by creator
      const byCreator = {};
      nonOwnerKeys.forEach((key) => {
        const email = key.creatorEmail;
        if (!byCreator[email]) {
          byCreator[email] = {
            email,
            name: key.createdBy.split(' (')[0],
            count: 0,
            keys: [],
          };
        }
        byCreator[email].count++;
        byCreator[email].keys.push(key);
      });

      console.log('\n📊 Non-Owner Keys by Creator:');
      console.log('='.repeat(80));
      Object.values(byCreator)
        .sort((a, b) => b.count - a.count)
        .forEach((creator, idx) => {
          console.log(`\n${idx + 1}. ${creator.name} (${creator.email})`);
          console.log(`   Total keys to delete: ${creator.count}`);
        });
    }

    if (keysWithNoCreator.length > 0) {
      console.log('\n⚠️  API Keys with No Creator:');
      keysWithNoCreator.forEach((key, idx) => {
        console.log(
          `   ${idx + 1}. ${key._id} - ${key.label} (created: ${key.createdAt})`
        );
      });
    }

    return {
      total: allApiKeys.length,
      owner: ownerKeys.length,
      nonOwner: nonOwnerKeys.length,
      noCreator: keysWithNoCreator.length,
      nonOwnerKeys,
      ownerKeys,
      keysWithNoCreator,
    };
  } catch (error) {
    console.error('❌ Error finding non-owner API keys:', error);
    throw error;
  }
}

/**
 * Create backup of keys to be deleted
 */
async function createBackup(nonOwnerKeys) {
  if (nonOwnerKeys.length === 0) {
    console.log('\n✅ No keys to backup (no non-owner keys found)');
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
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(
    backupDir,
    `non-owner-api-keys-backup-${timestamp}.json`
  );

  const backupData = {
    timestamp: new Date().toISOString(),
    totalKeys: nonOwnerKeys.length,
    keys: nonOwnerKeys,
  };

  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`\n💾 Backup created: ${backupFile}`);

  return backupFile;
}

/**
 * Delete non-owner API keys
 */
async function deleteNonOwnerKeys(nonOwnerKeys) {
  if (nonOwnerKeys.length === 0) {
    console.log('\n✅ No keys to delete');
    return { deleted: 0, errors: [] };
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🗑️  Deleting ${nonOwnerKeys.length} Non-Owner API Keys`);
  console.log('='.repeat(80));

  const deleted = [];
  const errors = [];

  for (const keyInfo of nonOwnerKeys) {
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
    console.log('🔧 API KEY CLEANUP: Remove Non-Owner Keys');
    console.log('='.repeat(80));
    console.log(
      `Mode: ${
        DRY_RUN ? '🔍 DRY RUN (Preview Only)' : '⚠️  LIVE (Will Delete Keys)'
      }`
    );
    console.log('='.repeat(80));

    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find non-owner keys
    const results = await findNonOwnerApiKeys();

    if (results.nonOwner === 0) {
      console.log('\n✅ No non-owner API keys found. Nothing to delete.');
      await mongoose.disconnect();
      return;
    }

    // Create backup
    const backupFile = await createBackup(results.nonOwnerKeys);

    // Confirm before deletion (unless dry run)
    if (!DRY_RUN) {
      console.log('\n' + '='.repeat(80));
      console.log('⚠️  WARNING: About to delete API keys!');
      console.log('='.repeat(80));
      console.log(`Total keys to delete: ${results.nonOwner}`);
      console.log(`Backup saved to: ${backupFile}`);
      console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...');

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Delete keys
    const deleteResults = await deleteNonOwnerKeys(results.nonOwnerKeys);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total API keys: ${results.total}`);
    console.log(`✅ Owner keys (kept): ${results.owner}`);
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
