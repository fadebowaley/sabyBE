# 🔄 Production Retry & Dead Letter Queue Implementation

**Complete Guide for Fail-Safe Job Processing**

---

## 🎯 IMPLEMENTATION OVERVIEW

### What We're Building:

1. ✅ Automatic retry with exponential backoff
2. ✅ Dead Letter Queue (DLQ) for permanent failures
3. ✅ Failed job recovery dashboard
4. ✅ Admin alerts for critical failures

---

## 🔧 STEP 1: Update Worker with Retry Logic

### File: `src/workers/submission.worker.js`

```javascript
const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const SubmissionModel = require('../models/submission.model');
const { logActivity } = require('../utils/activityLogger');
const permSubmissionService = require('../services/permSubmission.service');
const { saveToDLQ, sendAdminAlert } = require('../services/dlq.service');

const SUBMISSION_QUEUE_NAME = 'submissionQueue';

const createSubmissionWorker = () => {
  // Queue events monitoring
  const submissionQueueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });

  submissionQueueEvents.on('completed', ({ jobId }) => {
    logger.info(`✅ Submission job completed - ID: ${jobId}`);
  });

  submissionQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(
      `❌ Submission job failed - ID: ${jobId}, Reason: ${failedReason}`
    );
  });

  // Create worker with retry configuration
  const submissionWorker = new Worker(
    SUBMISSION_QUEUE_NAME,
    async (job) => {
      const startTime = Date.now();

      const {
        tenantId,
        projectId,
        project_name,
        project_category,
        formId,
        nodeId,
        userId,
        source,
        payload,
        meta,
        status,
        month,
        year,
        perm_enabled,
      } = job.data;

      const isPERMSubmission =
        perm_enabled || month || (payload && payload.month);

      const submissionPayload = {
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        source: source || 'unknown',
        data: payload,
        meta: meta || {},
        status: status || 'submitted',
        month: month || (payload && payload.month),
        year: year || (payload && payload.year) || new Date().getFullYear(),
        perm_enabled: isPERMSubmission,
      };

      logger.info(
        `[Worker] Processing ${
          isPERMSubmission ? 'PERM' : 'regular'
        } submission for project=${projectId} (Attempt ${
          job.attemptsMade + 1
        }/${job.opts.attempts})`
      );

      await logActivity({
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        action: 'processing',
        status: 'in progress',
        job_id: job.id,
        message: isPERMSubmission
          ? `Processing PERM submission for ${month}`
          : 'Processing submission',
      });

      try {
        let result;

        if (isPERMSubmission) {
          logger.info(
            '[Worker] Calling permSubmissionService.submitPERMData for PERM submission'
          );
          const permResult = await permSubmissionService.submitPERMData(
            submissionPayload
          );
          result = permResult.submission;
          logger.info(
            `[Worker] PERM submission ${permResult.action} - ${result.id} ` +
              `(${permResult.compliance.event_compliance_percentage}% compliance, ` +
              `${permResult.compliance.total_events_submitted}/${permResult.compliance.total_events_required} events, ` +
              `status: ${permResult.compliance.completeness_status})`
          );
        } else {
          result = await SubmissionModel.createSubmission(submissionPayload);
          logger.info(`[Worker] Regular submission ${result.id} saved`);
        }

        // Log success
        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'completed',
          status: 'success',
          job_id: job.id,
          message: isPERMSubmission
            ? `PERM submission completed (${
                result.event_compliance_percentage || 0
              }% compliance)`
            : 'Submission completed successfully',
        });

        const processingTime = Date.now() - startTime;
        logger.info(`[Worker] Processing completed in ${processingTime}ms`);

        return result;
      } catch (error) {
        const processingTime = Date.now() - startTime;
        logger.error(`[Worker] Submission failed:`, error.message);
        logger.error(`[Worker] Error stack:`, error.stack);

        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'failed',
          status: 'failed',
          job_id: job.id,
          message: `Submission failed: ${error.message}`,
        });

        // ✅ PRODUCTION: Throw error to trigger retry
        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,

      // ✅ PRODUCTION: Retry configuration
      settings: {
        attempts: 5, // Total attempts (1 initial + 4 retries)
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds
          // Delays: 5s, 10s, 20s, 40s
        },
      },

      // ✅ PRODUCTION: Job timeout
      lockDuration: 300000, // 5 minutes max per job
      lockRenewTime: 150000, // Renew every 2.5 minutes

      // ✅ PRODUCTION: Remove completed jobs to save memory
      removeOnComplete: {
        age: 24 * 3600, // Keep for 24 hours
        count: 1000, // Keep last 1000
      },

      // ✅ PRODUCTION: Keep failed jobs for analysis
      removeOnFail: false, // Never auto-delete failed jobs
    }
  );

  submissionWorker.on('completed', (job) => {
    logger.info(`✅ Submission worker completed job: ${job.id}`);
  });

  submissionWorker.on('failed', async (job, err) => {
    const attempts = job.attemptsMade;
    const maxAttempts = job.opts.attempts || 3;

    logger.error(`❌ Submission worker failed job: ${job.id}`, err.message);

    // ✅ PRODUCTION: Move to DLQ after all retries exhausted
    if (attempts >= maxAttempts) {
      logger.error(
        `🔴 Job ${job.id} permanently failed after ${attempts} attempts - Moving to DLQ`
      );

      try {
        await saveToDLQ({
          jobId: job.id,
          queueName: SUBMISSION_QUEUE_NAME,
          jobData: job.data,
          error: err.message,
          stack: err.stack,
          attempts,
          failedAt: new Date(),
          tenantId: job.data.tenantId,
          projectId: job.data.projectId,
          userId: job.data.userId,
        });

        // Send alert to admin
        await sendAdminAlert({
          level: 'CRITICAL',
          type: 'submission_permanent_failure',
          message: `Submission permanently failed: ${job.id}`,
          error: err.message,
          tenantId: job.data.tenantId,
          projectId: job.data.projectId,
        });
      } catch (dlqError) {
        logger.error(`❌ Failed to save to DLQ:`, dlqError.message);
      }
    }
  });

  submissionWorker.on('error', (err) => {
    logger.error(`❌ Submission worker error:`, err.message);
  });

  return submissionWorker;
};

module.exports = { createSubmissionWorker };
```

---

## 💾 STEP 2: Create Dead Letter Queue Service

### File: `src/services/dlq.service.js`

```javascript
/**
 * Dead Letter Queue (DLQ) Service
 *
 * Handles permanently failed jobs for analysis and recovery
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const emailService = require('./email.service');
const config = require('../config/config');
const { v4: uuidv4 } = require('uuid');

class DLQService {
  /**
   * Save failed job to DLQ
   */
  async saveToDLQ(failedJob) {
    const {
      jobId,
      queueName,
      jobData,
      error,
      stack,
      attempts,
      failedAt,
      tenantId,
      projectId,
      userId,
    } = failedJob;

    const id = uuidv4();

    try {
      const query = `
        INSERT INTO dead_letter_queue (
          id, job_id, queue_name, job_data,
          error_message, error_stack, attempts,
          failed_at, tenant_id, project_id, user_id,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
        )
        RETURNING *
      `;

      const values = [
        id,
        jobId,
        queueName,
        JSON.stringify(jobData),
        error,
        stack,
        attempts,
        failedAt,
        tenantId,
        projectId,
        userId,
      ];

      const result = await postgresPool.query(query, values);

      logger.info(`✅ Job ${jobId} saved to DLQ with ID: ${id}`);

      return result.rows[0];
    } catch (err) {
      logger.error(`❌ Failed to save to DLQ:`, err.message);
      throw err;
    }
  }

  /**
   * Get all failed jobs from DLQ
   */
  async getFailedJobs(filters = {}) {
    const { tenantId, queueName, recovered, limit = 50, offset = 0 } = filters;

    const where = [];
    const values = [];
    let idx = 1;

    if (tenantId) {
      where.push(`tenant_id = $${idx++}`);
      values.push(tenantId);
    }

    if (queueName) {
      where.push(`queue_name = $${idx++}`);
      values.push(queueName);
    }

    if (recovered !== undefined) {
      where.push(`recovered = $${idx++}`);
      values.push(recovered);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT * FROM dead_letter_queue
      ${whereClause}
      ORDER BY failed_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    values.push(limit, offset);

    try {
      const result = await postgresPool.query(query, values);
      return result.rows;
    } catch (err) {
      logger.error(`❌ Failed to get DLQ jobs:`, err.message);
      throw err;
    }
  }

  /**
   * Retry failed job from DLQ
   */
  async retryFromDLQ(dlqId, recoveredBy) {
    try {
      // Get job from DLQ
      const getQuery = `
        SELECT * FROM dead_letter_queue
        WHERE id = $1 AND recovered = FALSE
      `;
      const result = await postgresPool.query(getQuery, [dlqId]);

      if (result.rows.length === 0) {
        throw new Error('Job not found or already recovered');
      }

      const dlqJob = result.rows[0];
      const jobData = JSON.parse(dlqJob.job_data);

      // Re-queue the job
      const submissionQueue = require('../config/queue').submissionQueue;
      await submissionQueue.add('retry-from-dlq', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });

      // Mark as recovered in DLQ
      const updateQuery = `
        UPDATE dead_letter_queue
        SET recovered = TRUE,
            recovered_at = NOW(),
            recovered_by = $2,
            recovery_notes = 'Manually retried from DLQ'
        WHERE id = $1
        RETURNING *
      `;

      const updated = await postgresPool.query(updateQuery, [
        dlqId,
        recoveredBy,
      ]);

      logger.info(
        `✅ Job ${dlqJob.job_id} recovered from DLQ by ${recoveredBy}`
      );

      return updated.rows[0];
    } catch (err) {
      logger.error(`❌ Failed to retry from DLQ:`, err.message);
      throw err;
    }
  }

  /**
   * Send admin alert for critical failures
   */
  async sendAdminAlert(alert) {
    const { level, type, message, error, tenantId, projectId } = alert;

    try {
      // Log alert
      logger.error(`🚨 ADMIN ALERT [${level}]: ${message}`);

      // Send email to admin
      const adminEmail = config.alerts?.adminEmail || config.email?.from;

      if (adminEmail && emailService.sendEmail) {
        await emailService.sendEmail(
          adminEmail,
          `🚨 ${level} Alert: ${type}`,
          `
Alert Level: ${level}
Type: ${type}
Message: ${message}

Details:
- Tenant ID: ${tenantId}
- Project ID: ${projectId}
- Error: ${error}
- Timestamp: ${new Date().toISOString()}

Please investigate this issue immediately.

Environment: ${config.env}
Server: ${config.server?.host || 'unknown'}
          `
        );

        logger.info(`✅ Admin alert email sent for ${type}`);
      }

      // Store alert in database for tracking
      await postgresPool.query(
        `
        INSERT INTO system_alerts (
          id, level, type, message, error_message,
          tenant_id, project_id, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
        )
        `,
        [level, type, message, error, tenantId, projectId]
      );

      return true;
    } catch (err) {
      logger.error(`❌ Failed to send admin alert:`, err.message);
      return false;
    }
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats() {
    try {
      const query = `
        SELECT 
          queue_name,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE recovered = FALSE) as unrecovered,
          COUNT(*) FILTER (WHERE recovered = TRUE) as recovered,
          COUNT(*) FILTER (WHERE failed_at >= NOW() - INTERVAL '24 hours') as last_24h,
          COUNT(*) FILTER (WHERE failed_at >= NOW() - INTERVAL '7 days') as last_7d
        FROM dead_letter_queue
        GROUP BY queue_name
      `;

      const result = await postgresPool.query(query);
      return result.rows;
    } catch (err) {
      logger.error(`❌ Failed to get DLQ stats:`, err.message);
      throw err;
    }
  }
}

module.exports = new DLQService();
```

---

## 💾 STEP 3: Create Database Schema for DLQ

### File: `create-dlq-tables.sql`

```sql
-- =============================================================================
-- DEAD LETTER QUEUE (DLQ) TABLE
-- =============================================================================
-- Stores permanently failed jobs for analysis and recovery

CREATE TABLE IF NOT EXISTS dead_letter_queue (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Job information
    job_id VARCHAR(255) UNIQUE NOT NULL,
    queue_name VARCHAR(100) NOT NULL,
    job_data JSONB NOT NULL,

    -- Error information
    error_message TEXT,
    error_stack TEXT,
    attempts INTEGER DEFAULT 0,
    failed_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- For filtering/analysis
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    user_id VARCHAR(64),

    -- Recovery tracking
    recovered BOOLEAN DEFAULT FALSE,
    recovered_at TIMESTAMP WITH TIME ZONE,
    recovered_by VARCHAR(64),
    recovery_notes TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dlq_tenant_id ON dead_letter_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_queue_name ON dead_letter_queue(queue_name);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dead_letter_queue(failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_recovered ON dead_letter_queue(recovered);
CREATE INDEX IF NOT EXISTS idx_dlq_job_id ON dead_letter_queue(job_id);

-- =============================================================================
-- SYSTEM ALERTS TABLE
-- =============================================================================
-- Stores system alerts for monitoring and debugging

CREATE TABLE IF NOT EXISTS system_alerts (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Alert information
    level VARCHAR(20) NOT NULL, -- CRITICAL, WARNING, INFO
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    error_message TEXT,

    -- Context
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    user_id VARCHAR(64),

    -- Resolution tracking
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(64),
    resolution_notes TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_alerts_level ON system_alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON system_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON system_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_id ON system_alerts(tenant_id);

-- =============================================================================
-- IDEMPOTENCY CACHE TABLE (Optional - can use Redis instead)
-- =============================================================================
-- Prevents duplicate processing of same request

CREATE TABLE IF NOT EXISTS idempotency_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Idempotency key
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,

    -- Result
    job_id VARCHAR(255),
    result JSONB,

    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_cache(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant ON idempotency_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_cache(expires_at);

-- Auto-delete expired entries (PostgreSQL cron extension)
-- Or use a cleanup job in your application
```

---

## 🗄️ STEP 4: Create Database Tables

### Run SQL Script:

```javascript
// create-production-tables.js

const { postgresPool } = require('./src/config/postgres');
const fs = require('fs');
const logger = require('./src/config/logger');

async function createProductionTables() {
  console.log('\n🔧 Creating production tables...\n');

  try {
    const sql = fs.readFileSync('create-dlq-tables.sql', 'utf-8');

    await postgresPool.query(sql);

    console.log('✅ dead_letter_queue table created');
    console.log('✅ system_alerts table created');
    console.log('✅ idempotency_cache table created');

    // Verify tables exist
    const result = await postgresPool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('dead_letter_queue', 'system_alerts', 'idempotency_cache')
      ORDER BY table_name
    `);

    console.log('\n📊 Tables created:');
    result.rows.forEach((row) => console.log(`  ✅ ${row.table_name}`));

    console.log('\n🎉 Production tables setup complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to create tables:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createProductionTables();
```

---

## 📊 STEP 5: Create DLQ Management API

### File: `src/routes/v1/dlq.route.js`

```javascript
const express = require('express');
const { requireAccess } = require('../../middlewares/requireAccess');
const dlqController = require('../../controllers/dlq.controller');

const router = express.Router();

// Get all failed jobs (Admin only)
router.get(
  '/',
  requireAccess({ permissions: ['admin:system'], jwtOnly: true }),
  dlqController.getFailedJobs
);

// Get DLQ statistics (Admin only)
router.get(
  '/stats',
  requireAccess({ permissions: ['admin:system'], jwtOnly: true }),
  dlqController.getDLQStats
);

// Retry job from DLQ (Admin only)
router.post(
  '/:dlqId/retry',
  requireAccess({ permissions: ['admin:system'], jwtOnly: true }),
  dlqController.retryJob
);

// Mark job as resolved (Admin only)
router.patch(
  '/:dlqId/resolve',
  requireAccess({ permissions: ['admin:system'], jwtOnly: true }),
  dlqController.resolveJob
);

// Delete job from DLQ (Super Admin only)
router.delete(
  '/:dlqId',
  requireAccess({ permissions: ['superadmin:system'], jwtOnly: true }),
  dlqController.deleteJob
);

module.exports = router;
```

---

## 🧪 STEP 6: Test Retry Mechanism

### Create Test Script:

```javascript
// test-retry-mechanism.js

const axios = require('axios');

async function testRetry() {
  console.log('🧪 Testing Retry Mechanism...\n');

  const API_URL = 'http://localhost:4000/v1';

  // Login
  const auth = await axios.post(`${API_URL}/auth/login`, {
    email: 'saby@saby.ai',
    password: '@saby_Saby1',
  });

  const token = auth.data.tokens.access.token;

  // Submit with invalid data to trigger failure
  console.log('📤 Submitting invalid data (should retry and fail)...');

  try {
    await axios.post(
      `${API_URL}/submissions`,
      {
        tenantId: 'invalid',
        projectId: 'nonexistent',
        formId: 'fake',
        payload: {},
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  } catch (error) {
    console.log('✅ Submission rejected (expected)');
  }

  // Wait for retries
  console.log('\n⏳ Waiting 60 seconds for retry attempts...');
  await new Promise((resolve) => setTimeout(resolve, 60000));

  // Check DLQ
  console.log('\n📊 Checking Dead Letter Queue...');
  const dlq = await axios.get(`${API_URL}/dlq`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log(`Total failed jobs: ${dlq.data.results.length}`);
  console.log('✅ Retry mechanism test complete!');
}

testRetry();
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Retry Mechanism (2 hours)

- [ ] Update `submission.worker.js` with retry config
- [ ] Test retry with exponential backoff
- [ ] Verify failed jobs retry 5 times
- [ ] Monitor worker logs for retry attempts

### Phase 2: Dead Letter Queue (3 hours)

- [ ] Create database tables (run SQL script)
- [ ] Implement DLQ service
- [ ] Update worker to save to DLQ
- [ ] Test DLQ storage

### Phase 3: Admin Alerts (2 hours)

- [ ] Implement admin alert function
- [ ] Configure email for alerts
- [ ] Test alert sending
- [ ] Verify alerts arrive

### Phase 4: DLQ Management API (3 hours)

- [ ] Create DLQ routes
- [ ] Implement DLQ controller
- [ ] Add admin permissions
- [ ] Test retry from DLQ
- [ ] Build admin dashboard (optional)

---

## 🚀 QUICK START COMMANDS

```bash
# 1. Create production tables
cd /Users/fadebowaley/saby/sabyBackend
node create-production-tables.js

# 2. Update worker with retry logic
# (Apply code changes from Step 1)

# 3. Restart application
npm run dev

# 4. Test retry mechanism
node test-retry-mechanism.js

# 5. Check DLQ dashboard
curl http://localhost:4000/v1/dlq/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 SUCCESS METRICS

After implementation, you should see:

- ✅ Failed jobs automatically retry 5 times
- ✅ Exponential backoff between retries (5s, 10s, 20s, 40s)
- ✅ Permanently failed jobs saved to DLQ
- ✅ Admin alerts sent for critical failures
- ✅ DLQ dashboard shows failed jobs
- ✅ Failed jobs can be retried manually

---

**Status:** Ready to implement  
**Estimated Time:** 10 hours (1-2 days)  
**Priority:** CRITICAL for production
