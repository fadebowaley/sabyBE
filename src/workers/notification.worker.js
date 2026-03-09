/**
 * Notification Worker
 *
 * Processes notification jobs from notificationQueue.
 */

const { Worker } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const notificationQueueService = require('../services/notificationQueue.service');

const createNotificationWorker = () => {
  const notificationWorker = new Worker(
    'notificationQueue',
    async (job) => {
      logger.info(`[Notification Worker] Processing notification job: ${job.id}`);
      const result = await notificationQueueService.processNotificationJob(job);
      return result || { success: true, jobId: job.id };
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 10,
    }
  );

  notificationWorker.on('completed', (job) => {
    logger.info(`✅ Notification job completed: ${job.id}`);
  });

  notificationWorker.on('failed', (job, err) => {
    logger.error(`❌ Notification job failed: ${job?.id}`, err.message);
  });

  logger.info('🔔 Notification worker initialized');

  return notificationWorker;
};

module.exports = { createNotificationWorker };
