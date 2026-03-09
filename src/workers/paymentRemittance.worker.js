const { Worker } = require('bullmq');
const logger = require('../config/logger');
const { getRedisConnectionOptions } = require('../config/redis');
const { PAYMENT_REMITTANCE_QUEUE_NAME } = require('../queues/paymentRemittance.queue');
const paymentRemittanceService = require('../services/paymentRemittance.service');

const createPaymentRemittanceWorker = () => {
  const worker = new Worker(
    PAYMENT_REMITTANCE_QUEUE_NAME,
    async (job) => paymentRemittanceService.processRemittanceJob(job),
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`[Payment Remittance Worker] Job completed: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `[Payment Remittance Worker] Job failed: ${job?.id}`,
      err?.message || err
    );
    paymentRemittanceService.handleRemittanceFailure(job, err).catch((failureError) => {
      logger.error(
        `[Payment Remittance Worker] Failed during failure handling for ${job?.id}: ${failureError.message}`
      );
    });
  });

  logger.info('💸 Payment remittance worker initialized');
  return worker;
};

module.exports = {
  createPaymentRemittanceWorker,
};
