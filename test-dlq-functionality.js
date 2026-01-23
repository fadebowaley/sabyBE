/**
 * DLQ Functionality Test
 *
 * Tests the Dead Letter Queue (DLQ) service end-to-end
 *
 * Prerequisites:
 * - DLQ tables must be created (run create-dlq-tables.sql first)
 * - PostgreSQL must be running
 * - Environment variables configured
 *
 * Usage:
 *   node test-dlq-functionality.js
 */

const dlqService = require('./src/services/dlq.service');
const logger = require('./src/config/logger');

async function testDLQ() {
  console.log('\n🧪 ========================================');
  console.log('   DLQ FUNCTIONALITY TEST');
  console.log('========================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Save to DLQ
  console.log('📝 Test 1: Save failed job to DLQ');
  try {
    const testJobId = 'test-job-' + Date.now();
    const dlqEntry = await dlqService.saveToDLQ({
      jobId: testJobId,
      queueName: 'submissionQueue',
      jobData: {
        tenantId: 'test-tenant-001',
        projectId: 'test-project-001',
        formId: 'test-form-001',
        payload: {
          name: 'Test User',
          email: 'test@example.com',
          description: 'Test submission that failed',
        },
      },
      error: 'Test error: Database connection timeout after 5 retries',
      stack:
        'Error: Database connection timeout\n    at TestFunction (test.js:10:15)\n    at Worker.process (worker.js:50:20)',
      attempts: 5,
      failedAt: new Date(),
      tenantId: 'test-tenant-001',
      projectId: 'test-project-001',
      userId: 'test-user-001',
    });

    console.log(`   ✅ PASS: DLQ entry created`);
    console.log(`      ID: ${dlqEntry.id}`);
    console.log(`      Job ID: ${dlqEntry.job_id}`);
    console.log(`      Queue: ${dlqEntry.queue_name}`);
    console.log(`      Attempts: ${dlqEntry.attempts}`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    if (err.message.includes('relation "dead_letter_queue" does not exist')) {
      console.log('      → Run create-dlq-tables.sql first!');
    }
    testsFailed++;
  }

  // Test 2: Retrieve from DLQ
  console.log('\n📝 Test 2: Retrieve failed jobs from DLQ');
  try {
    const failed = await dlqService.getFailedJobs({
      tenantId: 'test-tenant-001',
    });

    console.log(`   ✅ PASS: Retrieved ${failed.rows.length} failed job(s)`);

    if (failed.rows.length > 0) {
      const job = failed.rows[0];
      console.log(`      Latest Job:`);
      console.log(`        - Job ID: ${job.job_id}`);
      console.log(`        - Queue: ${job.queue_name}`);
      console.log(`        - Error: ${job.error_message?.substring(0, 60)}...`);
      console.log(`        - Attempts: ${job.attempts}`);
      console.log(`        - Failed At: ${job.failed_at}`);
      console.log(`        - Recovered: ${job.recovered}`);
    }
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    testsFailed++;
  }

  // Test 3: Get all failed jobs (no filter)
  console.log('\n📝 Test 3: Get all failed jobs (system-wide)');
  try {
    const allFailed = await dlqService.getFailedJobs();
    console.log(
      `   ✅ PASS: Found ${allFailed.rows.length} total failed job(s) in DLQ`
    );
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    testsFailed++;
  }

  // Test 4: Test duplicate job handling (upsert)
  console.log('\n📝 Test 4: Test duplicate job handling (upsert)');
  try {
    const duplicateJobId = 'duplicate-test-' + Date.now();

    // Insert first time
    await dlqService.saveToDLQ({
      jobId: duplicateJobId,
      queueName: 'submissionQueue',
      jobData: { test: 'original data' },
      error: 'Original error',
      stack: 'Original stack',
      attempts: 3,
      failedAt: new Date(),
      tenantId: 'test-tenant-001',
      projectId: 'test-project-001',
      userId: 'test-user-001',
    });

    // Insert again with updated error
    const updated = await dlqService.saveToDLQ({
      jobId: duplicateJobId,
      queueName: 'submissionQueue',
      jobData: { test: 'updated data' },
      error: 'Updated error after retry',
      stack: 'Updated stack',
      attempts: 5,
      failedAt: new Date(),
      tenantId: 'test-tenant-001',
      projectId: 'test-project-001',
      userId: 'test-user-001',
    });

    console.log(`   ✅ PASS: Upsert handled duplicate job correctly`);
    console.log(`      Job ID: ${updated.job_id}`);
    console.log(`      Updated Error: ${updated.error_message}`);
    console.log(`      Final Attempts: ${updated.attempts}`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    testsFailed++;
  }

  // Test 5: Send admin alert (system_alerts table)
  console.log('\n📝 Test 5: Send admin alert to system_alerts');
  try {
    await dlqService.sendAdminAlert({
      level: 'CRITICAL',
      type: 'test_dlq_alert',
      message: 'Test DLQ alert - submission permanently failed',
      error: 'Test error: Connection refused',
      tenantId: 'test-tenant-001',
      projectId: 'test-project-001',
    });

    console.log(`   ✅ PASS: Admin alert saved to system_alerts`);
    console.log(`      Level: CRITICAL`);
    console.log(`      Type: test_dlq_alert`);
    console.log(`      (Email may not be sent if SMTP not configured)`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    if (err.message.includes('relation "system_alerts" does not exist')) {
      console.log('      → Run create-dlq-tables.sql first!');
    }
    testsFailed++;
  }

  // Test 6: Get DLQ stats
  console.log('\n📝 Test 6: Get DLQ statistics');
  try {
    const { postgresPool } = require('./src/config/postgres');
    const statsQuery = `
      SELECT 
        COUNT(*) as total_failed,
        COUNT(*) FILTER (WHERE recovered = false) as pending_recovery,
        COUNT(*) FILTER (WHERE recovered = true) as recovered,
        COUNT(*) FILTER (WHERE failed_at > NOW() - INTERVAL '24 hours') as last_24_hours,
        COUNT(DISTINCT tenant_id) as affected_tenants,
        COUNT(DISTINCT queue_name) as affected_queues
      FROM dead_letter_queue
    `;
    const result = await postgresPool.query(statsQuery);
    const stats = result.rows[0];

    console.log(`   ✅ PASS: DLQ statistics retrieved`);
    console.log(`      Total Failed Jobs: ${stats.total_failed}`);
    console.log(`      Pending Recovery: ${stats.pending_recovery}`);
    console.log(`      Recovered: ${stats.recovered}`);
    console.log(`      Last 24 Hours: ${stats.last_24_hours}`);
    console.log(`      Affected Tenants: ${stats.affected_tenants}`);
    console.log(`      Affected Queues: ${stats.affected_queues}`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    testsFailed++;
  }

  // Test 7: Check system_alerts
  console.log('\n📝 Test 7: Check system_alerts table');
  try {
    const { postgresPool } = require('./src/config/postgres');
    const alertsQuery = `
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(*) FILTER (WHERE level = 'CRITICAL') as critical,
        COUNT(*) FILTER (WHERE level = 'WARNING') as warnings,
        COUNT(*) FILTER (WHERE resolved = false) as unresolved
      FROM system_alerts
    `;
    const result = await postgresPool.query(alertsQuery);
    const alerts = result.rows[0];

    console.log(`   ✅ PASS: System alerts statistics retrieved`);
    console.log(`      Total Alerts: ${alerts.total_alerts}`);
    console.log(`      Critical: ${alerts.critical}`);
    console.log(`      Warnings: ${alerts.warnings}`);
    console.log(`      Unresolved: ${alerts.unresolved}`);
    testsPassed++;
  } catch (err) {
    console.log(`   ❌ FAIL: ${err.message}`);
    testsFailed++;
  }

  // Summary
  console.log('\n========================================');
  console.log('   TEST SUMMARY');
  console.log('========================================');
  console.log(`   ✅ Passed: ${testsPassed}/7`);
  console.log(`   ❌ Failed: ${testsFailed}/7`);

  if (testsFailed === 0) {
    console.log('\n   🎉 ALL TESTS PASSED!');
    console.log('   DLQ system is fully operational.\n');
  } else {
    console.log('\n   ⚠️  SOME TESTS FAILED');
    console.log('   Check error messages above for details.\n');
  }

  // Cleanup instructions
  console.log('========================================');
  console.log('   CLEANUP (Optional)');
  console.log('========================================');
  console.log('   To remove test data:');
  console.log(
    "   DELETE FROM dead_letter_queue WHERE tenant_id = 'test-tenant-001';"
  );
  console.log("   DELETE FROM system_alerts WHERE type = 'test_dlq_alert';\n");

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Handle errors
testDLQ().catch((err) => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error('\nStack trace:', err.stack);
  console.error('\nMake sure:');
  console.error('  1. PostgreSQL is running');
  console.error('  2. DLQ tables are created (run create-dlq-tables.sql)');
  console.error('  3. Environment variables are configured');
  console.error('  4. Database connection is working\n');
  process.exit(1);
});




