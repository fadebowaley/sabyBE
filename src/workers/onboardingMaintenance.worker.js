const config = require('../config/config');
const logger = require('../config/logger');
const { cleanupOnboardingArtifacts } = require('../services/copilotOnboardingJob.service');

const createOnboardingMaintenanceWorker = () => {
  let closed = false;
  let inFlight = false;
  let timer = null;
  const intervalMs = Number(config.copilot?.onboarding?.cleanupIntervalMs || 60 * 60 * 1000);

  const tick = async () => {
    if (closed || inFlight) return;
    inFlight = true;
    try {
      const summary = await cleanupOnboardingArtifacts({});
      const totalChanges =
        Number(summary.filePointersCleared || 0) +
        Number(summary.filesDeleted || 0) +
        Number(summary.orphanFilesDeleted || 0) +
        Number(summary.jobsPurged || 0);
      if (totalChanges > 0 || Number(summary.errors || 0) > 0) {
        logger.info(
          `[OnboardingMaintenanceWorker] Cleanup summary: ${JSON.stringify(summary)}`
        );
      }
    } catch (error) {
      logger.error(`[OnboardingMaintenanceWorker] Tick failed: ${error.message}`);
    } finally {
      inFlight = false;
    }
  };

  timer = setInterval(() => {
    tick();
  }, intervalMs);
  timer.unref();

  logger.info(
    `[OnboardingMaintenanceWorker] Started (interval=${intervalMs}ms)`
  );

  return {
    close: async () => {
      closed = true;
      if (timer) clearInterval(timer);
      logger.info('[OnboardingMaintenanceWorker] Stopped');
    },
  };
};

module.exports = {
  createOnboardingMaintenanceWorker,
};
