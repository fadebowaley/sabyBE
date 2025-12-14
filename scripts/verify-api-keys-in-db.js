/**
 * Script to verify API keys in database and check if they have proper sk_ prefix
 * Usage: node scripts/verify-api-keys-in-db.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ApiKey } = require('../src/models');
const crypto = require('crypto');

// Test keys to verify
const testKeys = [
  'sk_staging_abf99d3c5dedab64a1d5a54fd2f7e80b22727901c1c7f220132cf8047b5c420a',
  'sk_live_5afcb5f9ba71cacddc64314bfcfe17ae191a971a6c349e0116794d5a02ac8e12',
];

async function verifyKeys() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Get all API keys
    const allKeys = await ApiKey.find({}).lean();
    console.log(`\n📊 Total API keys in database: ${allKeys.length}\n`);

    // Verify test keys
    console.log('🔍 Verifying test keys:');
    console.log('='.repeat(80));
    for (const testKey of testKeys) {
      const hashedKey = crypto.createHash('sha256').update(testKey).digest('hex');
      const foundKey = await ApiKey.findOne({ hashedKey }).lean();
      
      if (foundKey) {
        console.log(`\n✅ Key found: ${testKey.substring(0, 30)}...`);
        console.log(`   Environment: ${foundKey.environment}`);
        console.log(`   Label: ${foundKey.label}`);
        console.log(`   Is Active: ${foundKey.isActive}`);
        console.log(`   Approval Status: ${foundKey.approvalStatus || 'N/A'}`);
        console.log(`   Usage Count: ${foundKey.usageCount}`);
        console.log(`   Staging Limit: ${foundKey.stagingUsageLimit || 'N/A'}`);
        console.log(`   Hashed Key (first 20): ${hashedKey.substring(0, 20)}...`);
        
        // Verify the key format
        if (testKey.startsWith('sk_')) {
          console.log(`   ✅ Key format: CORRECT (starts with sk_)`);
        } else {
          console.log(`   ❌ Key format: INCORRECT (missing sk_ prefix)`);
        }
      } else {
        console.log(`\n❌ Key NOT found: ${testKey.substring(0, 30)}...`);
        console.log(`   Hashed Key searched: ${hashedKey.substring(0, 20)}...`);
      }
    }

    // Show all keys summary
    console.log('\n\n📋 All API Keys Summary:');
    console.log('='.repeat(80));
    for (const key of allKeys) {
      console.log(`\n🔑 Key ID: ${key._id}`);
      console.log(`   Label: ${key.label}`);
      console.log(`   Environment: ${key.environment}`);
      console.log(`   Is Active: ${key.isActive}`);
      console.log(`   Approval Status: ${key.approvalStatus || 'N/A'}`);
      console.log(`   Usage Count: ${key.usageCount}`);
      console.log(`   Staging Limit: ${key.stagingUsageLimit || 'N/A'}`);
      console.log(`   Created: ${key.createdAt}`);
      console.log(`   Hashed Key (first 30): ${key.hashedKey.substring(0, 30)}...`);
      
      // Try to determine if this key was created with sk_ prefix
      // We can't reverse the hash, but we can check the environment
      const expectedPrefix = key.environment === 'production' ? 'sk_live_' : 'sk_staging_';
      console.log(`   Expected prefix: ${expectedPrefix}`);
    }

    // Test key generation
    console.log('\n\n🧪 Testing Key Generation:');
    console.log('='.repeat(80));
    
    // Test staging key generation
    const testStagingKey = await ApiKey.generateKey({
      tenantId: 'test-tenant',
      label: 'TEST - Staging Key (Will be deleted)',
      environment: 'staging',
      category: 'web',
      permissions: ['read'],
      createdBy: new mongoose.Types.ObjectId(),
    });
    
    console.log(`\n✅ Generated Staging Key:`);
    console.log(`   Raw Key: ${testStagingKey.rawKey}`);
    console.log(`   Has Prefix: ${testStagingKey.rawKey.startsWith('sk_staging_') ? '✅ YES' : '❌ NO'}`);
    console.log(`   Key Length: ${testStagingKey.rawKey.length}`);
    
    // Test production key generation
    const testProductionKey = await ApiKey.generateKey({
      tenantId: 'test-tenant',
      label: 'TEST - Production Key (Will be deleted)',
      environment: 'production',
      category: 'web',
      permissions: ['read'],
      createdBy: new mongoose.Types.ObjectId(),
    });
    
    console.log(`\n✅ Generated Production Key:`);
    console.log(`   Raw Key: ${testProductionKey.rawKey}`);
    console.log(`   Has Prefix: ${testProductionKey.rawKey.startsWith('sk_live_') ? '✅ YES' : '❌ NO'}`);
    console.log(`   Key Length: ${testProductionKey.rawKey.length}`);
    
    // Clean up test keys
    console.log('\n🧹 Cleaning up test keys...');
    await ApiKey.deleteMany({
      label: { $regex: /^TEST -/ }
    });
    console.log('✅ Test keys deleted');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyKeys();

