/**
 * Script to verify API keys in Docker MongoDB database
 * Usage: node scripts/verify-docker-api-keys.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../env.docker') });
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
    // Use MongoDB URL from env.docker
    // Format: mongodb://admin:local_mongo_2025@mongodb:27017/halo-local?authSource=admin&replicaSet=rs0
    // When running from host, replace 'mongodb' with 'localhost'
    // Try without auth first (Docker MongoDB might not have auth enabled)
    let mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/halo-local';
    
    // Replace mongodb hostname with localhost if running from host
    if (mongoUrl.includes('@mongodb:27017')) {
      mongoUrl = mongoUrl.replace('@mongodb:27017', '@localhost:27017');
    }
    
    // Remove replicaSet parameter when connecting from host (not needed for single instance)
    mongoUrl = mongoUrl.replace(/&replicaSet=[^&]*/, '').replace(/\?replicaSet=[^&]*/, '');
    
    // Try without authentication first (common for local Docker MongoDB)
    if (mongoUrl.includes('@')) {
      // Extract just the database part
      const dbMatch = mongoUrl.match(/\/\/([^/]+)\/([^?]+)/);
      if (dbMatch) {
        mongoUrl = `mongodb://localhost:27017/${dbMatch[2]}`;
      }
    }
    
    console.log('Connecting to Docker MongoDB...');
    console.log('MongoDB URL:', mongoUrl.replace(/\/\/.*@/, '//***@'));
    
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to Docker MongoDB\n');

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
        console.log(`   Full Key: ${testKey}`);
        console.log(`   Environment: ${foundKey.environment}`);
        console.log(`   Label: ${foundKey.label}`);
        console.log(`   Is Active: ${foundKey.isActive}`);
        console.log(`   Approval Status: ${foundKey.approvalStatus || 'N/A'}`);
        console.log(`   Usage Count: ${foundKey.usageCount}`);
        console.log(`   Staging Limit: ${foundKey.stagingUsageLimit || 'N/A'}`);
        console.log(`   Hashed Key (first 30): ${hashedKey.substring(0, 30)}...`);
        
        // Verify the key format
        if (testKey.startsWith('sk_')) {
          console.log(`   ✅ Key format: CORRECT (starts with sk_)`);
          if (testKey.startsWith('sk_staging_')) {
            console.log(`   ✅ Prefix: CORRECT (sk_staging_)`);
          } else if (testKey.startsWith('sk_live_')) {
            console.log(`   ✅ Prefix: CORRECT (sk_live_)`);
          }
        } else {
          console.log(`   ❌ Key format: INCORRECT (missing sk_ prefix)`);
        }
      } else {
        console.log(`\n❌ Key NOT found: ${testKey.substring(0, 30)}...`);
        console.log(`   Full Key: ${testKey}`);
        console.log(`   Hashed Key searched: ${hashedKey.substring(0, 30)}...`);
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
      
      // Expected prefix based on environment
      const expectedPrefix = key.environment === 'production' ? 'sk_live_' : 'sk_staging_';
      console.log(`   Expected prefix: ${expectedPrefix}`);
    }

    // Test key generation to verify it includes prefix
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
    console.log(`   Full Length: ${testStagingKey.rawKey.length} characters`);
    console.log(`   Has Prefix: ${testStagingKey.rawKey.startsWith('sk_staging_') ? '✅ YES' : '❌ NO'}`);
    if (!testStagingKey.rawKey.startsWith('sk_staging_')) {
      console.log(`   ❌ ERROR: Key missing sk_staging_ prefix!`);
    }
    
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
    console.log(`   Full Length: ${testProductionKey.rawKey.length} characters`);
    console.log(`   Has Prefix: ${testProductionKey.rawKey.startsWith('sk_live_') ? '✅ YES' : '❌ NO'}`);
    if (!testProductionKey.rawKey.startsWith('sk_live_')) {
      console.log(`   ❌ ERROR: Key missing sk_live_ prefix!`);
    }
    
    // Clean up test keys
    console.log('\n🧹 Cleaning up test keys...');
    await ApiKey.deleteMany({
      label: { $regex: /^TEST -/ }
    });
    console.log('✅ Test keys deleted');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from Docker MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyKeys();

