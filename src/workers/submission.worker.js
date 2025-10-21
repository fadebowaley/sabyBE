/**
 * Submission Worker (Modularized)
 * 
 * Exports a function to create the submission worker instance.
 * Can be used standalone or imported by worker manager.
 */

const { Worker, QueueEvents } = require('bullmq');
const { postgresPool } = require('../config/postgres');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const SubmissionModel = require('../models/submission.model');
const { logActivity } = require('../utils/activityLogger');
const notificationQueueService = require('../services/notificationQueue.service');
const { eventCalendarService, eventComplianceService } = require('../services');

const SUBMISSION_QUEUE_NAME = 'submissionQueue';

/**
 * Create and return submission worker instance
 */
const createSubmissionWorker = () => {
  // Queue events monitoring
  const submissionQueueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });

  submissionQueueEvents.on('completed', ({ jobId }) => {
    logger.info(`✅ Submission job completed - ID: ${jobId}`);
  });

  submissionQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(`❌ Submission job failed - ID: ${jobId}, Reason: ${failedReason}`);
  });

  // Create worker
  const submissionWorker = new Worker(
    SUBMISSION_QUEUE_NAME,
    async (job) => {
      const {
        tenantId,
        projectId,
        project_name,
        project_category,
        formId,
        nodeId,
        userId,
        source,
        payload,
        meta,
        status,
        month,
        year,
        perm_enabled,
      } = job.data;

      const isPERMSubmission = perm_enabled || month || (payload && payload.month);

      const submissionPayload = {
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        source: source || 'unknown',
        data: payload,
        meta: meta || {},
        status: status || 'submitted',
        month: month || (payload && payload.month),
        year: year || (payload && payload.year) || new Date().getFullYear(),
        perm_enabled: isPERMSubmission,
      };

      logger.info(
        `[Worker] Processing ${isPERMSubmission ? 'PERM' : 'regular'} submission for project=${projectId}`
      );

      await logActivity({
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        action: 'processing',
        status: 'in progress',
        job_id: job.id,
        message: isPERMSubmission
          ? `Processing PERM submission for ${month}`
          : 'Processing submission',
      });

      try {
        let result;

        if (isPERMSubmission) {
          result = await SubmissionModel.upsertPERMSubmission(submissionPayload);
          logger.info(
            `[Worker] PERM submission ${result.id} saved (${result.event_compliance_percentage}% complete)`
          );
        } else {
          result = await SubmissionModel.createSubmission(submissionPayload);
          logger.info(`[Worker] Regular submission ${result.id} saved`);
        }

        // Log success
        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'completed',
          status: 'success',
          job_id: job.id,
          message: isPERMSubmission
            ? `PERM submission completed (${result.event_compliance_percentage}% compliance)`
            : 'Submission completed successfully',
        });

        return result;
      } catch (error) {
        logger.error(`[Worker] Submission failed:`, error.message);

        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'failed',
          status: 'failed',
          job_id: job.id,
          message: `Submission failed: ${error.message}`,
        });

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,
    }
  );

  submissionWorker.on('completed', (job) => {
    logger.info(`✅ Submission worker completed job: ${job.id}`);
  });

  submissionWorker.on('failed', (job, err) => {
    logger.error(`❌ Submission worker failed job: ${job.id}`, err.message);
  });

  submissionWorker.on('error', (err) => {
    logger.error(`❌ Submission worker error:`, err.message);
  });

  return submissionWorker;
};

// If run directly (not imported), start the worker
if (require.main === module) {
  logger.info('🚀 Starting submission worker (standalone mode)...');
  createSubmissionWorker();

  process.on('SIGTERM', () => {
    logger.info('🛑 Submission worker shutting down...');
    process.exit(0);
  });
}

module.exports = { createSubmissionWorker };

/**
 * Submission Worker (Modularized)
 * 
 * Exports a function to create the submission worker instance.
 * Can be used standalone or imported by worker manager.
 */

const { Worker, QueueEvents } = require('bullmq');
const { postgresPool } = require('../config/postgres');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const SubmissionModel = require('../models/submission.model');
const { logActivity } = require('../utils/activityLogger');
const notificationQueueService = require('../services/notificationQueue.service');
const { eventCalendarService, eventComplianceService } = require('../services');

const SUBMISSION_QUEUE_NAME = 'submissionQueue';

/**
 * Create and return submission worker instance
 */
const createSubmissionWorker = () => {
  // Queue events monitoring
  const submissionQueueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });

  submissionQueueEvents.on('completed', ({ jobId }) => {
    logger.info(`✅ Submission job completed - ID: ${jobId}`);
  });

  submissionQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(`❌ Submission job failed - ID: ${jobId}, Reason: ${failedReason}`);
  });

  // Create worker
  const submissionWorker = new Worker(
    SUBMISSION_QUEUE_NAME,
    async (job) => {
      const {
        tenantId,
        projectId,
        project_name,
        project_category,
        formId,
        nodeId,
        userId,
        source,
        payload,
        meta,
        status,
        month,
        year,
        perm_enabled,
      } = job.data;

      const isPERMSubmission = perm_enabled || month || (payload && payload.month);

      const submissionPayload = {
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        source: source || 'unknown',
        data: payload,
        meta: meta || {},
        status: status || 'submitted',
        month: month || (payload && payload.month),
        year: year || (payload && payload.year) || new Date().getFullYear(),
        perm_enabled: isPERMSubmission,
      };

      logger.info(
        `[Worker] Processing ${isPERMSubmission ? 'PERM' : 'regular'} submission for project=${projectId}`
      );

      await logActivity({
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        action: 'processing',
        status: 'in progress',
        job_id: job.id,
        message: isPERMSubmission
          ? `Processing PERM submission for ${month}`
          : 'Processing submission',
      });

      try {
        let result;

        if (isPERMSubmission) {
          result = await SubmissionModel.upsertPERMSubmission(submissionPayload);
          logger.info(
            `[Worker] PERM submission ${result.id} saved (${result.event_compliance_percentage}% complete)`
          );
        } else {
          result = await SubmissionModel.createSubmission(submissionPayload);
          logger.info(`[Worker] Regular submission ${result.id} saved`);
        }

        // Log success
        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'completed',
          status: 'success',
          job_id: job.id,
          message: isPERMSubmission
            ? `PERM submission completed (${result.event_compliance_percentage}% compliance)`
            : 'Submission completed successfully',
        });

        return result;
      } catch (error) {
        logger.error(`[Worker] Submission failed:`, error.message);

        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'failed',
          status: 'failed',
          job_id: job.id,
          message: `Submission failed: ${error.message}`,
        });

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,
    }
  );

  submissionWorker.on('completed', (job) => {
    logger.info(`✅ Submission worker completed job: ${job.id}`);
  });

  submissionWorker.on('failed', (job, err) => {
    logger.error(`❌ Submission worker failed job: ${job.id}`, err.message);
  });

  submissionWorker.on('error', (err) => {
    logger.error(`❌ Submission worker error:`, err.message);
  });

  return submissionWorker;
};

// If run directly (not imported), start the worker
if (require.main === module) {
  logger.info('🚀 Starting submission worker (standalone mode)...');
  createSubmissionWorker();

  process.on('SIGTERM', () => {
    logger.info('🛑 Submission worker shutting down...');
    process.exit(0);
  });
}

module.exports = { createSubmissionWorker };

/**
 * Submission Worker (Modularized)
 * 
 * Exports a function to create the submission worker instance.
 * Can be used standalone or imported by worker manager.
 */

const { Worker, QueueEvents } = require('bullmq');
const { postgresPool } = require('../config/postgres');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const SubmissionModel = require('../models/submission.model');
const { logActivity } = require('../utils/activityLogger');
const notificationQueueService = require('../services/notificationQueue.service');
const { eventCalendarService, eventComplianceService } = require('../services');

const SUBMISSION_QUEUE_NAME = 'submissionQueue';

/**
 * Create and return submission worker instance
 */
const createSubmissionWorker = () => {
  // Queue events monitoring
  const submissionQueueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });

  submissionQueueEvents.on('completed', ({ jobId }) => {
    logger.info(`✅ Submission job completed - ID: ${jobId}`);
  });

  submissionQueueEvents.on('failed', ({ jobId, failedReason }) => {
    logger.error(`❌ Submission job failed - ID: ${jobId}, Reason: ${failedReason}`);
  });

  // Create worker
  const submissionWorker = new Worker(
    SUBMISSION_QUEUE_NAME,
    async (job) => {
      const {
        tenantId,
        projectId,
        project_name,
        project_category,
        formId,
        nodeId,
        userId,
        source,
        payload,
        meta,
        status,
        month,
        year,
        perm_enabled,
      } = job.data;

      const isPERMSubmission = perm_enabled || month || (payload && payload.month);

      const submissionPayload = {
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        source: source || 'unknown',
        data: payload,
        meta: meta || {},
        status: status || 'submitted',
        month: month || (payload && payload.month),
        year: year || (payload && payload.year) || new Date().getFullYear(),
        perm_enabled: isPERMSubmission,
      };

      logger.info(
        `[Worker] Processing ${isPERMSubmission ? 'PERM' : 'regular'} submission for project=${projectId}`
      );

      await logActivity({
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        node_id: nodeId,
        user_id: userId,
        action: 'processing',
        status: 'in progress',
        job_id: job.id,
        message: isPERMSubmission
          ? `Processing PERM submission for ${month}`
          : 'Processing submission',
      });

      try {
        let result;

        if (isPERMSubmission) {
          result = await SubmissionModel.upsertPERMSubmission(submissionPayload);
          logger.info(
            `[Worker] PERM submission ${result.id} saved (${result.event_compliance_percentage}% complete)`
          );
        } else {
          result = await SubmissionModel.createSubmission(submissionPayload);
          logger.info(`[Worker] Regular submission ${result.id} saved`);
        }

        // Log success
        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'completed',
          status: 'success',
          job_id: job.id,
          message: isPERMSubmission
            ? `PERM submission completed (${result.event_compliance_percentage}% compliance)`
            : 'Submission completed successfully',
        });

        return result;
      } catch (error) {
        logger.error(`[Worker] Submission failed:`, error.message);

        await logActivity({
          tenant_id: tenantId,
          project_id: projectId,
          project_name,
          project_category,
          form_id: formId,
          node_id: nodeId,
          user_id: userId,
          action: 'failed',
          status: 'failed',
          job_id: job.id,
          message: `Submission failed: ${error.message}`,
        });

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 3,
    }
  );

  submissionWorker.on('completed', (job) => {
    logger.info(`✅ Submission worker completed job: ${job.id}`);
  });

  submissionWorker.on('failed', (job, err) => {
    logger.error(`❌ Submission worker failed job: ${job.id}`, err.message);
  });

  submissionWorker.on('error', (err) => {
    logger.error(`❌ Submission worker error:`, err.message);
  });

  return submissionWorker;
};

// If run directly (not imported), start the worker
if (require.main === module) {
  logger.info('🚀 Starting submission worker (standalone mode)...');
  createSubmissionWorker();

  process.on('SIGTERM', () => {
    logger.info('🛑 Submission worker shutting down...');
    process.exit(0);
  });
}

module.exports = { createSubmissionWorker };

