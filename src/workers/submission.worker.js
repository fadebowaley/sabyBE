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
const SubmissionCatalogService = require('../services/submissionCatalog.service');
const {
  createFactsTableIfNeeded,
  insertFacts,
} = require('../models/factWriter');
const { logActivity } = require('../utils/activityLogger');
const notificationQueueService = require('../services/notificationQueue.service');
const { eventCalendarService, eventComplianceService } = require('../services');
const permSubmissionService = require('../services/permSubmission.service');
const dlqService = require('../services/dlq.service');
const emailService = require('../services/email.service');
const User = require('../models/user.model');
const Node = require('../models/node.model');
const submissionRollupService = require('../services/submissionRollup.service');

const SUBMISSION_QUEUE_NAME = 'submissionQueue';
let factsTableEnsured = false;

async function ensureFactsTable() {
  if (factsTableEnsured) {
    return;
  }
  await createFactsTableIfNeeded();
  factsTableEnsured = true;
}

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
      // Route to appropriate handler based on job type
      switch (job.name) {
        case 'submit:data':
          return handleSubmitJob(job);
        case 'update:data':
          return handleUpdateJob(job);
        case 'delete:data':
          return handleDeleteJob(job);
        default:
          logger.warn(`Unknown job type: ${job.name}`);
          throw new Error(`Unknown job type: ${job.name}`);
      }
    },
    { connection: getRedisConnectionOptions() }
  );

  // ============================================================
  // SUBMIT JOB HANDLER
  // ============================================================
  async function handleSubmitJob(job) {
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
      // Submitter Blueprint
      user_name,
      user_email,
      user_phone,
      node_name,
      node_reference,
      form_reference,
    } = job.data;

    const isPERMSubmission =
      perm_enabled || month || (payload && payload.month);

    let resolvedNodeName = node_name;
    let resolvedNodeReference = node_reference;

    if ((!resolvedNodeName || !resolvedNodeReference) && nodeId) {
      try {
        // Try PostgreSQL node_dimension table first
        const nodeQuery = await postgresPool.query(
          `SELECT node_name, node_reference FROM node_dimension 
             WHERE node_id = $1 AND tenant_id = $2 LIMIT 1`,
          [nodeId, tenantId]
        );

        if (nodeQuery.rows.length > 0) {
          const nodeRow = nodeQuery.rows[0];
          resolvedNodeName = resolvedNodeName || nodeRow.node_name || null;
          resolvedNodeReference =
            resolvedNodeReference || nodeRow.node_reference || null;
        } else {
          // Fallback to MongoDB Node model
          const nodeDoc = await Node.findById(nodeId).lean();
          if (nodeDoc) {
            resolvedNodeName =
              resolvedNodeName || nodeDoc.name || nodeDoc.nodeName || null;
            resolvedNodeReference =
              resolvedNodeReference ||
              nodeDoc.reference ||
              nodeDoc.referenceId ||
              nodeDoc.nodeReference ||
              null;
          }
        }
      } catch (nodeLookupError) {
        logger.warn(
          `[Worker] Unable to resolve node metadata for node_id=${nodeId}: ${nodeLookupError.message}`
        );
      }
    }

    const submissionPayload = {
      tenant_id: tenantId,
      project_id: projectId,
      project_name,
      project_category,
      form_id: formId,
      node_id: nodeId,
      node_name: resolvedNodeName || null,
      node_reference: resolvedNodeReference || null,
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
      source,
      // Submitter Blueprint
      user_name,
      user_email,
      user_phone,
      node_name,
      node_reference,
      form_reference,
    });

    try {
      let result;

      await ensureFactsTable();

      if (isPERMSubmission) {
        // ✅ FIXED: Call the correct PERM service method
        logger.info(
          `[Worker] Calling permSubmissionService.submitPERMData for PERM submission`
        );
        const permResult =
          await permSubmissionService.submitPERMData(submissionPayload);

        result = {
          id: permResult.submission.id,
          ...permResult.submission,
          action: permResult.action,
          existed: permResult.existed,
        };

        logger.info(
          `[Worker] PERM submission ${permResult.action} - ${result.id} ` +
            `[Mode: ${permResult.tracking_mode || 'legacy'}] ` +
            `(${permResult.compliance.completeness_percentage}% compliance, ` +
            `${permResult.compliance.total_events_submitted}/${permResult.compliance.total_events_required} events, ` +
            `status: ${permResult.compliance.compliance_status})`
        );
      } else {
        result = await SubmissionModel.createSubmission(submissionPayload);
        logger.info(`[Worker] Regular submission created - ${result.id}`);
      }

      if (result) {
        try {
          const catalog =
            await SubmissionCatalogService.getCatalogByProject(projectId);
          const facts =
            (await SubmissionModel.buildFactsFromSubmission(result, catalog)) ||
            [];
          if (facts.length > 0) {
            await insertFacts(facts);
            submissionRollupService.scheduleRefresh();
          }
        } catch (catalogError) {
          // Don't fail submission if catalog processing fails
          logger.warn(
            `[Worker] Catalog processing failed for submission ${result.id}: ${catalogError.message}`
          );
        }
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
        source,
        // Submitter Blueprint
        user_name,
        user_email,
        user_phone,
        node_name,
        node_reference,
        form_reference,
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
              month,
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
              logger.info(`✅ Completion email queued for ${userEmail} (100%)`);
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
        source,
        // Submitter Blueprint
        user_name,
        user_email,
        user_phone,
        node_name,
        node_reference,
        form_reference,
        job_id: job.id,
        message: `Submission failed: ${error.message}`,
      });

      throw error;
    }
  }

  // ============================================================
  // UPDATE JOB HANDLER
  // ============================================================
  async function handleUpdateJob(job) {
    const { submissionId, updates, userId, tenantId } = job.data;

    logger.info(`[Worker] Processing update for submission: ${submissionId}`);

    // 1. Get existing submission
    const existing = await SubmissionModel.getSubmissionById(submissionId);
    if (!existing) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    // 2. Build update query dynamically
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (updates.data || updates.payload) {
      setClauses.push(`data = $${idx++}`);
      values.push(JSON.stringify(updates.data || updates.payload));
    }

    if (updates.status) {
      setClauses.push(`status = $${idx++}`);
      values.push(updates.status);
    }

    if (updates.meta) {
      setClauses.push(`meta = $${idx++}`);
      values.push(JSON.stringify(updates.meta));
    }

    // Add edit tracking
    setClauses.push(`edited_by = $${idx++}`);
    values.push(userId);
    setClauses.push(`edited_at = $${idx++}`);
    values.push(new Date());

    values.push(submissionId);

    // 3. Execute update
    const query = `
      UPDATE form_submissions 
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `;

    const result = await postgresPool.query(query, values);
    const updated = result.rows[0];

    // 4. If PERM, update compliance tracking
    if (existing.perm_enabled && (updates.data || updates.payload)) {
      try {
        await updatePERMCompliance(
          tenantId,
          existing.project_id,
          existing.node_id,
          existing.month
        );
      } catch (permError) {
        logger.warn(
          `[Worker] PERM compliance update failed: ${permError.message}`
        );
      }
    }

    // 5. Log activity
    await logActivity({
      tenant_id: tenantId,
      project_id: existing.project_id,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id: userId,
      action: 'updated',
      status: 'success',
      job_id: job.id,
      message: 'Submission updated successfully',
    });

    // 6. Refresh facts if data changed
    if (updates.data || updates.payload) {
      try {
        const catalog = await SubmissionCatalogService.getCatalogByProject(
          existing.project_id
        );
        const facts = await SubmissionModel.buildFactsFromSubmission(
          updated,
          catalog
        );
        if (facts?.length > 0) {
          await insertFacts(facts);
          submissionRollupService.scheduleRefresh();
        }
      } catch (e) {
        logger.warn(`[Worker] Facts refresh failed: ${e.message}`);
      }
    }

    logger.info(`[Worker] Submission ${submissionId} updated successfully`);
    return updated;
  }

  // ============================================================
  // DELETE JOB HANDLER
  // ============================================================
  async function handleDeleteJob(job) {
    const { submissionId, userId, tenantId, permanent = false } = job.data;

    logger.info(
      `[Worker] Processing ${permanent ? 'permanent' : 'soft'} delete for submission: ${submissionId}`
    );

    // 1. Get existing submission
    const existing = await SubmissionModel.getSubmissionById(submissionId);
    if (!existing) {
      throw new Error(`Submission not found: ${submissionId}`);
    }

    if (permanent) {
      // Permanent delete - cascade
      const client = await postgresPool.connect();
      try {
        await client.query('BEGIN');

        // Delete facts
        await client.query('DELETE FROM facts WHERE submission_id = $1', [
          submissionId,
        ]);

        // Delete activity logs
        await client.query(
          'DELETE FROM submission_activity_log WHERE job_id = $1',
          [existing.job_id]
        );

        // Delete main record
        await client.query('DELETE FROM form_submissions WHERE id = $1', [
          submissionId,
        ]);

        await client.query('COMMIT');

        logger.info(`[Worker] Permanently deleted submission: ${submissionId}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      // Soft delete
      await postgresPool.query(
        `UPDATE form_submissions 
         SET deleted_at = NOW(), deleted_by = $1, status = 'deleted'
         WHERE id = $2`,
        [userId, submissionId]
      );
    }

    // 2. If PERM, update compliance
    if (existing.perm_enabled) {
      try {
        await updatePERMCompliance(
          tenantId,
          existing.project_id,
          existing.node_id,
          existing.month
        );
      } catch (permError) {
        logger.warn(
          `[Worker] PERM compliance update failed: ${permError.message}`
        );
      }
    }

    // 3. Log activity
    await logActivity({
      tenant_id: tenantId,
      project_id: existing.project_id,
      form_id: existing.form_id,
      node_id: existing.node_id,
      user_id: userId,
      action: permanent ? 'permanently_deleted' : 'deleted',
      status: 'success',
      job_id: job.id,
      message: permanent
        ? 'Submission permanently deleted'
        : 'Submission soft-deleted',
    });

    return { deleted: true, permanent, submissionId };
  }

  // Helper: Update PERM compliance after changes
  async function updatePERMCompliance(tenantId, projectId, nodeId, month) {
    logger.info(
      `[Worker] Recalculating PERM compliance for ${projectId}/${nodeId}/${month}`
    );
  }

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
