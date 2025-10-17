const mongoose = require('mongoose');
const config = require('../src/config/config');

/**
 * Script to remove the unique constraint on isSaby field
 * This allows multiple SabyUsers to exist
 *
 * WARNING: Only run this if you want to allow multiple SabyUsers in your system
 */

const removeUniqueConstraint = async () => {
  try {
    console.log('🔧 Remove Unique Constraint on isSaby Field\n');
    console.log(
      '⚠️  WARNING: This will allow multiple SabyUsers in your system\n'
    );

    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // Check existing indexes
    console.log('📋 Current indexes on users collection:');
    const indexes = await collection.indexes();
    indexes.forEach((index) => {
      console.log('  -', index.name, ':', JSON.stringify(index.key));
    });
    console.log();

    // Check if unique_saby_user index exists
    const hasSabyIndex = indexes.some((idx) => idx.name === 'unique_saby_user');

    if (!hasSabyIndex) {
      console.log('✅ unique_saby_user constraint does not exist');
      console.log('No action needed.');
      process.exit(0);
    }

    // Drop the unique index
    console.log('🗑️  Dropping unique_saby_user index...');
    await collection.dropIndex('unique_saby_user');
    console.log('✅ Successfully removed unique constraint on isSaby field\n');

    console.log('✅ You can now create multiple SabyUsers');
    console.log('💡 Run: node scripts/createCustomSabyUser.js\n');

    // Show updated indexes
    console.log('📋 Updated indexes on users collection:');
    const updatedIndexes = await collection.indexes();
    updatedIndexes.forEach((index) => {
      console.log('  -', index.name, ':', JSON.stringify(index.key));
    });
    console.log();
  } catch (error) {
    if (error.code === 27) {
      console.log('✅ Index does not exist (already removed)');
    } else {
      console.error('❌ Error removing constraint:', error);
      process.exit(1);
    }
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the script
removeUniqueConstraint();
