require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ApiKey } = require('../src/models');
const crypto = require('crypto');

// API keys to check
const keys = [
  'sk_staging_abf99d3c5dedab64a1d5a54fd2f7e80b22727901c1c7f220132cf8047b5c420a',
  'sk_live_5afcb5f9ba71cacddc64314bfcfe17ae191a971a6c349e0116794d5a02ac8e12',
];

async function checkKeys() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    for (const rawKey of keys) {
      const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
      const apiKey = await ApiKey.findOne({ hashedKey }).populate('tenant', 'name');
      
      if (!apiKey) {
        console.log(`❌ Key not found: ${rawKey.substring(0, 20)}...`);
        continue;
      }

      console.log(`\n📋 Key: ${rawKey.substring(0, 30)}...`);
      console.log(`   Environment: ${apiKey.environment}`);
      console.log(`   Label: ${apiKey.label || 'N/A'}`);
      console.log(`   Is Active: ${apiKey.isActive}`);
      console.log(`   Approval Status: ${apiKey.approvalStatus || 'N/A'}`);
      console.log(`   Is Production Ready: ${apiKey.isProductionReady}`);
      console.log(`   Staging Usage Limit: ${apiKey.stagingUsageLimit || 'N/A'}`);
      console.log(`   Current Usage Count: ${apiKey.usageCount || 0}`);
      console.log(`   Expires: ${apiKey.expires || 'Never'}`);
      console.log(`   Tenant: ${apiKey.tenant?.name || 'N/A'}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkKeys();

