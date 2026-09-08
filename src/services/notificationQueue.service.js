const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const simpleNotificationService = require('./simpleNotification.service');
const logger = require('../config/logger');
const { JOB_POLICY } = require('../queues/queueDefaults');

const NOTIFICATION_QUEUE_NAME = 'notificationQueue';

class NotificationQueueService {
  constructor() {
    this.queue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: JOB_POLICY.notification,
    });
  }

  /**
   * Queue a submission confirmation notification
   * @param {Object} submission - The submission data from database
   * @param {string} userId - The user ID who submitted
   * @param {string} projectId - The project ID
   * @param {Object} userData - User data (email, firstname, name)
   * @param {Object} projectData - Project data (projectName)
   * @returns {Promise<Object>} Job queuing result
   */
  async queueSubmissionConfirmation(
    submission,
    userId,
    projectId,
    userData,
    projectData
  ) {
    try {
      const job = await this.queue.add('submission_confirmation', {
        type: 'submission_confirmation',
        submission,
        userId,
        projectId,
        userData,
        projectData,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `📧 Queued submission confirmation notification - Job ID: ${job.id}`
      );

      return {
        success: true,
        jobId: job.id,
        message: 'Notification queued successfully',
      };
    } catch (error) {
      logger.error(
        `❌ Failed to queue submission confirmation:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Queue a processing status notification
   * @param {Object} submission - The submission data
   * @param {string} userId - The user ID
   * @param {string} projectId - The project ID
   * @param {string} status - Processing status (completed, failed, processing)
   * @returns {Promise<Object>} Job queuing result
   */
  async queueProcessingNotification(
    submission,
    userId,
    projectId,
    status = 'completed'
  ) {
    try {
      const job = await this.queue.add('processing_notification', {
        type: 'processing_notification',
        submission,
        userId,
        projectId,
        status,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `📧 Queued processing notification (${status}) - Job ID: ${job.id}`
      );

      return {
        success: true,
        jobId: job.id,
        message: 'Processing notification queued successfully',
      };
    } catch (error) {
      logger.error(
        `❌ Failed to queue processing notification:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Queue a validation failure notification
   * @param {Object} validationData - Validation failure data
   * @param {Object} userData - User data (email, firstname, lastname)
   * @param {Object} projectData - Project data (projectName)
   * @returns {Promise<Object>} Job queuing result
   */
  async queueValidationFailureNotification(
    validationData,
    userData,
    projectData
  ) {
    try {
      const job = await this.queue.add('validation_failure', {
        type: 'validation_failure',
        validationData,
        userData,
        projectData,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `📧 Queued validation failure notification - Job ID: ${job.id}`
      );

      return {
        success: true,
        jobId: job.id,
        message: 'Validation failure notification queued successfully',
      };
    } catch (error) {
      logger.error(
        `❌ Failed to queue validation failure notification:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Queue an anomaly alert notification for admin/ops recipients.
   *
   * Called by dataIntelligence.worker when detectAnomalies() returns anomalies
   * with severity >= 'high'. Each anomaly becomes one queued job so retries
   * are per-anomaly and don't block each other.
   *
   * @param {Object} opts
   * @param {string} opts.tenantId
   * @param {Object} opts.anomaly   — the anomaly record from anomalyDetection.service
   * @param {string} opts.projectId
   * @param {string} opts.projectName
   * @param {string} opts.monthLabel
   * @returns {Promise<Object>}
   */
  async queueAnomalyAlert({
    tenantId,
    anomaly,
    projectId,
    projectName,
    monthLabel,
  }) {
    try {
      const job = await this.queue.add('anomaly_alert', {
        type: 'anomaly_alert',
        tenantId,
        anomaly,
        projectId,
        projectName,
        monthLabel,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `🚨 Queued anomaly alert - severity=${anomaly?.severity} job=${job.id}`
      );
      return { success: true, jobId: job.id };
    } catch (error) {
      logger.error('❌ Failed to queue anomaly alert:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Queue a custom notification
   * @param {Object} notificationData - Custom notification data
   * @returns {Promise<Object>} Job queuing result
   */
  async queueCustomNotification(notificationData) {
    try {
      const job = await this.queue.add('custom_notification', {
        type: 'custom_notification',
        ...notificationData,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📧 Queued custom notification - Job ID: ${job.id}`);

      return {
        success: true,
        jobId: job.id,
        message: 'Custom notification queued successfully',
      };
    } catch (error) {
      logger.error(`❌ Failed to queue custom notification:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async queueReminder({ reminderTriggerId, scheduledAt }) {
    const job = await this.queue.add(
      'work_item_reminder',
      {
        type: 'work_item_reminder',
        reminderTriggerId,
        timestamp: new Date().toISOString(),
      },
      {
        jobId: `reminder:${reminderTriggerId}:${new Date(
          scheduledAt
        ).getTime()}`,
      }
    );
    return { success: true, jobId: job.id };
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getQueueStats() {
    try {
      const waiting = await this.queue.getWaiting();
      const active = await this.queue.getActive();
      const completed = await this.queue.getCompleted();
      const failed = await this.queue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total:
          waiting.length + active.length + completed.length + failed.length,
      };
    } catch (error) {
      logger.error(`❌ Failed to get queue stats:`, error.message);
      return null;
    }
  }

  /**
   * Process notification jobs (called by notification worker)
   * @param {Object} job - The job to process
   * @returns {Promise<Object>} Processing result
   */
  async processNotificationJob(job) {
    const {
      type,
      submission,
      userId,
      projectId,
      status,
      userData,
      projectData,
      validationData,
    } = job.data;

    try {
      logger.info(
        `📧 Processing notification job: ${type} for user ${
          userData ? userData.email : userId
        }`
      );

      let notificationResult;

      switch (type) {
        case 'submission_confirmation':
          notificationResult =
            await simpleNotificationService.sendSubmissionConfirmation(
              submission,
              userData,
              projectData
            );
          break;

        case 'validation_failure':
          notificationResult =
            await simpleNotificationService.sendValidationFailureNotification(
              validationData,
              userData,
              projectData
            );
          break;

        case 'processing_notification':
          notificationResult =
            await simpleNotificationService.sendProcessingNotification(
              submission,
              userData,
              projectData,
              status
            );
          break;

        case 'anomaly_alert':
          notificationResult = await this.handleAnomalyAlert(job.data);
          break;

        case 'custom_notification':
          // Handle custom notifications
          notificationResult = await this.handleCustomNotification(
            job.data,
            userData,
            projectData
          );
          break;

        case 'work_item_reminder':
          notificationResult =
            await require('./reminderTrigger.service').deliverReminder(
              job.data.reminderTriggerId
            );
          break;

        default:
          throw new Error(`Unknown notification type: ${type}`);
      }

      if (notificationResult.success) {
        logger.info(
          `✅ Notification sent successfully: ${type} to ${
            userData ? userData.email : userId
          }`
        );
      } else {
        logger.warn(
          `⚠️ Notification failed: ${type} to ${
            userData ? userData.email : userId
          } - ${notificationResult.error}`
        );
      }

      return notificationResult;
    } catch (error) {
      logger.error(`❌ Error processing notification job:`, error.message);
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Handle anomaly alert notifications.
   * Sends an in-app/email alert to tenant admins about a high/critical anomaly.
   *
   * @param {Object} jobData - Job payload from queueAnomalyAlert
   * @returns {Promise<Object>}
   */
  async handleAnomalyAlert(jobData) {
    const { tenantId, anomaly, projectName, monthLabel } = jobData;
    const metricKey =
      anomaly?.metricKey || anomaly?.metric_key || 'unknown metric';
    const severity = (anomaly?.severity || 'high').toUpperCase();
    const deviation =
      anomaly?.deviation != null
        ? `${Number(anomaly.deviation).toFixed(1)}%`
        : 'significant';

    const subject = `[${severity}] Anomaly detected: ${metricKey} - ${
      projectName || 'project'
    }`;
    const message =
      `A ${severity} anomaly was detected in "${
        projectName || 'your project'
      }" ` +
      `for ${monthLabel || 'the current period'}.\n\n` +
      `Metric: ${metricKey}\n` +
      `Deviation: ${deviation} from baseline\n\n` +
      `Log in to Saby to investigate and resolve this alert.`;

    try {
      // Attempt to notify tenant admins by looking up admin emails.
      // Falls back gracefully if the user service is unavailable.
      const { postgresPool } = require('../config/postgres');
      const { rows: admins } = await postgresPool.query(
        `SELECT u.email FROM users u
         JOIN roles r ON r.id = ANY(u.role_ids)
         WHERE u.tenant_id = $1
           AND r.name ILIKE '%admin%'
           AND u.is_active = true
         LIMIT 10`,
        [tenantId]
      );

      const { sendSabyEmail } = require('./email.service');
      const results = await Promise.allSettled(
        admins.map((a) =>
          sendSabyEmail({
            to: a.email,
            subject,
            preheader: `Saby detected an unusual movement in ${
              projectName || 'your project'
            }.`,
            layout: 'operationalAlert',
            label: 'Anomaly alert',
            icon: 'ALT',
            headline: 'Saby detected an anomaly.',
            body: [
              `Saby detected a ${severity} anomaly in "${
                projectName || 'your project'
              }" for ${monthLabel || 'the current period'}.`,
              'This metric moved outside the expected baseline. Please investigate the source and resolve any operational issue.',
            ],
            detailsRows: [
              ['Metric', metricKey],
              ['Severity', severity],
              ['Deviation', `${deviation} from baseline`],
              ['Tenant', tenantId],
            ],
            ctaLabel: 'Investigate alert',
          })
        )
      );

      const sent = results.filter((r) => r.status === 'fulfilled').length;
      logger.info(`[AnomalyAlert] Sent to ${sent}/${admins.length} admins`, {
        tenantId,
        severity,
        metricKey,
      });

      return { success: true, type: 'anomaly_alert', tenantId, sent };
    } catch (err) {
      logger.error('[AnomalyAlert] Delivery failed (non-fatal):', err.message);
      // Return success=false but don't rethrow — anomaly detection should not
      // be blocked by a transient email failure.
      return { success: false, error: err.message, type: 'anomaly_alert' };
    }
  }

  /**
   * Handle custom notifications
   * @param {Object} notificationData - Custom notification data
   * @param {Object} userData - User data object
   * @param {Object} projectData - Project data object
   * @returns {Promise<Object>} Notification result
   */
  async handleCustomNotification(notificationData, userData, projectData) {
    // This can be extended to handle various custom notification types
    const { subject, message, template } = notificationData;

    try {
      const { sendSabyEmail } = require('./email.service');

      await sendSabyEmail({
        to: userData.email,
        subject,
        preheader: String(message || '').slice(0, 140),
        layout: template?.layout || 'default',
        label: template?.label || 'Saby notification',
        icon: template?.icon || 'SBY',
        headline: template?.headline || subject,
        body: [message || 'You have a new Saby notification.'],
        tone: template?.tone || 'neutral',
        purpose: template?.purpose || 'default',
        detailsRows: [
          ['Project', projectData?.projectName || projectData?.name || 'N/A'],
        ],
        ctaLabel: template?.ctaLabel || '',
        ctaUrl: template?.ctaUrl || '',
        showManageNotifications: true,
      });

      return {
        success: true,
        recipient: userData.email,
        type: 'custom_notification',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        recipient: userData.email,
        type: 'custom_notification',
      };
    }
  }
}

module.exports = new NotificationQueueService();
