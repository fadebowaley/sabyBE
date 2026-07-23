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


