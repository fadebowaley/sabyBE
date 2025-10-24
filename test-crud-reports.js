/**
 * CRUD Reports Testing Script
 * 
 * Tests all 34 API endpoints for submission, compliance, and validation reports.
 * 
 * Usage:
 *   node test-crud-reports.js
 * 
 * Requirements:
 *   - Backend server running on http://localhost:4000
 *   - Valid credentials: saby@saby.ai / @saby_Saby1
 *   - Test data in PostgreSQL
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

let authToken = null;
let testTenantId = null;
let testProjectId = null;
let testSubmissionId = null;
let testComplianceId = null;
let testValidationId = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

/**
 * Helper: Log test result
 */
function logTest(name, passed, error = null) {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`${colors.green}✓${colors.reset} ${name}`);
  } else {
    results.failed++;
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    if (error) {
      console.log(`  ${colors.red}Error: ${error}${colors.reset}`);
    }
  }
  results.tests.push({ name, passed, error });
}

/**
 * Helper: Log section header
 */
function logSection(title) {
  console.log(`\n${colors.cyan}${colors.bright}━━━ ${title} ━━━${colors.reset}`);
}

/**
 * Helper: Make authenticated request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };

    if (data) config.data = data;
    if (params) config.params = params;

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

/**
 * Test 1: Authentication
 */
async function testAuthentication() {
  logSection('AUTHENTICATION');

  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);

  if (result.success && result.data.tokens?.access?.token) {
    authToken = result.data.tokens.access.token;
    testTenantId = result.data.user?.tenantId;
    logTest('Login successful', true);
    console.log(`  Tenant ID: ${testTenantId}`);
    return true;
  } else {
    logTest('Login failed', false, result.error);
    return false;
  }
}

/**
 * Test 2: Submission Reports (14 endpoints)
 */
async function testSubmissionReports() {
  logSection('SUBMISSION REPORTS (14 endpoints)');

  // Test 2.1: Get all submissions
  let result = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: testTenantId,
    limit: 10,
  });
  logTest('GET /submission-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testSubmissionId = result.data.data[0].id;
    testProjectId = result.data.data[0].project_id;
    console.log(`  Found ${result.data.data.length} submissions`);
    console.log(`  Test Submission ID: ${testSubmissionId}`);
    console.log(`  Test Project ID: ${testProjectId}`);
  }

  // Test 2.2: Get submission by ID
  if (testSubmissionId) {
    result = await apiRequest('GET', `/submission-reports/${testSubmissionId}`);
    logTest('GET /submission-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/:id (skipped - no data)`);
  }

  // Test 2.3: Get submission statistics
  result = await apiRequest('GET', '/submission-reports/stats', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /submission-reports/stats (statistics)', result.success);
  if (result.success) {
    console.log(`  Total: ${result.data.data.total}, Completed: ${result.data.data.completed}`);
  }

  // Test 2.4: Get compliance report
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/compliance/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/compliance/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/compliance/:month (skipped - no project)`);
  }

  // Test 2.5: Get submissions by node
  if (testProjectId && testSubmissionId) {
    const nodeId = '00000000-0000-0000-0000-000000000001'; // Test node
    result = await apiRequest('GET', `/submission-reports/node/${nodeId}`, null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/node/:nodeId', result.success || result.status === 404);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/node/:nodeId (skipped)`);
  }

  // Test 2.6: Get monthly report
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/monthly/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/monthly/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/monthly/:month (skipped)`);
  }

  // Test 2.7: Get incomplete submissions
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/incomplete/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/incomplete/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/incomplete/:month (skipped)`);
  }

  // Test 2.8: Get locked submissions
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/locked', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/locked', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/locked (skipped)`);
  }

  // Test 2.9-2.14: Update/Delete operations (read-only test for safety)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /submission-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /submission-reports/:id/status (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/:id/lock (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/:id/unlock (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /submission-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/bulk-delete (skipped - read-only test)`);
  results.skipped += 6;
}

/**
 * Test 3: Compliance Reports (11 endpoints)
 */
async function testComplianceReports() {
  logSection('COMPLIANCE REPORTS (11 endpoints)');

  // Test 3.1: Get all compliance tracking
  let result = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testComplianceId = result.data.data[0].id;
    console.log(`  Found ${result.data.data.length} compliance records`);
    console.log(`  Test Compliance ID: ${testComplianceId}`);
  }

  // Test 3.2: Get compliance by ID
  if (testComplianceId) {
    result = await apiRequest('GET', `/compliance-reports/${testComplianceId}`);
    logTest('GET /compliance-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /compliance-reports/:id (skipped - no data)`);
  }

  // Test 3.3: Get compliance trends
  result = await apiRequest('GET', '/compliance-reports/trends', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/trends', result.success);

  // Test 3.4: Get node compliance
  const testNodeId = '00000000-0000-0000-0000-000000000001';
  result = await apiRequest('GET', `/compliance-reports/node/${testNodeId}`, null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/node/:nodeId', result.success || result.status === 404);

  // Test 3.5: Get project compliance
  if (testProjectId) {
    result = await apiRequest('GET', `/compliance-reports/project/${testProjectId}`, null, {
      tenant_id: testTenantId,
      month: '2025-01-01',
    });
    logTest('GET /compliance-reports/project/:projectId', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /compliance-reports/project/:projectId (skipped)`);
  }

  // Test 3.6: Get weekly progress
  result = await apiRequest('GET', '/compliance-reports/weekly/2025-01-01', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
    node_id: testNodeId,
  });
  logTest('GET /compliance-reports/weekly/:month', result.success);

  // Test 3.7: Get nodes by status
  result = await apiRequest('GET', '/compliance-reports/status/incomplete', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/status/:status', result.success);

  // Test 3.8-3.11: Update/Delete operations (read-only test)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /compliance-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /compliance-reports/:id/mark-event (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /compliance-reports/:id/reset (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /compliance-reports/:id (skipped - read-only test)`);
  results.skipped += 4;
}

/**
 * Test 4: Validation Reports (9 endpoints)
 */
async function testValidationReports() {
  logSection('VALIDATION REPORTS (9 endpoints)');

  // Test 4.1: Get all validations
  let result = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: testTenantId,
    limit: 10,
  });
  logTest('GET /validation-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testValidationId = result.data.data[0].id;
    console.log(`  Found ${result.data.data.length} validations`);
    console.log(`  Test Validation ID: ${testValidationId}`);
  }

  // Test 4.2: Get validation by ID
  if (testValidationId) {
    result = await apiRequest('GET', `/validation-reports/${testValidationId}`);
    logTest('GET /validation-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /validation-reports/:id (skipped - no data)`);
  }

  // Test 4.3: Get validations by submission
  if (testSubmissionId) {
    result = await apiRequest('GET', `/validation-reports/submission/${testSubmissionId}`);
    logTest('GET /validation-reports/submission/:id', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /validation-reports/submission/:id (skipped)`);
  }

  // Test 4.4: Get failed validations
  result = await apiRequest('GET', '/validation-reports/failed', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/failed', result.success);

  // Test 4.5: Get validation statistics
  result = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/stats', result.success);
  if (result.success) {
    console.log(`  Total: ${result.data.data.total_validations}, Failed: ${result.data.data.failed_validations}`);
  }

  // Test 4.6: Get validation errors
  result = await apiRequest('GET', '/validation-reports/errors', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/errors', result.success);

  // Test 4.7-4.9: Update/Delete operations (read-only test)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /validation-reports/:id/resolve (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /validation-reports/bulk-resolve (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /validation-reports/:id (skipped - read-only test)`);
  results.skipped += 3;
}

/**
 * Print final summary
 */
function printSummary() {
  console.log('\n');
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}                    TEST SUMMARY                           ${colors.reset}`);
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  
  console.log(`\nTotal Tests:    ${results.total}`);
  console.log(`${colors.green}Passed:         ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:         ${results.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped:        ${results.skipped}${colors.reset}`);
  console.log(`\nPass Rate:      ${passRate}%`);
  
  if (results.failed === 0 && results.passed > 0) {
    console.log(`\n${colors.green}${colors.bright}✓ ALL TESTS PASSED!${colors.reset}`);
  } else if (results.failed > 0) {
    console.log(`\n${colors.red}${colors.bright}✗ SOME TESTS FAILED${colors.reset}`);
    console.log(`\nFailed tests:`);
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  ${colors.red}✗${colors.reset} ${t.name}`);
        if (t.error) console.log(`    Error: ${t.error}`);
      });
  }
  
  console.log(`\n${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.bright}${colors.blue}
╔══════════════════════════════════════════════════════════════════════╗
║           CRUD REPORTS API TESTING - 34 ENDPOINTS                    ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Mode: Read-only (write operations skipped for safety)\n`);

  try {
    // Step 1: Authentication
    const authSuccess = await testAuthentication();
    if (!authSuccess) {
      console.log(`\n${colors.red}Authentication failed. Cannot proceed with tests.${colors.reset}`);
      return;
    }

    // Step 2: Submission Reports
    await testSubmissionReports();

    // Step 3: Compliance Reports
    await testComplianceReports();

    // Step 4: Validation Reports
    await testValidationReports();

    // Print summary
    printSummary();

  } catch (error) {
    console.error(`\n${colors.red}Fatal error during testing:${colors.reset}`, error.message);
  }
}

// Run tests
runTests();

/**
 * CRUD Reports Testing Script
 * 
 * Tests all 34 API endpoints for submission, compliance, and validation reports.
 * 
 * Usage:
 *   node test-crud-reports.js
 * 
 * Requirements:
 *   - Backend server running on http://localhost:4000
 *   - Valid credentials: saby@saby.ai / @saby_Saby1
 *   - Test data in PostgreSQL
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

let authToken = null;
let testTenantId = null;
let testProjectId = null;
let testSubmissionId = null;
let testComplianceId = null;
let testValidationId = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

/**
 * Helper: Log test result
 */
function logTest(name, passed, error = null) {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`${colors.green}✓${colors.reset} ${name}`);
  } else {
    results.failed++;
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    if (error) {
      console.log(`  ${colors.red}Error: ${error}${colors.reset}`);
    }
  }
  results.tests.push({ name, passed, error });
}

/**
 * Helper: Log section header
 */
function logSection(title) {
  console.log(`\n${colors.cyan}${colors.bright}━━━ ${title} ━━━${colors.reset}`);
}

/**
 * Helper: Make authenticated request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };

    if (data) config.data = data;
    if (params) config.params = params;

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

/**
 * Test 1: Authentication
 */
async function testAuthentication() {
  logSection('AUTHENTICATION');

  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);

  if (result.success && result.data.tokens?.access?.token) {
    authToken = result.data.tokens.access.token;
    testTenantId = result.data.user?.tenantId;
    logTest('Login successful', true);
    console.log(`  Tenant ID: ${testTenantId}`);
    return true;
  } else {
    logTest('Login failed', false, result.error);
    return false;
  }
}

/**
 * Test 2: Submission Reports (14 endpoints)
 */
async function testSubmissionReports() {
  logSection('SUBMISSION REPORTS (14 endpoints)');

  // Test 2.1: Get all submissions
  let result = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: testTenantId,
    limit: 10,
  });
  logTest('GET /submission-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testSubmissionId = result.data.data[0].id;
    testProjectId = result.data.data[0].project_id;
    console.log(`  Found ${result.data.data.length} submissions`);
    console.log(`  Test Submission ID: ${testSubmissionId}`);
    console.log(`  Test Project ID: ${testProjectId}`);
  }

  // Test 2.2: Get submission by ID
  if (testSubmissionId) {
    result = await apiRequest('GET', `/submission-reports/${testSubmissionId}`);
    logTest('GET /submission-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/:id (skipped - no data)`);
  }

  // Test 2.3: Get submission statistics
  result = await apiRequest('GET', '/submission-reports/stats', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /submission-reports/stats (statistics)', result.success);
  if (result.success) {
    console.log(`  Total: ${result.data.data.total}, Completed: ${result.data.data.completed}`);
  }

  // Test 2.4: Get compliance report
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/compliance/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/compliance/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/compliance/:month (skipped - no project)`);
  }

  // Test 2.5: Get submissions by node
  if (testProjectId && testSubmissionId) {
    const nodeId = '00000000-0000-0000-0000-000000000001'; // Test node
    result = await apiRequest('GET', `/submission-reports/node/${nodeId}`, null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/node/:nodeId', result.success || result.status === 404);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/node/:nodeId (skipped)`);
  }

  // Test 2.6: Get monthly report
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/monthly/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/monthly/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/monthly/:month (skipped)`);
  }

  // Test 2.7: Get incomplete submissions
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/incomplete/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/incomplete/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/incomplete/:month (skipped)`);
  }

  // Test 2.8: Get locked submissions
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/locked', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/locked', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/locked (skipped)`);
  }

  // Test 2.9-2.14: Update/Delete operations (read-only test for safety)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /submission-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /submission-reports/:id/status (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/:id/lock (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/:id/unlock (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /submission-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/bulk-delete (skipped - read-only test)`);
  results.skipped += 6;
}

/**
 * Test 3: Compliance Reports (11 endpoints)
 */
async function testComplianceReports() {
  logSection('COMPLIANCE REPORTS (11 endpoints)');

  // Test 3.1: Get all compliance tracking
  let result = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testComplianceId = result.data.data[0].id;
    console.log(`  Found ${result.data.data.length} compliance records`);
    console.log(`  Test Compliance ID: ${testComplianceId}`);
  }

  // Test 3.2: Get compliance by ID
  if (testComplianceId) {
    result = await apiRequest('GET', `/compliance-reports/${testComplianceId}`);
    logTest('GET /compliance-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /compliance-reports/:id (skipped - no data)`);
  }

  // Test 3.3: Get compliance trends
  result = await apiRequest('GET', '/compliance-reports/trends', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/trends', result.success);

  // Test 3.4: Get node compliance
  const testNodeId = '00000000-0000-0000-0000-000000000001';
  result = await apiRequest('GET', `/compliance-reports/node/${testNodeId}`, null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/node/:nodeId', result.success || result.status === 404);

  // Test 3.5: Get project compliance
  if (testProjectId) {
    result = await apiRequest('GET', `/compliance-reports/project/${testProjectId}`, null, {
      tenant_id: testTenantId,
      month: '2025-01-01',
    });
    logTest('GET /compliance-reports/project/:projectId', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /compliance-reports/project/:projectId (skipped)`);
  }

  // Test 3.6: Get weekly progress
  result = await apiRequest('GET', '/compliance-reports/weekly/2025-01-01', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
    node_id: testNodeId,
  });
  logTest('GET /compliance-reports/weekly/:month', result.success);

  // Test 3.7: Get nodes by status
  result = await apiRequest('GET', '/compliance-reports/status/incomplete', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/status/:status', result.success);

  // Test 3.8-3.11: Update/Delete operations (read-only test)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /compliance-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /compliance-reports/:id/mark-event (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /compliance-reports/:id/reset (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /compliance-reports/:id (skipped - read-only test)`);
  results.skipped += 4;
}

/**
 * Test 4: Validation Reports (9 endpoints)
 */
async function testValidationReports() {
  logSection('VALIDATION REPORTS (9 endpoints)');

  // Test 4.1: Get all validations
  let result = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: testTenantId,
    limit: 10,
  });
  logTest('GET /validation-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testValidationId = result.data.data[0].id;
    console.log(`  Found ${result.data.data.length} validations`);
    console.log(`  Test Validation ID: ${testValidationId}`);
  }

  // Test 4.2: Get validation by ID
  if (testValidationId) {
    result = await apiRequest('GET', `/validation-reports/${testValidationId}`);
    logTest('GET /validation-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /validation-reports/:id (skipped - no data)`);
  }

  // Test 4.3: Get validations by submission
  if (testSubmissionId) {
    result = await apiRequest('GET', `/validation-reports/submission/${testSubmissionId}`);
    logTest('GET /validation-reports/submission/:id', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /validation-reports/submission/:id (skipped)`);
  }

  // Test 4.4: Get failed validations
  result = await apiRequest('GET', '/validation-reports/failed', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/failed', result.success);

  // Test 4.5: Get validation statistics
  result = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/stats', result.success);
  if (result.success) {
    console.log(`  Total: ${result.data.data.total_validations}, Failed: ${result.data.data.failed_validations}`);
  }

  // Test 4.6: Get validation errors
  result = await apiRequest('GET', '/validation-reports/errors', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/errors', result.success);

  // Test 4.7-4.9: Update/Delete operations (read-only test)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /validation-reports/:id/resolve (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /validation-reports/bulk-resolve (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /validation-reports/:id (skipped - read-only test)`);
  results.skipped += 3;
}

/**
 * Print final summary
 */
function printSummary() {
  console.log('\n');
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}                    TEST SUMMARY                           ${colors.reset}`);
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  
  console.log(`\nTotal Tests:    ${results.total}`);
  console.log(`${colors.green}Passed:         ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:         ${results.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped:        ${results.skipped}${colors.reset}`);
  console.log(`\nPass Rate:      ${passRate}%`);
  
  if (results.failed === 0 && results.passed > 0) {
    console.log(`\n${colors.green}${colors.bright}✓ ALL TESTS PASSED!${colors.reset}`);
  } else if (results.failed > 0) {
    console.log(`\n${colors.red}${colors.bright}✗ SOME TESTS FAILED${colors.reset}`);
    console.log(`\nFailed tests:`);
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  ${colors.red}✗${colors.reset} ${t.name}`);
        if (t.error) console.log(`    Error: ${t.error}`);
      });
  }
  
  console.log(`\n${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.bright}${colors.blue}
╔══════════════════════════════════════════════════════════════════════╗
║           CRUD REPORTS API TESTING - 34 ENDPOINTS                    ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Mode: Read-only (write operations skipped for safety)\n`);

  try {
    // Step 1: Authentication
    const authSuccess = await testAuthentication();
    if (!authSuccess) {
      console.log(`\n${colors.red}Authentication failed. Cannot proceed with tests.${colors.reset}`);
      return;
    }

    // Step 2: Submission Reports
    await testSubmissionReports();

    // Step 3: Compliance Reports
    await testComplianceReports();

    // Step 4: Validation Reports
    await testValidationReports();

    // Print summary
    printSummary();

  } catch (error) {
    console.error(`\n${colors.red}Fatal error during testing:${colors.reset}`, error.message);
  }
}

// Run tests
runTests();

/**
 * CRUD Reports Testing Script
 * 
 * Tests all 34 API endpoints for submission, compliance, and validation reports.
 * 
 * Usage:
 *   node test-crud-reports.js
 * 
 * Requirements:
 *   - Backend server running on http://localhost:4000
 *   - Valid credentials: saby@saby.ai / @saby_Saby1
 *   - Test data in PostgreSQL
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4000/v1';
const CREDENTIALS = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
};

let authToken = null;
let testTenantId = null;
let testProjectId = null;
let testSubmissionId = null;
let testComplianceId = null;
let testValidationId = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

/**
 * Helper: Log test result
 */
function logTest(name, passed, error = null) {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`${colors.green}✓${colors.reset} ${name}`);
  } else {
    results.failed++;
    console.log(`${colors.red}✗${colors.reset} ${name}`);
    if (error) {
      console.log(`  ${colors.red}Error: ${error}${colors.reset}`);
    }
  }
  results.tests.push({ name, passed, error });
}

/**
 * Helper: Log section header
 */
function logSection(title) {
  console.log(`\n${colors.cyan}${colors.bright}━━━ ${title} ━━━${colors.reset}`);
}

/**
 * Helper: Make authenticated request
 */
async function apiRequest(method, endpoint, data = null, params = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    };

    if (data) config.data = data;
    if (params) config.params = params;

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

/**
 * Test 1: Authentication
 */
async function testAuthentication() {
  logSection('AUTHENTICATION');

  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);

  if (result.success && result.data.tokens?.access?.token) {
    authToken = result.data.tokens.access.token;
    testTenantId = result.data.user?.tenantId;
    logTest('Login successful', true);
    console.log(`  Tenant ID: ${testTenantId}`);
    return true;
  } else {
    logTest('Login failed', false, result.error);
    return false;
  }
}

/**
 * Test 2: Submission Reports (14 endpoints)
 */
async function testSubmissionReports() {
  logSection('SUBMISSION REPORTS (14 endpoints)');

  // Test 2.1: Get all submissions
  let result = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: testTenantId,
    limit: 10,
  });
  logTest('GET /submission-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testSubmissionId = result.data.data[0].id;
    testProjectId = result.data.data[0].project_id;
    console.log(`  Found ${result.data.data.length} submissions`);
    console.log(`  Test Submission ID: ${testSubmissionId}`);
    console.log(`  Test Project ID: ${testProjectId}`);
  }

  // Test 2.2: Get submission by ID
  if (testSubmissionId) {
    result = await apiRequest('GET', `/submission-reports/${testSubmissionId}`);
    logTest('GET /submission-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/:id (skipped - no data)`);
  }

  // Test 2.3: Get submission statistics
  result = await apiRequest('GET', '/submission-reports/stats', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /submission-reports/stats (statistics)', result.success);
  if (result.success) {
    console.log(`  Total: ${result.data.data.total}, Completed: ${result.data.data.completed}`);
  }

  // Test 2.4: Get compliance report
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/compliance/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/compliance/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/compliance/:month (skipped - no project)`);
  }

  // Test 2.5: Get submissions by node
  if (testProjectId && testSubmissionId) {
    const nodeId = '00000000-0000-0000-0000-000000000001'; // Test node
    result = await apiRequest('GET', `/submission-reports/node/${nodeId}`, null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/node/:nodeId', result.success || result.status === 404);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/node/:nodeId (skipped)`);
  }

  // Test 2.6: Get monthly report
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/monthly/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/monthly/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/monthly/:month (skipped)`);
  }

  // Test 2.7: Get incomplete submissions
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/incomplete/2025-01-01', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/incomplete/:month', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/incomplete/:month (skipped)`);
  }

  // Test 2.8: Get locked submissions
  if (testProjectId) {
    result = await apiRequest('GET', '/submission-reports/locked', null, {
      tenant_id: testTenantId,
      project_id: testProjectId,
    });
    logTest('GET /submission-reports/locked', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /submission-reports/locked (skipped)`);
  }

  // Test 2.9-2.14: Update/Delete operations (read-only test for safety)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /submission-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /submission-reports/:id/status (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/:id/lock (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/:id/unlock (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /submission-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /submission-reports/bulk-delete (skipped - read-only test)`);
  results.skipped += 6;
}

/**
 * Test 3: Compliance Reports (11 endpoints)
 */
async function testComplianceReports() {
  logSection('COMPLIANCE REPORTS (11 endpoints)');

  // Test 3.1: Get all compliance tracking
  let result = await apiRequest('GET', '/compliance-reports', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testComplianceId = result.data.data[0].id;
    console.log(`  Found ${result.data.data.length} compliance records`);
    console.log(`  Test Compliance ID: ${testComplianceId}`);
  }

  // Test 3.2: Get compliance by ID
  if (testComplianceId) {
    result = await apiRequest('GET', `/compliance-reports/${testComplianceId}`);
    logTest('GET /compliance-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /compliance-reports/:id (skipped - no data)`);
  }

  // Test 3.3: Get compliance trends
  result = await apiRequest('GET', '/compliance-reports/trends', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/trends', result.success);

  // Test 3.4: Get node compliance
  const testNodeId = '00000000-0000-0000-0000-000000000001';
  result = await apiRequest('GET', `/compliance-reports/node/${testNodeId}`, null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/node/:nodeId', result.success || result.status === 404);

  // Test 3.5: Get project compliance
  if (testProjectId) {
    result = await apiRequest('GET', `/compliance-reports/project/${testProjectId}`, null, {
      tenant_id: testTenantId,
      month: '2025-01-01',
    });
    logTest('GET /compliance-reports/project/:projectId', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /compliance-reports/project/:projectId (skipped)`);
  }

  // Test 3.6: Get weekly progress
  result = await apiRequest('GET', '/compliance-reports/weekly/2025-01-01', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
    node_id: testNodeId,
  });
  logTest('GET /compliance-reports/weekly/:month', result.success);

  // Test 3.7: Get nodes by status
  result = await apiRequest('GET', '/compliance-reports/status/incomplete', null, {
    tenant_id: testTenantId,
    project_id: testProjectId || '00000000-0000-0000-0000-000000000001',
  });
  logTest('GET /compliance-reports/status/:status', result.success);

  // Test 3.8-3.11: Update/Delete operations (read-only test)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /compliance-reports/:id (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /compliance-reports/:id/mark-event (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /compliance-reports/:id/reset (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /compliance-reports/:id (skipped - read-only test)`);
  results.skipped += 4;
}

/**
 * Test 4: Validation Reports (9 endpoints)
 */
async function testValidationReports() {
  logSection('VALIDATION REPORTS (9 endpoints)');

  // Test 4.1: Get all validations
  let result = await apiRequest('GET', '/validation-reports', null, {
    tenant_id: testTenantId,
    limit: 10,
  });
  logTest('GET /validation-reports (list with filters)', result.success);
  
  if (result.success && result.data.data?.length > 0) {
    testValidationId = result.data.data[0].id;
    console.log(`  Found ${result.data.data.length} validations`);
    console.log(`  Test Validation ID: ${testValidationId}`);
  }

  // Test 4.2: Get validation by ID
  if (testValidationId) {
    result = await apiRequest('GET', `/validation-reports/${testValidationId}`);
    logTest('GET /validation-reports/:id (get by ID)', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /validation-reports/:id (skipped - no data)`);
  }

  // Test 4.3: Get validations by submission
  if (testSubmissionId) {
    result = await apiRequest('GET', `/validation-reports/submission/${testSubmissionId}`);
    logTest('GET /validation-reports/submission/:id', result.success);
  } else {
    results.skipped++;
    console.log(`${colors.yellow}⊘${colors.reset} GET /validation-reports/submission/:id (skipped)`);
  }

  // Test 4.4: Get failed validations
  result = await apiRequest('GET', '/validation-reports/failed', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/failed', result.success);

  // Test 4.5: Get validation statistics
  result = await apiRequest('GET', '/validation-reports/stats', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/stats', result.success);
  if (result.success) {
    console.log(`  Total: ${result.data.data.total_validations}, Failed: ${result.data.data.failed_validations}`);
  }

  // Test 4.6: Get validation errors
  result = await apiRequest('GET', '/validation-reports/errors', null, {
    tenant_id: testTenantId,
  });
  logTest('GET /validation-reports/errors', result.success);

  // Test 4.7-4.9: Update/Delete operations (read-only test)
  console.log(`${colors.yellow}⊘${colors.reset} PATCH /validation-reports/:id/resolve (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} POST /validation-reports/bulk-resolve (skipped - read-only test)`);
  console.log(`${colors.yellow}⊘${colors.reset} DELETE /validation-reports/:id (skipped - read-only test)`);
  results.skipped += 3;
}

/**
 * Print final summary
 */
function printSummary() {
  console.log('\n');
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.bright}                    TEST SUMMARY                           ${colors.reset}`);
  console.log(`${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;
  
  console.log(`\nTotal Tests:    ${results.total}`);
  console.log(`${colors.green}Passed:         ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed:         ${results.failed}${colors.reset}`);
  console.log(`${colors.yellow}Skipped:        ${results.skipped}${colors.reset}`);
  console.log(`\nPass Rate:      ${passRate}%`);
  
  if (results.failed === 0 && results.passed > 0) {
    console.log(`\n${colors.green}${colors.bright}✓ ALL TESTS PASSED!${colors.reset}`);
  } else if (results.failed > 0) {
    console.log(`\n${colors.red}${colors.bright}✗ SOME TESTS FAILED${colors.reset}`);
    console.log(`\nFailed tests:`);
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        console.log(`  ${colors.red}✗${colors.reset} ${t.name}`);
        if (t.error) console.log(`    Error: ${t.error}`);
      });
  }
  
  console.log(`\n${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`${colors.bright}${colors.blue}
╔══════════════════════════════════════════════════════════════════════╗
║           CRUD REPORTS API TESTING - 34 ENDPOINTS                    ║
╚══════════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test Mode: Read-only (write operations skipped for safety)\n`);

  try {
    // Step 1: Authentication
    const authSuccess = await testAuthentication();
    if (!authSuccess) {
      console.log(`\n${colors.red}Authentication failed. Cannot proceed with tests.${colors.reset}`);
      return;
    }

    // Step 2: Submission Reports
    await testSubmissionReports();

    // Step 3: Compliance Reports
    await testComplianceReports();

    // Step 4: Validation Reports
    await testValidationReports();

    // Print summary
    printSummary();

  } catch (error) {
    console.error(`\n${colors.red}Fatal error during testing:${colors.reset}`, error.message);
  }
}

// Run tests
runTests();

