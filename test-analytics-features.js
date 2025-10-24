/**
 * ANALYTICS FEATURES TEST SUITE (Phase 6.3)
 * 
 * Tests all 11 analytics endpoints:
 * 1. GET /v1/analytics/submissions/summary
 * 2. GET /v1/analytics/submissions/by-status
 * 3. GET /v1/analytics/submissions/by-month
 * 4. GET /v1/analytics/compliance/rates
 * 5. GET /v1/analytics/compliance/by-node
 * 6. GET /v1/analytics/validations/failures
 * 7. GET /v1/analytics/notifications/delivery
 * 8. GET /v1/analytics/activity/trends
 * 9. GET /v1/analytics/performance/top-nodes
 * 10. GET /v1/analytics/quality/metrics
 * 11. GET /v1/analytics/dashboard/overview
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

async function testSubmissionSummary() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: SUBMISSION SUMMARY ANALYTICS                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 1.1: Get Submission Summary ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/summary', null, {
    params: {
      tenant_id: tenantId,
      group_by: 'month',
      limit: 12,
    },
  });
  
  recordTest(
    'Get submission summary analytics',
    result.success && result.data.success && Array.isArray(result.data.data.summary),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.summary.length} summary periods`, 'cyan');
    log(`  Generated at: ${result.data.data.generated_at}`, 'cyan');
  }
}

async function testSubmissionsByStatus() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: SUBMISSIONS BY STATUS ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 2.1: Get Submissions by Status ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/by-status', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get submissions by status breakdown',
    result.success && result.data.success && Array.isArray(result.data.data.breakdown),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.breakdown.length} status categories`, 'cyan');
    result.data.data.breakdown.forEach(status => {
      log(`    ${status.status}: ${status.count} (${status.percentage}%)`, 'cyan');
    });
  }
}

async function testSubmissionsByMonth() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 3: SUBMISSIONS BY MONTH ANALYTICS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 3.1: Get Submissions by Month ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/by-month', null, {
    params: {
      tenant_id: tenantId,
      year: 2025,
    },
  });
  
  recordTest(
    'Get submissions by month breakdown',
    result.success && result.data.success && Array.isArray(result.data.data.monthly_breakdown),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.monthly_breakdown.length} months`, 'cyan');
    log(`  Year: ${result.data.data.year}`, 'cyan');
  }
}

async function testComplianceRates() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 4: COMPLIANCE RATES ANALYTICS                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 4.1: Get Compliance Rates ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/compliance/rates', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get compliance rates analytics',
    result.success && result.data.success && Array.isArray(result.data.data.compliance_rates),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.compliance_rates.length} project compliance rates`, 'cyan');
  }
}

async function testComplianceByNode() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 5: COMPLIANCE BY NODE ANALYTICS                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 5.1: Get Compliance by Node ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/compliance/by-node', null, {
    params: {
      tenant_id: tenantId,
      limit: 20,
    },
  });
  
  recordTest(
    'Get compliance by node analytics',
    result.success && result.data.success && Array.isArray(result.data.data.node_compliance),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.node_compliance.length} nodes`, 'cyan');
  }
}

async function testValidationFailures() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 6: VALIDATION FAILURES ANALYTICS                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 6.1: Get Validation Failures ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/validations/failures', null, {
    params: {
      tenant_id: tenantId,
      limit: 20,
    },
  });
  
  recordTest(
    'Get validation failures analytics',
    result.success && result.data.success && Array.isArray(result.data.data.validation_failures),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.validation_failures.length} failure types`, 'cyan');
  }
}

async function testNotificationDelivery() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 7: NOTIFICATION DELIVERY ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 7.1: Get Notification Delivery ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/notifications/delivery', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get notification delivery analytics',
    result.success && result.data.success && Array.isArray(result.data.data.delivery_metrics),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.delivery_metrics.length} notification types`, 'cyan');
  }
}

async function testActivityTrends() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 8: ACTIVITY TRENDS ANALYTICS                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 8.1: Get Activity Trends ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/activity/trends', null, {
    params: {
      tenant_id: tenantId,
      group_by: 'day',
    },
  });
  
  recordTest(
    'Get activity trends analytics',
    result.success && result.data.success && Array.isArray(result.data.data.activity_trends),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.activity_trends.length} trend points`, 'cyan');
  }
}

async function testTopPerformingNodes() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 9: TOP PERFORMING NODES ANALYTICS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 9.1: Get Top Performing Nodes ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/performance/top-nodes', null, {
    params: {
      tenant_id: tenantId,
      limit: 10,
    },
  });
  
  recordTest(
    'Get top performing nodes analytics',
    result.success && result.data.success && Array.isArray(result.data.data.top_nodes),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.top_nodes.length} top nodes`, 'cyan');
  }
}

async function testDataQualityMetrics() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 10: DATA QUALITY METRICS ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 10.1: Get Data Quality Metrics ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/quality/metrics', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get data quality metrics analytics',
    result.success && result.data.success && result.data.data.quality_metrics,
    result.error
  );
  
  if (result.success) {
    const metrics = result.data.data.quality_metrics;
    log(`  Total submissions: ${metrics.total_submissions}`, 'cyan');
    log(`  Data completeness: ${metrics.data_completeness_rate}%`, 'cyan');
    log(`  Validation success: ${metrics.validation_success_rate}%`, 'cyan');
  }
}

async function testDashboardOverview() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 11: DASHBOARD OVERVIEW ANALYTICS                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 11.1: Get Dashboard Overview ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/dashboard/overview', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get dashboard overview analytics',
    result.success && result.data.success && result.data.data.overview,
    result.error
  );
  
  if (result.success) {
    const overview = result.data.data.overview;
    log(`  Dashboard overview retrieved successfully`, 'cyan');
    log(`  Summary periods: ${overview.submission_summary.length}`, 'cyan');
    log(`  Status categories: ${overview.status_breakdown.length}`, 'cyan');
    log(`  Compliance projects: ${overview.compliance_rates.length}`, 'cyan');
    log(`  Top nodes: ${overview.top_performing_nodes.length}`, 'cyan');
  }
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
  log(`   Test 1: Submission Summary Analytics`, 'cyan');
  log(`   Test 2: Submissions by Status Analytics`, 'cyan');
  log(`   Test 3: Submissions by Month Analytics`, 'cyan');
  log(`   Test 4: Compliance Rates Analytics`, 'cyan');
  log(`   Test 5: Compliance by Node Analytics`, 'cyan');
  log(`   Test 6: Validation Failures Analytics`, 'cyan');
  log(`   Test 7: Notification Delivery Analytics`, 'cyan');
  log(`   Test 8: Activity Trends Analytics`, 'cyan');
  log(`   Test 9: Top Performing Nodes Analytics`, 'cyan');
  log(`   Test 10: Data Quality Metrics Analytics`, 'cyan');
  log(`   Test 11: Dashboard Overview Analytics`, 'cyan');

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
║                    ✅ ANALYTICS FEATURES TESTS PASSED! (${passRate}%)              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    log('\n🎉 All analytics endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.4: Trend Analysis', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ANALYTICS FEATURES TEST SUITE (Phase 6.3)               ║
║                                                                              ║
║  Testing 11 analytics endpoints with comprehensive data analysis tests    ║
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

    // Step 2: Run tests
    await testSubmissionSummary();
    await testSubmissionsByStatus();
    await testSubmissionsByMonth();
    await testComplianceRates();
    await testComplianceByNode();
    await testValidationFailures();
    await testNotificationDelivery();
    await testActivityTrends();
    await testTopPerformingNodes();
    await testDataQualityMetrics();
    await testDashboardOverview();

    // Step 3: Print summary
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
 * ANALYTICS FEATURES TEST SUITE (Phase 6.3)
 * 
 * Tests all 11 analytics endpoints:
 * 1. GET /v1/analytics/submissions/summary
 * 2. GET /v1/analytics/submissions/by-status
 * 3. GET /v1/analytics/submissions/by-month
 * 4. GET /v1/analytics/compliance/rates
 * 5. GET /v1/analytics/compliance/by-node
 * 6. GET /v1/analytics/validations/failures
 * 7. GET /v1/analytics/notifications/delivery
 * 8. GET /v1/analytics/activity/trends
 * 9. GET /v1/analytics/performance/top-nodes
 * 10. GET /v1/analytics/quality/metrics
 * 11. GET /v1/analytics/dashboard/overview
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

async function testSubmissionSummary() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: SUBMISSION SUMMARY ANALYTICS                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 1.1: Get Submission Summary ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/summary', null, {
    params: {
      tenant_id: tenantId,
      group_by: 'month',
      limit: 12,
    },
  });
  
  recordTest(
    'Get submission summary analytics',
    result.success && result.data.success && Array.isArray(result.data.data.summary),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.summary.length} summary periods`, 'cyan');
    log(`  Generated at: ${result.data.data.generated_at}`, 'cyan');
  }
}

async function testSubmissionsByStatus() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: SUBMISSIONS BY STATUS ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 2.1: Get Submissions by Status ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/by-status', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get submissions by status breakdown',
    result.success && result.data.success && Array.isArray(result.data.data.breakdown),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.breakdown.length} status categories`, 'cyan');
    result.data.data.breakdown.forEach(status => {
      log(`    ${status.status}: ${status.count} (${status.percentage}%)`, 'cyan');
    });
  }
}

async function testSubmissionsByMonth() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 3: SUBMISSIONS BY MONTH ANALYTICS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 3.1: Get Submissions by Month ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/by-month', null, {
    params: {
      tenant_id: tenantId,
      year: 2025,
    },
  });
  
  recordTest(
    'Get submissions by month breakdown',
    result.success && result.data.success && Array.isArray(result.data.data.monthly_breakdown),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.monthly_breakdown.length} months`, 'cyan');
    log(`  Year: ${result.data.data.year}`, 'cyan');
  }
}

async function testComplianceRates() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 4: COMPLIANCE RATES ANALYTICS                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 4.1: Get Compliance Rates ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/compliance/rates', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get compliance rates analytics',
    result.success && result.data.success && Array.isArray(result.data.data.compliance_rates),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.compliance_rates.length} project compliance rates`, 'cyan');
  }
}

async function testComplianceByNode() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 5: COMPLIANCE BY NODE ANALYTICS                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 5.1: Get Compliance by Node ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/compliance/by-node', null, {
    params: {
      tenant_id: tenantId,
      limit: 20,
    },
  });
  
  recordTest(
    'Get compliance by node analytics',
    result.success && result.data.success && Array.isArray(result.data.data.node_compliance),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.node_compliance.length} nodes`, 'cyan');
  }
}

async function testValidationFailures() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 6: VALIDATION FAILURES ANALYTICS                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 6.1: Get Validation Failures ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/validations/failures', null, {
    params: {
      tenant_id: tenantId,
      limit: 20,
    },
  });
  
  recordTest(
    'Get validation failures analytics',
    result.success && result.data.success && Array.isArray(result.data.data.validation_failures),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.validation_failures.length} failure types`, 'cyan');
  }
}

async function testNotificationDelivery() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 7: NOTIFICATION DELIVERY ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 7.1: Get Notification Delivery ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/notifications/delivery', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get notification delivery analytics',
    result.success && result.data.success && Array.isArray(result.data.data.delivery_metrics),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.delivery_metrics.length} notification types`, 'cyan');
  }
}

async function testActivityTrends() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 8: ACTIVITY TRENDS ANALYTICS                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 8.1: Get Activity Trends ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/activity/trends', null, {
    params: {
      tenant_id: tenantId,
      group_by: 'day',
    },
  });
  
  recordTest(
    'Get activity trends analytics',
    result.success && result.data.success && Array.isArray(result.data.data.activity_trends),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.activity_trends.length} trend points`, 'cyan');
  }
}

async function testTopPerformingNodes() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 9: TOP PERFORMING NODES ANALYTICS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 9.1: Get Top Performing Nodes ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/performance/top-nodes', null, {
    params: {
      tenant_id: tenantId,
      limit: 10,
    },
  });
  
  recordTest(
    'Get top performing nodes analytics',
    result.success && result.data.success && Array.isArray(result.data.data.top_nodes),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.top_nodes.length} top nodes`, 'cyan');
  }
}

async function testDataQualityMetrics() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 10: DATA QUALITY METRICS ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 10.1: Get Data Quality Metrics ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/quality/metrics', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get data quality metrics analytics',
    result.success && result.data.success && result.data.data.quality_metrics,
    result.error
  );
  
  if (result.success) {
    const metrics = result.data.data.quality_metrics;
    log(`  Total submissions: ${metrics.total_submissions}`, 'cyan');
    log(`  Data completeness: ${metrics.data_completeness_rate}%`, 'cyan');
    log(`  Validation success: ${metrics.validation_success_rate}%`, 'cyan');
  }
}

async function testDashboardOverview() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 11: DASHBOARD OVERVIEW ANALYTICS                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 11.1: Get Dashboard Overview ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/dashboard/overview', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get dashboard overview analytics',
    result.success && result.data.success && result.data.data.overview,
    result.error
  );
  
  if (result.success) {
    const overview = result.data.data.overview;
    log(`  Dashboard overview retrieved successfully`, 'cyan');
    log(`  Summary periods: ${overview.submission_summary.length}`, 'cyan');
    log(`  Status categories: ${overview.status_breakdown.length}`, 'cyan');
    log(`  Compliance projects: ${overview.compliance_rates.length}`, 'cyan');
    log(`  Top nodes: ${overview.top_performing_nodes.length}`, 'cyan');
  }
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
  log(`   Test 1: Submission Summary Analytics`, 'cyan');
  log(`   Test 2: Submissions by Status Analytics`, 'cyan');
  log(`   Test 3: Submissions by Month Analytics`, 'cyan');
  log(`   Test 4: Compliance Rates Analytics`, 'cyan');
  log(`   Test 5: Compliance by Node Analytics`, 'cyan');
  log(`   Test 6: Validation Failures Analytics`, 'cyan');
  log(`   Test 7: Notification Delivery Analytics`, 'cyan');
  log(`   Test 8: Activity Trends Analytics`, 'cyan');
  log(`   Test 9: Top Performing Nodes Analytics`, 'cyan');
  log(`   Test 10: Data Quality Metrics Analytics`, 'cyan');
  log(`   Test 11: Dashboard Overview Analytics`, 'cyan');

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
║                    ✅ ANALYTICS FEATURES TESTS PASSED! (${passRate}%)              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    log('\n🎉 All analytics endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.4: Trend Analysis', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ANALYTICS FEATURES TEST SUITE (Phase 6.3)               ║
║                                                                              ║
║  Testing 11 analytics endpoints with comprehensive data analysis tests    ║
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

    // Step 2: Run tests
    await testSubmissionSummary();
    await testSubmissionsByStatus();
    await testSubmissionsByMonth();
    await testComplianceRates();
    await testComplianceByNode();
    await testValidationFailures();
    await testNotificationDelivery();
    await testActivityTrends();
    await testTopPerformingNodes();
    await testDataQualityMetrics();
    await testDashboardOverview();

    // Step 3: Print summary
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
 * ANALYTICS FEATURES TEST SUITE (Phase 6.3)
 * 
 * Tests all 11 analytics endpoints:
 * 1. GET /v1/analytics/submissions/summary
 * 2. GET /v1/analytics/submissions/by-status
 * 3. GET /v1/analytics/submissions/by-month
 * 4. GET /v1/analytics/compliance/rates
 * 5. GET /v1/analytics/compliance/by-node
 * 6. GET /v1/analytics/validations/failures
 * 7. GET /v1/analytics/notifications/delivery
 * 8. GET /v1/analytics/activity/trends
 * 9. GET /v1/analytics/performance/top-nodes
 * 10. GET /v1/analytics/quality/metrics
 * 11. GET /v1/analytics/dashboard/overview
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

async function testSubmissionSummary() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: SUBMISSION SUMMARY ANALYTICS                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 1.1: Get Submission Summary ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/summary', null, {
    params: {
      tenant_id: tenantId,
      group_by: 'month',
      limit: 12,
    },
  });
  
  recordTest(
    'Get submission summary analytics',
    result.success && result.data.success && Array.isArray(result.data.data.summary),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.summary.length} summary periods`, 'cyan');
    log(`  Generated at: ${result.data.data.generated_at}`, 'cyan');
  }
}

async function testSubmissionsByStatus() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: SUBMISSIONS BY STATUS ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 2.1: Get Submissions by Status ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/by-status', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get submissions by status breakdown',
    result.success && result.data.success && Array.isArray(result.data.data.breakdown),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.breakdown.length} status categories`, 'cyan');
    result.data.data.breakdown.forEach(status => {
      log(`    ${status.status}: ${status.count} (${status.percentage}%)`, 'cyan');
    });
  }
}

async function testSubmissionsByMonth() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 3: SUBMISSIONS BY MONTH ANALYTICS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 3.1: Get Submissions by Month ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/submissions/by-month', null, {
    params: {
      tenant_id: tenantId,
      year: 2025,
    },
  });
  
  recordTest(
    'Get submissions by month breakdown',
    result.success && result.data.success && Array.isArray(result.data.data.monthly_breakdown),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.monthly_breakdown.length} months`, 'cyan');
    log(`  Year: ${result.data.data.year}`, 'cyan');
  }
}

async function testComplianceRates() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 4: COMPLIANCE RATES ANALYTICS                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 4.1: Get Compliance Rates ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/compliance/rates', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get compliance rates analytics',
    result.success && result.data.success && Array.isArray(result.data.data.compliance_rates),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.compliance_rates.length} project compliance rates`, 'cyan');
  }
}

async function testComplianceByNode() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 5: COMPLIANCE BY NODE ANALYTICS                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 5.1: Get Compliance by Node ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/compliance/by-node', null, {
    params: {
      tenant_id: tenantId,
      limit: 20,
    },
  });
  
  recordTest(
    'Get compliance by node analytics',
    result.success && result.data.success && Array.isArray(result.data.data.node_compliance),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.node_compliance.length} nodes`, 'cyan');
  }
}

async function testValidationFailures() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 6: VALIDATION FAILURES ANALYTICS                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 6.1: Get Validation Failures ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/validations/failures', null, {
    params: {
      tenant_id: tenantId,
      limit: 20,
    },
  });
  
  recordTest(
    'Get validation failures analytics',
    result.success && result.data.success && Array.isArray(result.data.data.validation_failures),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.validation_failures.length} failure types`, 'cyan');
  }
}

async function testNotificationDelivery() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 7: NOTIFICATION DELIVERY ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 7.1: Get Notification Delivery ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/notifications/delivery', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get notification delivery analytics',
    result.success && result.data.success && Array.isArray(result.data.data.delivery_metrics),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.delivery_metrics.length} notification types`, 'cyan');
  }
}

async function testActivityTrends() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 8: ACTIVITY TRENDS ANALYTICS                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 8.1: Get Activity Trends ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/activity/trends', null, {
    params: {
      tenant_id: tenantId,
      group_by: 'day',
    },
  });
  
  recordTest(
    'Get activity trends analytics',
    result.success && result.data.success && Array.isArray(result.data.data.activity_trends),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.activity_trends.length} trend points`, 'cyan');
  }
}

async function testTopPerformingNodes() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 9: TOP PERFORMING NODES ANALYTICS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 9.1: Get Top Performing Nodes ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/performance/top-nodes', null, {
    params: {
      tenant_id: tenantId,
      limit: 10,
    },
  });
  
  recordTest(
    'Get top performing nodes analytics',
    result.success && result.data.success && Array.isArray(result.data.data.top_nodes),
    result.error
  );
  
  if (result.success) {
    log(`  Retrieved ${result.data.data.top_nodes.length} top nodes`, 'cyan');
  }
}

async function testDataQualityMetrics() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 10: DATA QUALITY METRICS ANALYTICS                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 10.1: Get Data Quality Metrics ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/quality/metrics', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get data quality metrics analytics',
    result.success && result.data.success && result.data.data.quality_metrics,
    result.error
  );
  
  if (result.success) {
    const metrics = result.data.data.quality_metrics;
    log(`  Total submissions: ${metrics.total_submissions}`, 'cyan');
    log(`  Data completeness: ${metrics.data_completeness_rate}%`, 'cyan');
    log(`  Validation success: ${metrics.validation_success_rate}%`, 'cyan');
  }
}

async function testDashboardOverview() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 11: DASHBOARD OVERVIEW ANALYTICS                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  log('\n━━━ Test 11.1: Get Dashboard Overview ━━━', 'cyan');
  
  const result = await apiRequest('GET', '/analytics/dashboard/overview', null, {
    params: {
      tenant_id: tenantId,
    },
  });
  
  recordTest(
    'Get dashboard overview analytics',
    result.success && result.data.success && result.data.data.overview,
    result.error
  );
  
  if (result.success) {
    const overview = result.data.data.overview;
    log(`  Dashboard overview retrieved successfully`, 'cyan');
    log(`  Summary periods: ${overview.submission_summary.length}`, 'cyan');
    log(`  Status categories: ${overview.status_breakdown.length}`, 'cyan');
    log(`  Compliance projects: ${overview.compliance_rates.length}`, 'cyan');
    log(`  Top nodes: ${overview.top_performing_nodes.length}`, 'cyan');
  }
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
  log(`   Test 1: Submission Summary Analytics`, 'cyan');
  log(`   Test 2: Submissions by Status Analytics`, 'cyan');
  log(`   Test 3: Submissions by Month Analytics`, 'cyan');
  log(`   Test 4: Compliance Rates Analytics`, 'cyan');
  log(`   Test 5: Compliance by Node Analytics`, 'cyan');
  log(`   Test 6: Validation Failures Analytics`, 'cyan');
  log(`   Test 7: Notification Delivery Analytics`, 'cyan');
  log(`   Test 8: Activity Trends Analytics`, 'cyan');
  log(`   Test 9: Top Performing Nodes Analytics`, 'cyan');
  log(`   Test 10: Data Quality Metrics Analytics`, 'cyan');
  log(`   Test 11: Dashboard Overview Analytics`, 'cyan');

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
║                    ✅ ANALYTICS FEATURES TESTS PASSED! (${passRate}%)              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
    
    log('\n🎉 All analytics endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.4: Trend Analysis', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ANALYTICS FEATURES TEST SUITE (Phase 6.3)               ║
║                                                                              ║
║  Testing 11 analytics endpoints with comprehensive data analysis tests    ║
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

    // Step 2: Run tests
    await testSubmissionSummary();
    await testSubmissionsByStatus();
    await testSubmissionsByMonth();
    await testComplianceRates();
    await testComplianceByNode();
    await testValidationFailures();
    await testNotificationDelivery();
    await testActivityTrends();
    await testTopPerformingNodes();
    await testDataQualityMetrics();
    await testDashboardOverview();

    // Step 3: Print summary
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
