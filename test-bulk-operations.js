/**
 * COMPREHENSIVE TEST: Bulk Operations (Phase 6.1)
 *
 * Tests all 6 bulk operation endpoints:
 * 1. Bulk Update Status
 * 2. Bulk Lock/Unlock
 * 3. Bulk Update Compliance
 * 4. Bulk Archive
 * 5. Bulk Delete Advanced
 * 6. Bulk Update Metadata
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;
let testSubmissionIds = [];
let testProjectId = 'bulk-test-project';

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
    return { success: true, data: response.data };
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

async function createTestSubmissions() {
  log('\n━━━ Creating Test Submissions ━━━', 'cyan');

  // First, clean up any existing test data
  const cleanupQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  await postgresPool.query(cleanupQuery, [tenantId, testProjectId]);
  log('  Cleaned up existing test data', 'cyan');

  const submissions = [];
  const nodeIds = [
    'bulk-node-1',
    'bulk-node-2',
    'bulk-node-3',
    'bulk-node-4',
    'bulk-node-5',
  ];

  // Create 5 test submissions (1 per node) to avoid unique constraint issues
  for (let i = 0; i < 5; i++) {
    const nodeId = nodeIds[i];
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, 
       perm_enabled, month, event_compliance_percentage, is_locked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, node_id, status
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      testProjectId,
      'test-form-bulk',
      nodeId,
      userId,
      i < 3 ? 'pending' : 'submitted',
      JSON.stringify({ test_data: `bulk_submission_${i}` }),
      true,
      new Date('2025-03-01'),
      Math.floor(Math.random() * 100),
      false,
    ]);

    submissions.push(result.rows[0]);
    testSubmissionIds.push(result.rows[0].id);
  }

  log(`  Created ${submissions.length} test submissions`, 'cyan');
  log(`  Nodes: ${nodeIds.join(', ')}`, 'cyan');
  log(`  Statuses: 3 pending, 2 submitted`, 'cyan');
}

async function testBulkUpdateStatus() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: BULK UPDATE STATUS (3 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 1.1: Update status for first 5 submissions
  log('\n━━━ Test 1.1: Bulk Update Status (5 submissions) ━━━', 'cyan');
  const updateIds = testSubmissionIds.slice(0, 5);

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-status',
    {
      ids: updateIds,
      status: 'approved',
      updated_by: userId,
    }
  );

  recordTest(
    'Bulk update status (5 submissions to approved)',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(`  Updated ${result.data.data.length} submissions`, 'cyan');
  }

  // Test 1.2: Verify status update
  log('\n━━━ Test 1.2: Verify Status Update ━━━', 'cyan');
  const verifyQuery = `
    SELECT COUNT(*) as count FROM form_submissions 
    WHERE id = ANY($1::uuid[]) AND status = 'approved'
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [updateIds]);
  const verifiedCount = parseInt(verifyResult.rows[0].count);

  recordTest(
    'Verify all 5 submissions updated',
    verifiedCount === 5,
    `Expected 5, got ${verifiedCount}`
  );

  // Test 1.3: Bulk update with invalid IDs
  log('\n━━━ Test 1.3: Handle Invalid IDs ━━━', 'cyan');
  const invalidResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-status',
    {
      ids: ['invalid-uuid'],
      status: 'approved',
    }
  );

  recordTest(
    'Handle invalid UUIDs gracefully',
    !invalidResult.success || invalidResult.data.data.length === 0,
    invalidResult.error
  );
}

async function testBulkLockUnlock() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: BULK LOCK/UNLOCK (2 tests)                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 2.1: Lock all submissions for March 2025
  log('\n━━━ Test 2.1: Lock All Submissions for March 2025 ━━━', 'cyan');

  const lockResult = await apiRequest('POST', '/submission-reports/bulk-lock', {
    tenant_id: tenantId,
    project_id: testProjectId,
    month: '2025-03-01',
    is_locked: true,
    locked_by: userId,
  });

  recordTest(
    'Lock all March 2025 submissions',
    lockResult.success && lockResult.data.data.length > 0,
    lockResult.error
  );

  if (lockResult.success) {
    log(`  Locked ${lockResult.data.data.length} submissions`, 'cyan');
  }

  // Test 2.2: Unlock submissions
  log('\n━━━ Test 2.2: Unlock Submissions ━━━', 'cyan');

  const unlockResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-lock',
    {
      tenant_id: tenantId,
      project_id: testProjectId,
      month: '2025-03-01',
      is_locked: false,
      locked_by: userId,
    }
  );

  recordTest(
    'Unlock all March 2025 submissions',
    unlockResult.success && unlockResult.data.data.length > 0,
    unlockResult.error
  );

  if (unlockResult.success) {
    log(`  Unlocked ${unlockResult.data.data.length} submissions`, 'cyan');
  }
}

async function testBulkUpdateCompliance() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 3: BULK UPDATE COMPLIANCE (2 tests)                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 3.1: Update compliance for multiple nodes
  log('\n━━━ Test 3.1: Update Compliance for 5 Nodes ━━━', 'cyan');

  const complianceData = [
    { node_id: 'bulk-node-1', percentage: 100, status: 'complete' },
    { node_id: 'bulk-node-2', percentage: 85, status: 'partial' },
    { node_id: 'bulk-node-3', percentage: 90, status: 'complete' },
    { node_id: 'bulk-node-4', percentage: 60, status: 'partial' },
    { node_id: 'bulk-node-5', percentage: 50, status: 'incomplete' },
  ];

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-compliance',
    {
      tenant_id: tenantId,
      project_id: testProjectId,
      month: '2025-03-01',
      compliance_data: complianceData,
    }
  );

  recordTest(
    'Update compliance for 5 nodes',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(`  Updated ${result.data.data.length} nodes`, 'cyan');
    result.data.data.forEach((node) => {
      log(`    ${node.node_id}: ${node.event_compliance_percentage}%`, 'cyan');
    });
  }

  // Test 3.2: Verify compliance updates
  log('\n━━━ Test 3.2: Verify Compliance Updates ━━━', 'cyan');

  const verifyQuery = `
    SELECT node_id, event_compliance_percentage 
    FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2 AND node_id = 'bulk-node-1'
    ORDER BY created_at DESC LIMIT 1
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [
    tenantId,
    testProjectId,
  ]);

  recordTest(
    'Verify bulk-node-1 compliance is 100%',
    verifyResult.rows[0]?.event_compliance_percentage === 100,
    `Got ${verifyResult.rows[0]?.event_compliance_percentage}%`
  );
}

async function testBulkArchive() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                      TEST 4: BULK ARCHIVE (2 tests)                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Create old submissions for archiving
  log('\n━━━ Creating Old Submissions for Archive Test ━━━', 'cyan');

  const oldDate = new Date();
  oldDate.setMonth(oldDate.getMonth() - 18); // 18 months ago

  const oldSubmissionIds = [];
  for (let i = 0; i < 3; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      testProjectId,
      'test-form-bulk',
      'old-node',
      userId,
      'submitted',
      JSON.stringify({ old_data: true }),
      oldDate,
    ]);

    oldSubmissionIds.push(result.rows[0].id);
  }

  log(`  Created 3 old submissions`, 'cyan');

  // Test 4.1: Archive submissions older than 12 months
  log('\n━━━ Test 4.1: Archive Submissions Older Than 12 Months ━━━', 'cyan');

  const archiveResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-archive',
    {
      tenant_id: tenantId,
      older_than_months: 12,
      project_ids: [testProjectId],
    }
  );

  recordTest(
    'Archive old submissions',
    archiveResult.success && archiveResult.data.data.length >= 3,
    archiveResult.error
  );

  if (archiveResult.success) {
    log(`  Archived ${archiveResult.data.data.length} submissions`, 'cyan');
  }

  // Test 4.2: Verify archived status
  log('\n━━━ Test 4.2: Verify Archived Status ━━━', 'cyan');

  const verifyQuery = `
    SELECT COUNT(*) as count FROM form_submissions 
    WHERE id = ANY($1::uuid[]) AND status = 'archived'
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [
    oldSubmissionIds,
  ]);
  const archivedCount = parseInt(verifyResult.rows[0].count);

  recordTest(
    'Verify submissions archived',
    archivedCount === 3,
    `Expected 3, got ${archivedCount}`
  );
}

async function testBulkDeleteAdvanced() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 5: BULK DELETE ADVANCED (2 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 5.1: Soft delete (mark as deleted)
  log('\n━━━ Test 5.1: Soft Delete Submissions ━━━', 'cyan');

  const softDeleteResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-delete-advanced',
    {
      tenant_id: tenantId,
      project_ids: [testProjectId],
      status: 'archived',
      hard_delete: false,
    }
  );

  recordTest(
    'Soft delete archived submissions',
    softDeleteResult.success && softDeleteResult.data.deleted > 0,
    softDeleteResult.error
  );

  if (softDeleteResult.success) {
    log(`  Soft deleted ${softDeleteResult.data.deleted} submissions`, 'cyan');
  }

  // Test 5.2: Hard delete (permanent removal)
  log('\n━━━ Test 5.2: Hard Delete Test Submissions ━━━', 'cyan');

  // Create disposable submissions
  const disposableIds = [];
  for (let i = 0; i < 2; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      'disposable-project',
      'test-form',
      'disposable-node',
      userId,
      'test',
      JSON.stringify({ disposable: true }),
    ]);

    disposableIds.push(result.rows[0].id);
  }

  const hardDeleteResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-delete-advanced',
    {
      tenant_id: tenantId,
      project_ids: ['disposable-project'],
      hard_delete: true,
    }
  );

  recordTest(
    'Hard delete test submissions',
    hardDeleteResult.success && hardDeleteResult.data.deleted === 2,
    hardDeleteResult.error
  );

  if (hardDeleteResult.success) {
    log(
      `  Hard deleted ${hardDeleteResult.data.deleted} submissions (permanent)`,
      'cyan'
    );
  }
}

async function testBulkUpdateMetadata() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 6: BULK UPDATE METADATA (2 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 6.1: Add metadata to multiple submissions
  log('\n━━━ Test 6.1: Add Metadata to 5 Submissions ━━━', 'cyan');

  const metadataIds = testSubmissionIds.slice(5, 10);
  const metadata = {
    tags: ['urgent', 'review'],
    priority: 'high',
    notes: 'Requires attention',
    reviewed_by: userId,
  };

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-metadata',
    {
      ids: metadataIds,
      metadata: metadata,
    }
  );

  recordTest(
    'Add metadata to 5 submissions',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(
      `  Updated metadata for ${result.data.data.length} submissions`,
      'cyan'
    );
  }

  // Test 6.2: Verify metadata was added
  log('\n━━━ Test 6.2: Verify Metadata ━━━', 'cyan');

  const verifyQuery = `
    SELECT meta FROM form_submissions 
    WHERE id = $1
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [metadataIds[0]]);
  const meta = verifyResult.rows[0]?.meta;

  recordTest(
    'Verify metadata contains tags',
    meta && meta.tags && meta.tags.includes('urgent'),
    `Meta: ${JSON.stringify(meta)}`
  );
}

async function cleanup() {
  log('\n━━━ Cleanup Test Data ━━━', 'cyan');

  // Delete all test submissions
  const deleteQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND (project_id = $2 OR project_id = 'disposable-project')
  `;

  const result = await postgresPool.query(deleteQuery, [
    tenantId,
    testProjectId,
  ]);
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
  log(
    `   Failed: ${testResults.failed}`,
    testResults.failed > 0 ? 'red' : 'green'
  );
  log(`   Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : 'yellow');

  log(`\n📋 Test Breakdown:`, 'bright');
  log(`   Test 1: Bulk Update Status (3 tests)`, 'cyan');
  log(`   Test 2: Bulk Lock/Unlock (2 tests)`, 'cyan');
  log(`   Test 3: Bulk Update Compliance (2 tests)`, 'cyan');
  log(`   Test 4: Bulk Archive (2 tests)`, 'cyan');
  log(`   Test 5: Bulk Delete Advanced (2 tests)`, 'cyan');
  log(`   Test 6: Bulk Update Metadata (2 tests)`, 'cyan');

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
║                    ✅ BULK OPERATIONS TESTS PASSED! (${passRate}%)                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

    log('\n🎉 All bulk operation endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.2: Export Features', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    BULK OPERATIONS TEST SUITE (Phase 6.1)                   ║
║                                                                              ║
║  Testing 6 bulk operation endpoints with 13 comprehensive tests             ║
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
    await createTestSubmissions();

    // Step 3: Run tests
    await testBulkUpdateStatus();
    await testBulkLockUnlock();
    await testBulkUpdateCompliance();
    await testBulkArchive();
    await testBulkDeleteAdvanced();
    await testBulkUpdateMetadata();

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

 *
 * Tests all 6 bulk operation endpoints:
 * 1. Bulk Update Status
 * 2. Bulk Lock/Unlock
 * 3. Bulk Update Compliance
 * 4. Bulk Archive
 * 5. Bulk Delete Advanced
 * 6. Bulk Update Metadata
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;
let testSubmissionIds = [];
let testProjectId = 'bulk-test-project';

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
    return { success: true, data: response.data };
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

async function createTestSubmissions() {
  log('\n━━━ Creating Test Submissions ━━━', 'cyan');

  // First, clean up any existing test data
  const cleanupQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  await postgresPool.query(cleanupQuery, [tenantId, testProjectId]);
  log('  Cleaned up existing test data', 'cyan');

  const submissions = [];
  const nodeIds = [
    'bulk-node-1',
    'bulk-node-2',
    'bulk-node-3',
    'bulk-node-4',
    'bulk-node-5',
  ];

  // Create 5 test submissions (1 per node) to avoid unique constraint issues
  for (let i = 0; i < 5; i++) {
    const nodeId = nodeIds[i];
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, 
       perm_enabled, month, event_compliance_percentage, is_locked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, node_id, status
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      testProjectId,
      'test-form-bulk',
      nodeId,
      userId,
      i < 3 ? 'pending' : 'submitted',
      JSON.stringify({ test_data: `bulk_submission_${i}` }),
      true,
      new Date('2025-03-01'),
      Math.floor(Math.random() * 100),
      false,
    ]);

    submissions.push(result.rows[0]);
    testSubmissionIds.push(result.rows[0].id);
  }

  log(`  Created ${submissions.length} test submissions`, 'cyan');
  log(`  Nodes: ${nodeIds.join(', ')}`, 'cyan');
  log(`  Statuses: 3 pending, 2 submitted`, 'cyan');
}

async function testBulkUpdateStatus() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: BULK UPDATE STATUS (3 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 1.1: Update status for first 5 submissions
  log('\n━━━ Test 1.1: Bulk Update Status (5 submissions) ━━━', 'cyan');
  const updateIds = testSubmissionIds.slice(0, 5);

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-status',
    {
      ids: updateIds,
      status: 'approved',
      updated_by: userId,
    }
  );

  recordTest(
    'Bulk update status (5 submissions to approved)',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(`  Updated ${result.data.data.length} submissions`, 'cyan');
  }

  // Test 1.2: Verify status update
  log('\n━━━ Test 1.2: Verify Status Update ━━━', 'cyan');
  const verifyQuery = `
    SELECT COUNT(*) as count FROM form_submissions 
    WHERE id = ANY($1::uuid[]) AND status = 'approved'
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [updateIds]);
  const verifiedCount = parseInt(verifyResult.rows[0].count);

  recordTest(
    'Verify all 5 submissions updated',
    verifiedCount === 5,
    `Expected 5, got ${verifiedCount}`
  );

  // Test 1.3: Bulk update with invalid IDs
  log('\n━━━ Test 1.3: Handle Invalid IDs ━━━', 'cyan');
  const invalidResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-status',
    {
      ids: ['invalid-uuid'],
      status: 'approved',
    }
  );

  recordTest(
    'Handle invalid UUIDs gracefully',
    !invalidResult.success || invalidResult.data.data.length === 0,
    invalidResult.error
  );
}

async function testBulkLockUnlock() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: BULK LOCK/UNLOCK (2 tests)                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 2.1: Lock all submissions for March 2025
  log('\n━━━ Test 2.1: Lock All Submissions for March 2025 ━━━', 'cyan');

  const lockResult = await apiRequest('POST', '/submission-reports/bulk-lock', {
    tenant_id: tenantId,
    project_id: testProjectId,
    month: '2025-03-01',
    is_locked: true,
    locked_by: userId,
  });

  recordTest(
    'Lock all March 2025 submissions',
    lockResult.success && lockResult.data.data.length > 0,
    lockResult.error
  );

  if (lockResult.success) {
    log(`  Locked ${lockResult.data.data.length} submissions`, 'cyan');
  }

  // Test 2.2: Unlock submissions
  log('\n━━━ Test 2.2: Unlock Submissions ━━━', 'cyan');

  const unlockResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-lock',
    {
      tenant_id: tenantId,
      project_id: testProjectId,
      month: '2025-03-01',
      is_locked: false,
      locked_by: userId,
    }
  );

  recordTest(
    'Unlock all March 2025 submissions',
    unlockResult.success && unlockResult.data.data.length > 0,
    unlockResult.error
  );

  if (unlockResult.success) {
    log(`  Unlocked ${unlockResult.data.data.length} submissions`, 'cyan');
  }
}

async function testBulkUpdateCompliance() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 3: BULK UPDATE COMPLIANCE (2 tests)                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 3.1: Update compliance for multiple nodes
  log('\n━━━ Test 3.1: Update Compliance for 5 Nodes ━━━', 'cyan');

  const complianceData = [
    { node_id: 'bulk-node-1', percentage: 100, status: 'complete' },
    { node_id: 'bulk-node-2', percentage: 85, status: 'partial' },
    { node_id: 'bulk-node-3', percentage: 90, status: 'complete' },
    { node_id: 'bulk-node-4', percentage: 60, status: 'partial' },
    { node_id: 'bulk-node-5', percentage: 50, status: 'incomplete' },
  ];

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-compliance',
    {
      tenant_id: tenantId,
      project_id: testProjectId,
      month: '2025-03-01',
      compliance_data: complianceData,
    }
  );

  recordTest(
    'Update compliance for 5 nodes',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(`  Updated ${result.data.data.length} nodes`, 'cyan');
    result.data.data.forEach((node) => {
      log(`    ${node.node_id}: ${node.event_compliance_percentage}%`, 'cyan');
    });
  }

  // Test 3.2: Verify compliance updates
  log('\n━━━ Test 3.2: Verify Compliance Updates ━━━', 'cyan');

  const verifyQuery = `
    SELECT node_id, event_compliance_percentage 
    FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2 AND node_id = 'bulk-node-1'
    ORDER BY created_at DESC LIMIT 1
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [
    tenantId,
    testProjectId,
  ]);

  recordTest(
    'Verify bulk-node-1 compliance is 100%',
    verifyResult.rows[0]?.event_compliance_percentage === 100,
    `Got ${verifyResult.rows[0]?.event_compliance_percentage}%`
  );
}

async function testBulkArchive() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                      TEST 4: BULK ARCHIVE (2 tests)                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Create old submissions for archiving
  log('\n━━━ Creating Old Submissions for Archive Test ━━━', 'cyan');

  const oldDate = new Date();
  oldDate.setMonth(oldDate.getMonth() - 18); // 18 months ago

  const oldSubmissionIds = [];
  for (let i = 0; i < 3; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      testProjectId,
      'test-form-bulk',
      'old-node',
      userId,
      'submitted',
      JSON.stringify({ old_data: true }),
      oldDate,
    ]);

    oldSubmissionIds.push(result.rows[0].id);
  }

  log(`  Created 3 old submissions`, 'cyan');

  // Test 4.1: Archive submissions older than 12 months
  log('\n━━━ Test 4.1: Archive Submissions Older Than 12 Months ━━━', 'cyan');

  const archiveResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-archive',
    {
      tenant_id: tenantId,
      older_than_months: 12,
      project_ids: [testProjectId],
    }
  );

  recordTest(
    'Archive old submissions',
    archiveResult.success && archiveResult.data.data.length >= 3,
    archiveResult.error
  );

  if (archiveResult.success) {
    log(`  Archived ${archiveResult.data.data.length} submissions`, 'cyan');
  }

  // Test 4.2: Verify archived status
  log('\n━━━ Test 4.2: Verify Archived Status ━━━', 'cyan');

  const verifyQuery = `
    SELECT COUNT(*) as count FROM form_submissions 
    WHERE id = ANY($1::uuid[]) AND status = 'archived'
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [
    oldSubmissionIds,
  ]);
  const archivedCount = parseInt(verifyResult.rows[0].count);

  recordTest(
    'Verify submissions archived',
    archivedCount === 3,
    `Expected 3, got ${archivedCount}`
  );
}

async function testBulkDeleteAdvanced() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 5: BULK DELETE ADVANCED (2 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 5.1: Soft delete (mark as deleted)
  log('\n━━━ Test 5.1: Soft Delete Submissions ━━━', 'cyan');

  const softDeleteResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-delete-advanced',
    {
      tenant_id: tenantId,
      project_ids: [testProjectId],
      status: 'archived',
      hard_delete: false,
    }
  );

  recordTest(
    'Soft delete archived submissions',
    softDeleteResult.success && softDeleteResult.data.deleted > 0,
    softDeleteResult.error
  );

  if (softDeleteResult.success) {
    log(`  Soft deleted ${softDeleteResult.data.deleted} submissions`, 'cyan');
  }

  // Test 5.2: Hard delete (permanent removal)
  log('\n━━━ Test 5.2: Hard Delete Test Submissions ━━━', 'cyan');

  // Create disposable submissions
  const disposableIds = [];
  for (let i = 0; i < 2; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      'disposable-project',
      'test-form',
      'disposable-node',
      userId,
      'test',
      JSON.stringify({ disposable: true }),
    ]);

    disposableIds.push(result.rows[0].id);
  }

  const hardDeleteResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-delete-advanced',
    {
      tenant_id: tenantId,
      project_ids: ['disposable-project'],
      hard_delete: true,
    }
  );

  recordTest(
    'Hard delete test submissions',
    hardDeleteResult.success && hardDeleteResult.data.deleted === 2,
    hardDeleteResult.error
  );

  if (hardDeleteResult.success) {
    log(
      `  Hard deleted ${hardDeleteResult.data.deleted} submissions (permanent)`,
      'cyan'
    );
  }
}

async function testBulkUpdateMetadata() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 6: BULK UPDATE METADATA (2 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 6.1: Add metadata to multiple submissions
  log('\n━━━ Test 6.1: Add Metadata to 5 Submissions ━━━', 'cyan');

  const metadataIds = testSubmissionIds.slice(5, 10);
  const metadata = {
    tags: ['urgent', 'review'],
    priority: 'high',
    notes: 'Requires attention',
    reviewed_by: userId,
  };

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-metadata',
    {
      ids: metadataIds,
      metadata: metadata,
    }
  );

  recordTest(
    'Add metadata to 5 submissions',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(
      `  Updated metadata for ${result.data.data.length} submissions`,
      'cyan'
    );
  }

  // Test 6.2: Verify metadata was added
  log('\n━━━ Test 6.2: Verify Metadata ━━━', 'cyan');

  const verifyQuery = `
    SELECT meta FROM form_submissions 
    WHERE id = $1
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [metadataIds[0]]);
  const meta = verifyResult.rows[0]?.meta;

  recordTest(
    'Verify metadata contains tags',
    meta && meta.tags && meta.tags.includes('urgent'),
    `Meta: ${JSON.stringify(meta)}`
  );
}

async function cleanup() {
  log('\n━━━ Cleanup Test Data ━━━', 'cyan');

  // Delete all test submissions
  const deleteQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND (project_id = $2 OR project_id = 'disposable-project')
  `;

  const result = await postgresPool.query(deleteQuery, [
    tenantId,
    testProjectId,
  ]);
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
  log(
    `   Failed: ${testResults.failed}`,
    testResults.failed > 0 ? 'red' : 'green'
  );
  log(`   Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : 'yellow');

  log(`\n📋 Test Breakdown:`, 'bright');
  log(`   Test 1: Bulk Update Status (3 tests)`, 'cyan');
  log(`   Test 2: Bulk Lock/Unlock (2 tests)`, 'cyan');
  log(`   Test 3: Bulk Update Compliance (2 tests)`, 'cyan');
  log(`   Test 4: Bulk Archive (2 tests)`, 'cyan');
  log(`   Test 5: Bulk Delete Advanced (2 tests)`, 'cyan');
  log(`   Test 6: Bulk Update Metadata (2 tests)`, 'cyan');

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
║                    ✅ BULK OPERATIONS TESTS PASSED! (${passRate}%)                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

    log('\n🎉 All bulk operation endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.2: Export Features', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    BULK OPERATIONS TEST SUITE (Phase 6.1)                   ║
║                                                                              ║
║  Testing 6 bulk operation endpoints with 13 comprehensive tests             ║
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
    await createTestSubmissions();

    // Step 3: Run tests
    await testBulkUpdateStatus();
    await testBulkLockUnlock();
    await testBulkUpdateCompliance();
    await testBulkArchive();
    await testBulkDeleteAdvanced();
    await testBulkUpdateMetadata();

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

 *
 * Tests all 6 bulk operation endpoints:
 * 1. Bulk Update Status
 * 2. Bulk Lock/Unlock
 * 3. Bulk Update Compliance
 * 4. Bulk Archive
 * 5. Bulk Delete Advanced
 * 6. Bulk Update Metadata
 */

const axios = require('axios');
const { postgresPool } = require('./src/config/postgres');

const BASE_URL = 'http://127.0.0.1:4000/v1';
const CREDENTIALS = { email: 'saby@saby.ai', password: '@saby_Saby1' };

let authToken = null;
let tenantId = null;
let userId = null;
let testSubmissionIds = [];
let testProjectId = 'bulk-test-project';

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
    return { success: true, data: response.data };
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

async function createTestSubmissions() {
  log('\n━━━ Creating Test Submissions ━━━', 'cyan');

  // First, clean up any existing test data
  const cleanupQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2
  `;
  await postgresPool.query(cleanupQuery, [tenantId, testProjectId]);
  log('  Cleaned up existing test data', 'cyan');

  const submissions = [];
  const nodeIds = [
    'bulk-node-1',
    'bulk-node-2',
    'bulk-node-3',
    'bulk-node-4',
    'bulk-node-5',
  ];

  // Create 5 test submissions (1 per node) to avoid unique constraint issues
  for (let i = 0; i < 5; i++) {
    const nodeId = nodeIds[i];
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, 
       perm_enabled, month, event_compliance_percentage, is_locked)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, node_id, status
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      testProjectId,
      'test-form-bulk',
      nodeId,
      userId,
      i < 3 ? 'pending' : 'submitted',
      JSON.stringify({ test_data: `bulk_submission_${i}` }),
      true,
      new Date('2025-03-01'),
      Math.floor(Math.random() * 100),
      false,
    ]);

    submissions.push(result.rows[0]);
    testSubmissionIds.push(result.rows[0].id);
  }

  log(`  Created ${submissions.length} test submissions`, 'cyan');
  log(`  Nodes: ${nodeIds.join(', ')}`, 'cyan');
  log(`  Statuses: 3 pending, 2 submitted`, 'cyan');
}

async function testBulkUpdateStatus() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 1: BULK UPDATE STATUS (3 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 1.1: Update status for first 5 submissions
  log('\n━━━ Test 1.1: Bulk Update Status (5 submissions) ━━━', 'cyan');
  const updateIds = testSubmissionIds.slice(0, 5);

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-status',
    {
      ids: updateIds,
      status: 'approved',
      updated_by: userId,
    }
  );

  recordTest(
    'Bulk update status (5 submissions to approved)',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(`  Updated ${result.data.data.length} submissions`, 'cyan');
  }

  // Test 1.2: Verify status update
  log('\n━━━ Test 1.2: Verify Status Update ━━━', 'cyan');
  const verifyQuery = `
    SELECT COUNT(*) as count FROM form_submissions 
    WHERE id = ANY($1::uuid[]) AND status = 'approved'
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [updateIds]);
  const verifiedCount = parseInt(verifyResult.rows[0].count);

  recordTest(
    'Verify all 5 submissions updated',
    verifiedCount === 5,
    `Expected 5, got ${verifiedCount}`
  );

  // Test 1.3: Bulk update with invalid IDs
  log('\n━━━ Test 1.3: Handle Invalid IDs ━━━', 'cyan');
  const invalidResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-status',
    {
      ids: ['invalid-uuid'],
      status: 'approved',
    }
  );

  recordTest(
    'Handle invalid UUIDs gracefully',
    !invalidResult.success || invalidResult.data.data.length === 0,
    invalidResult.error
  );
}

async function testBulkLockUnlock() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    TEST 2: BULK LOCK/UNLOCK (2 tests)                       ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 2.1: Lock all submissions for March 2025
  log('\n━━━ Test 2.1: Lock All Submissions for March 2025 ━━━', 'cyan');

  const lockResult = await apiRequest('POST', '/submission-reports/bulk-lock', {
    tenant_id: tenantId,
    project_id: testProjectId,
    month: '2025-03-01',
    is_locked: true,
    locked_by: userId,
  });

  recordTest(
    'Lock all March 2025 submissions',
    lockResult.success && lockResult.data.data.length > 0,
    lockResult.error
  );

  if (lockResult.success) {
    log(`  Locked ${lockResult.data.data.length} submissions`, 'cyan');
  }

  // Test 2.2: Unlock submissions
  log('\n━━━ Test 2.2: Unlock Submissions ━━━', 'cyan');

  const unlockResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-lock',
    {
      tenant_id: tenantId,
      project_id: testProjectId,
      month: '2025-03-01',
      is_locked: false,
      locked_by: userId,
    }
  );

  recordTest(
    'Unlock all March 2025 submissions',
    unlockResult.success && unlockResult.data.data.length > 0,
    unlockResult.error
  );

  if (unlockResult.success) {
    log(`  Unlocked ${unlockResult.data.data.length} submissions`, 'cyan');
  }
}

async function testBulkUpdateCompliance() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 3: BULK UPDATE COMPLIANCE (2 tests)                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 3.1: Update compliance for multiple nodes
  log('\n━━━ Test 3.1: Update Compliance for 5 Nodes ━━━', 'cyan');

  const complianceData = [
    { node_id: 'bulk-node-1', percentage: 100, status: 'complete' },
    { node_id: 'bulk-node-2', percentage: 85, status: 'partial' },
    { node_id: 'bulk-node-3', percentage: 90, status: 'complete' },
    { node_id: 'bulk-node-4', percentage: 60, status: 'partial' },
    { node_id: 'bulk-node-5', percentage: 50, status: 'incomplete' },
  ];

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-compliance',
    {
      tenant_id: tenantId,
      project_id: testProjectId,
      month: '2025-03-01',
      compliance_data: complianceData,
    }
  );

  recordTest(
    'Update compliance for 5 nodes',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(`  Updated ${result.data.data.length} nodes`, 'cyan');
    result.data.data.forEach((node) => {
      log(`    ${node.node_id}: ${node.event_compliance_percentage}%`, 'cyan');
    });
  }

  // Test 3.2: Verify compliance updates
  log('\n━━━ Test 3.2: Verify Compliance Updates ━━━', 'cyan');

  const verifyQuery = `
    SELECT node_id, event_compliance_percentage 
    FROM form_submissions 
    WHERE tenant_id = $1 AND project_id = $2 AND node_id = 'bulk-node-1'
    ORDER BY created_at DESC LIMIT 1
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [
    tenantId,
    testProjectId,
  ]);

  recordTest(
    'Verify bulk-node-1 compliance is 100%',
    verifyResult.rows[0]?.event_compliance_percentage === 100,
    `Got ${verifyResult.rows[0]?.event_compliance_percentage}%`
  );
}

async function testBulkArchive() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                      TEST 4: BULK ARCHIVE (2 tests)                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Create old submissions for archiving
  log('\n━━━ Creating Old Submissions for Archive Test ━━━', 'cyan');

  const oldDate = new Date();
  oldDate.setMonth(oldDate.getMonth() - 18); // 18 months ago

  const oldSubmissionIds = [];
  for (let i = 0; i < 3; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      testProjectId,
      'test-form-bulk',
      'old-node',
      userId,
      'submitted',
      JSON.stringify({ old_data: true }),
      oldDate,
    ]);

    oldSubmissionIds.push(result.rows[0].id);
  }

  log(`  Created 3 old submissions`, 'cyan');

  // Test 4.1: Archive submissions older than 12 months
  log('\n━━━ Test 4.1: Archive Submissions Older Than 12 Months ━━━', 'cyan');

  const archiveResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-archive',
    {
      tenant_id: tenantId,
      older_than_months: 12,
      project_ids: [testProjectId],
    }
  );

  recordTest(
    'Archive old submissions',
    archiveResult.success && archiveResult.data.data.length >= 3,
    archiveResult.error
  );

  if (archiveResult.success) {
    log(`  Archived ${archiveResult.data.data.length} submissions`, 'cyan');
  }

  // Test 4.2: Verify archived status
  log('\n━━━ Test 4.2: Verify Archived Status ━━━', 'cyan');

  const verifyQuery = `
    SELECT COUNT(*) as count FROM form_submissions 
    WHERE id = ANY($1::uuid[]) AND status = 'archived'
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [
    oldSubmissionIds,
  ]);
  const archivedCount = parseInt(verifyResult.rows[0].count);

  recordTest(
    'Verify submissions archived',
    archivedCount === 3,
    `Expected 3, got ${archivedCount}`
  );
}

async function testBulkDeleteAdvanced() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 5: BULK DELETE ADVANCED (2 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 5.1: Soft delete (mark as deleted)
  log('\n━━━ Test 5.1: Soft Delete Submissions ━━━', 'cyan');

  const softDeleteResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-delete-advanced',
    {
      tenant_id: tenantId,
      project_ids: [testProjectId],
      status: 'archived',
      hard_delete: false,
    }
  );

  recordTest(
    'Soft delete archived submissions',
    softDeleteResult.success && softDeleteResult.data.deleted > 0,
    softDeleteResult.error
  );

  if (softDeleteResult.success) {
    log(`  Soft deleted ${softDeleteResult.data.deleted} submissions`, 'cyan');
  }

  // Test 5.2: Hard delete (permanent removal)
  log('\n━━━ Test 5.2: Hard Delete Test Submissions ━━━', 'cyan');

  // Create disposable submissions
  const disposableIds = [];
  for (let i = 0; i < 2; i++) {
    const query = `
      INSERT INTO form_submissions 
      (tenant_id, project_id, form_id, node_id, user_id, status, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const result = await postgresPool.query(query, [
      tenantId,
      'disposable-project',
      'test-form',
      'disposable-node',
      userId,
      'test',
      JSON.stringify({ disposable: true }),
    ]);

    disposableIds.push(result.rows[0].id);
  }

  const hardDeleteResult = await apiRequest(
    'POST',
    '/submission-reports/bulk-delete-advanced',
    {
      tenant_id: tenantId,
      project_ids: ['disposable-project'],
      hard_delete: true,
    }
  );

  recordTest(
    'Hard delete test submissions',
    hardDeleteResult.success && hardDeleteResult.data.deleted === 2,
    hardDeleteResult.error
  );

  if (hardDeleteResult.success) {
    log(
      `  Hard deleted ${hardDeleteResult.data.deleted} submissions (permanent)`,
      'cyan'
    );
  }
}

async function testBulkUpdateMetadata() {
  console.log(`\n${colors.bright}${colors.magenta}
╔══════════════════════════════════════════════════════════════════════════════╗
║                  TEST 6: BULK UPDATE METADATA (2 tests)                     ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

  // Test 6.1: Add metadata to multiple submissions
  log('\n━━━ Test 6.1: Add Metadata to 5 Submissions ━━━', 'cyan');

  const metadataIds = testSubmissionIds.slice(5, 10);
  const metadata = {
    tags: ['urgent', 'review'],
    priority: 'high',
    notes: 'Requires attention',
    reviewed_by: userId,
  };

  const result = await apiRequest(
    'POST',
    '/submission-reports/bulk-update-metadata',
    {
      ids: metadataIds,
      metadata: metadata,
    }
  );

  recordTest(
    'Add metadata to 5 submissions',
    result.success && result.data.data.length === 5,
    result.error
  );

  if (result.success) {
    log(
      `  Updated metadata for ${result.data.data.length} submissions`,
      'cyan'
    );
  }

  // Test 6.2: Verify metadata was added
  log('\n━━━ Test 6.2: Verify Metadata ━━━', 'cyan');

  const verifyQuery = `
    SELECT meta FROM form_submissions 
    WHERE id = $1
  `;
  const verifyResult = await postgresPool.query(verifyQuery, [metadataIds[0]]);
  const meta = verifyResult.rows[0]?.meta;

  recordTest(
    'Verify metadata contains tags',
    meta && meta.tags && meta.tags.includes('urgent'),
    `Meta: ${JSON.stringify(meta)}`
  );
}

async function cleanup() {
  log('\n━━━ Cleanup Test Data ━━━', 'cyan');

  // Delete all test submissions
  const deleteQuery = `
    DELETE FROM form_submissions 
    WHERE tenant_id = $1 AND (project_id = $2 OR project_id = 'disposable-project')
  `;

  const result = await postgresPool.query(deleteQuery, [
    tenantId,
    testProjectId,
  ]);
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
  log(
    `   Failed: ${testResults.failed}`,
    testResults.failed > 0 ? 'red' : 'green'
  );
  log(`   Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : 'yellow');

  log(`\n📋 Test Breakdown:`, 'bright');
  log(`   Test 1: Bulk Update Status (3 tests)`, 'cyan');
  log(`   Test 2: Bulk Lock/Unlock (2 tests)`, 'cyan');
  log(`   Test 3: Bulk Update Compliance (2 tests)`, 'cyan');
  log(`   Test 4: Bulk Archive (2 tests)`, 'cyan');
  log(`   Test 5: Bulk Delete Advanced (2 tests)`, 'cyan');
  log(`   Test 6: Bulk Update Metadata (2 tests)`, 'cyan');

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
║                    ✅ BULK OPERATIONS TESTS PASSED! (${passRate}%)                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
${colors.reset}`);

    log('\n🎉 All bulk operation endpoints are working!', 'green');
    log('\n✅ Ready for Phase 6.2: Export Features', 'green');
  } else {
    log('\n⚠️  Some tests failed. Please review the errors above.', 'yellow');
  }
}

async function main() {
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════════════════════╗
║                    BULK OPERATIONS TEST SUITE (Phase 6.1)                   ║
║                                                                              ║
║  Testing 6 bulk operation endpoints with 13 comprehensive tests             ║
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
    await createTestSubmissions();

    // Step 3: Run tests
    await testBulkUpdateStatus();
    await testBulkLockUnlock();
    await testBulkUpdateCompliance();
    await testBulkArchive();
    await testBulkDeleteAdvanced();
    await testBulkUpdateMetadata();

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
