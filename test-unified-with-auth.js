/**
 * Test Script for Unified /v1/submissions Endpoint with Authentication
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000/v1';
const EMAIL = 'saby@saby.ai';
const PASSWORD = '@saby_Saby1';

let authToken = null;

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║       UNIFIED /v1/submissions ENDPOINT - AUTHENTICATED TESTS                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Step 1: Login to get authentication token
 */
async function login() {
  console.log('\n🔐 STEP 1: Authenticating...');
  console.log('━'.repeat(80));

  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });

    if (response.data.tokens && response.data.tokens.access) {
      authToken = response.data.tokens.access.token;
      console.log('✅ Login successful');
      console.log(`✅ Token obtained: ${authToken.substring(0, 20)}...`);
      console.log(`✅ User: ${response.data.user.email}`);
      console.log(`✅ Tenant: ${response.data.user.tenantId}`);
      return {
        success: true,
        user: response.data.user,
        token: authToken,
      };
    } else {
      console.log('❌ Login failed: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Login failed:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 1: Regular Submission via /v1/submissions
 */
async function testRegularSubmission(user) {
  console.log('\n\n📝 TEST 1: Regular Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_unified_' + Date.now(),
    formId: 'test_form_regular_' + Date.now(),
    payload: {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Testing unified endpoint with regular submission',
      timestamp: new Date().toISOString(),
    },
    source: 'api',
    project_name: 'Test Project Regular',
    project_category: 'testing',
  };

  console.log('📤 Sending payload:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${API_URL}/submissions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('\n✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    if (
      response.data.success &&
      response.data.type === 'regular' &&
      response.data.jobId
    ) {
      console.log('\n✅ TEST 1 PASSED: Regular submission accepted');
      console.log(`   JobId: ${response.data.jobId}`);
      console.log(`   Type: ${response.data.type}`);
      return {
        success: true,
        jobId: response.data.jobId,
        tenantId: payload.tenantId,
      };
    } else {
      console.log('\n❌ TEST 1 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 1 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: PERM Submission via /v1/submissions
 */
async function testPERMSubmission(user) {
  console.log('\n\n📝 TEST 2: PERM Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_perm_' + Date.now(),
    formId: 'test_form_perm_' + Date.now(),
    nodeId: 'Test_Node_Unified_' + Date.now(),
    month: '2025-12-01',
    year: 2025,
    payload: {
      attendance: {
        settings: { title: 'Attendance Tracking' },
        records: [
          {
            event: 'sunday_service',
            date: '2025-12-07',
            total: 250,
            men: 120,
            women: 130,
          },
        ],
      },
    },
    source: 'api',
    perm_enabled: true,
    project_name: 'Growth Tracker PERM',
    project_category: 'compliance',
  };

  console.log('📤 Sending PERM payload:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${API_URL}/submissions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('\n✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    if (
      response.data.success &&
      response.data.type === 'perm' &&
      response.data.jobId &&
      response.data.month === '2025-12-01'
    ) {
      console.log(
        '\n✅ TEST 2 PASSED: PERM submission accepted and auto-detected'
      );
      console.log(`   JobId: ${response.data.jobId}`);
      console.log(`   Type: ${response.data.type}`);
      console.log(`   Month: ${response.data.month}`);
      console.log(`   NodeId: ${response.data.nodeId}`);
      return {
        success: true,
        jobId: response.data.jobId,
        tenantId: payload.tenantId,
      };
    } else {
      console.log('\n❌ TEST 2 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 2 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Deprecation Warning on Old Endpoint
 */
async function testDeprecationWarning(user) {
  console.log('\n\n📝 TEST 3: Deprecation Warning on /v1/api-submit');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_deprecated',
    formId: 'test_form_deprecated',
    payload: { test: 'data' },
    source: 'api',
  };

  try {
    const response = await axios.post(`${API_URL}/api-submit`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('✅ Status:', response.status);
    console.log('✅ Deprecation Headers:');
    console.log('   X-API-Deprecated:', response.headers['x-api-deprecated']);
    console.log(
      '   X-API-Deprecation-Date:',
      response.headers['x-api-deprecation-date']
    );
    console.log(
      '   X-API-Deprecation-Info:',
      response.headers['x-api-deprecation-info']
    );
    console.log(
      '   X-API-Migration-Url:',
      response.headers['x-api-migration-url']
    );

    if (response.headers['x-api-deprecated'] === 'true') {
      console.log('\n✅ TEST 3 PASSED: Deprecation warning present');
      return { success: true };
    } else {
      console.log('\n❌ TEST 3 FAILED: No deprecation warning headers');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 3 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Activity Logs
 */
async function testActivityLogs(tenantId) {
  console.log('\n\n📝 TEST 4: Activity Logs Retrieval');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/submissions/activity-log?tenantId=${tenantId}&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Found:', response.data.total, 'activity log entries');
    console.log('✅ Showing:', response.data.results.length, 'results');

    if (response.data.results.length > 0) {
      console.log('\n📋 Sample Activity Log Entry:');
      console.log(JSON.stringify(response.data.results[0], null, 2));
    }

    if (response.data.success && Array.isArray(response.data.results)) {
      console.log('\n✅ TEST 4 PASSED: Activity logs retrieved');
      return { success: true };
    } else {
      console.log('\n❌ TEST 4 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 4 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Activity Log Summary
 */
async function testActivityLogSummary() {
  console.log('\n\n📝 TEST 5: Activity Log Summary');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/submissions/activity-log/summary`
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Summary:', JSON.stringify(response.data.summary, null, 2));

    if (response.data.success && response.data.summary) {
      console.log('\n✅ TEST 5 PASSED: Activity summary retrieved');
      return { success: true };
    } else {
      console.log('\n❌ TEST 5 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 5 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Multi-Source Support
 */
async function testMultiSourceSupport(user) {
  console.log(
    '\n\n📝 TEST 6: Multi-Source Support (WhatsApp, Telegram, Email, Agent)'
  );
  console.log('━'.repeat(80));

  const sources = ['whatsapp', 'telegram', 'email', 'agent'];
  const results = [];

  for (const source of sources) {
    const payload = {
      tenantId: user.tenantId,
      projectId: 'test_project_multi_source',
      formId: 'test_form_' + source + '_' + Date.now(),
      payload: {
        message: `Test from ${source}`,
        timestamp: new Date().toISOString(),
      },
      source: source,
      project_name: 'Multi-Source Test',
      project_category: 'testing',
    };

    try {
      const response = await axios.post(`${API_URL}/submissions`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      console.log(
        `✅ ${source.toUpperCase()}: Accepted (jobId: ${response.data.jobId})`
      );
      results.push({ source, success: true, jobId: response.data.jobId });
    } catch (error) {
      console.log(
        `❌ ${source.toUpperCase()}: Failed - ${
          error.response?.data?.message || error.message
        }`
      );
      results.push({ source, success: false, error: error.message });
    }
  }

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ TEST 6 PASSED: All sources accepted');
    return { success: true, results };
  } else {
    console.log('\n⚠️  TEST 6 PARTIAL: Some sources failed');
    return { success: false, results };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`🎯 API URL: ${API_URL}`);
  console.log(`🔑 Email: ${EMAIL}\n`);

  // Login first
  const loginResult = await login();
  if (!loginResult.success) {
    console.log('\n❌ Cannot proceed without authentication');
    process.exit(1);
  }

  const user = loginResult.user;
  const results = [];

  // Wait for server to be fully ready
  console.log('\n⏳ Waiting 5 seconds for server to be fully ready...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 1: Regular submission
  const test1 = await testRegularSubmission(user);
  results.push({ test: 'Test 1: Regular Submission', ...test1 });

  // Test 2: PERM submission
  const test2 = await testPERMSubmission(user);
  results.push({ test: 'Test 2: PERM Submission', ...test2 });

  // Wait for worker to process
  console.log('\n⏳ Waiting 5 seconds for worker to process submissions...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 3: Deprecation warning
  const test3 = await testDeprecationWarning(user);
  results.push({ test: 'Test 3: Deprecation Warning', ...test3 });

  // Test 4: Activity logs
  const test4 = await testActivityLogs(user.tenantId);
  results.push({ test: 'Test 4: Activity Logs', ...test4 });

  // Test 5: Activity summary
  const test5 = await testActivityLogSummary();
  results.push({ test: 'Test 5: Activity Summary', ...test5 });

  // Test 6: Multi-source support
  const test6 = await testMultiSourceSupport(user);
  results.push({ test: 'Test 6: Multi-Source Support', ...test6 });

  // Summary
  console.log('\n\n');
  console.log(
    '╔══════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║                           TEST RESULTS SUMMARY                               ║'
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════╝'
  );
  console.log('');

  results.forEach((result, index) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${index + 1}. ${result.test}: ${status}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const passedCount = results.filter((r) => r.success).length;
  const totalCount = results.length;
  const percentage = ((passedCount / totalCount) * 100).toFixed(1);

  console.log('');
  console.log(
    `Overall: ${passedCount}/${totalCount} tests passed (${percentage}%)`
  );
  console.log('');

  if (passedCount === totalCount) {
    console.log(
      '🎉 ALL TESTS PASSED! Unified endpoint is working perfectly! 🎉'
    );
    console.log('');
    console.log('✅ Key Achievements Verified:');
    console.log('   ✓ Unified endpoint accepts submissions');
    console.log('   ✓ Automatic PERM detection works');
    console.log('   ✓ Activity logging functional');
    console.log('   ✓ Deprecation warnings present');
    console.log('   ✓ Multi-source support working');
    console.log('');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('');
  return { passedCount, totalCount, percentage };
}

// Run tests
runAllTests()
  .then((summary) => {
    console.log('✅ Test suite completed');
    console.log(
      `Final Score: ${summary.passedCount}/${summary.totalCount} (${summary.percentage}%)`
    );
    process.exit(summary.passedCount === summary.totalCount ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });

/**
 * Test Script for Unified /v1/submissions Endpoint with Authentication
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000/v1';
const EMAIL = 'saby@saby.ai';
const PASSWORD = '@saby_Saby1';

let authToken = null;

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║       UNIFIED /v1/submissions ENDPOINT - AUTHENTICATED TESTS                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Step 1: Login to get authentication token
 */
async function login() {
  console.log('\n🔐 STEP 1: Authenticating...');
  console.log('━'.repeat(80));

  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });

    if (response.data.tokens && response.data.tokens.access) {
      authToken = response.data.tokens.access.token;
      console.log('✅ Login successful');
      console.log(`✅ Token obtained: ${authToken.substring(0, 20)}...`);
      console.log(`✅ User: ${response.data.user.email}`);
      console.log(`✅ Tenant: ${response.data.user.tenantId}`);
      return {
        success: true,
        user: response.data.user,
        token: authToken,
      };
    } else {
      console.log('❌ Login failed: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Login failed:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 1: Regular Submission via /v1/submissions
 */
async function testRegularSubmission(user) {
  console.log('\n\n📝 TEST 1: Regular Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_unified_' + Date.now(),
    formId: 'test_form_regular_' + Date.now(),
    payload: {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Testing unified endpoint with regular submission',
      timestamp: new Date().toISOString(),
    },
    source: 'api',
    project_name: 'Test Project Regular',
    project_category: 'testing',
  };

  console.log('📤 Sending payload:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${API_URL}/submissions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('\n✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    if (
      response.data.success &&
      response.data.type === 'regular' &&
      response.data.jobId
    ) {
      console.log('\n✅ TEST 1 PASSED: Regular submission accepted');
      console.log(`   JobId: ${response.data.jobId}`);
      console.log(`   Type: ${response.data.type}`);
      return {
        success: true,
        jobId: response.data.jobId,
        tenantId: payload.tenantId,
      };
    } else {
      console.log('\n❌ TEST 1 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 1 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: PERM Submission via /v1/submissions
 */
async function testPERMSubmission(user) {
  console.log('\n\n📝 TEST 2: PERM Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_perm_' + Date.now(),
    formId: 'test_form_perm_' + Date.now(),
    nodeId: 'Test_Node_Unified_' + Date.now(),
    month: '2025-12-01',
    year: 2025,
    payload: {
      attendance: {
        settings: { title: 'Attendance Tracking' },
        records: [
          {
            event: 'sunday_service',
            date: '2025-12-07',
            total: 250,
            men: 120,
            women: 130,
          },
        ],
      },
    },
    source: 'api',
    perm_enabled: true,
    project_name: 'Growth Tracker PERM',
    project_category: 'compliance',
  };

  console.log('📤 Sending PERM payload:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${API_URL}/submissions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('\n✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    if (
      response.data.success &&
      response.data.type === 'perm' &&
      response.data.jobId &&
      response.data.month === '2025-12-01'
    ) {
      console.log(
        '\n✅ TEST 2 PASSED: PERM submission accepted and auto-detected'
      );
      console.log(`   JobId: ${response.data.jobId}`);
      console.log(`   Type: ${response.data.type}`);
      console.log(`   Month: ${response.data.month}`);
      console.log(`   NodeId: ${response.data.nodeId}`);
      return {
        success: true,
        jobId: response.data.jobId,
        tenantId: payload.tenantId,
      };
    } else {
      console.log('\n❌ TEST 2 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 2 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Deprecation Warning on Old Endpoint
 */
async function testDeprecationWarning(user) {
  console.log('\n\n📝 TEST 3: Deprecation Warning on /v1/api-submit');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_deprecated',
    formId: 'test_form_deprecated',
    payload: { test: 'data' },
    source: 'api',
  };

  try {
    const response = await axios.post(`${API_URL}/api-submit`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('✅ Status:', response.status);
    console.log('✅ Deprecation Headers:');
    console.log('   X-API-Deprecated:', response.headers['x-api-deprecated']);
    console.log(
      '   X-API-Deprecation-Date:',
      response.headers['x-api-deprecation-date']
    );
    console.log(
      '   X-API-Deprecation-Info:',
      response.headers['x-api-deprecation-info']
    );
    console.log(
      '   X-API-Migration-Url:',
      response.headers['x-api-migration-url']
    );

    if (response.headers['x-api-deprecated'] === 'true') {
      console.log('\n✅ TEST 3 PASSED: Deprecation warning present');
      return { success: true };
    } else {
      console.log('\n❌ TEST 3 FAILED: No deprecation warning headers');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 3 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Activity Logs
 */
async function testActivityLogs(tenantId) {
  console.log('\n\n📝 TEST 4: Activity Logs Retrieval');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/submissions/activity-log?tenantId=${tenantId}&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Found:', response.data.total, 'activity log entries');
    console.log('✅ Showing:', response.data.results.length, 'results');

    if (response.data.results.length > 0) {
      console.log('\n📋 Sample Activity Log Entry:');
      console.log(JSON.stringify(response.data.results[0], null, 2));
    }

    if (response.data.success && Array.isArray(response.data.results)) {
      console.log('\n✅ TEST 4 PASSED: Activity logs retrieved');
      return { success: true };
    } else {
      console.log('\n❌ TEST 4 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 4 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Activity Log Summary
 */
async function testActivityLogSummary() {
  console.log('\n\n📝 TEST 5: Activity Log Summary');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/submissions/activity-log/summary`
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Summary:', JSON.stringify(response.data.summary, null, 2));

    if (response.data.success && response.data.summary) {
      console.log('\n✅ TEST 5 PASSED: Activity summary retrieved');
      return { success: true };
    } else {
      console.log('\n❌ TEST 5 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 5 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Multi-Source Support
 */
async function testMultiSourceSupport(user) {
  console.log(
    '\n\n📝 TEST 6: Multi-Source Support (WhatsApp, Telegram, Email, Agent)'
  );
  console.log('━'.repeat(80));

  const sources = ['whatsapp', 'telegram', 'email', 'agent'];
  const results = [];

  for (const source of sources) {
    const payload = {
      tenantId: user.tenantId,
      projectId: 'test_project_multi_source',
      formId: 'test_form_' + source + '_' + Date.now(),
      payload: {
        message: `Test from ${source}`,
        timestamp: new Date().toISOString(),
      },
      source: source,
      project_name: 'Multi-Source Test',
      project_category: 'testing',
    };

    try {
      const response = await axios.post(`${API_URL}/submissions`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      console.log(
        `✅ ${source.toUpperCase()}: Accepted (jobId: ${response.data.jobId})`
      );
      results.push({ source, success: true, jobId: response.data.jobId });
    } catch (error) {
      console.log(
        `❌ ${source.toUpperCase()}: Failed - ${
          error.response?.data?.message || error.message
        }`
      );
      results.push({ source, success: false, error: error.message });
    }
  }

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ TEST 6 PASSED: All sources accepted');
    return { success: true, results };
  } else {
    console.log('\n⚠️  TEST 6 PARTIAL: Some sources failed');
    return { success: false, results };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`🎯 API URL: ${API_URL}`);
  console.log(`🔑 Email: ${EMAIL}\n`);

  // Login first
  const loginResult = await login();
  if (!loginResult.success) {
    console.log('\n❌ Cannot proceed without authentication');
    process.exit(1);
  }

  const user = loginResult.user;
  const results = [];

  // Wait for server to be fully ready
  console.log('\n⏳ Waiting 5 seconds for server to be fully ready...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 1: Regular submission
  const test1 = await testRegularSubmission(user);
  results.push({ test: 'Test 1: Regular Submission', ...test1 });

  // Test 2: PERM submission
  const test2 = await testPERMSubmission(user);
  results.push({ test: 'Test 2: PERM Submission', ...test2 });

  // Wait for worker to process
  console.log('\n⏳ Waiting 5 seconds for worker to process submissions...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 3: Deprecation warning
  const test3 = await testDeprecationWarning(user);
  results.push({ test: 'Test 3: Deprecation Warning', ...test3 });

  // Test 4: Activity logs
  const test4 = await testActivityLogs(user.tenantId);
  results.push({ test: 'Test 4: Activity Logs', ...test4 });

  // Test 5: Activity summary
  const test5 = await testActivityLogSummary();
  results.push({ test: 'Test 5: Activity Summary', ...test5 });

  // Test 6: Multi-source support
  const test6 = await testMultiSourceSupport(user);
  results.push({ test: 'Test 6: Multi-Source Support', ...test6 });

  // Summary
  console.log('\n\n');
  console.log(
    '╔══════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║                           TEST RESULTS SUMMARY                               ║'
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════╝'
  );
  console.log('');

  results.forEach((result, index) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${index + 1}. ${result.test}: ${status}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const passedCount = results.filter((r) => r.success).length;
  const totalCount = results.length;
  const percentage = ((passedCount / totalCount) * 100).toFixed(1);

  console.log('');
  console.log(
    `Overall: ${passedCount}/${totalCount} tests passed (${percentage}%)`
  );
  console.log('');

  if (passedCount === totalCount) {
    console.log(
      '🎉 ALL TESTS PASSED! Unified endpoint is working perfectly! 🎉'
    );
    console.log('');
    console.log('✅ Key Achievements Verified:');
    console.log('   ✓ Unified endpoint accepts submissions');
    console.log('   ✓ Automatic PERM detection works');
    console.log('   ✓ Activity logging functional');
    console.log('   ✓ Deprecation warnings present');
    console.log('   ✓ Multi-source support working');
    console.log('');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('');
  return { passedCount, totalCount, percentage };
}

// Run tests
runAllTests()
  .then((summary) => {
    console.log('✅ Test suite completed');
    console.log(
      `Final Score: ${summary.passedCount}/${summary.totalCount} (${summary.percentage}%)`
    );
    process.exit(summary.passedCount === summary.totalCount ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });

/**
 * Test Script for Unified /v1/submissions Endpoint with Authentication
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000/v1';
const EMAIL = 'saby@saby.ai';
const PASSWORD = '@saby_Saby1';

let authToken = null;

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║       UNIFIED /v1/submissions ENDPOINT - AUTHENTICATED TESTS                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Step 1: Login to get authentication token
 */
async function login() {
  console.log('\n🔐 STEP 1: Authenticating...');
  console.log('━'.repeat(80));

  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });

    if (response.data.tokens && response.data.tokens.access) {
      authToken = response.data.tokens.access.token;
      console.log('✅ Login successful');
      console.log(`✅ Token obtained: ${authToken.substring(0, 20)}...`);
      console.log(`✅ User: ${response.data.user.email}`);
      console.log(`✅ Tenant: ${response.data.user.tenantId}`);
      return {
        success: true,
        user: response.data.user,
        token: authToken,
      };
    } else {
      console.log('❌ Login failed: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('❌ Login failed:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 1: Regular Submission via /v1/submissions
 */
async function testRegularSubmission(user) {
  console.log('\n\n📝 TEST 1: Regular Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_unified_' + Date.now(),
    formId: 'test_form_regular_' + Date.now(),
    payload: {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Testing unified endpoint with regular submission',
      timestamp: new Date().toISOString(),
    },
    source: 'api',
    project_name: 'Test Project Regular',
    project_category: 'testing',
  };

  console.log('📤 Sending payload:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${API_URL}/submissions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('\n✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    if (
      response.data.success &&
      response.data.type === 'regular' &&
      response.data.jobId
    ) {
      console.log('\n✅ TEST 1 PASSED: Regular submission accepted');
      console.log(`   JobId: ${response.data.jobId}`);
      console.log(`   Type: ${response.data.type}`);
      return {
        success: true,
        jobId: response.data.jobId,
        tenantId: payload.tenantId,
      };
    } else {
      console.log('\n❌ TEST 1 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 1 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: PERM Submission via /v1/submissions
 */
async function testPERMSubmission(user) {
  console.log('\n\n📝 TEST 2: PERM Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_perm_' + Date.now(),
    formId: 'test_form_perm_' + Date.now(),
    nodeId: 'Test_Node_Unified_' + Date.now(),
    month: '2025-12-01',
    year: 2025,
    payload: {
      attendance: {
        settings: { title: 'Attendance Tracking' },
        records: [
          {
            event: 'sunday_service',
            date: '2025-12-07',
            total: 250,
            men: 120,
            women: 130,
          },
        ],
      },
    },
    source: 'api',
    perm_enabled: true,
    project_name: 'Growth Tracker PERM',
    project_category: 'compliance',
  };

  console.log('📤 Sending PERM payload:');
  console.log(JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(`${API_URL}/submissions`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('\n✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));

    if (
      response.data.success &&
      response.data.type === 'perm' &&
      response.data.jobId &&
      response.data.month === '2025-12-01'
    ) {
      console.log(
        '\n✅ TEST 2 PASSED: PERM submission accepted and auto-detected'
      );
      console.log(`   JobId: ${response.data.jobId}`);
      console.log(`   Type: ${response.data.type}`);
      console.log(`   Month: ${response.data.month}`);
      console.log(`   NodeId: ${response.data.nodeId}`);
      return {
        success: true,
        jobId: response.data.jobId,
        tenantId: payload.tenantId,
      };
    } else {
      console.log('\n❌ TEST 2 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 2 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Deprecation Warning on Old Endpoint
 */
async function testDeprecationWarning(user) {
  console.log('\n\n📝 TEST 3: Deprecation Warning on /v1/api-submit');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: user.tenantId,
    projectId: 'test_project_deprecated',
    formId: 'test_form_deprecated',
    payload: { test: 'data' },
    source: 'api',
  };

  try {
    const response = await axios.post(`${API_URL}/api-submit`, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('✅ Status:', response.status);
    console.log('✅ Deprecation Headers:');
    console.log('   X-API-Deprecated:', response.headers['x-api-deprecated']);
    console.log(
      '   X-API-Deprecation-Date:',
      response.headers['x-api-deprecation-date']
    );
    console.log(
      '   X-API-Deprecation-Info:',
      response.headers['x-api-deprecation-info']
    );
    console.log(
      '   X-API-Migration-Url:',
      response.headers['x-api-migration-url']
    );

    if (response.headers['x-api-deprecated'] === 'true') {
      console.log('\n✅ TEST 3 PASSED: Deprecation warning present');
      return { success: true };
    } else {
      console.log('\n❌ TEST 3 FAILED: No deprecation warning headers');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 3 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Activity Logs
 */
async function testActivityLogs(tenantId) {
  console.log('\n\n📝 TEST 4: Activity Logs Retrieval');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/submissions/activity-log?tenantId=${tenantId}&limit=20`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Found:', response.data.total, 'activity log entries');
    console.log('✅ Showing:', response.data.results.length, 'results');

    if (response.data.results.length > 0) {
      console.log('\n📋 Sample Activity Log Entry:');
      console.log(JSON.stringify(response.data.results[0], null, 2));
    }

    if (response.data.success && Array.isArray(response.data.results)) {
      console.log('\n✅ TEST 4 PASSED: Activity logs retrieved');
      return { success: true };
    } else {
      console.log('\n❌ TEST 4 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 4 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Activity Log Summary
 */
async function testActivityLogSummary() {
  console.log('\n\n📝 TEST 5: Activity Log Summary');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/submissions/activity-log/summary`
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Summary:', JSON.stringify(response.data.summary, null, 2));

    if (response.data.success && response.data.summary) {
      console.log('\n✅ TEST 5 PASSED: Activity summary retrieved');
      return { success: true };
    } else {
      console.log('\n❌ TEST 5 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 5 FAILED:');
    console.log('   Status:', error.response?.status);
    console.log(
      '   Error:',
      JSON.stringify(error.response?.data, null, 2) || error.message
    );
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Multi-Source Support
 */
async function testMultiSourceSupport(user) {
  console.log(
    '\n\n📝 TEST 6: Multi-Source Support (WhatsApp, Telegram, Email, Agent)'
  );
  console.log('━'.repeat(80));

  const sources = ['whatsapp', 'telegram', 'email', 'agent'];
  const results = [];

  for (const source of sources) {
    const payload = {
      tenantId: user.tenantId,
      projectId: 'test_project_multi_source',
      formId: 'test_form_' + source + '_' + Date.now(),
      payload: {
        message: `Test from ${source}`,
        timestamp: new Date().toISOString(),
      },
      source: source,
      project_name: 'Multi-Source Test',
      project_category: 'testing',
    };

    try {
      const response = await axios.post(`${API_URL}/submissions`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      });

      console.log(
        `✅ ${source.toUpperCase()}: Accepted (jobId: ${response.data.jobId})`
      );
      results.push({ source, success: true, jobId: response.data.jobId });
    } catch (error) {
      console.log(
        `❌ ${source.toUpperCase()}: Failed - ${
          error.response?.data?.message || error.message
        }`
      );
      results.push({ source, success: false, error: error.message });
    }
  }

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ TEST 6 PASSED: All sources accepted');
    return { success: true, results };
  } else {
    console.log('\n⚠️  TEST 6 PARTIAL: Some sources failed');
    return { success: false, results };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`🎯 API URL: ${API_URL}`);
  console.log(`🔑 Email: ${EMAIL}\n`);

  // Login first
  const loginResult = await login();
  if (!loginResult.success) {
    console.log('\n❌ Cannot proceed without authentication');
    process.exit(1);
  }

  const user = loginResult.user;
  const results = [];

  // Wait for server to be fully ready
  console.log('\n⏳ Waiting 5 seconds for server to be fully ready...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 1: Regular submission
  const test1 = await testRegularSubmission(user);
  results.push({ test: 'Test 1: Regular Submission', ...test1 });

  // Test 2: PERM submission
  const test2 = await testPERMSubmission(user);
  results.push({ test: 'Test 2: PERM Submission', ...test2 });

  // Wait for worker to process
  console.log('\n⏳ Waiting 5 seconds for worker to process submissions...');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 3: Deprecation warning
  const test3 = await testDeprecationWarning(user);
  results.push({ test: 'Test 3: Deprecation Warning', ...test3 });

  // Test 4: Activity logs
  const test4 = await testActivityLogs(user.tenantId);
  results.push({ test: 'Test 4: Activity Logs', ...test4 });

  // Test 5: Activity summary
  const test5 = await testActivityLogSummary();
  results.push({ test: 'Test 5: Activity Summary', ...test5 });

  // Test 6: Multi-source support
  const test6 = await testMultiSourceSupport(user);
  results.push({ test: 'Test 6: Multi-Source Support', ...test6 });

  // Summary
  console.log('\n\n');
  console.log(
    '╔══════════════════════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║                           TEST RESULTS SUMMARY                               ║'
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════════════════════╝'
  );
  console.log('');

  results.forEach((result, index) => {
    const status = result.success ? '✅ PASSED' : '❌ FAILED';
    console.log(`${index + 1}. ${result.test}: ${status}`);
    if (!result.success && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const passedCount = results.filter((r) => r.success).length;
  const totalCount = results.length;
  const percentage = ((passedCount / totalCount) * 100).toFixed(1);

  console.log('');
  console.log(
    `Overall: ${passedCount}/${totalCount} tests passed (${percentage}%)`
  );
  console.log('');

  if (passedCount === totalCount) {
    console.log(
      '🎉 ALL TESTS PASSED! Unified endpoint is working perfectly! 🎉'
    );
    console.log('');
    console.log('✅ Key Achievements Verified:');
    console.log('   ✓ Unified endpoint accepts submissions');
    console.log('   ✓ Automatic PERM detection works');
    console.log('   ✓ Activity logging functional');
    console.log('   ✓ Deprecation warnings present');
    console.log('   ✓ Multi-source support working');
    console.log('');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('');
  return { passedCount, totalCount, percentage };
}

// Run tests
runAllTests()
  .then((summary) => {
    console.log('✅ Test suite completed');
    console.log(
      `Final Score: ${summary.passedCount}/${summary.totalCount} (${summary.percentage}%)`
    );
    process.exit(summary.passedCount === summary.totalCount ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });

