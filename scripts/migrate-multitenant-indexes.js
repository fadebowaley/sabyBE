/**
 * Migration script to update Level and Structure indexes for multi-tenancy
 * 
 * This script:
 * 1. Drops global unique indexes on Level.name and Level.rank
 * 2. Creates tenant-scoped unique indexes
 * 3. Creates tenant-scoped unique indexes for Structure.name
 * 
 * Run this script BEFORE deploying the model changes
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');

async function migrateIndexes() {
  try {
    console.log('🚀 Starting Multi-Tenant Index Migration...\n');

    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;

    // =========================================================================
    // LEVEL COLLECTION
    // =========================================================================
    console.log('📊 Migrating Level Collection Indexes...');
    console.log('=========================================\n');

    const levelsCollection = db.collection('levels');

    // List current indexes
    console.log('📋 Current Level indexes:');
    const levelIndexes = await levelsCollection.indexes();
    levelIndexes.forEach((idx) => {
      console.log(`   - ${idx.name}:`, JSON.stringify(idx.key));
    });
    console.log('');

    // Drop old global unique index on name (if exists)
    try {
      console.log('🗑️  Attempting to drop global unique index on name...');
      await levelsCollection.dropIndex('name_1');
      console.log('✅ Dropped name_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('⚠️  name_1 index does not exist (already removed or never created)');
      } else {
        console.error('❌ Error dropping name_1 index:', error.message);
      }
    }

    // Drop old global unique index on rank (if exists)
    try {
      console.log('🗑️  Attempting to drop global unique index on rank...');
      await levelsCollection.dropIndex('rank_1');
      console.log('✅ Dropped rank_1 index');
    } catch (error) {
      if (error.code === 27) {
        console.log('⚠️  rank_1 index does not exist (already removed or never created)');
      } else {
        console.error('❌ Error dropping rank_1 index:', error.message);
      }
    }

    // Create new tenant-scoped unique index on [tenantId, name]
    try {
      console.log('✨ Creating tenant-scoped unique index on [tenantId, name]...');
      await levelsCollection.createIndex(
        { tenantId: 1, name: 1 },
        {
          unique: true,
          name: 'tenantId_1_name_1_unique',
          partialFilterExpression: { deletedAt: null },
        }
      );
      console.log('✅ Created tenantId_1_name_1_unique index');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('⚠️  Index already exists');
      } else {
        console.error('❌ Error creating index:', error.message);
      }
    }

    // Create new tenant-scoped unique index on [tenantId, rank]
    try {
      console.log('✨ Creating tenant-scoped unique index on [tenantId, rank]...');
      await levelsCollection.createIndex(
        { tenantId: 1, rank: 1 },
        {
          unique: true,
          name: 'tenantId_1_rank_1_unique',
          partialFilterExpression: { deletedAt: null },
        }
      );
      console.log('✅ Created tenantId_1_rank_1_unique index');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('⚠️  Index already exists');
      } else {
        console.error('❌ Error creating index:', error.message);
      }
    }

    console.log('\n✅ Level collection migration complete!\n');

    // =========================================================================
    // STRUCTURES COLLECTION
    // =========================================================================
    console.log('📊 Migrating Structures Collection Indexes...');
    console.log('==============================================\n');

    const structuresCollection = db.collection('structures');

    // List current indexes
    console.log('📋 Current Structure indexes:');
    const structureIndexes = await structuresCollection.indexes();
    structureIndexes.forEach((idx) => {
      console.log(`   - ${idx.name}:`, JSON.stringify(idx.key));
    });
    console.log('');

    // Create tenant-scoped unique index on [tenantId, name]
    try {
      console.log('✨ Creating tenant-scoped unique index on [tenantId, name]...');
      await structuresCollection.createIndex(
        { tenantId: 1, name: 1 },
        {
          unique: true,
          name: 'tenantId_1_name_1_unique',
        }
      );
      console.log('✅ Created tenantId_1_name_1_unique index');
    } catch (error) {
      if (error.code === 85 || error.code === 86) {
        console.log('⚠️  Index already exists');
      } else {
        console.error('❌ Error creating index:', error.message);
      }
    }

    console.log('\n✅ Structures collection migration complete!\n');

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('========================================');
    console.log('✅ MULTI-TENANT INDEX MIGRATION COMPLETE');
    console.log('========================================\n');

    console.log('📊 Final Index Status:\n');

    console.log('Level Collection:');
    const finalLevelIndexes = await levelsCollection.indexes();
    finalLevelIndexes.forEach((idx) => {
      console.log(`   ✓ ${idx.name}:`, JSON.stringify(idx.key));
    });

    console.log('\nStructures Collection:');
    const finalStructureIndexes = await structuresCollection.indexes();
    finalStructureIndexes.forEach((idx) => {
      console.log(`   ✓ ${idx.name}:`, JSON.stringify(idx.key));
    });

    console.log('\n========================================');
    console.log('🎉 Migration completed successfully!');
    console.log('========================================\n');

    console.log('✅ Each tenant can now create:');
    console.log('   - Their own levels (Level 0, Level 1, etc.)');
    console.log('   - Their own structures with same names');
    console.log('   - Complete isolation between tenants');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nError details:', {
      message: error.message,
      code: error.code,
      name: error.name,
    });

    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run migration
migrateIndexes();


