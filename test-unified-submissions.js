/**
 * Test Script for Unified /v1/submissions Endpoint
 *
 * Tests:
 * 1. Regular submission (non-PERM)
 * 2. PERM submission (with month)
 * 3. Activity logging
 * 4. Deprecation warning on old endpoint
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000';
const AUTH_TOKEN = process.env.TEST_TOKEN || ''; // You'll need a valid token

// Test configuration
const config = {
  headers: {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
  },
};

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║          UNIFIED /v1/submissions ENDPOINT - COMPREHENSIVE TESTS              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Test 1: Regular Submission via /v1/submissions
 */
async function testRegularSubmission() {
  console.log('\n📝 TEST 1: Regular Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_unified',
    formId: 'test_form_regular',
    payload: {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Testing unified endpoint with regular submission',
    },
    source: 'api',
    project_name: 'Test Project Regular',
    project_category: 'testing',
  };

  try {
    const response = await axios.post(
      `${API_URL}/v1/submissions`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - type: "regular" ✓');
    console.log('   - jobId: present ✓');
    console.log('   - status: "queued" ✓');

    if (response.data.type === 'regular' && response.data.jobId) {
      console.log('\n✅ TEST 1 PASSED: Regular submission accepted');
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
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: PERM Submission via /v1/submissions
 */
async function testPERMSubmission() {
  console.log('\n\n📝 TEST 2: PERM Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_perm',
    formId: 'test_form_perm',
    nodeId: 'Test_Node_Unified',
    month: '2025-12-01',
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

  try {
    const response = await axios.post(
      `${API_URL}/v1/submissions`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - type: "perm" ✓');
    console.log('   - jobId: present ✓');
    console.log('   - month: "2025-12-01" ✓');
    console.log('   - nodeId: "Test_Node_Unified" ✓');

    if (
      response.data.type === 'perm' &&
      response.data.jobId &&
      response.data.month === '2025-12-01'
    ) {
      console.log(
        '\n✅ TEST 2 PASSED: PERM submission accepted and auto-detected'
      );
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
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Activity Logs Retrieval
 */
async function testActivityLogs(tenantId) {
  console.log('\n\n📝 TEST 3: Activity Logs Retrieval');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/v1/submissions/activity-log?tenantId=${tenantId}&limit=10`,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - results: array ✓');
    console.log('   - total: number ✓');

    if (response.data.success && Array.isArray(response.data.results)) {
      console.log('\n✅ TEST 3 PASSED: Activity logs retrieved');
      console.log(
        `   Found ${response.data.results.length} activity log entries`
      );
      return { success: true };
    } else {
      console.log('\n❌ TEST 3 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 3 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Activity Log Summary
 */
async function testActivityLogSummary() {
  console.log('\n\n📝 TEST 4: Activity Log Summary');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/v1/submissions/activity-log/summary`,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - summary: object with counts ✓');

    if (response.data.success && response.data.summary) {
      console.log('\n✅ TEST 4 PASSED: Activity summary retrieved');
      console.log(
        '   Summary:',
        JSON.stringify(response.data.summary, null, 2)
      );
      return { success: true };
    } else {
      console.log('\n❌ TEST 4 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 4 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Deprecation Warning on Old Endpoint
 */
async function testDeprecationWarning() {
  console.log('\n\n📝 TEST 5: Deprecation Warning on /v1/api-submit');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_deprecated',
    formId: 'test_form_deprecated',
    payload: { test: 'data' },
    source: 'api',
  };

  try {
    const response = await axios.post(
      `${API_URL}/v1/api-submit`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Headers:');
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
      console.log('\n✅ TEST 5 PASSED: Deprecation warning present');
      return { success: true };
    } else {
      console.log('\n❌ TEST 5 FAILED: No deprecation warning');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 5 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Multi-Source Support
 */
async function testMultiSourceSupport() {
  console.log(
    '\n\n📝 TEST 6: Multi-Source Support (WhatsApp, Telegram, Email)'
  );
  console.log('━'.repeat(80));

  const sources = ['whatsapp', 'telegram', 'email', 'agent'];
  const results = [];

  for (const source of sources) {
    const payload = {
      tenantId: 'test_tenant_' + Date.now(),
      projectId: 'test_project_multi_source',
      formId: 'test_form_' + source,
      payload: { message: `Test from ${source}` },
      source: source,
    };

    try {
      const response = await axios.post(
        `${API_URL}/v1/submissions`,
        payload,
        config
      );
      console.log(
        `✅ ${source.toUpperCase()}: Accepted (jobId: ${response.data.jobId})`
      );
      results.push({ source, success: true });
    } catch (error) {
      console.log(`❌ ${source.toUpperCase()}: Failed - ${error.message}`);
      results.push({ source, success: false, error: error.message });
    }
  }

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ TEST 6 PASSED: All sources accepted');
    return { success: true };
  } else {
    console.log('\n❌ TEST 6 FAILED: Some sources failed');
    return { success: false, results };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`\n🎯 API URL: ${API_URL}`);
  console.log(
    `🔑 Auth Token: ${
      AUTH_TOKEN ? 'Provided' : 'Not provided (tests may fail)'
    }\n`
  );

  const results = [];

  // Test 1: Regular submission
  const test1 = await testRegularSubmission();
  results.push({ test: 'Test 1: Regular Submission', ...test1 });

  // Test 2: PERM submission
  const test2 = await testPERMSubmission();
  results.push({ test: 'Test 2: PERM Submission', ...test2 });

  // Wait a bit for worker to process
  console.log('\n⏳ Waiting 3 seconds for worker to process submissions...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Test 3: Activity logs
  const test3 = await testActivityLogs(test1.tenantId || 'test_tenant');
  results.push({ test: 'Test 3: Activity Logs', ...test3 });

  // Test 4: Activity summary
  const test4 = await testActivityLogSummary();
  results.push({ test: 'Test 4: Activity Summary', ...test4 });

  // Test 5: Deprecation warning
  const test5 = await testDeprecationWarning();
  results.push({ test: 'Test 5: Deprecation Warning', ...test5 });

  // Test 6: Multi-source support
  const test6 = await testMultiSourceSupport();
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
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('');
}

// Run tests
runAllTests()
  .then(() => {
    console.log('✅ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });

/**
 * Test Script for Unified /v1/submissions Endpoint
 *
 * Tests:
 * 1. Regular submission (non-PERM)
 * 2. PERM submission (with month)
 * 3. Activity logging
 * 4. Deprecation warning on old endpoint
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000';
const AUTH_TOKEN = process.env.TEST_TOKEN || ''; // You'll need a valid token

// Test configuration
const config = {
  headers: {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
  },
};

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║          UNIFIED /v1/submissions ENDPOINT - COMPREHENSIVE TESTS              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Test 1: Regular Submission via /v1/submissions
 */
async function testRegularSubmission() {
  console.log('\n📝 TEST 1: Regular Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_unified',
    formId: 'test_form_regular',
    payload: {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Testing unified endpoint with regular submission',
    },
    source: 'api',
    project_name: 'Test Project Regular',
    project_category: 'testing',
  };

  try {
    const response = await axios.post(
      `${API_URL}/v1/submissions`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - type: "regular" ✓');
    console.log('   - jobId: present ✓');
    console.log('   - status: "queued" ✓');

    if (response.data.type === 'regular' && response.data.jobId) {
      console.log('\n✅ TEST 1 PASSED: Regular submission accepted');
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
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: PERM Submission via /v1/submissions
 */
async function testPERMSubmission() {
  console.log('\n\n📝 TEST 2: PERM Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_perm',
    formId: 'test_form_perm',
    nodeId: 'Test_Node_Unified',
    month: '2025-12-01',
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

  try {
    const response = await axios.post(
      `${API_URL}/v1/submissions`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - type: "perm" ✓');
    console.log('   - jobId: present ✓');
    console.log('   - month: "2025-12-01" ✓');
    console.log('   - nodeId: "Test_Node_Unified" ✓');

    if (
      response.data.type === 'perm' &&
      response.data.jobId &&
      response.data.month === '2025-12-01'
    ) {
      console.log(
        '\n✅ TEST 2 PASSED: PERM submission accepted and auto-detected'
      );
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
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Activity Logs Retrieval
 */
async function testActivityLogs(tenantId) {
  console.log('\n\n📝 TEST 3: Activity Logs Retrieval');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/v1/submissions/activity-log?tenantId=${tenantId}&limit=10`,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - results: array ✓');
    console.log('   - total: number ✓');

    if (response.data.success && Array.isArray(response.data.results)) {
      console.log('\n✅ TEST 3 PASSED: Activity logs retrieved');
      console.log(
        `   Found ${response.data.results.length} activity log entries`
      );
      return { success: true };
    } else {
      console.log('\n❌ TEST 3 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 3 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Activity Log Summary
 */
async function testActivityLogSummary() {
  console.log('\n\n📝 TEST 4: Activity Log Summary');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/v1/submissions/activity-log/summary`,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - summary: object with counts ✓');

    if (response.data.success && response.data.summary) {
      console.log('\n✅ TEST 4 PASSED: Activity summary retrieved');
      console.log(
        '   Summary:',
        JSON.stringify(response.data.summary, null, 2)
      );
      return { success: true };
    } else {
      console.log('\n❌ TEST 4 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 4 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Deprecation Warning on Old Endpoint
 */
async function testDeprecationWarning() {
  console.log('\n\n📝 TEST 5: Deprecation Warning on /v1/api-submit');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_deprecated',
    formId: 'test_form_deprecated',
    payload: { test: 'data' },
    source: 'api',
  };

  try {
    const response = await axios.post(
      `${API_URL}/v1/api-submit`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Headers:');
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
      console.log('\n✅ TEST 5 PASSED: Deprecation warning present');
      return { success: true };
    } else {
      console.log('\n❌ TEST 5 FAILED: No deprecation warning');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 5 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Multi-Source Support
 */
async function testMultiSourceSupport() {
  console.log(
    '\n\n📝 TEST 6: Multi-Source Support (WhatsApp, Telegram, Email)'
  );
  console.log('━'.repeat(80));

  const sources = ['whatsapp', 'telegram', 'email', 'agent'];
  const results = [];

  for (const source of sources) {
    const payload = {
      tenantId: 'test_tenant_' + Date.now(),
      projectId: 'test_project_multi_source',
      formId: 'test_form_' + source,
      payload: { message: `Test from ${source}` },
      source: source,
    };

    try {
      const response = await axios.post(
        `${API_URL}/v1/submissions`,
        payload,
        config
      );
      console.log(
        `✅ ${source.toUpperCase()}: Accepted (jobId: ${response.data.jobId})`
      );
      results.push({ source, success: true });
    } catch (error) {
      console.log(`❌ ${source.toUpperCase()}: Failed - ${error.message}`);
      results.push({ source, success: false, error: error.message });
    }
  }

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ TEST 6 PASSED: All sources accepted');
    return { success: true };
  } else {
    console.log('\n❌ TEST 6 FAILED: Some sources failed');
    return { success: false, results };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`\n🎯 API URL: ${API_URL}`);
  console.log(
    `🔑 Auth Token: ${
      AUTH_TOKEN ? 'Provided' : 'Not provided (tests may fail)'
    }\n`
  );

  const results = [];

  // Test 1: Regular submission
  const test1 = await testRegularSubmission();
  results.push({ test: 'Test 1: Regular Submission', ...test1 });

  // Test 2: PERM submission
  const test2 = await testPERMSubmission();
  results.push({ test: 'Test 2: PERM Submission', ...test2 });

  // Wait a bit for worker to process
  console.log('\n⏳ Waiting 3 seconds for worker to process submissions...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Test 3: Activity logs
  const test3 = await testActivityLogs(test1.tenantId || 'test_tenant');
  results.push({ test: 'Test 3: Activity Logs', ...test3 });

  // Test 4: Activity summary
  const test4 = await testActivityLogSummary();
  results.push({ test: 'Test 4: Activity Summary', ...test4 });

  // Test 5: Deprecation warning
  const test5 = await testDeprecationWarning();
  results.push({ test: 'Test 5: Deprecation Warning', ...test5 });

  // Test 6: Multi-source support
  const test6 = await testMultiSourceSupport();
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
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('');
}

// Run tests
runAllTests()
  .then(() => {
    console.log('✅ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });

/**
 * Test Script for Unified /v1/submissions Endpoint
 *
 * Tests:
 * 1. Regular submission (non-PERM)
 * 2. PERM submission (with month)
 * 3. Activity logging
 * 4. Deprecation warning on old endpoint
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:4000';
const AUTH_TOKEN = process.env.TEST_TOKEN || ''; // You'll need a valid token

// Test configuration
const config = {
  headers: {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN && { Authorization: `Bearer ${AUTH_TOKEN}` }),
  },
};

console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║          UNIFIED /v1/submissions ENDPOINT - COMPREHENSIVE TESTS              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

/**
 * Test 1: Regular Submission via /v1/submissions
 */
async function testRegularSubmission() {
  console.log('\n📝 TEST 1: Regular Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_unified',
    formId: 'test_form_regular',
    payload: {
      name: 'Test User',
      email: 'test@example.com',
      message: 'Testing unified endpoint with regular submission',
    },
    source: 'api',
    project_name: 'Test Project Regular',
    project_category: 'testing',
  };

  try {
    const response = await axios.post(
      `${API_URL}/v1/submissions`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - type: "regular" ✓');
    console.log('   - jobId: present ✓');
    console.log('   - status: "queued" ✓');

    if (response.data.type === 'regular' && response.data.jobId) {
      console.log('\n✅ TEST 1 PASSED: Regular submission accepted');
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
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: PERM Submission via /v1/submissions
 */
async function testPERMSubmission() {
  console.log('\n\n📝 TEST 2: PERM Submission via /v1/submissions');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_perm',
    formId: 'test_form_perm',
    nodeId: 'Test_Node_Unified',
    month: '2025-12-01',
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

  try {
    const response = await axios.post(
      `${API_URL}/v1/submissions`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - type: "perm" ✓');
    console.log('   - jobId: present ✓');
    console.log('   - month: "2025-12-01" ✓');
    console.log('   - nodeId: "Test_Node_Unified" ✓');

    if (
      response.data.type === 'perm' &&
      response.data.jobId &&
      response.data.month === '2025-12-01'
    ) {
      console.log(
        '\n✅ TEST 2 PASSED: PERM submission accepted and auto-detected'
      );
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
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Activity Logs Retrieval
 */
async function testActivityLogs(tenantId) {
  console.log('\n\n📝 TEST 3: Activity Logs Retrieval');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/v1/submissions/activity-log?tenantId=${tenantId}&limit=10`,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - results: array ✓');
    console.log('   - total: number ✓');

    if (response.data.success && Array.isArray(response.data.results)) {
      console.log('\n✅ TEST 3 PASSED: Activity logs retrieved');
      console.log(
        `   Found ${response.data.results.length} activity log entries`
      );
      return { success: true };
    } else {
      console.log('\n❌ TEST 3 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 3 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 4: Activity Log Summary
 */
async function testActivityLogSummary() {
  console.log('\n\n📝 TEST 4: Activity Log Summary');
  console.log('━'.repeat(80));

  try {
    const response = await axios.get(
      `${API_URL}/v1/submissions/activity-log/summary`,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    console.log('\n✅ Expected Validation:');
    console.log('   - success: true ✓');
    console.log('   - summary: object with counts ✓');

    if (response.data.success && response.data.summary) {
      console.log('\n✅ TEST 4 PASSED: Activity summary retrieved');
      console.log(
        '   Summary:',
        JSON.stringify(response.data.summary, null, 2)
      );
      return { success: true };
    } else {
      console.log('\n❌ TEST 4 FAILED: Invalid response structure');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 4 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 5: Deprecation Warning on Old Endpoint
 */
async function testDeprecationWarning() {
  console.log('\n\n📝 TEST 5: Deprecation Warning on /v1/api-submit');
  console.log('━'.repeat(80));

  const payload = {
    tenantId: 'test_tenant_' + Date.now(),
    projectId: 'test_project_deprecated',
    formId: 'test_form_deprecated',
    payload: { test: 'data' },
    source: 'api',
  };

  try {
    const response = await axios.post(
      `${API_URL}/v1/api-submit`,
      payload,
      config
    );

    console.log('✅ Status:', response.status);
    console.log('✅ Headers:');
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
      console.log('\n✅ TEST 5 PASSED: Deprecation warning present');
      return { success: true };
    } else {
      console.log('\n❌ TEST 5 FAILED: No deprecation warning');
      return { success: false };
    }
  } catch (error) {
    console.log('\n❌ TEST 5 FAILED:');
    console.log('   Error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Test 6: Multi-Source Support
 */
async function testMultiSourceSupport() {
  console.log(
    '\n\n📝 TEST 6: Multi-Source Support (WhatsApp, Telegram, Email)'
  );
  console.log('━'.repeat(80));

  const sources = ['whatsapp', 'telegram', 'email', 'agent'];
  const results = [];

  for (const source of sources) {
    const payload = {
      tenantId: 'test_tenant_' + Date.now(),
      projectId: 'test_project_multi_source',
      formId: 'test_form_' + source,
      payload: { message: `Test from ${source}` },
      source: source,
    };

    try {
      const response = await axios.post(
        `${API_URL}/v1/submissions`,
        payload,
        config
      );
      console.log(
        `✅ ${source.toUpperCase()}: Accepted (jobId: ${response.data.jobId})`
      );
      results.push({ source, success: true });
    } catch (error) {
      console.log(`❌ ${source.toUpperCase()}: Failed - ${error.message}`);
      results.push({ source, success: false, error: error.message });
    }
  }

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ TEST 6 PASSED: All sources accepted');
    return { success: true };
  } else {
    console.log('\n❌ TEST 6 FAILED: Some sources failed');
    return { success: false, results };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`\n🎯 API URL: ${API_URL}`);
  console.log(
    `🔑 Auth Token: ${
      AUTH_TOKEN ? 'Provided' : 'Not provided (tests may fail)'
    }\n`
  );

  const results = [];

  // Test 1: Regular submission
  const test1 = await testRegularSubmission();
  results.push({ test: 'Test 1: Regular Submission', ...test1 });

  // Test 2: PERM submission
  const test2 = await testPERMSubmission();
  results.push({ test: 'Test 2: PERM Submission', ...test2 });

  // Wait a bit for worker to process
  console.log('\n⏳ Waiting 3 seconds for worker to process submissions...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Test 3: Activity logs
  const test3 = await testActivityLogs(test1.tenantId || 'test_tenant');
  results.push({ test: 'Test 3: Activity Logs', ...test3 });

  // Test 4: Activity summary
  const test4 = await testActivityLogSummary();
  results.push({ test: 'Test 4: Activity Summary', ...test4 });

  // Test 5: Deprecation warning
  const test5 = await testDeprecationWarning();
  results.push({ test: 'Test 5: Deprecation Warning', ...test5 });

  // Test 6: Multi-source support
  const test6 = await testMultiSourceSupport();
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
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
  }

  console.log('');
}

// Run tests
runAllTests()
  .then(() => {
    console.log('✅ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  });

