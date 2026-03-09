const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const { buildJobOptions } = require('./queueDefaults');

const PAYMENT_RECONCILIATION_QUEUE_NAME = 'paymentReconciliationQueue';
const PAYMENT_RECONCILIATION_JOB_NAME = 'payment:reconciliation:sweep';

const paymentReconciliationQueue = new Queue(PAYMENT_RECONCILIATION_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: buildJobOptions('standard'),
});

module.exports = {
  PAYMENT_RECONCILIATION_QUEUE_NAME,
  PAYMENT_RECONCILIATION_JOB_NAME,
  paymentReconciliationQueue,
};
