/**
 * Investigation Script: API Key Creation Flow
 *
 * This script investigates:
 * 1. Current API key creation flow
 * 2. Who can create API keys
 * 3. Find all API keys created by non-owner/non-saby users
 */

const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ApiKey, User } = require('../src/models');
const logger = require('../src/config/logger');

/**
 * Check API key creation flow
 */
async function checkApiKeyCreationFlow() {
  console.log('\n' + '='.repeat(80));
  console.log('1️⃣  API KEY CREATION FLOW INVESTIGATION');
  console.log('='.repeat(80));

  console.log('\n📋 Current Flow:');
  console.log('  1. Route: POST /v1/api-keys');
  console.log(
    '     - Middleware: requireAccess({ permissions: ["apikey:create"], jwtOnly: true })'
  );
  console.log('     - Validates: User has "apikey:create" permission');
  console.log('     - ❌ Does NOT check if user is isOwner or isSaby');

  console.log('\n  2. Controller: apiKeyController.createApiKey');
  console.log('     - Calls: apiKeyService.createApiKey()');
  console.log('     - ❌ Does NOT check if user is isOwner or isSaby');

  console.log('\n  3. Service: apiKeyService.createApiKey');
  console.log('     - Checks: canCreateCategory(user, category)');
  console.log(
    '     - Only restricts certain categories (internal, external, partner, system) to SabyUser'
  );
  console.log('     - Allows web, api, mobile categories for ALL users');
  console.log(
    '     - ❌ Does NOT restrict general API key creation to isOwner/isSaby'
  );

  console.log('\n  4. Auto-generation: autoGenerateWebApiKeys');
  console.log('     - Called on user registration');
  console.log('     - Creates staging and production keys for ANY user');
  console.log('     - ❌ Does NOT check if user is isOwner or isSaby');
}

/**
 * Find all API keys created by non-owner/non-saby users
 */
async function findUnauthorizedApiKeys() {
  console.log('\n' + '='.repeat(80));
  console.log('2️⃣  FINDING UNAUTHORIZED API KEYS');
  console.log('='.repeat(80));

  try {
    // Get all API keys with createdBy populated
    const allApiKeys = await ApiKey.find({})
      .populate('createdBy', 'firstname lastname email isOwner isSaby isSuper')
      .lean();

    console.log(`\n📊 Total API keys in database: ${allApiKeys.length}`);

    // Find keys created by non-owner/non-saby users
    const unauthorizedKeys = [];
    const authorizedKeys = [];
    const keysWithNoCreator = [];

    for (const key of allApiKeys) {
      const creator = key.createdBy;

      if (!creator) {
        keysWithNoCreator.push(key);
        continue;
      }

      const isAuthorized = creator.isOwner === true || creator.isSaby === true;

      if (isAuthorized) {
        authorizedKeys.push({
          keyId: key._id.toString(),
          label: key.label,
          category: key.category,
          environment: key.environment,
          createdBy: `${creator.firstname} ${creator.lastname} (${creator.email})`,
          isOwner: creator.isOwner,
          isSaby: creator.isSaby,
          createdAt: key.createdAt,
        });
      } else {
        unauthorizedKeys.push({
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

    console.log(
      `\n✅ Authorized keys (created by isOwner/isSaby): ${authorizedKeys.length}`
    );
    console.log(
      `❌ Unauthorized keys (created by other users): ${unauthorizedKeys.length}`
    );
    console.log(`⚠️  Keys with no creator: ${keysWithNoCreator.length}`);

    if (unauthorizedKeys.length > 0) {
      console.log('\n📋 Unauthorized API Keys (to be removed):');
      console.log('='.repeat(80));

      unauthorizedKeys.slice(0, 20).forEach((key, idx) => {
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

      if (unauthorizedKeys.length > 20) {
        console.log(
          `\n   ... and ${unauthorizedKeys.length - 20} more unauthorized keys`
        );
      }

      // Group by creator
      const byCreator = {};
      unauthorizedKeys.forEach((key) => {
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

      console.log('\n📊 Unauthorized Keys by Creator:');
      console.log('='.repeat(80));
      Object.values(byCreator)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .forEach((creator, idx) => {
          console.log(`\n${idx + 1}. ${creator.name} (${creator.email})`);
          console.log(`   Total unauthorized keys: ${creator.count}`);
        });
    }

    if (keysWithNoCreator.length > 0) {
      console.log('\n⚠️  API Keys with No Creator:');
      keysWithNoCreator.slice(0, 10).forEach((key, idx) => {
        console.log(
          `   ${idx + 1}. ${key._id} - ${key.label} (created: ${key.createdAt})`
        );
      });
    }

    return {
      total: allApiKeys.length,
      authorized: authorizedKeys.length,
      unauthorized: unauthorizedKeys.length,
      noCreator: keysWithNoCreator.length,
      unauthorizedKeys,
      authorizedKeys,
      keysWithNoCreator,
    };
  } catch (error) {
    console.error('❌ Error finding unauthorized API keys:', error);
    throw error;
  }
}

/**
 * Check current access control
 */
async function checkAccessControl() {
  console.log('\n' + '='.repeat(80));
  console.log('3️⃣  CURRENT ACCESS CONTROL CHECK');
  console.log('='.repeat(80));

  console.log('\n📋 Route Protection:');
  console.log('  - POST /v1/api-keys');
  console.log(
    '  - Middleware: requireAccess({ permissions: ["apikey:create"], jwtOnly: true })'
  );
  console.log('  - ❌ Only checks permission, NOT role (isOwner/isSaby)');

  console.log('\n📋 Service Protection:');
  console.log('  - apiKeyService.createApiKey()');
  console.log('  - Checks: canCreateCategory(user, category)');
  console.log(
    '  - Only restricts: internal, external, partner, system categories'
  );
  console.log('  - Allows: web, api, mobile for ALL users');
  console.log('  - ❌ Does NOT restrict general creation to isOwner/isSaby');

  console.log('\n📋 Auto-generation:');
  console.log('  - autoGenerateWebApiKeys() called on user registration');
  console.log('  - ❌ Creates keys for ANY user, no role check');
}

/**
 * Main investigation
 */
async function investigate() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 API KEY CREATION INVESTIGATION');
    console.log('='.repeat(80));
    console.log(
      'Investigating: Who can create API keys and finding unauthorized keys'
    );
    console.log('='.repeat(80));

    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    await checkApiKeyCreationFlow();
    await checkAccessControl();
    const results = await findUnauthorizedApiKeys();

    console.log('\n' + '='.repeat(80));
    console.log('📊 INVESTIGATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`\nTotal API Keys: ${results.total}`);
    console.log(`✅ Authorized (isOwner/isSaby): ${results.authorized}`);
    console.log(`❌ Unauthorized (other users): ${results.unauthorized}`);
    console.log(`⚠️  No Creator: ${results.noCreator}`);

    if (results.unauthorized.length > 0) {
      console.log('\n⚠️  ACTION REQUIRED:');
      console.log(
        `   - ${results.unauthorized.length} API keys need to be removed`
      );
      console.log(
        '   - Update access control to restrict creation to isOwner/isSaby only'
      );
    }

    console.log('\n💡 Next Steps:');
    console.log(
      '   1. Add role check in createApiKey service (isOwner || isSaby)'
    );
    console.log('   2. Add role check in controller (isOwner || isSaby)');
    console.log('   3. Remove auto-generation or restrict to isOwner/isSaby');
    console.log('   4. Create script to remove unauthorized keys');
    console.log('\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Fatal error during investigation:', error);
    console.error('   Stack:', error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run investigation
investigate();
