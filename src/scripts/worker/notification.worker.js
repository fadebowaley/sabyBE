// 📁 scripts/worker/notification.worker.js

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../../config/redis');
const logger = require('../../config/logger');
const notificationQueueService = require('../../services/notificationQueue.service');

const NOTIFICATION_QUEUE_NAME = 'notificationQueue';

// Optional: log queue events
const notificationQueueEvents = new QueueEvents(NOTIFICATION_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

notificationQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`✅ Notification job completed - ID: ${jobId}`);
});

notificationQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(
    `❌ Notification job failed - ID: ${jobId}, Reason: ${failedReason}`
  );
});

// Notification worker
const notificationWorker = new Worker(
  NOTIFICATION_QUEUE_NAME,
  async (job) => {
    logger.info(
      `📧 Processing notification job: ${job.id} - Type: ${job.data.type}`
    );

    try {
      const result = await notificationQueueService.processNotificationJob(job);
      logger.info(`✅ Notification job ${job.id} processed successfully`);
      return result;
    } catch (error) {
      logger.error(`❌ Notification job ${job.id} failed:`, error.message);
      throw error; // Re-throw to trigger retry
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 5, // Process up to 5 notifications concurrently
  }
);

// Handle worker events
notificationWorker.on('completed', (job) => {
  logger.info(`✅ Notification worker completed job: ${job.id}`);
});

notificationWorker.on('failed', (job, err) => {
  logger.error(`❌ Notification worker failed job: ${job.id}`, err.message);
});

notificationWorker.on('error', (err) => {
  logger.error(`❌ Notification worker error:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Notification worker shutting down gracefully...');
  await notificationWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('🛑 Notification worker shutting down gracefully...');
  await notificationWorker.close();
  process.exit(0);
});

logger.info('📧 Notification Worker started');
