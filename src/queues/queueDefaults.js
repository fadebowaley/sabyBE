/**
 * Shared BullMQ queue defaults for consistency across workers.
 */

const JOB_POLICY = {
  critical: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
  standard: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
  onboarding: {
    attempts: 4,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  },
  notification: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
};

const buildJobOptions = (policyName, overrides = {}) => ({
  ...JOB_POLICY[policyName],
  ...overrides,
});

module.exports = {
  JOB_POLICY,
  buildJobOptions,
};
