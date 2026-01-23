require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ApiKey, User } = require('../src/models');
const crypto = require('crypto');

// Specific API keys to create in Docker MongoDB
const keysToCreate = [
  {
    rawKey: 'sk_staging_abf99d3c5dedab64a1d5a54fd2f7e80b22727901c1c7f220132cf8047b5c420a',
    environment: 'staging',
    userEmail: 'josaby@saby.ai',
    label: 'Test Staging Key',
    stagingUsageLimit: 100,
    usageCount: 0,
  },
  {
    rawKey: 'sk_live_5afcb5f9ba71cacddc64314bfcfe17ae191a971a6c349e0116794d5a02ac8e12',
    environment: 'production',
    userEmail: 'josaby@saby.ai',
    label: 'Test Production Key',
    approvalStatus: 'pending',
    isProductionReady: false,
    usageCount: 0,
  },
];

async function createKeys() {
  try {
    console.log('Connecting to MongoDB:', config.mongoose.url.replace(/\/\/.*@/, '//***@'));
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    for (const keyData of keysToCreate) {
      // Find user by email
      const user = await User.findOne({ email: keyData.userEmail }).lean();
      if (!user) {
        console.log(`❌ User not found: ${keyData.userEmail}`);
        continue;
      }

      // Hash the raw key
      const hashedKey = crypto.createHash('sha256').update(keyData.rawKey).digest('hex');

      // Check if key already exists
      let apiKey = await ApiKey.findOne({ hashedKey });
      
      if (apiKey) {
        console.log(`\n📋 Updating existing key: ${keyData.rawKey.substring(0, 30)}...`);
        
        apiKey.environment = keyData.environment;
        apiKey.label = keyData.label;
        apiKey.isActive = true;
        apiKey.usageCount = keyData.usageCount || 0;
        
        if (keyData.environment === 'staging') {
          apiKey.stagingUsageLimit = keyData.stagingUsageLimit || 100;
        }
        
        if (keyData.environment === 'production') {
          apiKey.approvalStatus = keyData.approvalStatus || 'pending';
          apiKey.isProductionReady = keyData.isProductionReady !== undefined ? keyData.isProductionReady : false;
        }
        
        await apiKey.save();
        console.log(`   ✅ Updated key settings`);
      } else {
        console.log(`\n📋 Creating new key: ${keyData.rawKey.substring(0, 30)}...`);
        
        apiKey = new ApiKey({
          hashedKey,
          label: keyData.label,
          environment: keyData.environment,
          tenant: user.tenant || user._id.toString(),
          permissions: ['read', 'write'],
          category: 'web',
          scope: 'api',
          rateLimit: 1000,
          isActive: true,
          usageCount: keyData.usageCount || 0,
          createdBy: user._id,
          requestedBy: user._id,
        });

        if (keyData.environment === 'staging') {
          apiKey.stagingUsageLimit = keyData.stagingUsageLimit || 100;
        }

        if (keyData.environment === 'production') {
          apiKey.approvalStatus = keyData.approvalStatus || 'pending';
          apiKey.isProductionReady = keyData.isProductionReady !== undefined ? keyData.isProductionReady : false;
        }

        await apiKey.save();
        console.log(`   ✅ Created key`);
      }

      console.log(`   Environment: ${apiKey.environment}`);
      console.log(`   Approval Status: ${apiKey.approvalStatus || 'N/A'}`);
      console.log(`   Is Production Ready: ${apiKey.isProductionReady}`);
      console.log(`   Staging Usage Limit: ${apiKey.stagingUsageLimit || 'N/A'}`);
      console.log(`   Usage Count: ${apiKey.usageCount}`);
      console.log(`   Hashed Key: ${hashedKey.substring(0, 20)}...`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createKeys();

