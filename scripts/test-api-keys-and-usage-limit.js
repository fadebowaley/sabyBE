/**
 * Test Script: API Keys Database Operations and Usage Limit Testing
 *
 * This script:
 * 1. Lists all API keys for user: josaby@saby.ai with complete data (including tenantId)
 * 2. Consumes staging API key usage to 99 (leaving only 1 opportunity)
 * 3. Tests if the usage limit works correctly
 *
 * Usage:
 *   cd sabyBackend
 *   node scripts/test-api-keys-and-usage-limit.js
 *
 * Requirements:
 *   - MongoDB must be running (Docker or local)
 *   - Backend server should be running on port 4000
 *   - User josaby@saby.ai must exist with password @judah_saby1
 */

// Note: env.docker will be loaded in connectDatabase() after getting original config
const mongoose = require('mongoose');
const config = require('../src/config/config');
const { ApiKey, User } = require('../src/models');
const axios = require('axios');
const crypto = require('crypto');

// Test credentials
const TEST_EMAIL = 'josaby@saby.ai';
const TEST_PASSWORD = '@judah_saby1';

// Detect if running inside Docker
// Check if MONGODB_URL uses 'mongodb' hostname (Docker service name)
const isInsideDocker =
  process.env.MONGODB_URL &&
  (process.env.MONGODB_URL.includes('@mongodb:') ||
    process.env.MONGODB_URL.includes('mongodb://mongodb:'));

// Set API base URL - will be set properly in connectDatabase after Docker detection
// Default to 127.0.0.1 to avoid IPv6 issues
let API_BASE_URL =
  process.env.SUBMISSION_API_BASE_URL || 'http://127.0.0.1:4000/v1';

/**
 * Connect to MongoDB
 * Handles both Docker and host machine execution
 */
async function connectDatabase() {
  try {
    // Get MongoDB URL from config (which uses env vars) BEFORE loading env.docker
    const originalMongoUrl = config.mongoose.url;

    // Now load env.docker (this may overwrite MONGODB_URL)
    require('dotenv').config({
      path: require('path').join(__dirname, '../env.docker'),
    });

    let mongoUrl = process.env.MONGODB_URL || originalMongoUrl;

    // Detect if running inside Docker by checking if we're in a container
    // Check for Docker-specific files or environment
    const isInsideDocker =
      require('fs').existsSync('/.dockerenv') ||
      (require('fs').existsSync('/proc/self/cgroup') &&
        require('fs')
          .readFileSync('/proc/self/cgroup', 'utf8')
          .includes('docker'));

    if (!isInsideDocker) {
      // Running from host machine - replace 'mongodb' with 'localhost' and remove replicaSet
      if (mongoUrl && mongoUrl.includes('@mongodb:')) {
        mongoUrl = mongoUrl.replace('@mongodb:', '@localhost:');
        // Remove replicaSet parameter for host connections (causes issues)
        mongoUrl = mongoUrl.replace(/[?&]replicaSet=[^&]*/, '');
        // Clean up any double ? or trailing &
        mongoUrl = mongoUrl.replace(/\?&/, '?').replace(/&$/, '');
        if (mongoUrl.endsWith('?')) {
          mongoUrl = mongoUrl.slice(0, -1);
        }
        console.log(
          '🔄 Running from host: Adjusted MongoDB URL (mongodb → localhost, removed replicaSet)'
        );
      } else if (mongoUrl && mongoUrl.includes('mongodb://mongodb:')) {
        mongoUrl = mongoUrl.replace(
          'mongodb://mongodb:',
          'mongodb://localhost:'
        );
        mongoUrl = mongoUrl.replace(/[?&]replicaSet=[^&]*/, '');
        console.log('🔄 Running from host: Adjusted MongoDB URL');
      }
    } else {
      // Inside Docker - keep 'mongodb' hostname, but remove replicaSet if it causes issues
      console.log('🐳 Running inside Docker: Using Docker network MongoDB URL');
      // Remove replicaSet parameter as it may cause connection issues
      if (mongoUrl && mongoUrl.includes('replicaSet=')) {
        mongoUrl = mongoUrl.replace(/[?&]replicaSet=[^&]*/, '');
        mongoUrl = mongoUrl.replace(/\?&/, '?').replace(/&$/, '');
        if (mongoUrl.endsWith('?')) {
          mongoUrl = mongoUrl.slice(0, -1);
        }
        console.log('   Removed replicaSet parameter for connection');
      }
    }

    // Update API_BASE_URL based on Docker detection
    if (!process.env.SUBMISSION_API_BASE_URL) {
      API_BASE_URL = isInsideDocker
        ? 'http://127.0.0.1:4000/v1' // Use IPv4 localhost inside container
        : 'http://127.0.0.1:4000/v1'; // Also use IPv4 from host to avoid IPv6 issues
      console.log(`   API Base URL: ${API_BASE_URL}`);
    }

    console.log(`🔌 Connecting to MongoDB...`);
    console.log(`   Database: ${mongoUrl.split('/').pop().split('?')[0]}`);
    await mongoose.connect(mongoUrl, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    console.error('   Make sure MongoDB is running and accessible');
    const finalMongoUrl = process.env.MONGODB_URL || config.mongoose.url || '';
    if (!finalMongoUrl.includes('localhost')) {
      console.error(
        '   If running from host, MongoDB should be accessible on localhost:27017'
      );
    }
    throw error;
  }
}

/**
 * Login and get JWT token
 */
async function login() {
  try {
    console.log(`🔐 Logging in as ${TEST_EMAIL}...`);
    // Ensure we use 127.0.0.1 instead of localhost to avoid IPv6 issues
    const loginUrl = API_BASE_URL.replace('localhost', '127.0.0.1');
    console.log(`   API URL: ${loginUrl}`);

    const response = await axios.post(`${loginUrl}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (response.data && response.data.tokens) {
      const accessToken = response.data.tokens.access.token;
      console.log('✅ Login successful\n');
      return accessToken;
    }
    throw new Error('No token in response');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * List all API keys for the user with complete data
 */
async function listAllApiKeys(userId, tenantId, token) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  TASK 1: List All API Keys for User                           ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    // Get API keys from database directly
    const apiKeys = await ApiKey.find({
      $or: [
        { createdBy: userId },
        { requestedBy: userId },
        { tenant: tenantId },
      ],
    })
      .populate('createdBy', 'email firstname lastname')
      .populate('requestedBy', 'email firstname lastname')
      .populate('approvedBy', 'email firstname lastname')
      .sort({ createdAt: -1 });

    console.log(`📊 Found ${apiKeys.length} API key(s) for user\n`);

    if (apiKeys.length === 0) {
      console.log('⚠️  No API keys found. Creating a test staging key...');
      // We'll create one later if needed
      return [];
    }

    // Display all API keys with complete data
    apiKeys.forEach((key, index) => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📋 API Key #${index + 1}`);
      console.log(`${'='.repeat(70)}`);
      console.log(`   ID: ${key._id}`);
      console.log(`   Label: ${key.label || 'N/A'}`);
      console.log(`   Environment: ${key.environment || 'N/A'}`);
      console.log(`   Category: ${key.category || 'N/A'}`);
      console.log(`   Scope: ${key.scope || 'N/A'} (deprecated)`);
      console.log(`   Permissions: ${JSON.stringify(key.permissions || [])}`);
      console.log(`   Rate Limit: ${key.rateLimit || 'N/A'} requests/minute`);
      console.log(`   Is Active: ${key.isActive}`);
      console.log(`   Approval Status: ${key.approvalStatus || 'N/A'}`);
      console.log(`   Is Production Ready: ${key.isProductionReady || false}`);
      console.log(`   Staging Usage Limit: ${key.stagingUsageLimit || 'N/A'}`);
      console.log(`   Current Usage Count: ${key.usageCount || 0}`);
      console.log(`   Last Used At: ${key.lastUsedAt || 'Never'}`);
      console.log(`   Expires: ${key.expires || 'Never'}`);
      console.log(`   Created At: ${key.createdAt || 'N/A'}`);
      console.log(`   Updated At: ${key.updatedAt || 'N/A'}`);
      console.log(`\n   🔑 TENANT INFORMATION:`);
      console.log(`      Tenant ID: ${key.tenant || '❌ NOT SET'}`);
      console.log(`      Tenant Type: ${typeof key.tenant}`);
      console.log(`\n   👤 USER INFORMATION:`);
      console.log(
        `      Created By: ${key.createdBy?.email || 'N/A'} (${
          key.createdBy?._id || 'N/A'
        })`
      );
      console.log(
        `      Requested By: ${key.requestedBy?.email || 'N/A'} (${
          key.requestedBy?._id || 'N/A'
        })`
      );
      console.log(`      Approved By: ${key.approvedBy?.email || 'N/A'}`);
      console.log(`\n   📝 METADATA:`);
      console.log(`      IP Address: ${key.metadata?.ipAddress || 'N/A'}`);
      console.log(`      User Agent: ${key.metadata?.userAgent || 'N/A'}`);
      console.log(`\n   🔒 SECURITY:`);
      console.log(
        `      Hashed Key: ${key.hashedKey?.substring(0, 20)}... (SHA-256)`
      );
    });

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ Total API Keys: ${apiKeys.length}`);
    console.log(`${'='.repeat(70)}\n`);

    return apiKeys;
  } catch (error) {
    console.error('❌ Error listing API keys:', error);
    throw error;
  }
}

/**
 * Get API keys via API endpoint
 */
async function getApiKeysViaAPI(token) {
  try {
    console.log('📡 Fetching API keys via API endpoint...');
    const response = await axios.get(`${API_BASE_URL}/api-keys`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        limit: 100,
      },
    });

    if (response.data && response.data.results) {
      console.log(
        `✅ Retrieved ${response.data.results.length} API key(s) via API\n`
      );
      return response.data.results;
    }
    return [];
  } catch (error) {
    console.error(
      '❌ Error fetching API keys via API:',
      error.response?.data || error.message
    );
    return [];
  }
}

/**
 * Find a staging API key for testing
 */
function findStagingKey(apiKeys) {
  const stagingKeys = apiKeys.filter(
    (key) => key.environment === 'staging' && key.isActive
  );

  if (stagingKeys.length === 0) {
    console.log('⚠️  No active staging keys found');
    return null;
  }

  // Prefer keys with lower usage count
  stagingKeys.sort((a, b) => (a.usageCount || 0) - (b.usageCount || 0));
  return stagingKeys[0];
}

/**
 * Make API call using API key
 */
async function makeApiCallWithKey(apiKey, token) {
  try {
    // We need the raw key, but we only have the hashed key
    // For testing, we'll use the API endpoint that accepts API keys
    // First, let's try to get the raw key from the API if possible

    // For now, we'll simulate API calls by directly calling verifyApiKey
    // But we need the raw key. Let's check if we can get it from the API

    // Actually, we need to make real HTTP requests with the API key
    // But we don't have the raw key stored. We need to either:
    // 1. Get it from the API response when creating
    // 2. Or use a test endpoint that accepts API key

    // For this test, we'll use the verifyApiKey service directly
    const { apiKeyService } = require('../src/services');

    // But we still need the raw key. Let's check the database for any stored raw keys
    // or we can create a new staging key for testing

    console.log(
      '⚠️  Cannot make API calls without raw key. Creating a test staging key...'
    );
    return null;
  } catch (error) {
    console.error('❌ Error making API call:', error.message);
    throw error;
  }
}

/**
 * Create a test staging API key
 */
async function createTestStagingKey(userId, tenantId, token) {
  try {
    console.log('\n📝 Creating test staging API key...');
    const response = await axios.post(
      `${API_BASE_URL}/api-keys`,
      {
        label: 'Test Staging Key - Usage Limit Test',
        environment: 'staging',
        category: 'web',
        permissions: ['read'],
        rateLimit: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.data && response.data.apiKey && response.data.rawKey) {
      console.log('✅ Test staging key created');
      console.log(`   Raw Key: ${response.data.rawKey.substring(0, 30)}...`);
      console.log(
        `   Key ID: ${response.data.apiKey.id || response.data.apiKey._id}`
      );
      return {
        rawKey: response.data.rawKey,
        apiKey: response.data.apiKey,
      };
    }
    throw new Error('Failed to create test key');
  } catch (error) {
    console.error(
      '❌ Error creating test key:',
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Consume staging API key usage to 99
 * Uses verifyApiKey service directly for efficient testing
 */
async function consumeStagingUsage(rawKey, targetUsage = 99) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  TASK 2: Consume Staging API Key Usage to 99                  ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    const { apiKeyService } = require('../src/services');

    // Get current usage
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    let apiKey = await ApiKey.findOne({ hashedKey });

    if (!apiKey) {
      throw new Error('API key not found in database');
    }

    const currentUsage = apiKey.usageCount || 0;
    console.log(`📊 Current usage: ${currentUsage}`);
    console.log(`🎯 Target usage: ${targetUsage}`);
    console.log(`📈 Need to make: ${targetUsage - currentUsage} API calls\n`);

    if (currentUsage >= targetUsage) {
      console.log(`✅ Usage already at or above target (${currentUsage})`);
      return apiKey;
    }

    // Make API calls to consume usage
    // We'll use the verifyApiKey service directly for efficiency
    const callsNeeded = targetUsage - currentUsage;
    console.log(
      `🔄 Making ${callsNeeded} API calls using verifyApiKey service...\n`
    );

    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i <= callsNeeded; i++) {
      try {
        // Use verifyApiKey service directly - this increments usageCount
        await apiKeyService.verifyApiKey(rawKey);
        successCount++;

        if (i % 10 === 0 || i === callsNeeded) {
          // Refresh usage count from DB
          apiKey = await ApiKey.findOne({ hashedKey });
          console.log(
            `   ✅ Call ${i}/${callsNeeded} - Usage: ${apiKey.usageCount || 0}`
          );
        }
      } catch (error) {
        failCount++;
        // Check if it's a usage limit error (expected at limit)
        if (error.message && error.message.includes('usage limit reached')) {
          console.log(
            `   ⚠️  Call ${i}/${callsNeeded} - Usage limit reached (expected)`
          );
          break; // Stop if limit reached
        } else {
          console.log(
            `   ❌ Call ${i}/${callsNeeded} - Error: ${error.message}`
          );
        }
      }

      // Small delay to avoid overwhelming the system
      if (i < callsNeeded && i % 50 !== 0) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    // Get final usage
    apiKey = await ApiKey.findOne({ hashedKey });
    const finalUsage = apiKey.usageCount || 0;

    console.log(`\n📊 Usage Summary:`);
    console.log(`   Successful calls: ${successCount}`);
    console.log(`   Failed calls: ${failCount}`);
    console.log(`   Final usage count: ${finalUsage}`);
    console.log(
      `   Remaining calls: ${(apiKey.stagingUsageLimit || 100) - finalUsage}`
    );

    return apiKey;
  } catch (error) {
    console.error('❌ Error consuming staging usage:', error);
    throw error;
  }
}

/**
 * Test the usage limit (should block the 100th call)
 */
async function testUsageLimit(rawKey) {
  console.log(
    '\n╔════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║  TASK 3: Test Usage Limit (100th call should be blocked)      ║'
  );
  console.log(
    '╚════════════════════════════════════════════════════════════════╝\n'
  );

  try {
    // Get current usage
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    let apiKey = await ApiKey.findOne({ hashedKey });

    const currentUsage = apiKey.usageCount || 0;
    const limit = apiKey.stagingUsageLimit || 100;
    const remaining = limit - currentUsage;

    console.log(`📊 Current Status:`);
    console.log(`   Usage Count: ${currentUsage}`);
    console.log(`   Limit: ${limit}`);
    console.log(`   Remaining: ${remaining}\n`);

    if (remaining > 1) {
      console.log(
        `⚠️  Usage is not at 99. Current: ${currentUsage}, Remaining: ${remaining}`
      );
      console.log(`   Making ${remaining - 1} more calls to reach 99...\n`);
      apiKey = await consumeStagingUsage(rawKey, limit - 1);
    }

    // Now make the call that should be blocked (the 100th call)
    console.log(
      `\n🧪 Testing the limit - Making call #${limit} (should be blocked)...\n`
    );

    try {
      // Use verifyApiKey service directly - this should be blocked
      const { apiKeyService } = require('../src/services');
      await apiKeyService.verifyApiKey(rawKey);

      // If we get here, the limit check failed
      apiKey = await ApiKey.findOne({ hashedKey });
      const newUsage = apiKey.usageCount || 0;

      console.log(
        '❌ FAILED: Request was allowed when it should have been blocked!'
      );
      console.log(`   Usage count after call: ${newUsage}`);
      console.log(`   ⚠️  The limit check may not be working correctly`);
    } catch (error) {
      // Refresh usage to verify it wasn't incremented
      apiKey = await ApiKey.findOne({ hashedKey });
      const newUsage = apiKey.usageCount || 0;

      if (error.message && error.message.includes('usage limit reached')) {
        console.log('✅ SUCCESS: Usage limit correctly blocked the request!');
        console.log(`   Error Message: ${error.message}`);
        console.log(
          `   Usage count after blocked call: ${newUsage} (should still be ${
            limit - 1
          })`
        );

        if (newUsage === limit - 1) {
          console.log(`   ✅ Usage count correctly NOT incremented`);
        } else {
          console.log(
            `   ⚠️  Usage count is ${newUsage}, expected ${limit - 1}`
          );
        }
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
        console.log(`   Usage count: ${newUsage}`);
      }
    }

    // Verify final state
    apiKey = await ApiKey.findOne({ hashedKey });
    console.log(`\n📊 Final State:`);
    console.log(`   Usage Count: ${apiKey.usageCount || 0}`);
    console.log(`   Limit: ${apiKey.stagingUsageLimit || 100}`);
    console.log(
      `   Remaining: ${
        (apiKey.stagingUsageLimit || 100) - (apiKey.usageCount || 0)
      }`
    );
  } catch (error) {
    console.error('❌ Error testing usage limit:', error);
    throw error;
  }
}

/**
 * Main test function
 */
async function main() {
  try {
    // Connect to database
    await connectDatabase();

    // Find user
    console.log(`\n👤 Finding user: ${TEST_EMAIL}...`);
    const user = await User.findOne({ email: TEST_EMAIL });
    if (!user) {
      throw new Error(`User not found: ${TEST_EMAIL}`);
    }
    console.log(`✅ User found: ${user.firstname} ${user.lastname}`);
    console.log(`   User ID: ${user._id}`);
    console.log(`   Tenant ID: ${user.tenant || user.tenantId || 'N/A'}\n`);

    const userId = user._id;
    const tenantId = user.tenant || user.tenantId;

    // Login to get JWT token (optional - we can work with DB directly)
    let token = null;
    try {
      token = await login();
    } catch (error) {
      console.log(
        '⚠️  Login via API failed, continuing with database operations only'
      );
      console.log(`   Error: ${error.message}`);
      console.log(
        '   Note: API key creation will be skipped, but we can still test existing keys\n'
      );
    }

    // Task 1: List all API keys with complete data
    const apiKeys = await listAllApiKeys(userId, tenantId, token);

    // Also get via API
    const apiKeysViaAPI = await getApiKeysViaAPI(token);

    // Task 2 & 3: Test staging usage limit
    if (!token) {
      console.log(
        '\n⚠️  Skipping usage limit testing - requires API access for key creation'
      );
      console.log('   To test usage limits, ensure backend API is accessible');
    } else {
      let stagingKey = findStagingKey(apiKeys);
      let rawKey = null;

      if (!stagingKey) {
        console.log('\n📝 No staging key found. Creating one for testing...');
        const testKey = await createTestStagingKey(userId, tenantId, token);
        rawKey = testKey.rawKey;
        stagingKey = testKey.apiKey;
      } else {
        console.log(`\n📋 Using existing staging key: ${stagingKey.label}`);
        console.log(`   Current usage: ${stagingKey.usageCount || 0}`);

        // We need the raw key to make API calls
        // Since we don't store raw keys, we'll need to create a new one for testing
        console.log('\n⚠️  Cannot retrieve raw key from database (security).');
        console.log(
          '   Creating a new test staging key for usage limit testing...'
        );
        const testKey = await createTestStagingKey(userId, tenantId, token);
        rawKey = testKey.rawKey;
        stagingKey = testKey.apiKey;
      }

      // Consume usage to 99
      await consumeStagingUsage(rawKey, 99);

      // Test the limit
      await testUsageLimit(rawKey);
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('\n✅ All tests completed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

// Run the test
main();
