const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const simpleNotificationService = require('./simpleNotification.service');
const logger = require('../config/logger');

const NOTIFICATION_QUEUE_NAME = 'notificationQueue';

class NotificationQueueService {
  constructor() {
    this.queue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
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
  async queueSubmissionConfirmation(submission, userId, projectId, userData, projectData) {
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

      logger.info(`📧 Queued submission confirmation notification - Job ID: ${job.id}`);

      return {
        success: true,
        jobId: job.id,
        message: 'Notification queued successfully',
      };
    } catch (error) {
      logger.error(`❌ Failed to queue submission confirmation:`, error.message);
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
  async queueProcessingNotification(submission, userId, projectId, status = 'completed') {
    try {
      const job = await this.queue.add('processing_notification', {
        type: 'processing_notification',
        submission,
        userId,
        projectId,
        status,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📧 Queued processing notification (${status}) - Job ID: ${job.id}`);

      return {
        success: true,
        jobId: job.id,
        message: 'Processing notification queued successfully',
      };
    } catch (error) {
      logger.error(`❌ Failed to queue processing notification:`, error.message);
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
  async queueValidationFailureNotification(validationData, userData, projectData) {
    try {
      const job = await this.queue.add('validation_failure', {
        type: 'validation_failure',
        validationData,
        userData,
        projectData,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📧 Queued validation failure notification - Job ID: ${job.id}`);

      return {
        success: true,
        jobId: job.id,
        message: 'Validation failure notification queued successfully',
      };
    } catch (error) {
      logger.error(`❌ Failed to queue validation failure notification:`, error.message);
      return {
        success: false,
        error: error.message,
      };
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
        total: waiting.length + active.length + completed.length + failed.length,
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
    const { type, submission, userId, projectId, status, userData, projectData, validationData } = job.data;

    try {
      logger.info(`📧 Processing notification job: ${type} for user ${userData ? userData.email : userId}`);

      let notificationResult;

      switch (type) {
        case 'submission_confirmation':
          notificationResult = await simpleNotificationService.sendSubmissionConfirmation(submission, userData, projectData);
          break;

        case 'validation_failure':
          notificationResult = await simpleNotificationService.sendValidationFailureNotification(
            validationData,
            userData,
            projectData
          );
          break;

        case 'processing_notification':
          notificationResult = await simpleNotificationService.sendProcessingNotification(
            submission,
            userData,
            projectData,
            status
          );
          break;

        case 'custom_notification':
          // Handle custom notifications
          notificationResult = await this.handleCustomNotification(job.data, userData, projectData);
          break;

        default:
          throw new Error(`Unknown notification type: ${type}`);
      }

      if (notificationResult.success) {
        logger.info(`✅ Notification sent successfully: ${type} to ${userData ? userData.email : userId}`);
      } else {
        logger.warn(
          `⚠️ Notification failed: ${type} to ${userData ? userData.email : userId} - ${notificationResult.error}`
        );
      }

      return notificationResult;
    } catch (error) {
      logger.error(`❌ Error processing notification job:`, error.message);
      throw error; // Re-throw to trigger retry
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
      // Use the existing email service to send custom notifications
      const { sendEmail } = require('./email.service');

      await sendEmail(userData.email, subject, message);

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
