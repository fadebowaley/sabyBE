const { Queue } = require('bullmq');
const config = require('../config/config');
const { getRedisConnectionOptions } = require('../config/redis');
const { buildJobOptions } = require('./queueDefaults');

const ONBOARDING_IMPORT_QUEUE_NAME = 'copilotOnboardingImportQueue';
const ONBOARDING_IMPORT_JOB_NAME = 'copilot:onboarding:import';
const ONBOARDING_IMPORT_DLQ_QUEUE_NAME = 'copilotOnboardingImportDlqQueue';
const ONBOARDING_IMPORT_DLQ_JOB_NAME = 'copilot:onboarding:import:dead_letter';

const onboardingQueueOptions = buildJobOptions('onboarding', {
  attempts: Number(config.copilot?.onboarding?.queueAttempts || 4),
  backoff: {
    type: 'exponential',
    delay: Number(config.copilot?.onboarding?.queueBackoffMs || 5000),
  },
});

const onboardingImportQueue = new Queue(ONBOARDING_IMPORT_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: onboardingQueueOptions,
});

const onboardingImportDlqQueue = new Queue(ONBOARDING_IMPORT_DLQ_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: buildJobOptions('standard', {
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: false,
  }),
});

const queueOnboardingImportJob = async ({
  jobId,
  tenantId,
  actorUser = {},
  options = {},
}) => {
  if (!jobId) {
    throw new Error('jobId is required');
  }
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  return onboardingImportQueue.add(
    ONBOARDING_IMPORT_JOB_NAME,
    {
      jobId,
      tenantId,
      actorUser: {
        id: actorUser.id || actorUser._id || null,
        userId: actorUser.userId || null,
        isOwner: Boolean(actorUser.isOwner),
        isSuper: Boolean(actorUser.isSuper),
      },
    },
    {
      ...onboardingQueueOptions,
      jobId: `onboarding-import-${jobId}`,
      ...options,
    }
  );
};

const queueOnboardingImportDlqJob = async ({
  jobId,
  tenantId,
  actorUser = {},
  errorMessage = 'Unknown error',
  attemptsMade = 0,
  maxAttempts = 0,
  options = {},
}) =>
  onboardingImportDlqQueue.add(
    ONBOARDING_IMPORT_DLQ_JOB_NAME,
    {
      jobId,
      tenantId,
      actorUser,
      errorMessage,
      attemptsMade,
      maxAttempts,
      movedAt: new Date().toISOString(),
    },
    {
      ...buildJobOptions('standard', {
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: false,
      }),
      jobId: `onboarding-import-dlq-${jobId}-${Date.now()}`,
      ...options,
    }
  );

module.exports = {
  ONBOARDING_IMPORT_QUEUE_NAME,
  ONBOARDING_IMPORT_JOB_NAME,
  ONBOARDING_IMPORT_DLQ_QUEUE_NAME,
  ONBOARDING_IMPORT_DLQ_JOB_NAME,
  onboardingImportQueue,
  onboardingImportDlqQueue,
  queueOnboardingImportJob,
  queueOnboardingImportDlqJob,
};
