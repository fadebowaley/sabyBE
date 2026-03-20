const { Worker } = require('bullmq');
const config = require('../config/config');
const logger = require('../config/logger');
const { getRedisConnectionOptions } = require('../config/redis');
const {
  ONBOARDING_IMPORT_QUEUE_NAME,
  ONBOARDING_IMPORT_JOB_NAME,
  queueOnboardingImportDlqJob,
} = require('../queues/onboardingImport.queue');
const {
  processOnboardingJob,
  markOnboardingJobDeadLetter,
} = require('../services/copilotOnboardingJob.service');

const createOnboardingImportWorker = () => {
  const worker = new Worker(
    ONBOARDING_IMPORT_QUEUE_NAME,
    async (job) => {
      if (job?.name !== ONBOARDING_IMPORT_JOB_NAME) {
        return { skipped: true, reason: 'unknown_job_name' };
      }

      const payload = job?.data || {};
      await processOnboardingJob({
        tenantId: payload.tenantId,
        jobId: payload.jobId,
        actorUser: payload.actorUser || {},
        attempt: Number(job?.attemptsMade || 0) + 1,
        maxAttempts: Number(job?.opts?.attempts || 1),
      });

      return { ok: true, jobId: payload.jobId };
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: Number(config.copilot?.onboardingWorkerConcurrency || 2),
    }
  );

  worker.on('completed', (job) => {
    logger.info(`[OnboardingWorker] Job completed: ${job?.id}`);
  });

  worker.on('failed', async (job, error) => {
    logger.error(`[OnboardingWorker] Job failed: ${job?.id} ${error?.message}`);
    const attemptsMade = Number(job?.attemptsMade || 0);
    const maxAttempts = Number(job?.opts?.attempts || 1);
    if (attemptsMade < maxAttempts) {
      return;
    }

    const payload = job?.data || {};
    if (!payload?.tenantId || !payload?.jobId) {
      return;
    }

    try {
      await markOnboardingJobDeadLetter({
        tenantId: payload.tenantId,
        jobId: payload.jobId,
        errorMessage: error?.message || 'Onboarding worker failed',
        attemptsMade,
        maxAttempts,
      });
      await queueOnboardingImportDlqJob({
        jobId: payload.jobId,
        tenantId: payload.tenantId,
        actorUser: payload.actorUser || {},
        errorMessage: error?.message || 'Onboarding worker failed',
        attemptsMade,
        maxAttempts,
      });
    } catch (dlqError) {
      logger.error(
        `[OnboardingWorker] Failed to dead-letter onboarding job ${payload.jobId}: ${dlqError?.message}`
      );
    }
  });

  return worker;
};

module.exports = {
  createOnboardingImportWorker,
};
