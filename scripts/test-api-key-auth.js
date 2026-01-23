#!/usr/bin/env node

/**
 * API Key Authentication Test Script
 * 
 * This script demonstrates how the new API key authentication works:
 * 1. Login with JWT to get authentication token
 * 2. Create an API key (requires JWT)
 * 3. Test endpoints with API key authentication
 * 4. Test endpoints with JWT authentication (fallback)
 * 
 * Usage:
 *   node scripts/test-api-key-auth.js
 * 
 * Environment Variables:
 *   BASE_URL - API base URL (default: http://localhost:3000/v1)
 *   TEST_EMAIL - Test user email (default: josaby@saby.ai)
 *   TEST_PASSWORD - Test user password (default: @judah_saby1)
 */

const axios = require('axios');

// Configuration
// Note: Backend API defaults to port 4000 (check your .env file for PORT variable)
const BASE_URL = process.env.BASE_URL || process.env.API_URL || 'http://localhost:4000/v1';
const TEST_EMAIL = process.env.TEST_EMAIL || 'josaby@saby.ai';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '@judah_saby1';

// Test state
let jwtToken = null;
let apiKey = null;
let apiKeyId = null;

/**
 * Print formatted output
 */
function log(message, type = 'info') {
  const prefixes = {
    info: 'ℹ️  ',
    success: '✅ ',
    error: '❌ ',
    warning: '⚠️  ',
    step: '\n' + '='.repeat(60) + '\n',
  };
  
  if (type === 'step') {
    console.log(prefixes.step + message + '\n' + '='.repeat(60));
  } else {
    console.log(prefixes[type] + message);
  }
}

/**
 * Make API request
 */
async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      validateStatus: () => true, // Don't throw on any status code
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    
    // Check if response is HTML (means wrong URL)
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE html>')) {
      return {
        success: false,
        error: `Received HTML instead of JSON. Check BASE_URL. Current: ${BASE_URL}${endpoint}`,
        status: response.status,
        html: true,
      };
    }
    
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500,
    };
  }
}

/**
 * Step 1: Login with JWT
 */
async function step1_login() {
  log('STEP 1: Login with JWT to get authentication token', 'step');
  
  log(`Attempting to login with email: ${TEST_EMAIL}`, 'info');
  
  const result = await makeRequest('POST', '/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (!result.success) {
    log(`❌ Login failed: ${JSON.stringify(result.error)}`, 'error');
    
    if (result.html) {
      log('\n⚠️  Received HTML response instead of JSON!', 'warning');
      log('💡 This means BASE_URL is pointing to the frontend, not the backend API.', 'warning');
      log('💡 Make sure your backend server is running and check the correct port.', 'warning');
      log(`💡 Current BASE_URL: ${BASE_URL}`, 'warning');
      log('💡 Try: BASE_URL=http://localhost:4000/v1 node scripts/test-api-key-auth.js', 'warning');
      log('💡 Or check your .env file for the PORT variable (default is 4000)', 'warning');
    } else {
      log('\n💡 Make sure you have a test user account or update TEST_EMAIL and TEST_PASSWORD', 'warning');
      log(`Response status: ${result.status}`, 'info');
    }
    return false;
  }

  // Handle different response structures
  if (result.data.tokens?.access?.token) {
    jwtToken = result.data.tokens.access.token;
  } else if (result.data.token) {
    jwtToken = result.data.token;
  } else if (result.data.accessToken) {
    jwtToken = result.data.accessToken;
  } else {
    log(`❌ Could not find JWT token in response: ${JSON.stringify(result.data, null, 2)}`, 'error');
    return false;
  }

  log(`✅ Login successful! JWT token obtained`, 'success');
  log(`Token (first 20 chars): ${jwtToken.substring(0, 20)}...`, 'info');
  
  return true;
}

/**
 * Step 2: Create API Key
 */
async function step2_createApiKey() {
  log('\nSTEP 2: Create API Key (requires JWT authentication)', 'step');
  
  log('Creating API key for testing...', 'info');
  
  const result = await makeRequest(
    'POST',
    '/api-keys',
    {
      label: 'Test API Key - Automated Testing',
      environment: 'development', // Use development to avoid approval
      scope: 'api',
      permissions: [
        'node:create',
        'node:read',
        'node:update',
        'node:delete',
        'inmail:create',
        'inmail:read',
        'inmail:update',
        'inmail:delete',
        'user:create',
        'user:read',
        'user:update',
      ],
      rateLimit: 1000,
    },
    {
      Authorization: `Bearer ${jwtToken}`,
    }
  );

  if (!result.success) {
    log(`❌ API key creation failed: ${JSON.stringify(result.error)}`, 'error');
    log('\n💡 Make sure your user has "create:apikeys" permission', 'warning');
    return false;
  }

  apiKey = result.data.rawKey;
  apiKeyId = result.data.apiKey.id;
  
  log(`✅ API key created successfully!`, 'success');
  log(`API Key ID: ${apiKeyId}`, 'info');
  log(`API Key (first 30 chars): ${apiKey.substring(0, 30)}...`, 'info');
  log(`\n⚠️  IMPORTANT: Save this API key! It won't be shown again.`, 'warning');
  
  return true;
}

/**
 * Step 3: Test Login with API Key (Optional)
 */
async function step3_testLoginWithApiKey() {
  log('\nSTEP 3: Test Login Endpoint with Optional API Key', 'step');
  
  log('Testing POST /auth/login with API key (optional)...', 'info');
  
  // Test with API key
  const resultWithKey = await makeRequest(
    'POST',
    '/auth/login',
    {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    },
    {
      'x-api-key': apiKey,
    }
  );

  if (resultWithKey.success) {
    log(`✅ Login with API key successful!`, 'success');
    log(`Response: ${JSON.stringify(resultWithKey.data, null, 2)}`, 'info');
  } else {
    log(`❌ Login with API key failed: ${JSON.stringify(resultWithKey.error)}`, 'error');
  }

  // Test without API key (should still work)
  log('\nTesting POST /auth/login without API key (normal login)...', 'info');
  
  const resultWithoutKey = await makeRequest('POST', '/auth/login', {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (resultWithoutKey.success) {
    log(`✅ Login without API key successful!`, 'success');
  } else {
    log(`❌ Login without API key failed: ${JSON.stringify(resultWithoutKey.error)}`, 'error');
  }

  return resultWithKey.success || resultWithoutKey.success;
}

/**
 * Step 4: Test Node Endpoints
 */
async function step4_testNodeEndpoints() {
  log('\nSTEP 4: Test Node Endpoints with API Key', 'step');
  
  const testNode = {
    name: 'Test Node - API Key Auth',
    type: 'test',
  };

  // Test POST /node with API key
  log('Testing POST /node (create node) with API key...', 'info');
  const createResult = await makeRequest(
    'POST',
    '/node',
    testNode,
    {
      'x-api-key': apiKey,
    }
  );

  if (createResult.success) {
    log(`✅ Create node with API key successful!`, 'success');
    const nodeId = createResult.data.id || createResult.data._id;
    
    // Test GET /node with API key
    log('\nTesting GET /node (list nodes) with API key...', 'info');
    const listResult = await makeRequest('GET', '/node', null, {
      'x-api-key': apiKey,
    });

    if (listResult.success) {
      log(`✅ List nodes with API key successful!`, 'success');
      log(`Found ${listResult.data.results?.length || 0} nodes`, 'info');
    } else {
      log(`❌ List nodes failed: ${JSON.stringify(listResult.error)}`, 'error');
    }

    // Test GET /node/:nodeId with API key
    if (nodeId) {
      log(`\nTesting GET /node/${nodeId} (get node) with API key...`, 'info');
      const getResult = await makeRequest(`GET`, `/node/${nodeId}`, null, {
        'x-api-key': apiKey,
      });

      if (getResult.success) {
        log(`✅ Get node with API key successful!`, 'success');
      } else {
        log(`❌ Get node failed: ${JSON.stringify(getResult.error)}`, 'error');
      }
    }

    // Test with JWT (fallback)
    log('\nTesting GET /node with JWT (fallback)...', 'info');
    const jwtResult = await makeRequest('GET', '/node', null, {
      Authorization: `Bearer ${jwtToken}`,
    });

    if (jwtResult.success) {
      log(`✅ List nodes with JWT successful!`, 'success');
    } else {
      log(`❌ List nodes with JWT failed: ${JSON.stringify(jwtResult.error)}`, 'error');
    }

    return createResult.success;
  } else {
    log(`❌ Create node failed: ${JSON.stringify(createResult.error)}`, 'error');
    return false;
  }
}

/**
 * Step 5: Test Inmail Endpoints
 */
async function step5_testInmailEndpoints() {
  log('\nSTEP 5: Test Inmail Endpoints with API Key', 'step');
  
  const testMessage = {
    subject: 'Test Message - API Key Auth',
    body: 'This is a test message created via API key authentication',
    recipientId: 'test-recipient-id', // Update with valid recipient ID
  };

  // Test POST /inmail with API key
  log('Testing POST /inmail (create message) with API key...', 'info');
  const createResult = await makeRequest(
    'POST',
    '/inmail',
    testMessage,
    {
      'x-api-key': apiKey,
    }
  );

  if (createResult.success) {
    log(`✅ Create message with API key successful!`, 'success');
    
    // Test GET /inmail with API key
    log('\nTesting GET /inmail (list messages) with API key...', 'info');
    const listResult = await makeRequest('GET', '/inmail', null, {
      'x-api-key': apiKey,
    });

    if (listResult.success) {
      log(`✅ List messages with API key successful!`, 'success');
    } else {
      log(`❌ List messages failed: ${JSON.stringify(listResult.error)}`, 'error');
    }

    return createResult.success;
  } else {
    log(`❌ Create message failed: ${JSON.stringify(createResult.error)}`, 'error');
    log('💡 This might fail if recipientId is invalid. That\'s okay for testing auth.', 'warning');
    return false;
  }
}

/**
 * Step 6: Test User Endpoints
 */
async function step6_testUserEndpoints() {
  log('\nSTEP 6: Test User Endpoints with API Key', 'step');
  
  // Test GET /users with API key
  log('Testing GET /users (list users) with API key...', 'info');
  const listResult = await makeRequest('GET', '/users', null, {
    'x-api-key': apiKey,
  });

  if (listResult.success) {
    log(`✅ List users with API key successful!`, 'success');
    log(`Found ${listResult.data.results?.length || 0} users`, 'info');
  } else {
    log(`❌ List users failed: ${JSON.stringify(listResult.error)}`, 'error');
    return false;
  }

  // Test with JWT (fallback)
  log('\nTesting GET /users with JWT (fallback)...', 'info');
  const jwtResult = await makeRequest('GET', '/users', null, {
    Authorization: `Bearer ${jwtToken}`,
  });

  if (jwtResult.success) {
    log(`✅ List users with JWT successful!`, 'success');
  } else {
    log(`❌ List users with JWT failed: ${JSON.stringify(jwtResult.error)}`, 'error');
  }

  return listResult.success;
}

/**
 * Step 7: Test Rate Limiting Headers
 */
async function step7_testRateLimitHeaders() {
  log('\nSTEP 7: Test Rate Limit Headers', 'step');
  
  log('Making request to check rate limit headers...', 'info');
  
  const result = await makeRequest('GET', '/node', null, {
    'x-api-key': apiKey,
  });

  if (result.success) {
    log(`✅ Request successful!`, 'success');
    log(`Check response headers for:`, 'info');
    log(`  - X-RateLimit-Limit`, 'info');
    log(`  - X-RateLimit-Remaining`, 'info');
    log(`  - X-RateLimit-Reset`, 'info');
  } else {
    log(`❌ Request failed: ${JSON.stringify(result.error)}`, 'error');
  }

  return result.success;
}

/**
 * Cleanup: Delete test API key
 */
async function cleanup() {
  log('\nCLEANUP: Deleting test API key...', 'step');
  
  if (!apiKeyId || !jwtToken) {
    log('Skipping cleanup - no API key to delete', 'warning');
    return;
  }

  const result = await makeRequest(
    'DELETE',
    `/api-keys/${apiKeyId}`,
    null,
    {
      Authorization: `Bearer ${jwtToken}`,
    }
  );

  if (result.success) {
    log(`✅ Test API key deleted successfully!`, 'success');
  } else {
    log(`⚠️  Failed to delete test API key: ${JSON.stringify(result.error)}`, 'warning');
    log(`💡 You may want to manually delete API key ID: ${apiKeyId}`, 'warning');
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n🚀 API Key Authentication Test Script', 'step');
  log(`Base URL: ${BASE_URL}`, 'info');
  log(`Test Email: ${TEST_EMAIL}`, 'info');
  log(`\nThis script will:`, 'info');
  log(`  1. Login with JWT`, 'info');
  log(`  2. Create an API key`, 'info');
  log(`  3. Test endpoints with API key authentication`, 'info');
  log(`  4. Test endpoints with JWT authentication (fallback)`, 'info');
  log(`  5. Clean up test API key`, 'info');

  try {
    // Step 1: Login
    if (!(await step1_login())) {
      log('\n❌ Test failed at Step 1. Cannot proceed.', 'error');
      process.exit(1);
    }

    // Step 2: Create API Key
    if (!(await step2_createApiKey())) {
      log('\n❌ Test failed at Step 2. Cannot proceed.', 'error');
      process.exit(1);
    }

    // Step 3: Test Login with API Key
    await step3_testLoginWithApiKey();

    // Step 4: Test Node Endpoints
    await step4_testNodeEndpoints();

    // Step 5: Test Inmail Endpoints
    await step5_testInmailEndpoints();

    // Step 6: Test User Endpoints
    await step6_testUserEndpoints();

    // Step 7: Test Rate Limit Headers
    await step7_testRateLimitHeaders();

    // Cleanup
    await cleanup();

    log('\n✅ All tests completed!', 'success');
    log('\n📝 Summary:', 'step');
    log(`  - JWT Token: ${jwtToken ? '✅ Obtained' : '❌ Failed'}`, 'info');
    log(`  - API Key: ${apiKey ? '✅ Created' : '❌ Failed'}`, 'info');
    log(`  - API Key ID: ${apiKeyId || 'N/A'}`, 'info');
    
    if (apiKey) {
      log(`\n⚠️  Remember to save your API key if you want to use it later:`, 'warning');
      log(`   ${apiKey}`, 'info');
    }

  } catch (error) {
    log(`\n❌ Test script error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests();
}

module.exports = { runTests };

