'use strict';

/**
 * Document Ingestion Worker — Phase 6 RAG
 *
 * Polls copilot.doc_ingestion_jobs for queued embedding jobs and runs the
 * chunk → embed → mark-indexed pipeline for each claimed job.
 *
 * Polling pattern: identical to compliance and data intelligence workers —
 * setInterval + FOR UPDATE SKIP LOCKED so multiple backend instances never
 * process the same job simultaneously.
 *
 * Retry logic: up to max_attempts (default 5). After the final failure the
 * doc is marked 'failed' and the job status is set to 'failed'. The doc
 * record's ingestion_status is updated accordingly so the API reflects it.
 */

const { postgresPool }           = require('../config/postgres');
const config                     = require('../config/config');
const logger                     = require('../config/logger');
const { embedDocumentChunks }    = require('../services/docEmbedding.service');
const submissionAttachmentService = require('../services/submissionAttachment.service');

const POLL_MS    = Number(config.rag?.workerIntervalMs || 30_000);
const WORKER_ID  = `doc-ingestion-worker-${process.pid}`;
const BATCH_SIZE = 5;

// ─── Job claim ────────────────────────────────────────────────────────────────

async function claimJobs() {
  const { rows } = await postgresPool.query(
    `SELECT id, tenant_id, doc_id, attempts, max_attempts
     FROM copilot.doc_ingestion_jobs
     WHERE status = 'queued'
     ORDER BY created_at ASC
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [BATCH_SIZE]
  );
  return rows;
}

async function markJobProcessing(jobId) {
  await postgresPool.query(
    `UPDATE copilot.doc_ingestion_jobs
     SET status = 'processing', started_at = now(),
         attempts = attempts + 1, updated_at = now()
     WHERE id = $1`,
    [jobId]
  );
}

async function markJobCompleted(jobId) {
  await postgresPool.query(
    `UPDATE copilot.doc_ingestion_jobs
     SET status = 'completed', completed_at = now(), updated_at = now()
     WHERE id = $1`,
    [jobId]
  );
}

async function markJobFailed(jobId, errorMessage, requeue) {
  const nextStatus = requeue ? 'queued' : 'failed';
  await postgresPool.query(
    `UPDATE copilot.doc_ingestion_jobs
     SET status = $1, error_message = $2, updated_at = now()
     WHERE id = $3`,
    [nextStatus, errorMessage, jobId]
  );
}

async function markDocFailed(docId) {
  await postgresPool.query(
    `UPDATE copilot.docs SET ingestion_status = 'failed', updated_at = now() WHERE id = $1`,
    [docId]
  );
}

async function getDocAttachmentRef(docId) {
  const { rows } = await postgresPool.query(
    `SELECT id, source_ref, metadata
     FROM copilot.docs
     WHERE id = $1
     LIMIT 1`,
    [docId]
  );
  return rows[0] || null;
}

async function syncAttachmentStatusFromDoc(docId, status, fields = {}) {
  const doc = await getDocAttachmentRef(docId);
  const attachmentId = doc?.source_ref;
  if (!attachmentId) return;

  await submissionAttachmentService.markIngestionStatus(attachmentId, status, fields);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function poll() {
  let jobs;
  try {
    jobs = await claimJobs();
  } catch (err) {
    logger.error('[DocIngestion] Job claim failed', { err: err.message });
    return;
  }

  for (const job of jobs) {
    const { id: jobId, tenant_id: tenantId, doc_id: docId, attempts, max_attempts } = job;

    await markJobProcessing(jobId);
    logger.info('[DocIngestion] Processing job', { jobId, tenantId, docId, attempt: attempts + 1 });

    try {
      const { embeddedCount, totalTokens } = await embedDocumentChunks({ docId, tenantId });
      await markJobCompleted(jobId);
      await syncAttachmentStatusFromDoc(docId, 'embedded', {
        ingestionReason: 'doc_embedding_completed',
        embeddedAt: new Date(),
      });
      logger.info('[DocIngestion] Job completed', { jobId, tenantId, docId, embeddedCount, totalTokens });
    } catch (err) {
      const exhausted = attempts + 1 >= max_attempts;
      logger.error('[DocIngestion] Job failed', {
        jobId, tenantId, docId, attempt: attempts + 1, exhausted, err: err.message,
      });

      await markJobFailed(jobId, err.message, !exhausted);
      if (exhausted) {
        await markDocFailed(docId);
        await syncAttachmentStatusFromDoc(docId, 'failed', {
          ingestionReason: 'doc_embedding_failed',
          ingestionError: err.message,
        });
      }
    }
  }
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

function createDocIngestionWorker() {
  logger.info('[DocIngestion] Worker starting', { pollIntervalMs: POLL_MS, workerId: WORKER_ID });
  const timer = setInterval(poll, POLL_MS);

  poll().catch(err => logger.error('[DocIngestion] Initial poll failed', { err: err.message }));

  return {
    close() {
      clearInterval(timer);
      logger.info('[DocIngestion] Worker stopped', { workerId: WORKER_ID });
    },
  };
}

module.exports = { createDocIngestionWorker };
