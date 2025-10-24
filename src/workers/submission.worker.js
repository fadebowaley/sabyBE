/**
 * Submission Worker (Modularized)
 * 
 * Exports a function to create the submission worker instance.
 * Can be used standalone or imported by worker manager.
 * 
 * FIXED: Now correctly calls permSubmissionService.submitPERMData() for PERM submissions
 */

const { Worker, QueueEvents } = require('bullmq');
const { postgresPool } = require('../config/postgres');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const SubmissionModel = require('../models/submission.model');
const { logActivity } = require('../utils/activityLogger');
const notificationQueueService = require('../services/notificationQueue.service');
const { eventCalendarService, eventComplianceService } = require('../services');
const permSubmissionService = require('../services/permSubmission.service');
const dlqService = require('../services/dlq.service');
const emailService = require('../services/email.service');
const User = require('../models/user.model');
const Node = require('../models/node.model');

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
    logger.error(
      `❌ Submission job failed - ID: ${jobId}, Reason: ${failedReason}`
    );
  });

  // Create worker with production-grade retry configuration
  const submissionWorker = new Worker(
    SUBMISSION_QUEUE_NAME,
    async (job) => {
      const startTime = Date.now();
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

      const isPERMSubmission =
        perm_enabled || month || (payload && payload.month);

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
        `[Worker] Processing ${
          isPERMSubmission ? 'PERM' : 'regular'
        } submission for project=${projectId} (Attempt ${
          job.attemptsMade + 1
        }/${job.opts.attempts || 1})`
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
          // ✅ FIXED: Call the correct PERM service method
          logger.info(
            `[Worker] Calling permSubmissionService.submitPERMData for PERM submission`
          );
          const permResult = await permSubmissionService.submitPERMData(
            submissionPayload
          );

          result = {
            id: permResult.submission.id,
            ...permResult.submission,
            action: permResult.action,
            existed: permResult.existed,
          };

          logger.info(
            `[Worker] PERM submission ${permResult.action} - ${result.id} ` +
              `(${permResult.compliance.event_compliance_percentage}% compliance, ` +
              `${permResult.compliance.total_events_submitted}/${permResult.compliance.total_events_required} events, ` +
              `status: ${permResult.compliance.completeness_status})`
          );
        } else {
          result = await SubmissionModel.createSubmission(submissionPayload);
          logger.info(`[Worker] Regular submission created - ${result.id}`);
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
            ? `PERM submission completed (${
                result.event_compliance_percentage || 0
              }% compliance)`
            : 'Submission completed successfully',
        });

        // ✅ PRODUCTION: Send email notifications
        try {
          // Get user email
          const user = userId ? await User.findById(userId).lean() : null;
          const userEmail = user?.email;

          if (userEmail && emailService.sendSubmissionConfirmation) {
            // Send confirmation email
            await emailService.sendSubmissionConfirmation(userEmail, {
              userName: user.firstname || 'User',
              submissionId: result.id,
              projectName: project_name || projectId,
              submittedAt: result.created_at || new Date(),
            });
            logger.info(`✅ Confirmation email queued for ${userEmail}`);
          }

          // For PERM submissions, send compliance alerts based on percentage
          if (
            isPERMSubmission &&
            result.event_compliance_percentage !== undefined
          ) {
            const compliance = parseFloat(result.event_compliance_percentage);

            if (userEmail) {
              const emailData = {
                nodeName: nodeId || 'Your Node',
                month: month,
                compliance,
                eventsSubmitted: result.total_events_submitted || 0,
                eventsRequired: result.total_events_required || 5,
                submissionId: result.id,
                daysRemaining: 15, // Default
              };

              if (compliance < 40) {
                // Critical alert
                await emailService.sendPERMCriticalAlert(userEmail, emailData);
                logger.info(
                  `✅ Critical alert queued for ${userEmail} (${compliance}%)`
                );
              } else if (compliance >= 40 && compliance < 80) {
                // Warning alert
                await emailService.sendPERMWarning(userEmail, emailData);
                logger.info(
                  `✅ Warning queued for ${userEmail} (${compliance}%)`
                );
              } else if (compliance === 100) {
                // Completion celebration
                await emailService.sendPERMCompletion(userEmail, emailData);
                logger.info(
                  `✅ Completion email queued for ${userEmail} (100%)`
                );
              }
            }
          }
        } catch (emailError) {
          // Don't fail the job if email fails
          logger.warn(`⚠️ Email notification failed: ${emailError.message}`);
        }

        return result;
      } catch (error) {
        logger.error(`[Worker] Submission failed:`, error.message);
        logger.error(`[Worker] Error stack:`, error.stack);

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

      // ✅ PRODUCTION: Retry configuration with exponential backoff
      settings: {
        attempts: 5, // Total attempts (1 initial + 4 retries)
        backoff: {
          type: 'exponential',
          delay: 5000, // Start with 5 seconds
          // Retry delays: 5s, 10s, 20s, 40s
        },
      },

      // ✅ PRODUCTION: Job timeout protection
      lockDuration: 300000, // 5 minutes max per job
      lockRenewTime: 150000, // Renew lock every 2.5 minutes

      // ✅ PRODUCTION: Cleanup strategy
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
      },
      removeOnFail: false, // Keep failed jobs for analysis
    }
  );

  submissionWorker.on('completed', (job) => {
    logger.info(`✅ Submission worker completed job: ${job.id}`);
  });

  submissionWorker.on('failed', async (job, err) => {
    const attempts = job.attemptsMade;
    const maxAttempts = job.opts.attempts || 3;

    logger.error(
      `❌ Submission worker failed job: ${job.id} (Attempt ${attempts}/${maxAttempts})`,
      err.message
    );

    // ✅ PRODUCTION: Move to DLQ after all retries exhausted
    if (attempts >= maxAttempts) {
      logger.error(
        `🔴 Job ${job.id} permanently failed after ${attempts} attempts - Moving to DLQ`
      );

      try {
        await dlqService.saveToDLQ({
          jobId: job.id,
          queueName: SUBMISSION_QUEUE_NAME,
          jobData: job.data,
          error: err.message,
          stack: err.stack,
          attempts,
          failedAt: new Date(),
          tenantId: job.data.tenantId,
          projectId: job.data.projectId,
          userId: job.data.userId,
        });

        // Send alert to admin
        await dlqService.sendAdminAlert({
          level: 'CRITICAL',
          type: 'submission_permanent_failure',
          message: `Submission permanently failed after ${attempts} attempts: ${job.id}`,
          error: err.message,
          tenantId: job.data.tenantId,
          projectId: job.data.projectId,
        });

        // ✅ PRODUCTION: Send failure notification to user
        try {
          const user = job.data.userId
            ? await User.findById(job.data.userId).lean()
            : null;
          if (user?.email && emailService.sendSubmissionFailed) {
            await emailService.sendSubmissionFailed(user.email, {
              userName: user.firstname || 'User',
              submissionId: job.id,
              errorMessage: err.message,
              attempts,
            });
            logger.info(`✅ Failure notification sent to ${user.email}`);
          }
        } catch (emailError) {
          logger.warn(`⚠️ Could not send failure email: ${emailError.message}`);
        }

        logger.info(`✅ Job ${job.id} saved to DLQ and admin alerted`);
      } catch (dlqError) {
        logger.error(
          `❌ Failed to process DLQ for job ${job.id}:`,
          dlqError.message
        );
      }
    } else {
      logger.warn(
        `⚠️ Job ${job.id} will retry (${
          maxAttempts - attempts
        } attempts remaining)`
      );
    }
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
