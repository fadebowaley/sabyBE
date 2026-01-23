/**
 * Script to delete all API keys from MongoDB
 * This allows us to test API key creation with the sk_ prefix
 * Usage: node scripts/delete-api-keys.js
 *
 * Note: If running outside Docker, you may need to set MONGODB_URL environment variable
 * to use localhost instead of the Docker hostname (mongodb)
 */

// Load env.docker file
const envPath = require('path').join(__dirname, '../env.docker');
require('dotenv').config({ path: envPath });

// When running inside Docker, use the Docker service name 'mongodb'
// When running outside Docker, you would need to replace 'mongodb' with 'localhost'
// Since we're running this inside Docker, we keep the original connection string

const mongoose = require('mongoose');
// Adjust path based on where script is run from
// If in src/scripts/, use ../config/config
// If in scripts/, use ../src/config/config
let config, models;
try {
  config = require('../config/config');
  models = require('../models');
} catch (e) {
  config = require('../src/config/config');
  models = require('../src/models');
}
const { ApiKey } = models;

async function deleteApiKeys() {
  try {
    // Connect to MongoDB using config
    console.log('Connecting to MongoDB...');
    const maskedUrl = config.mongoose.url.replace(/\/\/.*@/, '//***:***@');
    console.log('Connection URL:', maskedUrl);

    // Try to connect
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Count existing keys
    const countBefore = await ApiKey.countDocuments();
    console.log(`Found ${countBefore} API key(s) in database\n`);

    if (countBefore === 0) {
      console.log('No API keys to delete. Exiting...');
      await mongoose.disconnect();
      return;
    }

    // List keys before deletion
    const keys = await ApiKey.find({})
      .select('label environment createdAt')
      .lean();
    console.log('API Keys to be deleted:');
    keys.forEach((key, index) => {
      console.log(
        `  ${index + 1}. ${key.label} (${key.environment}) - Created: ${
          key.createdAt
        }`
      );
    });
    console.log('');

    // Delete all API keys
    const result = await ApiKey.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} API key(s)\n`);

    // Verify deletion
    const countAfter = await ApiKey.countDocuments();
    console.log(`Verification: ${countAfter} API key(s) remaining in database`);

    if (countAfter === 0) {
      console.log('✅ All API keys successfully deleted!');
    } else {
      console.log('⚠️  Warning: Some API keys may still exist');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
deleteApiKeys();

