const { Worker } = require('bullmq');
const logger = require('../config/logger');
const config = require('../config/config');
const { getRedisConnectionOptions } = require('../config/redis');
const {
  PAYMENT_RECONCILIATION_QUEUE_NAME,
  PAYMENT_RECONCILIATION_JOB_NAME,
  paymentReconciliationQueue,
} = require('../queues/paymentReconciliation.queue');
const { buildJobOptions } = require('../queues/queueDefaults');
const paymentReconciliationService = require('../services/paymentReconciliation.service');

const ensureRepeatableJob = async () => {
  const cron =
    config.payment?.reconciliation?.cron || process.env.PAYMENT_RECONCILIATION_CRON || '*/5 * * * *';

  await paymentReconciliationQueue.add(
    PAYMENT_RECONCILIATION_JOB_NAME,
    {},
    {
      ...buildJobOptions('standard'),
      jobId: PAYMENT_RECONCILIATION_JOB_NAME,
      repeat: {
        pattern: cron,
      },
    }
  );

  logger.info(`[Payment Reconciliation Worker] Repeatable sweep scheduled: ${cron}`);
};

const createPaymentReconciliationWorker = async () => {
  const worker = new Worker(
    PAYMENT_RECONCILIATION_QUEUE_NAME,
    async () => paymentReconciliationService.runReconciliationSweep(),
    {
      connection: getRedisConnectionOptions(),
      concurrency: 1,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      `[Payment Reconciliation Worker] Job completed: ${job.id} ${JSON.stringify(
        result || {}
      )}`
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `[Payment Reconciliation Worker] Job failed: ${job?.id}`,
      err?.message || err
    );
  });

  await ensureRepeatableJob();
  logger.info('🧮 Payment reconciliation worker initialized');

  return worker;
};

module.exports = {
  createPaymentReconciliationWorker,
};
