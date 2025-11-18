const { Worker, Queue, QueueScheduler } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const {
  refreshMaterializedViews,
  MATERIALIZED_VIEWS,
} = require('../services/analyticsRefresh.service');

const QUEUE_NAME = 'analyticsRefreshQueue';
const JOB_NAME = 'refresh-materialized-views';

let analyticsQueue;
let analyticsQueueScheduler;

async function ensureRepeatableJob() {
  if (!analyticsQueue) {
    analyticsQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
  }

  if (!analyticsQueueScheduler) {
    analyticsQueueScheduler = new QueueScheduler(QUEUE_NAME, {
      connection: getRedisConnectionOptions(),
    });
    await analyticsQueueScheduler.waitUntilReady();
  }

  await analyticsQueue.add(
    JOB_NAME,
    {},
    {
      jobId: JOB_NAME,
      repeat: {
        pattern: process.env.ANALYTICS_REFRESH_CRON || '0 * * * *',
      },
      removeOnComplete: true,
      removeOnFail: 50,
    }
  );
}

const createAnalyticsRefreshWorker = () => {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      logger.info(
        `[AnalyticsRefreshWorker] Starting refresh job ${job.id} (repeat ${
          job.opts.repeat?.pattern || 'manual'
        })`
      );

      await refreshMaterializedViews();

      logger.info(
        `[AnalyticsRefreshWorker] Completed refresh job ${
          job.id
        } for views: ${MATERIALIZED_VIEWS.join(', ')}`
      );
      return { refreshed: MATERIALIZED_VIEWS.length };
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 1,
    }
  );

  worker.on('completed', (job) => {
    logger.info(
      `[AnalyticsRefreshWorker] ✅ Job ${job.id} completed successfully`
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `[AnalyticsRefreshWorker] ❌ Job ${job?.id} failed: ${err.message}`
    );
  });

  ensureRepeatableJob().catch((error) => {
    logger.error(
      '[AnalyticsRefreshWorker] Failed to schedule repeatable job:',
      error.message
    );
  });

  logger.info(
    `[AnalyticsRefreshWorker] Initialized. Refresh cron: ${
      process.env.ANALYTICS_REFRESH_CRON || '0 * * * *'
    }`
  );

  return worker;
};

module.exports = { createAnalyticsRefreshWorker };
