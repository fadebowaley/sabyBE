const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const { buildJobOptions } = require('./queueDefaults');

const SUBMISSION_ATTACHMENT_INGESTION_QUEUE_NAME = 'submissionAttachmentIngestionQueue';

const submissionAttachmentIngestionQueue = new Queue(
  SUBMISSION_ATTACHMENT_INGESTION_QUEUE_NAME,
  {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: buildJobOptions('standard'),
  }
);

const queueSubmissionAttachmentIngestion = async (payload = {}, options = {}) => {
  const attachmentId = payload.attachmentId;
  if (!attachmentId) {
    throw new Error('attachmentId is required to queue submission attachment ingestion');
  }

  return submissionAttachmentIngestionQueue.add(
    'submission-attachment:ingest',
    payload,
    {
      ...buildJobOptions('standard'),
      jobId: options.jobId || `submission-attachment-${attachmentId}`,
      ...options,
    }
  );
};

module.exports = {
  SUBMISSION_ATTACHMENT_INGESTION_QUEUE_NAME,
  submissionAttachmentIngestionQueue,
  queueSubmissionAttachmentIngestion,
};
