const path = require('path');
const logger = require('../config/logger');
const { Storage } = require('../models');
const submissionAttachmentService = require('./submissionAttachment.service');
const { ingestDocument } = require('./docIngestion.service');
const { StorageProviderFactory } = require('./providers/storageProvider');
const { isTextIngestible } = require('./storageIngestionPolicy.service');

const extractTextFromAttachment = async (attachment) => {
  const storagePath = attachment.storage_path;
  const mimeType = attachment.mime_type;
  const fileExtension = path.extname(
    attachment.original_name || attachment.filename || ''
  );

  if (!isTextIngestible({ mimeType, fileExtension })) {
    return { status: 'not_ingestible', contentText: null };
  }

  const provider = StorageProviderFactory.create(attachment.storage_provider || 'aws-s3');
  const downloadUrl = await provider.generatePresignedUrl(storagePath, 300);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch attachment payload (${response.status})`);
  }

  const lowerMime = String(mimeType || '').toLowerCase();
  if (
    lowerMime.startsWith('text/') ||
    lowerMime === 'application/json' ||
    lowerMime === 'text/csv' ||
    lowerMime === 'text/html'
  ) {
    return { status: 'ready', contentText: await response.text() };
  }

  return { status: 'not_ingestible', contentText: null };
};

const ingestSubmissionAttachment = async ({ attachmentId, tenantId = null }) => {
  const attachment = await submissionAttachmentService.getById(
    attachmentId,
    tenantId
  );
  if (!attachment) {
    throw new Error('Submission attachment not found');
  }

  if (attachment.ingestion_mode === 'off') {
    await submissionAttachmentService.markIngestionStatus(attachment.id, 'skipped', {
      ingestionReason: attachment.ingestion_reason || 'ingestion_off',
    });
    return { skipped: true, reason: 'ingestion_off' };
  }

  await submissionAttachmentService.markIngestionStatus(attachment.id, 'extracting');

  const extracted = await extractTextFromAttachment(attachment);
  if (extracted.status === 'not_ingestible' || !extracted.contentText?.trim()) {
    await submissionAttachmentService.markIngestionStatus(attachment.id, 'not_ingestible', {
      ingestionReason: attachment.ingestion_reason || 'unsupported_mime_type_or_empty_content',
    });
    return { skipped: true, reason: 'not_ingestible' };
  }

  const storageFile = attachment.storage_file_id
    ? await Storage.findById(attachment.storage_file_id).lean()
    : null;

  const ingestResult = await ingestDocument({
    tenantId: attachment.tenant_id,
    title: attachment.original_name || attachment.filename,
    source: 'upload',
    sourceRef: attachment.id,
    s3Key: attachment.storage_path,
    url: attachment.storage_url,
    mimeType: attachment.mime_type || 'text/plain',
    contentText: extracted.contentText,
    accessPolicy: {
      ownerType: 'submission',
      submissionId: attachment.submission_id,
      projectId: attachment.project_id,
    },
    metadata: {
      submissionId: attachment.submission_id,
      projectId: attachment.project_id,
      projectFormId: attachment.project_form_id,
      storageFileId: attachment.storage_file_id,
      attachmentId: attachment.id,
      source: 'submission_upload',
      storageOwnerType: storageFile?.ownerType || 'submission',
    },
    createdBy: attachment.uploaded_by,
  });

  await submissionAttachmentService.markIngestionStatus(attachment.id, 'queued', {
    ingestionReason: attachment.ingestion_reason || 'doc_embedding_job_queued',
  });

  logger.info('[SubmissionAttachmentIngestion] Attachment embedded', {
    attachmentId: attachment.id,
    tenantId: attachment.tenant_id,
    docId: ingestResult.docId,
  });

  return ingestResult;
};

module.exports = {
  ingestSubmissionAttachment,
};
