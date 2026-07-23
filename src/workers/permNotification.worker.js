/**
 * PERM Notification Worker (Modularized)
 */

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const { permNotificationService } = require('../services');
const emailService = require('../services/email.service');

const PERM_NOTIFICATION_QUEUE_NAME = 'permNotificationQueue';

const createPermNotificationWorker = () => {
  const permNotificationQueueEvents = new QueueEvents(PERM_NOTIFICATION_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });

  permNotificationQueueEvents.on('completed', ({ jobId }) => {
    logger.info(`✅ PERM Notification job completed - ID: ${jobId}`);
  });

  permNotificationQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(`❌ PERM Notification job failed - ID: ${jobId}, Reason: ${failedReason}`);
  });

  const worker = new Worker(
    PERM_NOTIFICATION_QUEUE_NAME,
    async (job) => {
      logger.info(`📧 Processing PERM notification job: ${job.id}`);

      const notification = job.data;
      const { notification_type, recipient_email, subject, message } = notification;

      try {
        // Send email notification
        if (recipient_email && emailService?.sendSabyEmail) {
          await emailService.sendSabyEmail({
            to: recipient_email,
            subject: `[PERM] ${subject}`,
            preheader: String(message || subject || '').replace(/<[^>]+>/g, '').slice(0, 140),
            layout: 'complianceAlert',
            label: 'Compliance notification',
            icon: 'PERM',
            headline: subject || 'PERM notification',
            bodyHtml: message,
            showManageNotifications: true,
          });

          // Update notification status
          await permNotificationService.updateNotificationStatus(
            notification.id,
            'sent',
            `Email sent to ${recipient_email}`
          );

          logger.info(`✅ PERM notification sent: ${notification_type} to ${recipient_email}`);
        } else {
          logger.warn(`⚠️  Email service not configured, skipping notification ${notification.id}`);
        }

        return { success: true, notification_id: notification.id };
      } catch (error) {
        logger.error(`❌ PERM notification failed: ${error.message}`);

        await permNotificationService.updateNotificationStatus(
          notification.id,
          'failed',
          error.message
        );

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`✅ PERM notification worker completed job: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`❌ PERM notification worker failed job: ${job.id}`, err.message);
  });

  return worker;
};

if (require.main === module) {
  logger.info('🚀 Starting PERM notification worker (standalone mode)...');
  createPermNotificationWorker();
}

module.exports = { createPermNotificationWorker };
