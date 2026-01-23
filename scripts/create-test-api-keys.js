/**
 * Script to create new test API keys for approval and rate limiting testing
 * Usage: node scripts/create-test-api-keys.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ApiKey } = require('../src/models');
const { apiKeyApprovalService } = require('../src/services');

async function createTestKeys() {
  try {
    // Connect to MongoDB using config
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Find test users
    const user1Email = 'abioye.ayorinde.ologuneru@sotsm.org';
    const user2Email = 'ajiboye.oluwaseun.s.enugu@sotsm.org';

    const User = mongoose.model('User');
    const user1 = await User.findOne({ email: user1Email });
    const user2 = await User.findOne({ email: user2Email });

    if (!user1 || !user2) {
      console.error(
        '❌ Users not found. Please ensure users exist in database.'
      );
      process.exit(1);
    }

    console.log(`Found User 1: ${user1.email} (ID: ${user1._id})`);
    console.log(`Found User 2: ${user2.email} (ID: ${user2._id})\n`);

    // Use first user's tenant
    const tenantId = user1.tenantId || user1.tenant;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('Creating Test API Keys');
    console.log(
      '═══════════════════════════════════════════════════════════\n'
    );

    // 1. Create Staging Key (with usage limit)
    console.log('1️⃣  Creating STAGING API Key...');
    const stagingKeyResult = await ApiKey.generateKey({
      tenantId,
      label: 'Test Staging Key (Rate Limit Test)',
      environment: 'staging',
      category: 'web',
      permissions: ['read', 'write'],
      rateLimit: 1000,
      createdBy: user1._id,
    });

    // Ensure stagingUsageLimit is set
    stagingKeyResult.keyDoc.stagingUsageLimit = 100;
    stagingKeyResult.keyDoc.usageCount = 0; // Reset usage count
    await stagingKeyResult.keyDoc.save();

    console.log('   ✅ Staging key created');
    console.log(`   📝 Label: ${stagingKeyResult.keyDoc.label}`);
    console.log(`   🔑 Key: ${stagingKeyResult.rawKey}`);
    console.log(
      `   📊 Usage Limit: ${stagingKeyResult.keyDoc.stagingUsageLimit}`
    );
    console.log(`   📈 Current Usage: ${stagingKeyResult.keyDoc.usageCount}`);
    console.log(`   ✅ Status: ${stagingKeyResult.keyDoc.approvalStatus}`);
    console.log(`   ✅ Active: ${stagingKeyResult.keyDoc.isActive}\n`);

    // 2. Create Production Key (pending approval)
    console.log('2️⃣  Creating PRODUCTION API Key (Pending Approval)...');
    const productionKeyResult = await ApiKey.generateKey({
      tenantId,
      label: 'Test Production Key (Approval Test)',
      environment: 'production',
      category: 'web',
      permissions: ['read', 'write'],
      rateLimit: 500,
      createdBy: user1._id,
    });

    // Create approval request
    await apiKeyApprovalService.createApprovalRequest(
      productionKeyResult.keyDoc,
      user1._id,
      tenantId
    );

    // Reload to get updated status
    const productionKey = await ApiKey.findById(productionKeyResult.keyDoc._id);

    console.log('   ✅ Production key created');
    console.log(`   📝 Label: ${productionKey.label}`);
    console.log(`   🔑 Key: ${productionKeyResult.rawKey}`);
    console.log(`   📊 Approval Status: ${productionKey.approvalStatus}`);
    console.log(`   📈 Is Active: ${productionKey.isActive}`);
    console.log(
      `   🚀 Is Production Ready: ${productionKey.isProductionReady}\n`
    );

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TEST KEYS SUMMARY');
    console.log(
      '═══════════════════════════════════════════════════════════\n'
    );

    console.log('🔵 STAGING KEY (Rate Limit: 100 calls)');
    console.log(`   Key: ${stagingKeyResult.rawKey}`);
    console.log(`   User 1: ${user1Email}`);
    console.log(`   User 2: ${user2Email}`);
    console.log(`   Password: H@lopa55word\n`);

    console.log('🔴 PRODUCTION KEY (Pending Approval)');
    console.log(`   Key: ${productionKeyResult.rawKey}`);
    console.log(`   User 1: ${user1Email}`);
    console.log(`   User 2: ${user2Email}`);
    console.log(`   Password: H@lopa55word`);
    console.log(`   ⚠️  This key should be BLOCKED until approved\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Keys created successfully!');
    console.log(
      '═══════════════════════════════════════════════════════════\n'
    );

    console.log('📝 Next Steps:');
    console.log(
      '   1. Use staging key to test rate limiting (should allow 100 calls)'
    );
    console.log(
      '   2. Use production key to test approval (should be blocked)'
    );
    console.log(
      '   3. Approve production key via admin panel to test approved state\n'
    );

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating test keys:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
createTestKeys();
