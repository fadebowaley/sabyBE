# 🧪 Test Data Management Strategy

**Date:** November 4, 2025  
**Purpose:** Handle test submissions with easy cleanup  
**Use Case:** Submit 200+ test records, then delete safely

---

## 🎯 THE CHALLENGE

**Scenario:**

- Run submission simulator (200+ test submissions)
- Test performance, compliance, dashboards
- Clean up ALL test data afterward
- Don't delete production data

**Requirements:**

1. Mark test submissions clearly
2. Easy identification
3. Safe deletion (only test data)
4. Reusable strategy

---

## ✅ SOLUTION 1: Use Test Tenant ID (RECOMMENDED)

### Strategy: Dedicated Test Tenant

**Concept:** All test data uses a special tenant ID

```javascript
// Test submissions use:
const TEST_TENANT_ID = 'test-tenant-simulator';

// Production submissions use:
const PROD_TENANT_ID = 'real-tenant-abc123';
```

**Benefits:**

- ✅ Complete isolation (test vs production)
- ✅ Easy to identify
- ✅ Safe to delete (can't accidentally delete production)
- ✅ Multi-tenant compliance maintained

**Cleanup:**

```sql
-- Delete ALL test data with one command
DELETE FROM form_submissions WHERE tenant_id = 'test-tenant-simulator';
DELETE FROM submission_activity_log WHERE tenant_id = 'test-tenant-simulator';
DELETE FROM event_calendar WHERE tenant_id = 'test-tenant-simulator';
DELETE FROM dead_letter_queue WHERE tenant_id = 'test-tenant-simulator';
DELETE FROM system_alerts WHERE tenant_id = 'test-tenant-simulator';

-- Safe: Won't touch production data!
```

---

## ✅ SOLUTION 2: Use Metadata Flags

### Strategy: Add `is_test` flag to submissions

**Implementation:**

**A. Add to Submission Payload**

```javascript
// When submitting test data:
const testSubmission = {
  tenantId: 'your-tenant-id',
  projectId: 'your-project-id',
  formId: 'your-form-id',
  payload: { ...formData },
  meta: {
    is_test: true, // ← Mark as test
    test_batch_id: 'sim-001', // ← Batch identifier
    test_date: new Date(), // ← When created
    test_description: 'Performance test - 200 submissions',
  },
};
```

**B. Query Test Submissions**

```sql
-- Find all test submissions
SELECT * FROM form_submissions
WHERE meta->>'is_test' = 'true';

-- Find specific test batch
SELECT * FROM form_submissions
WHERE meta->>'test_batch_id' = 'sim-001';

-- Count test vs production
SELECT
  meta->>'is_test' as is_test,
  COUNT(*) as count
FROM form_submissions
GROUP BY meta->>'is_test';
```

**C. Delete Test Submissions**

```sql
-- Delete specific test batch
DELETE FROM form_submissions
WHERE meta->>'test_batch_id' = 'sim-001';

-- Delete all test submissions
DELETE FROM form_submissions
WHERE meta->>'is_test' = 'true';

-- Delete test activity logs
DELETE FROM submission_activity_log
WHERE meta->>'is_test' = 'true';
```

**Benefits:**

- ✅ Can use real tenant IDs for realistic testing
- ✅ Flexible filtering (by batch, date, type)
- ✅ Metadata preserved for analysis
- ⚠️ Requires JSONB query (slightly slower)

---

## ✅ SOLUTION 3: Use Source Field

### Strategy: Mark source as 'test-simulator'

**Implementation:**

```javascript
// Test submissions:
{
  source: 'test-simulator',  // Instead of 'web', 'api', etc.
  // or
  source: 'test-performance',
  source: 'test-load-200',
}

// Production submissions:
{
  source: 'web',
  source: 'api',
  source: 'whatsapp',
}
```

**Cleanup:**

```sql
-- Delete all test simulator submissions
DELETE FROM form_submissions
WHERE source LIKE 'test-%';

-- Delete specific test type
DELETE FROM form_submissions
WHERE source = 'test-simulator';

-- Activity logs
DELETE FROM submission_activity_log
WHERE source LIKE 'test-%';
```

**Benefits:**

- ✅ Simple indexed column (fast queries)
- ✅ Easy to identify
- ✅ Works with existing field

---

## 🎯 RECOMMENDED: HYBRID APPROACH

### Best Practice: Combine Multiple Markers

```javascript
const createTestSubmission = (formData, batchId) => {
  return {
    // Use test tenant (isolation)
    tenantId: 'test-tenant-simulator',

    // Mark source
    source: 'test-simulator',

    // Add metadata
    meta: {
      is_test: true,
      test_batch_id: batchId,
      test_timestamp: new Date(),
      test_type: 'performance',
      test_count: 200,
    },

    // Real data
    projectId: formData.projectId,
    formId: formData.formId,
    payload: formData.payload,
  };
};
```

**Why multiple markers?**

- **Tenant ID:** Primary isolation
- **Source:** Quick filter
- **Metadata:** Detailed tracking

**Cleanup is super safe:**

```sql
-- Triple check before deletion
DELETE FROM form_submissions
WHERE tenant_id = 'test-tenant-simulator'
  AND source LIKE 'test-%'
  AND meta->>'is_test' = 'true';

-- Literally impossible to delete production data!
```

---

## 🤖 TEST SUBMISSION SIMULATOR

### Script: 200 Submissions Simulator

**File:** `test-submission-simulator.js`

```javascript
/**
 * Submission Simulator
 *
 * Purpose: Generate 200+ test submissions for performance/compliance testing
 * Features:
 * - Batch tracking
 * - Easy cleanup
 * - Realistic data
 * - Progress monitoring
 */

const { queueSubmission } = require('./src/services/submission.service');
const { postgresPool } = require('./src/config/postgres');
const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const config = require('./src/config/config');

// ============================================================================
// CONFIGURATION
// ============================================================================

const SIMULATION_CONFIG = {
  // Number of submissions to create
  totalSubmissions: 200,

  // Test identifier (for cleanup)
  testBatchId: 'sim-' + Date.now(),
  testTenantId: 'test-tenant-simulator',

  // Use existing project or create new one
  projectId: null, // Set to use existing, null to create new

  // Delay between submissions (ms)
  delayBetweenSubmissions: 50, // 50ms = 20 submissions/second

  // Test type
  testType: 'performance', // 'performance', 'load', 'stress', 'compliance'
};

// ============================================================================

async function runSimulation() {
  console.log('\n🤖 ========================================');
  console.log('   SUBMISSION SIMULATOR');
  console.log('========================================\n');

  console.log('📋 Configuration:');
  console.log('   Total submissions:', SIMULATION_CONFIG.totalSubmissions);
  console.log('   Batch ID:', SIMULATION_CONFIG.testBatchId);
  console.log('   Tenant ID:', SIMULATION_CONFIG.testTenantId);
  console.log('   Test type:', SIMULATION_CONFIG.testType);
  console.log('   Delay:', SIMULATION_CONFIG.delayBetweenSubmissions + 'ms\n');

  let projectId = SIMULATION_CONFIG.projectId;
  let formId = null;
  let form = null;

  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ MongoDB connected\n');

    // Get or create form
    if (!projectId) {
      console.log('📝 Creating test form...');

      const testForm = {
        configuration: {
          projectName: 'Test Simulator Form - ' + SIMULATION_CONFIG.testBatchId,
          projectCategory: 'Testing',
          security: 'private',
        },
        elements: [
          {
            id: 'user_name',
            type: 'text',
            properties: { label: 'Name', required: true },
          },
          {
            id: 'user_email',
            type: 'email',
            properties: { label: 'Email', required: true },
          },
          {
            id: 'rating',
            type: 'number',
            properties: { label: 'Rating', required: false },
          },
          {
            id: 'comment',
            type: 'textarea',
            properties: { label: 'Comment', required: false },
          },
        ],
        metadata: { deploymentStatus: 'published' },
        status: 'active',
      };

      form = await ProjectForm.createProjectForm(
        testForm,
        SIMULATION_CONFIG.testTenantId,
        new mongoose.Types.ObjectId()
      );

      projectId = form.projectId;
      formId = form._id.toString();

      console.log('✅ Test form created');
      console.log('   Project ID:', projectId);
      console.log('   Form ID:', formId + '\n');
    } else {
      console.log('📝 Using existing project:', projectId);
      form = await ProjectForm.findOne({ projectId });
      if (!form) {
        throw new Error('Project not found: ' + projectId);
      }
      formId = form._id.toString();
      console.log('✅ Form found\n');
    }

    // Generate test data
    console.log('🎲 Generating test data...\n');

    const submissions = [];
    const startTime = Date.now();

    for (let i = 1; i <= SIMULATION_CONFIG.totalSubmissions; i++) {
      const submission = {
        tenantId: SIMULATION_CONFIG.testTenantId,
        projectId: projectId,
        formId: formId,
        userId: `test-user-${i % 10}`, // 10 different users
        source: 'test-simulator',
        payload: {
          user_name: `Test User ${i}`,
          user_email: `testuser${i}@simulator.test`,
          rating: Math.floor(Math.random() * 5) + 1, // 1-5
          comment: `Test submission #${i} from simulator batch ${SIMULATION_CONFIG.testBatchId}`,
          submission_number: i,
        },
        meta: {
          is_test: true,
          test_batch_id: SIMULATION_CONFIG.testBatchId,
          test_number: i,
          test_type: SIMULATION_CONFIG.testType,
          test_timestamp: new Date(),
        },
      };

      submissions.push(submission);
    }

    console.log(`✅ Generated ${submissions.length} test submissions\n`);

    // Submit all to queue
    console.log('📤 Submitting to queue...\n');

    const results = [];
    let queued = 0;
    let failed = 0;

    for (const submission of submissions) {
      try {
        const result = await queueSubmission(submission);
        results.push(result);
        queued++;

        // Progress updates
        if (queued % 50 === 0) {
          console.log(
            `   ✓ Queued ${queued}/${submissions.length} submissions`
          );
        }

        // Delay to avoid overwhelming queue
        if (SIMULATION_CONFIG.delayBetweenSubmissions > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, SIMULATION_CONFIG.delayBetweenSubmissions)
          );
        }
      } catch (error) {
        failed++;
        console.error(
          `   ✗ Failed to queue submission ${queued + failed}:`,
          error.message
        );
      }
    }

    const duration = (Date.now() - startTime) / 1000;

    console.log('\n✅ Submission complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('   Queued:', queued);
    console.log('   Failed:', failed);
    console.log('   Duration:', duration.toFixed(2) + 's');
    console.log(
      '   Rate:',
      (queued / duration).toFixed(2) + ' submissions/sec'
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Monitor processing
    console.log('📊 Monitoring worker processing...');
    console.log('   (Checking every 5 seconds for 60 seconds)\n');

    let monitoring = true;
    let monitorAttempts = 0;
    const maxMonitorAttempts = 12; // 60 seconds

    while (monitoring && monitorAttempts < maxMonitorAttempts) {
      monitorAttempts++;
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const stats = await postgresPool.query(
        `
        SELECT 
          COUNT(*) FILTER (WHERE meta->>'test_batch_id' = $1) as total,
          COUNT(*) FILTER (WHERE meta->>'test_batch_id' = $1 AND status = 'completed') as completed,
          COUNT(*) FILTER (WHERE meta->>'test_batch_id' = $1 AND status = 'failed') as failed
        FROM form_submissions
        WHERE tenant_id = $2
      `,
        [SIMULATION_CONFIG.testBatchId, SIMULATION_CONFIG.testTenantId]
      );

      const s = stats.rows[0];
      const progress = ((s.completed / queued) * 100).toFixed(1);

      console.log(
        `   [${monitorAttempts}/${maxMonitorAttempts}] Completed: ${s.completed}/${queued} (${progress}%) | Failed: ${s.failed}`
      );

      if (s.completed >= queued * 0.95) {
        // 95% complete
        monitoring = false;
        console.log('\n   ✅ Most submissions processed!\n');
      }
    }

    // Final statistics
    console.log('📊 Final Statistics:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const finalStats = await postgresPool.query(
      `
      SELECT 
        COUNT(*) as total_in_db,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        MIN(created_at) as first_submission,
        MAX(created_at) as last_submission
      FROM form_submissions
      WHERE tenant_id = $1
        AND meta->>'test_batch_id' = $2
    `,
      [SIMULATION_CONFIG.testTenantId, SIMULATION_CONFIG.testBatchId]
    );

    const final = finalStats.rows[0];
    console.log('   Total in DB:', final.total_in_db);
    console.log('   Completed:', final.completed);
    console.log('   Failed:', final.failed);
    console.log('   Pending:', final.pending);
    console.log(
      '   Duration:',
      (
        (new Date(final.last_submission) - new Date(final.first_submission)) /
        1000
      ).toFixed(2) + 's'
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Cleanup instructions
    console.log('🧹 CLEANUP COMMANDS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nTo delete this test data:\n');
    console.log('METHOD 1: By Batch ID (Safest)');
    console.log(
      `DELETE FROM form_submissions WHERE meta->>'test_batch_id' = '${SIMULATION_CONFIG.testBatchId}';`
    );
    console.log(
      `DELETE FROM submission_activity_log WHERE meta->>'test_batch_id' = '${SIMULATION_CONFIG.testBatchId}';\n`
    );

    console.log('METHOD 2: By Tenant ID (All test data)');
    console.log(
      `DELETE FROM form_submissions WHERE tenant_id = '${SIMULATION_CONFIG.testTenantId}';`
    );
    console.log(
      `DELETE FROM submission_activity_log WHERE tenant_id = '${SIMULATION_CONFIG.testTenantId}';`
    );
    console.log(
      `DELETE FROM event_calendar WHERE tenant_id = '${SIMULATION_CONFIG.testTenantId}';`
    );
    console.log(
      `DELETE FROM dead_letter_queue WHERE tenant_id = '${SIMULATION_CONFIG.testTenantId}';\n`
    );

    console.log('METHOD 3: By Source');
    console.log(
      "DELETE FROM form_submissions WHERE source = 'test-simulator';\n"
    );

    if (!SIMULATION_CONFIG.projectId) {
      console.log('MongoDB (delete test form):');
      console.log(
        `await ProjectForm.findOneAndDelete({ projectId: '${projectId}' });\n`
      );
    }

    console.log('🎉 Simulation complete!\n');
  } catch (error) {
    console.error('\n❌ Simulation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed\n');
    process.exit(0);
  }
}

// Run simulation
runSimulation();
```

---

## 🧹 CLEANUP SCRIPTS

### Script 1: Clean by Batch ID

```javascript
// cleanup-test-batch.js
const { postgresPool } = require('./src/config/postgres');

async function cleanupBatch(batchId) {
  console.log(`🧹 Cleaning up test batch: ${batchId}\n`);

  // Count before
  const before = await postgresPool.query(
    "SELECT COUNT(*) FROM form_submissions WHERE meta->>'test_batch_id' = $1",
    [batchId]
  );
  console.log('Submissions to delete:', before.rows[0].count);

  if (before.rows[0].count === 0) {
    console.log('✅ No submissions found with this batch ID');
    return;
  }

  // Confirm (in production, add user prompt)
  console.log('Deleting in 3 seconds... (Ctrl+C to cancel)');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Delete
  await postgresPool.query(
    "DELETE FROM form_submissions WHERE meta->>'test_batch_id' = $1",
    [batchId]
  );

  await postgresPool.query(
    "DELETE FROM submission_activity_log WHERE meta->>'test_batch_id' = $1",
    [batchId]
  );

  console.log('✅ Cleanup complete!\n');
  process.exit(0);
}

// Usage: node cleanup-test-batch.js sim-123456
const batchId = process.argv[2];
if (!batchId) {
  console.error('Usage: node cleanup-test-batch.js <batch-id>');
  process.exit(1);
}

cleanupBatch(batchId);
```

---

### Script 2: Clean All Test Data

```sql
-- cleanup-all-test-data.sql

BEGIN;

-- Show what will be deleted
SELECT 'form_submissions' as table_name, COUNT(*) as test_records
FROM form_submissions
WHERE tenant_id LIKE 'test-%' OR source LIKE 'test-%' OR meta->>'is_test' = 'true'
UNION ALL
SELECT 'submission_activity_log', COUNT(*)
FROM submission_activity_log
WHERE tenant_id LIKE 'test-%' OR source LIKE 'test-%' OR meta->>'is_test' = 'true'
UNION ALL
SELECT 'event_calendar', COUNT(*)
FROM event_calendar
WHERE tenant_id LIKE 'test-%'
UNION ALL
SELECT 'dead_letter_queue', COUNT(*)
FROM dead_letter_queue
WHERE tenant_id LIKE 'test-%';

-- Uncomment to execute (after reviewing above)
-- DELETE FROM form_submissions
-- WHERE tenant_id LIKE 'test-%' OR source LIKE 'test-%' OR meta->>'is_test' = 'true';

-- DELETE FROM submission_activity_log
-- WHERE tenant_id LIKE 'test-%' OR source LIKE 'test-%' OR meta->>'is_test' = 'true';

-- DELETE FROM event_calendar WHERE tenant_id LIKE 'test-%';
-- DELETE FROM dead_letter_queue WHERE tenant_id LIKE 'test-%';
-- DELETE FROM system_alerts WHERE tenant_id LIKE 'test-%';

-- COMMIT;

ROLLBACK;  -- Change to COMMIT when ready
```

---

## 📊 MONITORING TEST DATA

### Check Test Data Volume

```sql
-- How much test data do we have?
SELECT
  'Total Submissions' as metric,
  COUNT(*) as count
FROM form_submissions
WHERE tenant_id LIKE 'test-%' OR source LIKE 'test-%'

UNION ALL

SELECT
  'By Tenant (test-tenant-simulator)',
  COUNT(*)
FROM form_submissions
WHERE tenant_id = 'test-tenant-simulator'

UNION ALL

SELECT
  'By Source (test-simulator)',
  COUNT(*)
FROM form_submissions
WHERE source = 'test-simulator'

UNION ALL

SELECT
  'By Metadata (is_test=true)',
  COUNT(*)
FROM form_submissions
WHERE meta->>'is_test' = 'true';
```

### List All Test Batches

```sql
-- See all test batches
SELECT
  meta->>'test_batch_id' as batch_id,
  meta->>'test_type' as test_type,
  COUNT(*) as submissions,
  MIN(created_at) as started,
  MAX(created_at) as ended
FROM form_submissions
WHERE meta->>'is_test' = 'true'
GROUP BY meta->>'test_batch_id', meta->>'test_type'
ORDER BY started DESC;
```

---

## 🎯 BEST PRACTICES

### 1. Always Use Test Tenant ID

```javascript
✅ GOOD: tenantId: 'test-tenant-simulator'
❌ BAD:  tenantId: 'real-tenant-production'
```

### 2. Add Multiple Markers

```javascript
✅ GOOD:
{
  tenantId: 'test-tenant-simulator',  // Isolation
  source: 'test-simulator',           // Quick filter
  meta: {
    is_test: true,                    // Boolean flag
    test_batch_id: 'sim-123',         // Batch tracking
  }
}
```

### 3. Use Unique Batch IDs

```javascript
✅ GOOD: test_batch_id: 'sim-' + Date.now()  // Unique per run
❌ BAD:  test_batch_id: 'test-1'             // Reused
```

### 4. Document Test Data

```javascript
meta: {
  is_test: true,
  test_batch_id: 'sim-123',
  test_description: 'Performance test - 200 submissions',
  test_date: new Date(),
  test_author: 'dev-team',
  test_purpose: 'Load testing before production release'
}
```

### 5. Cleanup Promptly

```bash
# Don't let test data accumulate
# Clean up after testing
docker exec saby-postgres-local psql -U halograph_user -d halograph \
  -c "DELETE FROM form_submissions WHERE tenant_id = 'test-tenant-simulator';"
```

---

## 🚀 QUICK START EXAMPLES

### Example 1: 200 Submissions Performance Test

```javascript
// Quick simulator (inline)
const runQuickTest = async () => {
  const batchId = 'perf-' + Date.now();

  for (let i = 1; i <= 200; i++) {
    await queueSubmission({
      tenantId: 'test-tenant-simulator',
      projectId: 'YOUR_PROJECT_ID',
      formId: 'YOUR_FORM_ID',
      source: 'test-simulator',
      payload: { name: `Test ${i}`, email: `test${i}@test.com` },
      meta: { is_test: true, test_batch_id: batchId },
    });

    if (i % 50 === 0) console.log(`Queued ${i}/200`);
    await new Promise((r) => setTimeout(r, 50)); // 50ms delay
  }

  console.log('✅ 200 submissions queued!');
  console.log(
    `Cleanup: DELETE FROM form_submissions WHERE meta->>'test_batch_id' = '${batchId}';`
  );
};
```

### Example 2: PERM Compliance Test (14 events)

```javascript
const runPERMTest = async () => {
  const batchId = 'perm-' + Date.now();

  for (let i = 1; i <= 14; i++) {
    await queueSubmission({
      tenantId: 'test-tenant-simulator',
      projectId: 'YOUR_PERM_PROJECT',
      formId: 'YOUR_FORM_ID',
      nodeId: 'test-node-001',
      month: '2025-10-01',
      year: 2025,
      perm_enabled: true,
      source: 'test-simulator',
      payload: { event_name: `Event ${i}`, attendance: 50 + i },
      meta: { is_test: true, test_batch_id: batchId, perm_test: true },
    });
  }

  console.log('✅ 14 PERM events queued for October 2025!');
};
```

---

## 📋 SAFETY CHECKLIST

Before running simulator:

- [ ] ✅ Using test tenant ID (not production)
- [ ] ✅ Source marked as 'test-simulator'
- [ ] ✅ Metadata includes is_test: true
- [ ] ✅ Unique batch ID generated
- [ ] ✅ Workers are running
- [ ] ✅ Know how to clean up afterward

Before cleanup:

- [ ] ✅ Verified batch ID is correct
- [ ] ✅ Reviewed what will be deleted (SELECT first)
- [ ] ✅ Confirmed it's test data only
- [ ] ✅ Have backup if unsure
- [ ] ✅ Using WHERE clause (not DELETE without WHERE!)

---

## 🎉 SUMMARY

**You asked:** How to handle 200 test submissions with easy cleanup?

**Answer:** Three strategies:

1. **Test Tenant ID** (Recommended)

   - Use: `test-tenant-simulator`
   - Cleanup: `DELETE WHERE tenant_id = 'test-tenant-simulator'`

2. **Metadata Flags**

   - Add: `meta: { is_test: true, test_batch_id: 'sim-123' }`
   - Cleanup: `DELETE WHERE meta->>'test_batch_id' = 'sim-123'`

3. **Source Field**
   - Use: `source: 'test-simulator'`
   - Cleanup: `DELETE WHERE source = 'test-simulator'`

**Best:** Combine all three for maximum safety!

**Scripts provided:**

- `test-submission-simulator.js` - Generate 200+ test submissions
- `cleanup-test-batch.js` - Clean by batch ID
- `cleanup-all-test-data.sql` - Clean all test data

---

**Created:** November 4, 2025  
**Status:** Ready to use  
**Safety:** Multiple markers prevent accidental production deletion
