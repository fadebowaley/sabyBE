const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const { buildJobOptions } = require('./queueDefaults');

const PAYMENT_REMITTANCE_QUEUE_NAME = 'paymentRemittanceQueue';

const paymentRemittanceQueue = new Queue(PAYMENT_REMITTANCE_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: buildJobOptions('critical'),
});

const queueRemittance = async (payload = {}, options = {}) => {
  const paymentId = payload.paymentId || payload.id;
  if (!paymentId) {
    throw new Error('paymentId is required to queue remittance');
  }

  return paymentRemittanceQueue.add(
    'payment:remittance',
    payload,
    {
      ...buildJobOptions('critical'),
      jobId: options.jobId || `payment-remittance:${paymentId}`,
      ...options,
    }
  );
};

module.exports = {
  PAYMENT_REMITTANCE_QUEUE_NAME,
  paymentRemittanceQueue,
  queueRemittance,
};
