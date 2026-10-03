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
  constructor() {
    this._tablesEnsured = false;
  }

  /**
   * Ensure DLQ and system alerts tables exist
   */
  async ensureTables() {
    if (this._tablesEnsured) return;
    try {
      await postgresPool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
      await postgresPool.query(`
        CREATE TABLE IF NOT EXISTS dead_letter_queue (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          job_id VARCHAR(255) UNIQUE NOT NULL,
          queue_name VARCHAR(100) NOT NULL,
          job_data JSONB NOT NULL,
          error_message TEXT,
          error_stack TEXT,
          attempts INTEGER DEFAULT 0,
          failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
          tenant_id VARCHAR(64),
          project_id VARCHAR(64),
          user_id VARCHAR(64),
          recovered BOOLEAN DEFAULT FALSE,
          recovered_at TIMESTAMP WITH TIME ZONE,
          recovered_by VARCHAR(64),
          recovery_notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_dlq_tenant_id ON dead_letter_queue(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_dlq_queue_name ON dead_letter_queue(queue_name);
        CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dead_letter_queue(failed_at);
        CREATE INDEX IF NOT EXISTS idx_dlq_recovered ON dead_letter_queue(recovered);
        CREATE INDEX IF NOT EXISTS idx_dlq_job_id ON dead_letter_queue(job_id);

        CREATE TABLE IF NOT EXISTS system_alerts (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          level VARCHAR(20) NOT NULL,
          type VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          error_message TEXT,
          tenant_id VARCHAR(64),
          project_id VARCHAR(64),
          user_id VARCHAR(64),
          resolved BOOLEAN DEFAULT FALSE,
          resolved_at TIMESTAMP WITH TIME ZONE,
          resolved_by VARCHAR(64),
          resolution_notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_level ON system_alerts(level);
        CREATE INDEX IF NOT EXISTS idx_alerts_type ON system_alerts(type);
        CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON system_alerts(resolved);
        CREATE INDEX IF NOT EXISTS idx_alerts_tenant_id ON system_alerts(tenant_id);
      `);
      this._tablesEnsured = true;
    } catch (err) {
      logger.warn(`[DLQ] Failed to ensure DLQ tables: ${err.message}`);
    }
  }

  /**
   * Save failed job to DLQ
   */
  async saveToDLQ(failedJob) {
    await this.ensureTables();
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
        ON CONFLICT (job_id) 
        DO UPDATE SET
          error_message = EXCLUDED.error_message,
          error_stack = EXCLUDED.error_stack,
          attempts = EXCLUDED.attempts,
          failed_at = EXCLUDED.failed_at
        RETURNING *
      `;

      const values = [
        id,
        jobId,
        queueName || 'submissionQueue',
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
    await this.ensureTables();
    const {
      tenantId,
      queueName,
      recovered,
      limit = 50,
      offset = 0,
    } = filters;

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
      return result; // Return full result object with rows property
    } catch (err) {
      logger.error(`❌ Failed to get DLQ jobs:`, err.message);
      throw err;
    }
  }

  /**
   * Retry failed job from DLQ
   */
  async retryFromDLQ(dlqId, recoveredBy) {
    await this.ensureTables();
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

      // Re-queue the job (requires submission service)
      const { queueSubmission } = require('./submission.service');
      const requeued = await queueSubmission(jobData);

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

      const updated = await postgresPool.query(updateQuery, [dlqId, recoveredBy]);
      
      logger.info(`✅ Job ${dlqJob.job_id} recovered from DLQ by ${recoveredBy}`);
      
      return {
        dlqRecord: updated.rows[0],
        requeuedJobId: requeued.jobId,
      };
    } catch (err) {
      logger.error(`❌ Failed to retry from DLQ:`, err.message);
      throw err;
    }
  }

  /**
   * Send admin alert for critical failures
   */
  async sendAdminAlert(alert) {
    await this.ensureTables();
    const { level, type, message, error, tenantId, projectId } = alert;

    try {
      // Log alert
      logger.error(`🚨 ADMIN ALERT [${level}]: ${message}`);

      // Store alert in database first
      const alertId = uuidv4();
      await postgresPool.query(
        `
        INSERT INTO system_alerts (
          id, level, type, message, error_message,
          tenant_id, project_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW()
        )
        `,
        [alertId, level, type, message, error || null, tenantId, projectId]
      );

      // Send email to admin (if configured)
      const adminEmail = config.alerts?.adminEmail || config.adminEmail || null;
      
      if (adminEmail && emailService.sendSabyEmail) {
        try {
          await emailService.sendSabyEmail({
            to: adminEmail,
            subject: `${level} alert: ${type}`,
            preheader: 'A Saby system alert requires attention.',
            layout: 'adminIncident',
            label: 'System alert',
            icon: 'SYS',
            headline: 'A system issue needs investigation.',
            body: [
              'Saby detected a system issue that requires administrator attention.',
              'Review the details below and investigate the affected workflow.',
              message,
            ],
            detailsRows: [
              ['Alert level', level],
              ['Type', type],
              ['Tenant ID', tenantId || 'N/A'],
              ['Project ID', projectId || 'N/A'],
              ['Error', error || 'N/A'],
              ['Timestamp', new Date().toISOString()],
              ['Alert ID', alertId],
              ['Environment', config.env],
            ],
            ctaLabel: 'View DLQ',
            ctaUrl: `${config.clientUrl || 'http://localhost:4000'}/admin/dlq`,
          });
          
          logger.info(`✅ Admin alert email sent for ${type}`);
        } catch (emailError) {
          logger.warn(`⚠️ Could not send alert email: ${emailError.message}`);
        }
      } else {
        logger.warn('⚠️ Admin email not configured, alert stored in database only');
      }

      return alertId;
    } catch (err) {
      logger.error(`❌ Failed to send admin alert:`, err.message);
      return null;
    }
  }

  /**
   * Get DLQ statistics
   */
  async getDLQStats() {
    await this.ensureTables();
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

  /**
   * Get system alerts
   */
  async getAlerts(filters = {}) {
    await this.ensureTables();
    const {
      level,
      resolved,
      limit = 50,
      offset = 0,
    } = filters;

    const where = [];
    const values = [];
    let idx = 1;

    if (level) {
      where.push(`level = $${idx++}`);
      values.push(level);
    }

    if (resolved !== undefined) {
      where.push(`resolved = $${idx++}`);
      values.push(resolved);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const query = `
      SELECT * FROM system_alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `;

    values.push(limit, offset);

    try {
      const result = await postgresPool.query(query, values);
      return result.rows;
    } catch (err) {
      logger.error(`❌ Failed to get alerts:`, err.message);
      throw err;
    }
  }
}

module.exports = new DLQService();


