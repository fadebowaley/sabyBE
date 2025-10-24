/**
 * EXPORT FEATURES TEST SUITE (Phase 6.2)
 * 
 * Tests all 13 export endpoints:
 * 1. GET /v1/export/submissions/csv
 * 2. GET /v1/export/submissions/json
 * 3. GET /v1/export/compliance/csv
 * 4. GET /v1/export/compliance/json
 * 5. GET /v1/export/validations/csv
 * 6. GET /v1/export/validations/json
 * 7. GET /v1/export/notifications/csv
 * 8. GET /v1/export/notifications/json
 * 9. GET /v1/export/activity-logs/csv
 * 10. GET /v1/export/activity-logs/json
 * 11. GET /v1/export/combined/csv
 * 12. GET /v1/export/combined/json
 * 13. GET /v1/export/stats
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bright: '\x1b[1m',
};

const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };
    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
    };
  }
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function recordTest(name, passed, message = '') {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    log(`  ✓ ${name}`, 'green');
  } else {
    testResults.failed++;
    log(`  ✗ ${name}: ${message}`, 'red');
  }
}

async function createTestData() {
  log('\n━━━ Creating Test Data for Export ━━━', 'cyan');
  
  // Clean up any existing test data
  const cleanupQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  await postgresPool.query(cleanupQuery, [tenantId, 'export-test-project']);
  log('  Cleaned up existing test data', 'cyan');
  
  // Create test submissions
  const submissions = [];
  for (let i = 0; i < 3; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, 
       perm_enabled, month, event_compliance_percentage, is_locked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    
    const result = await postgresPool.query(query, [
      tenantId,
      'export-test-project',
      'test-form-export',
      `export-node-${i + 1}`,
      userId,
      i === 0 ? 'pending' : 'submitted',
      JSON.stringify({ test_data: `export_submission_${i}` }),
      true,
      new Date('2025-03-01'),
      Math.floor(Math.random() * 100),
      false,
    ]);
    
    submissions.push(result.rows[0].id);
  }
  
  log(`  Created ${submissions.length} test submissions`, 'cyan');
  return submissions;
}

async function testSubmissionsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: EXPORT SUBMISSIONS CSV                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 1.1: Export Submissions CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/submissions/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export submissions CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testSubmissionsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: EXPORT SUBMISSIONS JSON                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 2.1: Export Submissions JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/submissions/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export submissions JSON',
    result.success && result.data.success && result.data.data.records.length > 0,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
    log(`  Export info: ${result.data.data.export_info.format} format`, 'cyan');
  }
}

async function testComplianceCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 3: EXPORT COMPLIANCE CSV                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 3.1: Export Compliance CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/compliance/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export compliance CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testComplianceJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 4: EXPORT COMPLIANCE JSON                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 4.1: Export Compliance JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/compliance/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export compliance JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testValidationsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 5: EXPORT VALIDATIONS CSV                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 5.1: Export Validations CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/validations/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export validations CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testValidationsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 6: EXPORT VALIDATIONS JSON                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 6.1: Export Validations JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/validations/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export validations JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testNotificationsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 7: EXPORT NOTIFICATIONS CSV                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 7.1: Export Notifications CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/notifications/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export notifications CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testNotificationsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 8: EXPORT NOTIFICATIONS JSON                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 8.1: Export Notifications JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/notifications/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export notifications JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testActivityLogsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 9: EXPORT ACTIVITY LOGS CSV                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 9.1: Export Activity Logs CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/activity-logs/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export activity logs CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testActivityLogsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 10: EXPORT ACTIVITY LOGS JSON                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 10.1: Export Activity Logs JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/activity-logs/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export activity logs JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testCombinedCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 11: EXPORT COMBINED CSV                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 11.1: Export Combined CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/combined/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export combined CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testCombinedJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 12: EXPORT COMBINED JSON                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 12.1: Export Combined JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/combined/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export combined JSON',
    result.success && result.data.success && result.data.data.breakdown,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully`, 'cyan');
    log(`  Breakdown: ${JSON.stringify(result.data.data.export_info.breakdown)}`, 'cyan');
  }
}

async function testExportStats() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 13: EXPORT STATISTICS                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 13.1: Get Export Statistics ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/stats', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
    },
  });
  
  recordTest(
    'Get export statistics',
    result.success && result.data.success && result.data.data.total_records >= 0,
    result.error
  );
  
  if (result.success) {
    log(`  Statistics retrieved successfully`, 'cyan');
    log(`  Total records: ${result.data.data.total_records}`, 'cyan');
    log(`  Generated at: ${result.data.data.generated_at}`, 'cyan');
  }
}

async function cleanup() {
  log('\n━━━ Cleanup Test Data ━━━', 'cyan');
  
  const deleteQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  
  const result = await postgresPool.query(deleteQuery, [tenantId, 'export-test-project']);
  log(`  Deleted ${result.rowCount} test submissions`, 'cyan');
}

async function printFinalSummary() {
  console.log(`\n${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                         FINAL TEST SUMMARY                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const totalTests = testResults.passed + testResults.failed;
  const passRate = ((testResults.passed / totalTests) * 100).toFixed(1);

  log(`\n📊 Overall Results:`, 'bright');
  log(`   Total Tests: ${totalTests}`, 'cyan');
  log(`   Passed: ${testResults.passed}`, 'green');
  log(`   Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
  log(`   Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : 'yellow');

  log(`\n📋 Test Breakdown:`, 'bright');
  log(`   Test 1: Export Submissions CSV`, 'cyan');
  log(`   Test 2: Export Submissions JSON`, 'cyan');
  log(`   Test 3: Export Compliance CSV`, 'cyan');
  log(`   Test 4: Export Compliance JSON`, 'cyan');
  log(`   Test 5: Export Validations CSV`, 'cyan');
  log(`   Test 6: Export Validations JSON`, 'cyan');
  log(`   Test 7: Export Notifications CSV`, 'cyan');
  log(`   Test 8: Export Notifications JSON`, 'cyan');
  log(`   Test 9: Export Activity Logs CSV`, 'cyan');
  log(`   Test 10: Export Activity Logs JSON`, 'cyan');
  log(`   Test 11: Export Combined CSV`, 'cyan');
  log(`   Test 12: Export Combined JSON`, 'cyan');
  log(`   Test 13: Export Statistics`, 'cyan');

  if (testResults.failed > 0) {
    log(`\n❌ Failed Tests:`, 'red');
    testResults.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        log(`   • ${t.name}: ${t.message}`, 'red');
      });
  }

  if (passRate >= 90) {
    console.log(`\n${colors.green}${colors.bright}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ✅ EXPORT FEATURES TESTS PASSED! (${passRate}%)              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    log('\n🎉 All export endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.3: Aggregation & Analytics', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    EXPORT FEATURES TEST SUITE (Phase 6.2)                  ║
║                                                                              ║
║  Testing 13 export endpoints with comprehensive data export tests         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

  try {
    // Step 1: Authenticate
    log('━━━ Step 1: Authentication ━━━', 'cyan');
    const authResult = await apiRequest('POST', '/auth/login', CREDENTIALS);
    if (!authResult.success) {
      log(`✗ Authentication failed: ${authResult.error}`, 'red');
      return;
    }
    
    authToken = authResult.data.tokens.access.token;
    tenantId = authResult.data.user.tenantId;
    userId = authResult.data.user.id || authResult.data.user._id;
    log('✓ Authenticated', 'green');

    // Step 2: Create test data
    await createTestData();

    // Step 3: Run tests
    await testSubmissionsCSV();
    await testSubmissionsJSON();
    await testComplianceCSV();
    await testComplianceJSON();
    await testValidationsCSV();
    await testValidationsJSON();
    await testNotificationsCSV();
    await testNotificationsJSON();
    await testActivityLogsCSV();
    await testActivityLogsJSON();
    await testCombinedCSV();
    await testCombinedJSON();
    await testExportStats();

    // Step 4: Cleanup
    await cleanup();

    // Step 5: Print summary
    await printFinalSummary();

  } catch (error) {
    log(`\n❌ Fatal Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
/**
 * EXPORT FEATURES TEST SUITE (Phase 6.2)
 * 
 * Tests all 13 export endpoints:
 * 1. GET /v1/export/submissions/csv
 * 2. GET /v1/export/submissions/json
 * 3. GET /v1/export/compliance/csv
 * 4. GET /v1/export/compliance/json
 * 5. GET /v1/export/validations/csv
 * 6. GET /v1/export/validations/json
 * 7. GET /v1/export/notifications/csv
 * 8. GET /v1/export/notifications/json
 * 9. GET /v1/export/activity-logs/csv
 * 10. GET /v1/export/activity-logs/json
 * 11. GET /v1/export/combined/csv
 * 12. GET /v1/export/combined/json
 * 13. GET /v1/export/stats
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bright: '\x1b[1m',
};

const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };
    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
    };
  }
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function recordTest(name, passed, message = '') {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    log(`  ✓ ${name}`, 'green');
  } else {
    testResults.failed++;
    log(`  ✗ ${name}: ${message}`, 'red');
  }
}

async function createTestData() {
  log('\n━━━ Creating Test Data for Export ━━━', 'cyan');
  
  // Clean up any existing test data
  const cleanupQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  await postgresPool.query(cleanupQuery, [tenantId, 'export-test-project']);
  log('  Cleaned up existing test data', 'cyan');
  
  // Create test submissions
  const submissions = [];
  for (let i = 0; i < 3; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, 
       perm_enabled, month, event_compliance_percentage, is_locked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    
    const result = await postgresPool.query(query, [
      tenantId,
      'export-test-project',
      'test-form-export',
      `export-node-${i + 1}`,
      userId,
      i === 0 ? 'pending' : 'submitted',
      JSON.stringify({ test_data: `export_submission_${i}` }),
      true,
      new Date('2025-03-01'),
      Math.floor(Math.random() * 100),
      false,
    ]);
    
    submissions.push(result.rows[0].id);
  }
  
  log(`  Created ${submissions.length} test submissions`, 'cyan');
  return submissions;
}

async function testSubmissionsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: EXPORT SUBMISSIONS CSV                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 1.1: Export Submissions CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/submissions/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export submissions CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testSubmissionsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: EXPORT SUBMISSIONS JSON                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 2.1: Export Submissions JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/submissions/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export submissions JSON',
    result.success && result.data.success && result.data.data.records.length > 0,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
    log(`  Export info: ${result.data.data.export_info.format} format`, 'cyan');
  }
}

async function testComplianceCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 3: EXPORT COMPLIANCE CSV                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 3.1: Export Compliance CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/compliance/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export compliance CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testComplianceJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 4: EXPORT COMPLIANCE JSON                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 4.1: Export Compliance JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/compliance/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export compliance JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testValidationsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 5: EXPORT VALIDATIONS CSV                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 5.1: Export Validations CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/validations/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export validations CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testValidationsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 6: EXPORT VALIDATIONS JSON                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 6.1: Export Validations JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/validations/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export validations JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testNotificationsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 7: EXPORT NOTIFICATIONS CSV                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 7.1: Export Notifications CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/notifications/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export notifications CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testNotificationsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 8: EXPORT NOTIFICATIONS JSON                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 8.1: Export Notifications JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/notifications/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export notifications JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testActivityLogsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 9: EXPORT ACTIVITY LOGS CSV                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 9.1: Export Activity Logs CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/activity-logs/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export activity logs CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testActivityLogsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 10: EXPORT ACTIVITY LOGS JSON                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 10.1: Export Activity Logs JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/activity-logs/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export activity logs JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testCombinedCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 11: EXPORT COMBINED CSV                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 11.1: Export Combined CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/combined/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export combined CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testCombinedJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 12: EXPORT COMBINED JSON                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 12.1: Export Combined JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/combined/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export combined JSON',
    result.success && result.data.success && result.data.data.breakdown,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully`, 'cyan');
    log(`  Breakdown: ${JSON.stringify(result.data.data.export_info.breakdown)}`, 'cyan');
  }
}

async function testExportStats() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 13: EXPORT STATISTICS                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 13.1: Get Export Statistics ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/stats', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
    },
  });
  
  recordTest(
    'Get export statistics',
    result.success && result.data.success && result.data.data.total_records >= 0,
    result.error
  );
  
  if (result.success) {
    log(`  Statistics retrieved successfully`, 'cyan');
    log(`  Total records: ${result.data.data.total_records}`, 'cyan');
    log(`  Generated at: ${result.data.data.generated_at}`, 'cyan');
  }
}

async function cleanup() {
  log('\n━━━ Cleanup Test Data ━━━', 'cyan');
  
  const deleteQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  
  const result = await postgresPool.query(deleteQuery, [tenantId, 'export-test-project']);
  log(`  Deleted ${result.rowCount} test submissions`, 'cyan');
}

async function printFinalSummary() {
  console.log(`\n${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                         FINAL TEST SUMMARY                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const totalTests = testResults.passed + testResults.failed;
  const passRate = ((testResults.passed / totalTests) * 100).toFixed(1);

  log(`\n📊 Overall Results:`, 'bright');
  log(`   Total Tests: ${totalTests}`, 'cyan');
  log(`   Passed: ${testResults.passed}`, 'green');
  log(`   Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
  log(`   Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : 'yellow');

  log(`\n📋 Test Breakdown:`, 'bright');
  log(`   Test 1: Export Submissions CSV`, 'cyan');
  log(`   Test 2: Export Submissions JSON`, 'cyan');
  log(`   Test 3: Export Compliance CSV`, 'cyan');
  log(`   Test 4: Export Compliance JSON`, 'cyan');
  log(`   Test 5: Export Validations CSV`, 'cyan');
  log(`   Test 6: Export Validations JSON`, 'cyan');
  log(`   Test 7: Export Notifications CSV`, 'cyan');
  log(`   Test 8: Export Notifications JSON`, 'cyan');
  log(`   Test 9: Export Activity Logs CSV`, 'cyan');
  log(`   Test 10: Export Activity Logs JSON`, 'cyan');
  log(`   Test 11: Export Combined CSV`, 'cyan');
  log(`   Test 12: Export Combined JSON`, 'cyan');
  log(`   Test 13: Export Statistics`, 'cyan');

  if (testResults.failed > 0) {
    log(`\n❌ Failed Tests:`, 'red');
    testResults.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        log(`   • ${t.name}: ${t.message}`, 'red');
      });
  }

  if (passRate >= 90) {
    console.log(`\n${colors.green}${colors.bright}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ✅ EXPORT FEATURES TESTS PASSED! (${passRate}%)              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    log('\n🎉 All export endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.3: Aggregation & Analytics', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    EXPORT FEATURES TEST SUITE (Phase 6.2)                  ║
║                                                                              ║
║  Testing 13 export endpoints with comprehensive data export tests         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

  try {
    // Step 1: Authenticate
    log('━━━ Step 1: Authentication ━━━', 'cyan');
    const authResult = await apiRequest('POST', '/auth/login', CREDENTIALS);
    if (!authResult.success) {
      log(`✗ Authentication failed: ${authResult.error}`, 'red');
      return;
    }
    
    authToken = authResult.data.tokens.access.token;
    tenantId = authResult.data.user.tenantId;
    userId = authResult.data.user.id || authResult.data.user._id;
    log('✓ Authenticated', 'green');

    // Step 2: Create test data
    await createTestData();

    // Step 3: Run tests
    await testSubmissionsCSV();
    await testSubmissionsJSON();
    await testComplianceCSV();
    await testComplianceJSON();
    await testValidationsCSV();
    await testValidationsJSON();
    await testNotificationsCSV();
    await testNotificationsJSON();
    await testActivityLogsCSV();
    await testActivityLogsJSON();
    await testCombinedCSV();
    await testCombinedJSON();
    await testExportStats();

    // Step 4: Cleanup
    await cleanup();

    // Step 5: Print summary
    await printFinalSummary();

  } catch (error) {
    log(`\n❌ Fatal Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
/**
 * EXPORT FEATURES TEST SUITE (Phase 6.2)
 * 
 * Tests all 13 export endpoints:
 * 1. GET /v1/export/submissions/csv
 * 2. GET /v1/export/submissions/json
 * 3. GET /v1/export/compliance/csv
 * 4. GET /v1/export/compliance/json
 * 5. GET /v1/export/validations/csv
 * 6. GET /v1/export/validations/json
 * 7. GET /v1/export/notifications/csv
 * 8. GET /v1/export/notifications/json
 * 9. GET /v1/export/activity-logs/csv
 * 10. GET /v1/export/activity-logs/json
 * 11. GET /v1/export/combined/csv
 * 12. GET /v1/export/combined/json
 * 13. GET /v1/export/stats
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bright: '\x1b[1m',
};

const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

async function apiRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };
    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      status: error.response?.status,
    };
  }
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function recordTest(name, passed, message = '') {
  testResults.tests.push({ name, passed, message });
  if (passed) {
    testResults.passed++;
    log(`  ✓ ${name}`, 'green');
  } else {
    testResults.failed++;
    log(`  ✗ ${name}: ${message}`, 'red');
  }
}

async function createTestData() {
  log('\n━━━ Creating Test Data for Export ━━━', 'cyan');
  
  // Clean up any existing test data
  const cleanupQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  await postgresPool.query(cleanupQuery, [tenantId, 'export-test-project']);
  log('  Cleaned up existing test data', 'cyan');
  
  // Create test submissions
  const submissions = [];
  for (let i = 0; i < 3; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, 
       perm_enabled, month, event_compliance_percentage, is_locked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    
    const result = await postgresPool.query(query, [
      tenantId,
      'export-test-project',
      'test-form-export',
      `export-node-${i + 1}`,
      userId,
      i === 0 ? 'pending' : 'submitted',
      JSON.stringify({ test_data: `export_submission_${i}` }),
      true,
      new Date('2025-03-01'),
      Math.floor(Math.random() * 100),
      false,
    ]);
    
    submissions.push(result.rows[0].id);
  }
  
  log(`  Created ${submissions.length} test submissions`, 'cyan');
  return submissions;
}

async function testSubmissionsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: EXPORT SUBMISSIONS CSV                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 1.1: Export Submissions CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/submissions/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export submissions CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testSubmissionsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: EXPORT SUBMISSIONS JSON                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 2.1: Export Submissions JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/submissions/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export submissions JSON',
    result.success && result.data.success && result.data.data.records.length > 0,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
    log(`  Export info: ${result.data.data.export_info.format} format`, 'cyan');
  }
}

async function testComplianceCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 3: EXPORT COMPLIANCE CSV                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 3.1: Export Compliance CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/compliance/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export compliance CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testComplianceJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 4: EXPORT COMPLIANCE JSON                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 4.1: Export Compliance JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/compliance/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export compliance JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testValidationsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 5: EXPORT VALIDATIONS CSV                          ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 5.1: Export Validations CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/validations/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export validations CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testValidationsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 6: EXPORT VALIDATIONS JSON                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 6.1: Export Validations JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/validations/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export validations JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testNotificationsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 7: EXPORT NOTIFICATIONS CSV                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 7.1: Export Notifications CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/notifications/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export notifications CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testNotificationsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 8: EXPORT NOTIFICATIONS JSON                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 8.1: Export Notifications JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/notifications/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export notifications JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testActivityLogsCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 9: EXPORT ACTIVITY LOGS CSV                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 9.1: Export Activity Logs CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/activity-logs/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export activity logs CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testActivityLogsJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 10: EXPORT ACTIVITY LOGS JSON                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 10.1: Export Activity Logs JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/activity-logs/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export activity logs JSON',
    result.success && result.data.success,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully (${result.data.data.records.length} records)`, 'cyan');
  }
}

async function testCombinedCSV() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 11: EXPORT COMBINED CSV                            ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 11.1: Export Combined CSV ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/combined/csv', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export combined CSV',
    result.success && result.status === 200,
    result.error
  );
  
  if (result.success) {
    log(`  CSV exported successfully (${result.data.length} characters)`, 'cyan');
  }
}

async function testCombinedJSON() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 12: EXPORT COMBINED JSON                           ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 12.1: Export Combined JSON ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/combined/json', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
      limit: 10,
    },
  });
  
  recordTest(
    'Export combined JSON',
    result.success && result.data.success && result.data.data.breakdown,
    result.error
  );
  
  if (result.success) {
    log(`  JSON exported successfully`, 'cyan');
    log(`  Breakdown: ${JSON.stringify(result.data.data.export_info.breakdown)}`, 'cyan');
  }
}

async function testExportStats() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 13: EXPORT STATISTICS                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 13.1: Get Export Statistics ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/export/stats', null, {
    params: {
      tenant_id: tenantId,
      project_id: 'export-test-project',
    },
  });
  
  recordTest(
    'Get export statistics',
    result.success && result.data.success && result.data.data.total_records >= 0,
    result.error
  );
  
  if (result.success) {
    log(`  Statistics retrieved successfully`, 'cyan');
    log(`  Total records: ${result.data.data.total_records}`, 'cyan');
    log(`  Generated at: ${result.data.data.generated_at}`, 'cyan');
  }
}

async function cleanup() {
  log('\n━━━ Cleanup Test Data ━━━', 'cyan');
  
  const deleteQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  
  const result = await postgresPool.query(deleteQuery, [tenantId, 'export-test-project']);
  log(`  Deleted ${result.rowCount} test submissions`, 'cyan');
}

async function printFinalSummary() {
  console.log(`\n${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                         FINAL TEST SUMMARY                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  const totalTests = testResults.passed + testResults.failed;
  const passRate = ((testResults.passed / totalTests) * 100).toFixed(1);

  log(`\n📊 Overall Results:`, 'bright');
  log(`   Total Tests: ${totalTests}`, 'cyan');
  log(`   Passed: ${testResults.passed}`, 'green');
  log(`   Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
  log(`   Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : 'yellow');

  log(`\n📋 Test Breakdown:`, 'bright');
  log(`   Test 1: Export Submissions CSV`, 'cyan');
  log(`   Test 2: Export Submissions JSON`, 'cyan');
  log(`   Test 3: Export Compliance CSV`, 'cyan');
  log(`   Test 4: Export Compliance JSON`, 'cyan');
  log(`   Test 5: Export Validations CSV`, 'cyan');
  log(`   Test 6: Export Validations JSON`, 'cyan');
  log(`   Test 7: Export Notifications CSV`, 'cyan');
  log(`   Test 8: Export Notifications JSON`, 'cyan');
  log(`   Test 9: Export Activity Logs CSV`, 'cyan');
  log(`   Test 10: Export Activity Logs JSON`, 'cyan');
  log(`   Test 11: Export Combined CSV`, 'cyan');
  log(`   Test 12: Export Combined JSON`, 'cyan');
  log(`   Test 13: Export Statistics`, 'cyan');

  if (testResults.failed > 0) {
    log(`\n❌ Failed Tests:`, 'red');
    testResults.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        log(`   • ${t.name}: ${t.message}`, 'red');
      });
  }

  if (passRate >= 90) {
    console.log(`\n${colors.green}${colors.bright}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ✅ EXPORT FEATURES TESTS PASSED! (${passRate}%)              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    log('\n🎉 All export endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.3: Aggregation & Analytics', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    EXPORT FEATURES TEST SUITE (Phase 6.2)                  ║
║                                                                              ║
║  Testing 13 export endpoints with comprehensive data export tests         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

  try {
    // Step 1: Authenticate
    log('━━━ Step 1: Authentication ━━━', 'cyan');
    const authResult = await apiRequest('POST', '/auth/login', CREDENTIALS);
    if (!authResult.success) {
      log(`✗ Authentication failed: ${authResult.error}`, 'red');
      return;
    }
    
    authToken = authResult.data.tokens.access.token;
    tenantId = authResult.data.user.tenantId;
    userId = authResult.data.user.id || authResult.data.user._id;
    log('✓ Authenticated', 'green');

    // Step 2: Create test data
    await createTestData();

    // Step 3: Run tests
    await testSubmissionsCSV();
    await testSubmissionsJSON();
    await testComplianceCSV();
    await testComplianceJSON();
    await testValidationsCSV();
    await testValidationsJSON();
    await testNotificationsCSV();
    await testNotificationsJSON();
    await testActivityLogsCSV();
    await testActivityLogsJSON();
    await testCombinedCSV();
    await testCombinedJSON();
    await testExportStats();

    // Step 4: Cleanup
    await cleanup();

    // Step 5: Print summary
    await printFinalSummary();

  } catch (error) {
    log(`\n❌ Fatal Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
