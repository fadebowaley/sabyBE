const { Worker } = require('bullmq');
const logger = require('../config/logger');
const { getRedisConnectionOptions } = require('../config/redis');
const {
  SUBMISSION_ATTACHMENT_INGESTION_QUEUE_NAME,
} = require('../queues/submissionAttachmentIngestion.queue');
const submissionAttachmentIngestionService = require('../services/submissionAttachmentIngestion.service');

const createSubmissionAttachmentIngestionWorker = async () => {
  const worker = new Worker(
    SUBMISSION_ATTACHMENT_INGESTION_QUEUE_NAME,
    async (job) =>
      submissionAttachmentIngestionService.ingestSubmissionAttachment(job.data),
    {
      connection: getRedisConnectionOptions(),
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    logger.info(
      `[Submission Attachment Ingestion Worker] Job completed: ${job.id}`
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `[Submission Attachment Ingestion Worker] Job failed: ${job?.id}`,
      err?.message || err
    );
  });

  logger.info('🧠 Submission attachment ingestion worker initialized');
  return worker;
};

module.exports = {
  createSubmissionAttachmentIngestionWorker,
};
