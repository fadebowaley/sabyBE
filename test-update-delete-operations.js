/**
 * COMPREHENSIVE UPDATE/DELETE OPERATIONS TEST
 *
 * Tests all UPDATE and DELETE endpoints for CRUD reports
 * Uses the tomato price data created in the E2E test
 *
 * Coverage:
 * - Submission Reports: 6 UPDATE/DELETE endpoints
 * - Compliance Reports: 4 UPDATE/DELETE endpoints
 * - Validation Reports: 3 UPDATE/DELETE endpoints
 *
 * Total: 13 write operation endpoints
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;

// Test data IDs (will be fetched)
let testSubmissionId = null;
let testComplianceId = null;
let testValidationId = null;
let testProjectId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  bright: '\x1b[1m',
};

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(
    `\n${colors.cyan}${colors.bright}${'='.repeat(80)}${colors.reset}`
  );
  console.log(`${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log(
    `${colors.cyan}${colors.bright}${'='.repeat(80)}${colors.reset}\n`
  );
}

function logTest(name, passed, details = '') {
  results.total++;
  if (passed) {
    results.passed++;
    log(`✓ ${name}${details ? ' - ' + details : ''}`, 'green');
  } else {
    results.failed++;
    log(`✗ ${name}${details ? ' - ' + details : ''}`, 'red');
  }
  results.tests.push({ name, passed, details });
}

/**
 * Step 1: Authenticate
 */
async function authenticate() {
  logSection('STEP 1: AUTHENTICATION');

  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);

  if (!result.success) {
    log(`✗ Authentication failed: ${result.error}`, 'red');
    return false;
  }

  authToken = result.data.tokens.access.token;
  tenantId = result.data.user.tenantId;
  userId = result.data.user.id;

  log(`✓ Login successful`, 'green');
  log(`  Tenant ID: ${tenantId}`);
  log(`  User ID: ${userId}`);
  return true;
}

/**
 * Step 2: Get Test Data IDs
 */
async function getTestDataIds() {
  logSection('STEP 2: FETCH TEST DATA IDs');

  // Get a test submission
  const submissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 5,
  });

  if (submissions.success && submissions.data.data?.length > 0) {
    testSubmissionId = submissions.data.data[0].id;
    testProjectId = submissions.data.data[0].project_id;
    log(`✓ Found test submission: ${testSubmissionId}`, 'green');
    log(`  Project ID: ${testProjectId}`);
  } else {
    log(`✗ No submissions found`, 'red');
  }

  // Get a test compliance record
  const compliance = await postgresPool.query(
    'SELECT id FROM event_compliance_tracking WHERE tenant_id = $1 LIMIT 1',
    [tenantId]
  );

  if (compliance.rows.length > 0) {
    testComplianceId = compliance.rows[0].id;
    log(`✓ Found test compliance: ${testComplianceId}`, 'green');
  } else {
    log(`⚠ No compliance records found`, 'yellow');
  }

  // Get a test validation
  const validations = await postgresPool.query(
    'SELECT id FROM submission_validations LIMIT 1'
  );

  if (validations.rows.length > 0) {
    testValidationId = validations.rows[0].id;
    log(`✓ Found test validation: ${testValidationId}`, 'green');
  } else {
    log(`⚠ No validation records found`, 'yellow');
  }
}

/**
 * Step 3: Test Submission UPDATE Operations
 */
async function testSubmissionUpdates() {
  logSection('STEP 3: SUBMISSION REPORTS - UPDATE OPERATIONS');

  if (!testSubmissionId) {
    log('⊘ Skipping - no test submission available', 'yellow');
    return;
  }

  // Test 3.1: Update submission data
  let result = await apiRequest(
    'PATCH',
    `/submission-reports/${testSubmissionId}`,
    {
      meta: { updated_in_test: true, test_timestamp: new Date().toISOString() },
    }
  );
  logTest(
    'PATCH /submission-reports/:id (update data)',
    result.success,
    result.success ? 'Metadata updated' : result.error
  );

  // Test 3.2: Update submission status
  result = await apiRequest(
    'PATCH',
    `/submission-reports/${testSubmissionId}/status`,
    {
      status: 'completed',
    }
  );
  logTest(
    'PATCH /submission-reports/:id/status',
    result.success,
    result.success ? 'Status → completed' : result.error
  );

  // Test 3.3: Lock submission
  result = await apiRequest(
    'POST',
    `/submission-reports/${testSubmissionId}/lock`,
    {
      reason: 'Testing lock functionality',
    }
  );
  logTest(
    'POST /submission-reports/:id/lock',
    result.success,
    result.success ? 'Submission locked' : result.error
  );

  // Test 3.4: Unlock submission
  result = await apiRequest(
    'POST',
    `/submission-reports/${testSubmissionId}/unlock`,
    {
      reason: 'Testing unlock functionality',
    }
  );
  logTest(
    'POST /submission-reports/:id/unlock',
    result.success,
    result.success ? 'Submission unlocked' : result.error
  );
}

/**
 * Step 4: Test Compliance UPDATE Operations
 */
async function testComplianceUpdates() {
  logSection('STEP 4: COMPLIANCE REPORTS - UPDATE OPERATIONS');

  if (!testComplianceId) {
    log('⊘ Skipping - no test compliance available', 'yellow');
    return;
  }

  // Test 4.1: Override compliance percentage
  let result = await apiRequest(
    'PATCH',
    `/compliance-reports/${testComplianceId}`,
    {
      percentage: 85,
      reason: 'Manual adjustment for testing',
    }
  );
  logTest(
    'PATCH /compliance-reports/:id (override)',
    result.success,
    result.success ? 'Compliance → 85%' : result.error
  );

  // Test 4.2: Mark event as submitted
  result = await apiRequest(
    'POST',
    `/compliance-reports/${testComplianceId}/mark-event`,
    {
      event_key: 'week_1_sunday',
    }
  );
  logTest(
    'POST /compliance-reports/:id/mark-event',
    result.success,
    result.success ? 'Event marked' : result.error
  );

  // Test 4.3: Reset compliance
  result = await apiRequest(
    'POST',
    `/compliance-reports/${testComplianceId}/reset`
  );
  logTest(
    'POST /compliance-reports/:id/reset',
    result.success,
    result.success ? 'Compliance reset' : result.error
  );
}

/**
 * Step 5: Test Validation UPDATE Operations
 */
async function testValidationUpdates() {
  logSection('STEP 5: VALIDATION REPORTS - UPDATE OPERATIONS');

  if (!testValidationId) {
    log('⊘ Skipping - no test validation available', 'yellow');
    return;
  }

  // Test 5.1: Resolve validation
  let result = await apiRequest(
    'PATCH',
    `/validation-reports/${testValidationId}/resolve`,
    {
      resolution_note: 'Issue resolved during testing',
    }
  );
  logTest(
    'PATCH /validation-reports/:id/resolve',
    result.success,
    result.success ? 'Validation resolved' : result.error
  );

  // Test 5.2: Bulk resolve validations
  const failedValidations = await apiRequest(
    'GET',
    '/validation-reports/failed',
    null,
    {
      tenant_id: tenantId,
      limit: 3,
    }
  );

  if (failedValidations.success && failedValidations.data?.data?.length > 0) {
    const ids = failedValidations.data.data.slice(0, 2).map((v) => v.id);
    result = await apiRequest('POST', '/validation-reports/bulk-resolve', {
      ids: ids,
      resolution_note: 'Bulk resolution test',
    });
    logTest(
      'POST /validation-reports/bulk-resolve',
      result.success,
      result.success ? `Resolved ${ids.length} validations` : result.error
    );
  } else {
    log('⊘ No failed validations to bulk resolve', 'yellow');
  }
}

/**
 * Step 6: Test Bulk DELETE Operations
 */
async function testBulkOperations() {
  logSection('STEP 6: BULK OPERATIONS');

  // Get some old/test submissions to delete
  const oldSubmissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    status: 'pending',
    limit: 3,
  });

  if (oldSubmissions.success && oldSubmissions.data.data?.length >= 2) {
    const idsToDelete = oldSubmissions.data.data.slice(0, 2).map((s) => s.id);

    // Test 6.1: Bulk soft delete
    const result = await apiRequest('POST', '/submission-reports/bulk-delete', {
      ids: idsToDelete,
      hard: false,
    });
    logTest(
      'POST /submission-reports/bulk-delete (soft)',
      result.success,
      result.success
        ? `Deleted ${idsToDelete.length} submissions`
        : result.error
    );
  } else {
    log('⊘ Not enough submissions for bulk delete test', 'yellow');
  }
}

/**
 * Step 7: Test Single DELETE Operations
 */
async function testDeleteOperations() {
  logSection('STEP 7: DELETE OPERATIONS');

  // Create a test submission specifically for deletion
  const testData = {
    tenantId: tenantId,
    projectId: testProjectId || 'test-delete-project',
    formId: 'test-delete-form',
    nodeId: '00000000-0000-0000-0000-000000000099',
    userId: userId,
    payload: { test: 'delete_me', price: 100 },
    source: 'api',
    project_name: 'Test Delete',
    project_category: 'Test',
  };

  const createResult = await apiRequest('POST', '/submissions', testData);

  if (createResult.success) {
    log(`✓ Created test submission for deletion`, 'green');

    // Wait a moment for processing
    await new Promise((r) => setTimeout(r, 3000));

    // Get the created submission ID
    const getSubmission = await apiRequest('GET', '/submission-reports', null, {
      tenant_id: tenantId,
      form_id: 'test-delete-form',
      limit: 1,
    });

    if (getSubmission.success && getSubmission.data.data?.length > 0) {
      const submissionToDelete = getSubmission.data.data[0].id;

      // Test 7.1: Delete submission (soft delete)
      const deleteResult = await apiRequest(
        'DELETE',
        `/submission-reports/${submissionToDelete}`
      );
      logTest(
        'DELETE /submission-reports/:id (soft delete)',
        deleteResult.success,
        deleteResult.success ? 'Submission deleted' : deleteResult.error
      );

      // Verify it's marked as deleted
      const verifyDelete = await apiRequest(
        'GET',
        `/submission-reports/${submissionToDelete}`
      );
      if (
        verifyDelete.success &&
        verifyDelete.data.data?.status === 'deleted'
      ) {
        log(`  ✓ Verified: Status changed to 'deleted'`, 'green');
      }
    }
  }

  // Test 7.2: Delete compliance record
  if (testComplianceId) {
    const result = await apiRequest(
      'DELETE',
      `/compliance-reports/${testComplianceId}`
    );
    logTest(
      'DELETE /compliance-reports/:id',
      result.success,
      result.success ? 'Compliance record deleted' : result.error
    );
  } else {
    log('⊘ No compliance record to delete', 'yellow');
  }

  // Test 7.3: Delete validation
  if (testValidationId) {
    const result = await apiRequest(
      'DELETE',
      `/validation-reports/${testValidationId}`
    );
    logTest(
      'DELETE /validation-reports/:id',
      result.success,
      result.success ? 'Validation deleted' : result.error
    );
  } else {
    log('⊘ No validation to delete', 'yellow');
  }
}

/**
 * Step 8: Verify Changes
 */
async function verifyChanges() {
  logSection('STEP 8: VERIFY ALL CHANGES');

  // Check updated submission
  if (testSubmissionId) {
    const result = await apiRequest(
      'GET',
      `/submission-reports/${testSubmissionId}`
    );
    if (result.success) {
      const submission = result.data.data;
      log(`✓ Submission ${testSubmissionId.substring(0, 8)}...`, 'green');
      log(`  Status: ${submission.status}`, 'cyan');
      log(`  Locked: ${submission.is_locked}`, 'cyan');
      log(
        `  Has test metadata: ${
          submission.meta?.updated_in_test ? 'Yes' : 'No'
        }`,
        'cyan'
      );
    }
  }

  // Check activity logs for UPDATE operations
  const activityLogs = await apiRequest(
    'GET',
    '/submissions/activity-log',
    null,
    {
      tenant_id: tenantId,
      limit: 20,
    }
  );

  if (activityLogs.success) {
    const logs = activityLogs.data.data || activityLogs.data || [];
    if (Array.isArray(logs)) {
      const updateActions = logs.filter((l) =>
        ['updated', 'locked', 'unlocked', 'status_updated', 'deleted'].includes(
          l.action
        )
      );
      log(`\n✓ Activity log entries: ${logs.length}`, 'green');
      log(`  Update/Delete actions: ${updateActions.length}`, 'cyan');

      // Show recent update actions
      if (updateActions.length > 0) {
        log(`\n  Recent update actions:`, 'cyan');
        updateActions.slice(0, 5).forEach((l) => {
          log(`    - [${l.action}] ${l.message}`, 'blue');
        });
      }
    } else {
      log(`⚠ Activity logs not in expected format`, 'yellow');
    }
  }
}

/**
 * Step 9: Test Edge Cases
 */
async function testEdgeCases() {
  logSection('STEP 9: EDGE CASES & ERROR HANDLING');

  // Test 9.1: Update non-existent submission
  let result = await apiRequest(
    'PATCH',
    '/submission-reports/00000000-0000-0000-0000-000000000000',
    {
      status: 'completed',
    }
  );
  logTest(
    'Update non-existent submission',
    !result.success && result.status === 404,
    'Returns 404 as expected'
  );

  // Test 9.2: Delete non-existent submission
  result = await apiRequest(
    'DELETE',
    '/submission-reports/00000000-0000-0000-0000-000000000000'
  );
  logTest(
    'Delete non-existent submission',
    !result.success && result.status === 404,
    'Returns 404 as expected'
  );

  // Test 9.3: Invalid status update
  if (testSubmissionId) {
    result = await apiRequest(
      'PATCH',
      `/submission-reports/${testSubmissionId}/status`,
      {
        status: 'invalid_status',
      }
    );
    logTest(
      'Update with invalid status',
      !result.success && result.status === 400,
      'Returns 400 as expected'
    );
  }

  // Test 9.4: Bulk delete with empty array
  result = await apiRequest('POST', '/submission-reports/bulk-delete', {
    ids: [],
  });
  logTest(
    'Bulk delete with empty array',
    !result.success && result.status === 400,
    'Returns 400 as expected'
  );

  // Test 9.5: Override compliance with invalid percentage
  if (testComplianceId) {
    result = await apiRequest(
      'PATCH',
      `/compliance-reports/${testComplianceId}`,
      {
        percentage: 150, // Invalid (>100)
      }
    );
    logTest(
      'Override with invalid percentage',
      !result.success && result.status === 400,
      'Returns 400 as expected'
    );
  }
}

/**
 * Step 10: Print Summary
 */
function printSummary() {
  logSection('TEST SUMMARY');

  const passRate =
    results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;

  console.log(`
${colors.bright}Total Tests:    ${results.total}${colors.reset}
${colors.green}Passed:         ${results.passed}${colors.reset}
${colors.red}Failed:         ${results.failed}${colors.reset}

${colors.bright}Pass Rate:      ${passRate}%${colors.reset}
  `);

  if (results.failed > 0) {
    log('Failed Tests:', 'red');
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        log(`  ✗ ${t.name} - ${t.details}`, 'red');
      });
  }

  if (results.passed === results.total) {
    console.log(`
${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  🎉 ALL UPDATE/DELETE TESTS PASSED! 🎉                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}

${colors.green}✓ Submission Updates: Working${colors.reset}
${colors.green}✓ Submission Deletes: Working${colors.reset}
${colors.green}✓ Compliance Updates: Working${colors.reset}
${colors.green}✓ Compliance Deletes: Working${colors.reset}
${colors.green}✓ Validation Updates: Working${colors.reset}
${colors.green}✓ Validation Deletes: Working${colors.reset}
${colors.green}✓ Bulk Operations: Working${colors.reset}
${colors.green}✓ Error Handling: Working${colors.reset}

${colors.cyan}The CRUD reporting system is fully operational!${colors.reset}
    `);
  } else {
    log(`\n⚠ Some tests failed. Review failures above.`, 'yellow');
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log(`${colors.bright}${colors.blue}
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║              UPDATE/DELETE OPERATIONS COMPREHENSIVE TEST                     ║
║                                                                              ║
║  Tests: 13 write operation endpoints (UPDATE + DELETE)                      ║
║  Coverage: Submissions, Compliance, Validations                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      process.exit(1);
    }

    // Step 2: Get test data IDs
    await getTestDataIds();

    // Step 3: Test submission updates
    await testSubmissionUpdates();

    // Step 4: Test compliance updates
    await testComplianceUpdates();

    // Step 5: Test validation updates
    await testValidationUpdates();

    // Step 6: Test bulk operations
    await testBulkOperations();

    // Step 7: Test delete operations
    await testDeleteOperations();

    // Step 8: Verify changes
    await verifyChanges();

    // Step 9: Test edge cases
    await testEdgeCases();

    // Step 10: Print summary
    printSummary();

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

main();

 *
 * Tests all UPDATE and DELETE endpoints for CRUD reports
 * Uses the tomato price data created in the E2E test
 *
 * Coverage:
 * - Submission Reports: 6 UPDATE/DELETE endpoints
 * - Compliance Reports: 4 UPDATE/DELETE endpoints
 * - Validation Reports: 3 UPDATE/DELETE endpoints
 *
 * Total: 13 write operation endpoints
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;

// Test data IDs (will be fetched)
let testSubmissionId = null;
let testComplianceId = null;
let testValidationId = null;
let testProjectId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  bright: '\x1b[1m',
};

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(
    `\n${colors.cyan}${colors.bright}${'='.repeat(80)}${colors.reset}`
  );
  console.log(`${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log(
    `${colors.cyan}${colors.bright}${'='.repeat(80)}${colors.reset}\n`
  );
}

function logTest(name, passed, details = '') {
  results.total++;
  if (passed) {
    results.passed++;
    log(`✓ ${name}${details ? ' - ' + details : ''}`, 'green');
  } else {
    results.failed++;
    log(`✗ ${name}${details ? ' - ' + details : ''}`, 'red');
  }
  results.tests.push({ name, passed, details });
}

/**
 * Step 1: Authenticate
 */
async function authenticate() {
  logSection('STEP 1: AUTHENTICATION');

  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);

  if (!result.success) {
    log(`✗ Authentication failed: ${result.error}`, 'red');
    return false;
  }

  authToken = result.data.tokens.access.token;
  tenantId = result.data.user.tenantId;
  userId = result.data.user.id;

  log(`✓ Login successful`, 'green');
  log(`  Tenant ID: ${tenantId}`);
  log(`  User ID: ${userId}`);
  return true;
}

/**
 * Step 2: Get Test Data IDs
 */
async function getTestDataIds() {
  logSection('STEP 2: FETCH TEST DATA IDs');

  // Get a test submission
  const submissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 5,
  });

  if (submissions.success && submissions.data.data?.length > 0) {
    testSubmissionId = submissions.data.data[0].id;
    testProjectId = submissions.data.data[0].project_id;
    log(`✓ Found test submission: ${testSubmissionId}`, 'green');
    log(`  Project ID: ${testProjectId}`);
  } else {
    log(`✗ No submissions found`, 'red');
  }

  // Get a test compliance record
  const compliance = await postgresPool.query(
    'SELECT id FROM event_compliance_tracking WHERE tenant_id = $1 LIMIT 1',
    [tenantId]
  );

  if (compliance.rows.length > 0) {
    testComplianceId = compliance.rows[0].id;
    log(`✓ Found test compliance: ${testComplianceId}`, 'green');
  } else {
    log(`⚠ No compliance records found`, 'yellow');
  }

  // Get a test validation
  const validations = await postgresPool.query(
    'SELECT id FROM submission_validations LIMIT 1'
  );

  if (validations.rows.length > 0) {
    testValidationId = validations.rows[0].id;
    log(`✓ Found test validation: ${testValidationId}`, 'green');
  } else {
    log(`⚠ No validation records found`, 'yellow');
  }
}

/**
 * Step 3: Test Submission UPDATE Operations
 */
async function testSubmissionUpdates() {
  logSection('STEP 3: SUBMISSION REPORTS - UPDATE OPERATIONS');

  if (!testSubmissionId) {
    log('⊘ Skipping - no test submission available', 'yellow');
    return;
  }

  // Test 3.1: Update submission data
  let result = await apiRequest(
    'PATCH',
    `/submission-reports/${testSubmissionId}`,
    {
      meta: { updated_in_test: true, test_timestamp: new Date().toISOString() },
    }
  );
  logTest(
    'PATCH /submission-reports/:id (update data)',
    result.success,
    result.success ? 'Metadata updated' : result.error
  );

  // Test 3.2: Update submission status
  result = await apiRequest(
    'PATCH',
    `/submission-reports/${testSubmissionId}/status`,
    {
      status: 'completed',
    }
  );
  logTest(
    'PATCH /submission-reports/:id/status',
    result.success,
    result.success ? 'Status → completed' : result.error
  );

  // Test 3.3: Lock submission
  result = await apiRequest(
    'POST',
    `/submission-reports/${testSubmissionId}/lock`,
    {
      reason: 'Testing lock functionality',
    }
  );
  logTest(
    'POST /submission-reports/:id/lock',
    result.success,
    result.success ? 'Submission locked' : result.error
  );

  // Test 3.4: Unlock submission
  result = await apiRequest(
    'POST',
    `/submission-reports/${testSubmissionId}/unlock`,
    {
      reason: 'Testing unlock functionality',
    }
  );
  logTest(
    'POST /submission-reports/:id/unlock',
    result.success,
    result.success ? 'Submission unlocked' : result.error
  );
}

/**
 * Step 4: Test Compliance UPDATE Operations
 */
async function testComplianceUpdates() {
  logSection('STEP 4: COMPLIANCE REPORTS - UPDATE OPERATIONS');

  if (!testComplianceId) {
    log('⊘ Skipping - no test compliance available', 'yellow');
    return;
  }

  // Test 4.1: Override compliance percentage
  let result = await apiRequest(
    'PATCH',
    `/compliance-reports/${testComplianceId}`,
    {
      percentage: 85,
      reason: 'Manual adjustment for testing',
    }
  );
  logTest(
    'PATCH /compliance-reports/:id (override)',
    result.success,
    result.success ? 'Compliance → 85%' : result.error
  );

  // Test 4.2: Mark event as submitted
  result = await apiRequest(
    'POST',
    `/compliance-reports/${testComplianceId}/mark-event`,
    {
      event_key: 'week_1_sunday',
    }
  );
  logTest(
    'POST /compliance-reports/:id/mark-event',
    result.success,
    result.success ? 'Event marked' : result.error
  );

  // Test 4.3: Reset compliance
  result = await apiRequest(
    'POST',
    `/compliance-reports/${testComplianceId}/reset`
  );
  logTest(
    'POST /compliance-reports/:id/reset',
    result.success,
    result.success ? 'Compliance reset' : result.error
  );
}

/**
 * Step 5: Test Validation UPDATE Operations
 */
async function testValidationUpdates() {
  logSection('STEP 5: VALIDATION REPORTS - UPDATE OPERATIONS');

  if (!testValidationId) {
    log('⊘ Skipping - no test validation available', 'yellow');
    return;
  }

  // Test 5.1: Resolve validation
  let result = await apiRequest(
    'PATCH',
    `/validation-reports/${testValidationId}/resolve`,
    {
      resolution_note: 'Issue resolved during testing',
    }
  );
  logTest(
    'PATCH /validation-reports/:id/resolve',
    result.success,
    result.success ? 'Validation resolved' : result.error
  );

  // Test 5.2: Bulk resolve validations
  const failedValidations = await apiRequest(
    'GET',
    '/validation-reports/failed',
    null,
    {
      tenant_id: tenantId,
      limit: 3,
    }
  );

  if (failedValidations.success && failedValidations.data?.data?.length > 0) {
    const ids = failedValidations.data.data.slice(0, 2).map((v) => v.id);
    result = await apiRequest('POST', '/validation-reports/bulk-resolve', {
      ids: ids,
      resolution_note: 'Bulk resolution test',
    });
    logTest(
      'POST /validation-reports/bulk-resolve',
      result.success,
      result.success ? `Resolved ${ids.length} validations` : result.error
    );
  } else {
    log('⊘ No failed validations to bulk resolve', 'yellow');
  }
}

/**
 * Step 6: Test Bulk DELETE Operations
 */
async function testBulkOperations() {
  logSection('STEP 6: BULK OPERATIONS');

  // Get some old/test submissions to delete
  const oldSubmissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    status: 'pending',
    limit: 3,
  });

  if (oldSubmissions.success && oldSubmissions.data.data?.length >= 2) {
    const idsToDelete = oldSubmissions.data.data.slice(0, 2).map((s) => s.id);

    // Test 6.1: Bulk soft delete
    const result = await apiRequest('POST', '/submission-reports/bulk-delete', {
      ids: idsToDelete,
      hard: false,
    });
    logTest(
      'POST /submission-reports/bulk-delete (soft)',
      result.success,
      result.success
        ? `Deleted ${idsToDelete.length} submissions`
        : result.error
    );
  } else {
    log('⊘ Not enough submissions for bulk delete test', 'yellow');
  }
}

/**
 * Step 7: Test Single DELETE Operations
 */
async function testDeleteOperations() {
  logSection('STEP 7: DELETE OPERATIONS');

  // Create a test submission specifically for deletion
  const testData = {
    tenantId: tenantId,
    projectId: testProjectId || 'test-delete-project',
    formId: 'test-delete-form',
    nodeId: '00000000-0000-0000-0000-000000000099',
    userId: userId,
    payload: { test: 'delete_me', price: 100 },
    source: 'api',
    project_name: 'Test Delete',
    project_category: 'Test',
  };

  const createResult = await apiRequest('POST', '/submissions', testData);

  if (createResult.success) {
    log(`✓ Created test submission for deletion`, 'green');

    // Wait a moment for processing
    await new Promise((r) => setTimeout(r, 3000));

    // Get the created submission ID
    const getSubmission = await apiRequest('GET', '/submission-reports', null, {
      tenant_id: tenantId,
      form_id: 'test-delete-form',
      limit: 1,
    });

    if (getSubmission.success && getSubmission.data.data?.length > 0) {
      const submissionToDelete = getSubmission.data.data[0].id;

      // Test 7.1: Delete submission (soft delete)
      const deleteResult = await apiRequest(
        'DELETE',
        `/submission-reports/${submissionToDelete}`
      );
      logTest(
        'DELETE /submission-reports/:id (soft delete)',
        deleteResult.success,
        deleteResult.success ? 'Submission deleted' : deleteResult.error
      );

      // Verify it's marked as deleted
      const verifyDelete = await apiRequest(
        'GET',
        `/submission-reports/${submissionToDelete}`
      );
      if (
        verifyDelete.success &&
        verifyDelete.data.data?.status === 'deleted'
      ) {
        log(`  ✓ Verified: Status changed to 'deleted'`, 'green');
      }
    }
  }

  // Test 7.2: Delete compliance record
  if (testComplianceId) {
    const result = await apiRequest(
      'DELETE',
      `/compliance-reports/${testComplianceId}`
    );
    logTest(
      'DELETE /compliance-reports/:id',
      result.success,
      result.success ? 'Compliance record deleted' : result.error
    );
  } else {
    log('⊘ No compliance record to delete', 'yellow');
  }

  // Test 7.3: Delete validation
  if (testValidationId) {
    const result = await apiRequest(
      'DELETE',
      `/validation-reports/${testValidationId}`
    );
    logTest(
      'DELETE /validation-reports/:id',
      result.success,
      result.success ? 'Validation deleted' : result.error
    );
  } else {
    log('⊘ No validation to delete', 'yellow');
  }
}

/**
 * Step 8: Verify Changes
 */
async function verifyChanges() {
  logSection('STEP 8: VERIFY ALL CHANGES');

  // Check updated submission
  if (testSubmissionId) {
    const result = await apiRequest(
      'GET',
      `/submission-reports/${testSubmissionId}`
    );
    if (result.success) {
      const submission = result.data.data;
      log(`✓ Submission ${testSubmissionId.substring(0, 8)}...`, 'green');
      log(`  Status: ${submission.status}`, 'cyan');
      log(`  Locked: ${submission.is_locked}`, 'cyan');
      log(
        `  Has test metadata: ${
          submission.meta?.updated_in_test ? 'Yes' : 'No'
        }`,
        'cyan'
      );
    }
  }

  // Check activity logs for UPDATE operations
  const activityLogs = await apiRequest(
    'GET',
    '/submissions/activity-log',
    null,
    {
      tenant_id: tenantId,
      limit: 20,
    }
  );

  if (activityLogs.success) {
    const logs = activityLogs.data.data || activityLogs.data || [];
    if (Array.isArray(logs)) {
      const updateActions = logs.filter((l) =>
        ['updated', 'locked', 'unlocked', 'status_updated', 'deleted'].includes(
          l.action
        )
      );
      log(`\n✓ Activity log entries: ${logs.length}`, 'green');
      log(`  Update/Delete actions: ${updateActions.length}`, 'cyan');

      // Show recent update actions
      if (updateActions.length > 0) {
        log(`\n  Recent update actions:`, 'cyan');
        updateActions.slice(0, 5).forEach((l) => {
          log(`    - [${l.action}] ${l.message}`, 'blue');
        });
      }
    } else {
      log(`⚠ Activity logs not in expected format`, 'yellow');
    }
  }
}

/**
 * Step 9: Test Edge Cases
 */
async function testEdgeCases() {
  logSection('STEP 9: EDGE CASES & ERROR HANDLING');

  // Test 9.1: Update non-existent submission
  let result = await apiRequest(
    'PATCH',
    '/submission-reports/00000000-0000-0000-0000-000000000000',
    {
      status: 'completed',
    }
  );
  logTest(
    'Update non-existent submission',
    !result.success && result.status === 404,
    'Returns 404 as expected'
  );

  // Test 9.2: Delete non-existent submission
  result = await apiRequest(
    'DELETE',
    '/submission-reports/00000000-0000-0000-0000-000000000000'
  );
  logTest(
    'Delete non-existent submission',
    !result.success && result.status === 404,
    'Returns 404 as expected'
  );

  // Test 9.3: Invalid status update
  if (testSubmissionId) {
    result = await apiRequest(
      'PATCH',
      `/submission-reports/${testSubmissionId}/status`,
      {
        status: 'invalid_status',
      }
    );
    logTest(
      'Update with invalid status',
      !result.success && result.status === 400,
      'Returns 400 as expected'
    );
  }

  // Test 9.4: Bulk delete with empty array
  result = await apiRequest('POST', '/submission-reports/bulk-delete', {
    ids: [],
  });
  logTest(
    'Bulk delete with empty array',
    !result.success && result.status === 400,
    'Returns 400 as expected'
  );

  // Test 9.5: Override compliance with invalid percentage
  if (testComplianceId) {
    result = await apiRequest(
      'PATCH',
      `/compliance-reports/${testComplianceId}`,
      {
        percentage: 150, // Invalid (>100)
      }
    );
    logTest(
      'Override with invalid percentage',
      !result.success && result.status === 400,
      'Returns 400 as expected'
    );
  }
}

/**
 * Step 10: Print Summary
 */
function printSummary() {
  logSection('TEST SUMMARY');

  const passRate =
    results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;

  console.log(`
${colors.bright}Total Tests:    ${results.total}${colors.reset}
${colors.green}Passed:         ${results.passed}${colors.reset}
${colors.red}Failed:         ${results.failed}${colors.reset}

${colors.bright}Pass Rate:      ${passRate}%${colors.reset}
  `);

  if (results.failed > 0) {
    log('Failed Tests:', 'red');
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        log(`  ✗ ${t.name} - ${t.details}`, 'red');
      });
  }

  if (results.passed === results.total) {
    console.log(`
${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  🎉 ALL UPDATE/DELETE TESTS PASSED! 🎉                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}

${colors.green}✓ Submission Updates: Working${colors.reset}
${colors.green}✓ Submission Deletes: Working${colors.reset}
${colors.green}✓ Compliance Updates: Working${colors.reset}
${colors.green}✓ Compliance Deletes: Working${colors.reset}
${colors.green}✓ Validation Updates: Working${colors.reset}
${colors.green}✓ Validation Deletes: Working${colors.reset}
${colors.green}✓ Bulk Operations: Working${colors.reset}
${colors.green}✓ Error Handling: Working${colors.reset}

${colors.cyan}The CRUD reporting system is fully operational!${colors.reset}
    `);
  } else {
    log(`\n⚠ Some tests failed. Review failures above.`, 'yellow');
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log(`${colors.bright}${colors.blue}
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║              UPDATE/DELETE OPERATIONS COMPREHENSIVE TEST                     ║
║                                                                              ║
║  Tests: 13 write operation endpoints (UPDATE + DELETE)                      ║
║  Coverage: Submissions, Compliance, Validations                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      process.exit(1);
    }

    // Step 2: Get test data IDs
    await getTestDataIds();

    // Step 3: Test submission updates
    await testSubmissionUpdates();

    // Step 4: Test compliance updates
    await testComplianceUpdates();

    // Step 5: Test validation updates
    await testValidationUpdates();

    // Step 6: Test bulk operations
    await testBulkOperations();

    // Step 7: Test delete operations
    await testDeleteOperations();

    // Step 8: Verify changes
    await verifyChanges();

    // Step 9: Test edge cases
    await testEdgeCases();

    // Step 10: Print summary
    printSummary();

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

main();

 *
 * Tests all UPDATE and DELETE endpoints for CRUD reports
 * Uses the tomato price data created in the E2E test
 *
 * Coverage:
 * - Submission Reports: 6 UPDATE/DELETE endpoints
 * - Compliance Reports: 4 UPDATE/DELETE endpoints
 * - Validation Reports: 3 UPDATE/DELETE endpoints
 *
 * Total: 13 write operation endpoints
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;

// Test data IDs (will be fetched)
let testSubmissionId = null;
let testComplianceId = null;
let testValidationId = null;
let testProjectId = null;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  bright: '\x1b[1m',
};

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: [],
};

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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(
    `\n${colors.cyan}${colors.bright}${'='.repeat(80)}${colors.reset}`
  );
  console.log(`${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log(
    `${colors.cyan}${colors.bright}${'='.repeat(80)}${colors.reset}\n`
  );
}

function logTest(name, passed, details = '') {
  results.total++;
  if (passed) {
    results.passed++;
    log(`✓ ${name}${details ? ' - ' + details : ''}`, 'green');
  } else {
    results.failed++;
    log(`✗ ${name}${details ? ' - ' + details : ''}`, 'red');
  }
  results.tests.push({ name, passed, details });
}

/**
 * Step 1: Authenticate
 */
async function authenticate() {
  logSection('STEP 1: AUTHENTICATION');

  const result = await apiRequest('POST', '/auth/login', CREDENTIALS);

  if (!result.success) {
    log(`✗ Authentication failed: ${result.error}`, 'red');
    return false;
  }

  authToken = result.data.tokens.access.token;
  tenantId = result.data.user.tenantId;
  userId = result.data.user.id;

  log(`✓ Login successful`, 'green');
  log(`  Tenant ID: ${tenantId}`);
  log(`  User ID: ${userId}`);
  return true;
}

/**
 * Step 2: Get Test Data IDs
 */
async function getTestDataIds() {
  logSection('STEP 2: FETCH TEST DATA IDs');

  // Get a test submission
  const submissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    limit: 5,
  });

  if (submissions.success && submissions.data.data?.length > 0) {
    testSubmissionId = submissions.data.data[0].id;
    testProjectId = submissions.data.data[0].project_id;
    log(`✓ Found test submission: ${testSubmissionId}`, 'green');
    log(`  Project ID: ${testProjectId}`);
  } else {
    log(`✗ No submissions found`, 'red');
  }

  // Get a test compliance record
  const compliance = await postgresPool.query(
    'SELECT id FROM event_compliance_tracking WHERE tenant_id = $1 LIMIT 1',
    [tenantId]
  );

  if (compliance.rows.length > 0) {
    testComplianceId = compliance.rows[0].id;
    log(`✓ Found test compliance: ${testComplianceId}`, 'green');
  } else {
    log(`⚠ No compliance records found`, 'yellow');
  }

  // Get a test validation
  const validations = await postgresPool.query(
    'SELECT id FROM submission_validations LIMIT 1'
  );

  if (validations.rows.length > 0) {
    testValidationId = validations.rows[0].id;
    log(`✓ Found test validation: ${testValidationId}`, 'green');
  } else {
    log(`⚠ No validation records found`, 'yellow');
  }
}

/**
 * Step 3: Test Submission UPDATE Operations
 */
async function testSubmissionUpdates() {
  logSection('STEP 3: SUBMISSION REPORTS - UPDATE OPERATIONS');

  if (!testSubmissionId) {
    log('⊘ Skipping - no test submission available', 'yellow');
    return;
  }

  // Test 3.1: Update submission data
  let result = await apiRequest(
    'PATCH',
    `/submission-reports/${testSubmissionId}`,
    {
      meta: { updated_in_test: true, test_timestamp: new Date().toISOString() },
    }
  );
  logTest(
    'PATCH /submission-reports/:id (update data)',
    result.success,
    result.success ? 'Metadata updated' : result.error
  );

  // Test 3.2: Update submission status
  result = await apiRequest(
    'PATCH',
    `/submission-reports/${testSubmissionId}/status`,
    {
      status: 'completed',
    }
  );
  logTest(
    'PATCH /submission-reports/:id/status',
    result.success,
    result.success ? 'Status → completed' : result.error
  );

  // Test 3.3: Lock submission
  result = await apiRequest(
    'POST',
    `/submission-reports/${testSubmissionId}/lock`,
    {
      reason: 'Testing lock functionality',
    }
  );
  logTest(
    'POST /submission-reports/:id/lock',
    result.success,
    result.success ? 'Submission locked' : result.error
  );

  // Test 3.4: Unlock submission
  result = await apiRequest(
    'POST',
    `/submission-reports/${testSubmissionId}/unlock`,
    {
      reason: 'Testing unlock functionality',
    }
  );
  logTest(
    'POST /submission-reports/:id/unlock',
    result.success,
    result.success ? 'Submission unlocked' : result.error
  );
}

/**
 * Step 4: Test Compliance UPDATE Operations
 */
async function testComplianceUpdates() {
  logSection('STEP 4: COMPLIANCE REPORTS - UPDATE OPERATIONS');

  if (!testComplianceId) {
    log('⊘ Skipping - no test compliance available', 'yellow');
    return;
  }

  // Test 4.1: Override compliance percentage
  let result = await apiRequest(
    'PATCH',
    `/compliance-reports/${testComplianceId}`,
    {
      percentage: 85,
      reason: 'Manual adjustment for testing',
    }
  );
  logTest(
    'PATCH /compliance-reports/:id (override)',
    result.success,
    result.success ? 'Compliance → 85%' : result.error
  );

  // Test 4.2: Mark event as submitted
  result = await apiRequest(
    'POST',
    `/compliance-reports/${testComplianceId}/mark-event`,
    {
      event_key: 'week_1_sunday',
    }
  );
  logTest(
    'POST /compliance-reports/:id/mark-event',
    result.success,
    result.success ? 'Event marked' : result.error
  );

  // Test 4.3: Reset compliance
  result = await apiRequest(
    'POST',
    `/compliance-reports/${testComplianceId}/reset`
  );
  logTest(
    'POST /compliance-reports/:id/reset',
    result.success,
    result.success ? 'Compliance reset' : result.error
  );
}

/**
 * Step 5: Test Validation UPDATE Operations
 */
async function testValidationUpdates() {
  logSection('STEP 5: VALIDATION REPORTS - UPDATE OPERATIONS');

  if (!testValidationId) {
    log('⊘ Skipping - no test validation available', 'yellow');
    return;
  }

  // Test 5.1: Resolve validation
  let result = await apiRequest(
    'PATCH',
    `/validation-reports/${testValidationId}/resolve`,
    {
      resolution_note: 'Issue resolved during testing',
    }
  );
  logTest(
    'PATCH /validation-reports/:id/resolve',
    result.success,
    result.success ? 'Validation resolved' : result.error
  );

  // Test 5.2: Bulk resolve validations
  const failedValidations = await apiRequest(
    'GET',
    '/validation-reports/failed',
    null,
    {
      tenant_id: tenantId,
      limit: 3,
    }
  );

  if (failedValidations.success && failedValidations.data?.data?.length > 0) {
    const ids = failedValidations.data.data.slice(0, 2).map((v) => v.id);
    result = await apiRequest('POST', '/validation-reports/bulk-resolve', {
      ids: ids,
      resolution_note: 'Bulk resolution test',
    });
    logTest(
      'POST /validation-reports/bulk-resolve',
      result.success,
      result.success ? `Resolved ${ids.length} validations` : result.error
    );
  } else {
    log('⊘ No failed validations to bulk resolve', 'yellow');
  }
}

/**
 * Step 6: Test Bulk DELETE Operations
 */
async function testBulkOperations() {
  logSection('STEP 6: BULK OPERATIONS');

  // Get some old/test submissions to delete
  const oldSubmissions = await apiRequest('GET', '/submission-reports', null, {
    tenant_id: tenantId,
    status: 'pending',
    limit: 3,
  });

  if (oldSubmissions.success && oldSubmissions.data.data?.length >= 2) {
    const idsToDelete = oldSubmissions.data.data.slice(0, 2).map((s) => s.id);

    // Test 6.1: Bulk soft delete
    const result = await apiRequest('POST', '/submission-reports/bulk-delete', {
      ids: idsToDelete,
      hard: false,
    });
    logTest(
      'POST /submission-reports/bulk-delete (soft)',
      result.success,
      result.success
        ? `Deleted ${idsToDelete.length} submissions`
        : result.error
    );
  } else {
    log('⊘ Not enough submissions for bulk delete test', 'yellow');
  }
}

/**
 * Step 7: Test Single DELETE Operations
 */
async function testDeleteOperations() {
  logSection('STEP 7: DELETE OPERATIONS');

  // Create a test submission specifically for deletion
  const testData = {
    tenantId: tenantId,
    projectId: testProjectId || 'test-delete-project',
    formId: 'test-delete-form',
    nodeId: '00000000-0000-0000-0000-000000000099',
    userId: userId,
    payload: { test: 'delete_me', price: 100 },
    source: 'api',
    project_name: 'Test Delete',
    project_category: 'Test',
  };

  const createResult = await apiRequest('POST', '/submissions', testData);

  if (createResult.success) {
    log(`✓ Created test submission for deletion`, 'green');

    // Wait a moment for processing
    await new Promise((r) => setTimeout(r, 3000));

    // Get the created submission ID
    const getSubmission = await apiRequest('GET', '/submission-reports', null, {
      tenant_id: tenantId,
      form_id: 'test-delete-form',
      limit: 1,
    });

    if (getSubmission.success && getSubmission.data.data?.length > 0) {
      const submissionToDelete = getSubmission.data.data[0].id;

      // Test 7.1: Delete submission (soft delete)
      const deleteResult = await apiRequest(
        'DELETE',
        `/submission-reports/${submissionToDelete}`
      );
      logTest(
        'DELETE /submission-reports/:id (soft delete)',
        deleteResult.success,
        deleteResult.success ? 'Submission deleted' : deleteResult.error
      );

      // Verify it's marked as deleted
      const verifyDelete = await apiRequest(
        'GET',
        `/submission-reports/${submissionToDelete}`
      );
      if (
        verifyDelete.success &&
        verifyDelete.data.data?.status === 'deleted'
      ) {
        log(`  ✓ Verified: Status changed to 'deleted'`, 'green');
      }
    }
  }

  // Test 7.2: Delete compliance record
  if (testComplianceId) {
    const result = await apiRequest(
      'DELETE',
      `/compliance-reports/${testComplianceId}`
    );
    logTest(
      'DELETE /compliance-reports/:id',
      result.success,
      result.success ? 'Compliance record deleted' : result.error
    );
  } else {
    log('⊘ No compliance record to delete', 'yellow');
  }

  // Test 7.3: Delete validation
  if (testValidationId) {
    const result = await apiRequest(
      'DELETE',
      `/validation-reports/${testValidationId}`
    );
    logTest(
      'DELETE /validation-reports/:id',
      result.success,
      result.success ? 'Validation deleted' : result.error
    );
  } else {
    log('⊘ No validation to delete', 'yellow');
  }
}

/**
 * Step 8: Verify Changes
 */
async function verifyChanges() {
  logSection('STEP 8: VERIFY ALL CHANGES');

  // Check updated submission
  if (testSubmissionId) {
    const result = await apiRequest(
      'GET',
      `/submission-reports/${testSubmissionId}`
    );
    if (result.success) {
      const submission = result.data.data;
      log(`✓ Submission ${testSubmissionId.substring(0, 8)}...`, 'green');
      log(`  Status: ${submission.status}`, 'cyan');
      log(`  Locked: ${submission.is_locked}`, 'cyan');
      log(
        `  Has test metadata: ${
          submission.meta?.updated_in_test ? 'Yes' : 'No'
        }`,
        'cyan'
      );
    }
  }

  // Check activity logs for UPDATE operations
  const activityLogs = await apiRequest(
    'GET',
    '/submissions/activity-log',
    null,
    {
      tenant_id: tenantId,
      limit: 20,
    }
  );

  if (activityLogs.success) {
    const logs = activityLogs.data.data || activityLogs.data || [];
    if (Array.isArray(logs)) {
      const updateActions = logs.filter((l) =>
        ['updated', 'locked', 'unlocked', 'status_updated', 'deleted'].includes(
          l.action
        )
      );
      log(`\n✓ Activity log entries: ${logs.length}`, 'green');
      log(`  Update/Delete actions: ${updateActions.length}`, 'cyan');

      // Show recent update actions
      if (updateActions.length > 0) {
        log(`\n  Recent update actions:`, 'cyan');
        updateActions.slice(0, 5).forEach((l) => {
          log(`    - [${l.action}] ${l.message}`, 'blue');
        });
      }
    } else {
      log(`⚠ Activity logs not in expected format`, 'yellow');
    }
  }
}

/**
 * Step 9: Test Edge Cases
 */
async function testEdgeCases() {
  logSection('STEP 9: EDGE CASES & ERROR HANDLING');

  // Test 9.1: Update non-existent submission
  let result = await apiRequest(
    'PATCH',
    '/submission-reports/00000000-0000-0000-0000-000000000000',
    {
      status: 'completed',
    }
  );
  logTest(
    'Update non-existent submission',
    !result.success && result.status === 404,
    'Returns 404 as expected'
  );

  // Test 9.2: Delete non-existent submission
  result = await apiRequest(
    'DELETE',
    '/submission-reports/00000000-0000-0000-0000-000000000000'
  );
  logTest(
    'Delete non-existent submission',
    !result.success && result.status === 404,
    'Returns 404 as expected'
  );

  // Test 9.3: Invalid status update
  if (testSubmissionId) {
    result = await apiRequest(
      'PATCH',
      `/submission-reports/${testSubmissionId}/status`,
      {
        status: 'invalid_status',
      }
    );
    logTest(
      'Update with invalid status',
      !result.success && result.status === 400,
      'Returns 400 as expected'
    );
  }

  // Test 9.4: Bulk delete with empty array
  result = await apiRequest('POST', '/submission-reports/bulk-delete', {
    ids: [],
  });
  logTest(
    'Bulk delete with empty array',
    !result.success && result.status === 400,
    'Returns 400 as expected'
  );

  // Test 9.5: Override compliance with invalid percentage
  if (testComplianceId) {
    result = await apiRequest(
      'PATCH',
      `/compliance-reports/${testComplianceId}`,
      {
        percentage: 150, // Invalid (>100)
      }
    );
    logTest(
      'Override with invalid percentage',
      !result.success && result.status === 400,
      'Returns 400 as expected'
    );
  }
}

/**
 * Step 10: Print Summary
 */
function printSummary() {
  logSection('TEST SUMMARY');

  const passRate =
    results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0;

  console.log(`
${colors.bright}Total Tests:    ${results.total}${colors.reset}
${colors.green}Passed:         ${results.passed}${colors.reset}
${colors.red}Failed:         ${results.failed}${colors.reset}

${colors.bright}Pass Rate:      ${passRate}%${colors.reset}
  `);

  if (results.failed > 0) {
    log('Failed Tests:', 'red');
    results.tests
      .filter((t) => !t.passed)
      .forEach((t) => {
        log(`  ✗ ${t.name} - ${t.details}`, 'red');
      });
  }

  if (results.passed === results.total) {
    console.log(`
${colors.bright}${colors.green}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  🎉 ALL UPDATE/DELETE TESTS PASSED! 🎉                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}

${colors.green}✓ Submission Updates: Working${colors.reset}
${colors.green}✓ Submission Deletes: Working${colors.reset}
${colors.green}✓ Compliance Updates: Working${colors.reset}
${colors.green}✓ Compliance Deletes: Working${colors.reset}
${colors.green}✓ Validation Updates: Working${colors.reset}
${colors.green}✓ Validation Deletes: Working${colors.reset}
${colors.green}✓ Bulk Operations: Working${colors.reset}
${colors.green}✓ Error Handling: Working${colors.reset}

${colors.cyan}The CRUD reporting system is fully operational!${colors.reset}
    `);
  } else {
    log(`\n⚠ Some tests failed. Review failures above.`, 'yellow');
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log(`${colors.bright}${colors.blue}
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║              UPDATE/DELETE OPERATIONS COMPREHENSIVE TEST                     ║
║                                                                              ║
║  Tests: 13 write operation endpoints (UPDATE + DELETE)                      ║
║  Coverage: Submissions, Compliance, Validations                             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  try {
    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
      process.exit(1);
    }

    // Step 2: Get test data IDs
    await getTestDataIds();

    // Step 3: Test submission updates
    await testSubmissionUpdates();

    // Step 4: Test compliance updates
    await testComplianceUpdates();

    // Step 5: Test validation updates
    await testValidationUpdates();

    // Step 6: Test bulk operations
    await testBulkOperations();

    // Step 7: Test delete operations
    await testDeleteOperations();

    // Step 8: Verify changes
    await verifyChanges();

    // Step 9: Test edge cases
    await testEdgeCases();

    // Step 10: Print summary
    printSummary();

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (error) {
    log(`\n✗ Fatal error: ${error.message}`, 'red');
    console.error(error.stack);
    process.exit(1);
  }
}

main();
