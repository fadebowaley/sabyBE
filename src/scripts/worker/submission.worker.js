// 📁 script/worker/submission.worker.js

const { Worker, QueueEvents } = require('bullmq');
const { postgresPool } = require('../../config/postgres');
const { getRedisConnectionOptions } = require('../../config/redis');
const logger = require('../../config/logger');
const SubmissionModel = require('../../models/submission.model');
const { emitActivityUpdate } = require('../../config/socket');
const notificationQueueService = require('../../services/notificationQueue.service');

const SUBMISSION_QUEUE_NAME = 'submissionQueue';

// Optional: log queue events like completed/failed
const submissionQueueEvents = new QueueEvents(SUBMISSION_QUEUE_NAME, {
  connection: getRedisConnectionOptions(),
});

submissionQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`✅ Job completed - ID: ${jobId}`);
});

submissionQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`❌ Job failed - ID: ${jobId}, Reason: ${failedReason}`);
});

// Worker for processing submission jobs
const submissionWorker = new Worker(
  SUBMISSION_QUEUE_NAME,
  async (job) => {
    console.log('[Worker] Received job:', job.data);
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
    } = job.data;

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
    };

    logger.info(
      `[Worker] Calling SubmissionModel.createSubmission for formId=${formId}, tenantId=${tenantId}, project_name=${project_name}, project_category=${project_category}`
    );
    try {
      const result = await SubmissionModel.createSubmission(submissionPayload);
      console.log('[Worker] Inserted submission:', result);
      logger.info(`[Worker] Inserted submission: ${JSON.stringify(result)}`);

      // Queue confirmation notification (asynchronous, non-blocking)
      try {
        // Extract user data from the job metadata if available
        const verifiedEmail =
          (job.data.metadata &&
            job.data.metadata.validation &&
            job.data.metadata.validation.verifiedEmail) ||
          (job.data.metadata && job.data.metadata.from) ||
          'fadebowaley@gmail.com'; // Fallback to sender email

        const userData = {
          email: verifiedEmail,
          firstname: 'User', // Default fallback
          name: 'User', // Default fallback
        };

        // Extract project data
        const projectData = {
          projectName: project_name || 'Email Form',
        };

        const notificationResult =
          await notificationQueueService.queueSubmissionConfirmation(
            result,
            userId,
            projectId,
            userData,
            projectData
          );

        if (notificationResult.success) {
          logger.info(
            `📧 Confirmation notification queued successfully - Job ID: ${notificationResult.jobId}`
          );
        } else {
          logger.warn(
            `⚠️ Failed to queue confirmation notification: ${notificationResult.error}`
          );
        }
      } catch (notificationError) {
        logger.error(
          `❌ Error queuing confirmation notification:`,
          notificationError.message
        );
      }

      // Log activity: processed
      const activityLog = {
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        user_id: userId,
        action: 'processed',
        status: 'success',
        job_id: job.id,
        message: 'Submission processed successfully',
        created_at: new Date(),
      };

      await postgresPool.query(
        `INSERT INTO submission_activity_log (tenant_id, project_id, project_name, project_category, form_id, user_id, action, status, job_id, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          activityLog.tenant_id,
          activityLog.project_id,
          activityLog.project_name,
          activityLog.project_category,
          activityLog.form_id,
          activityLog.user_id,
          activityLog.action,
          activityLog.status,
          activityLog.job_id,
          activityLog.message,
        ]
      );

      // Emit real-time update
      emitActivityUpdate(tenantId, activityLog);
    } catch (err) {
      console.log('[Worker] Error:', err.message);
      logger.error(`[Worker] Error inserting submission: ${err.message}`);

      // Log activity: failed
      const activityLog = {
        tenant_id: tenantId,
        project_id: projectId,
        project_name,
        project_category,
        form_id: formId,
        user_id: userId,
        action: 'processed',
        status: 'failed',
        job_id: job.id,
        message: err.message,
        created_at: new Date(),
      };

      await postgresPool.query(
        `INSERT INTO submission_activity_log (tenant_id, project_id, project_name, project_category, form_id, user_id, action, status, job_id, message)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          activityLog.tenant_id,
          activityLog.project_id,
          activityLog.project_name,
          activityLog.project_category,
          activityLog.form_id,
          activityLog.user_id,
          activityLog.action,
          activityLog.status,
          activityLog.job_id,
          activityLog.message,
        ]
      );

      // Emit real-time update
      emitActivityUpdate(tenantId, activityLog);

      throw err;
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 5, // Can be increased based on load
  }
);

submissionWorker.on('error', (err) => {
  logger.error('❌ Worker error:', err);
});

logger.info('👷‍♂️ Submission Worker is running...');
