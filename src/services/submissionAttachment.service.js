const { postgresPool } = require('../config/postgres');
const { Storage, ProjectForm } = require('../models');
const {
  queueSubmissionAttachmentIngestion,
} = require('../queues/submissionAttachmentIngestion.queue');

const collectAttachmentCandidates = (payload, fieldKey = null, acc = []) => {
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectAttachmentCandidates(item, fieldKey, acc));
    return acc;
  }

  if (!payload || typeof payload !== 'object') {
    return acc;
  }

  if (payload.fileId || payload.storageFileId) {
    acc.push({
      fieldId: fieldKey || payload.fieldId || 'attachment',
      storageFileId: payload.storageFileId || payload.fileId,
      originalName: payload.originalName || payload.name || payload.filename,
      mimeType: payload.mimeType,
      sizeBytes: payload.size || payload.fileSize,
      storageUrl: payload.url,
    });
    return acc;
  }

  Object.entries(payload).forEach(([key, value]) => {
    collectAttachmentCandidates(value, fieldKey || key, acc);
  });

  return acc;
};

const createAttachmentRecord = async (payload, client = null) => {
  const db = client || postgresPool;
  const query = `
    INSERT INTO submission_attachments (
      tenant_id,
      project_id,
      project_form_id,
      submission_id,
      field_id,
      storage_file_id,
      node_id,
      uploaded_by,
      filename,
      original_name,
      mime_type,
      size_bytes,
      storage_provider,
      storage_path,
      storage_url,
      status,
      ingestion_mode,
      ingestion_status,
      ingestion_reason,
      ingestion_error,
      embedded_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
    )
    RETURNING *;
  `;

  const values = [
    payload.tenantId,
    payload.projectId,
    payload.projectFormId || null,
    payload.submissionId,
    payload.fieldId,
    payload.storageFileId || null,
    payload.nodeId || null,
    payload.uploadedBy || null,
    payload.filename,
    payload.originalName,
    payload.mimeType || null,
    payload.sizeBytes || null,
    payload.storageProvider || null,
    payload.storagePath || null,
    payload.storageUrl || null,
    payload.status || 'active',
    payload.ingestionMode || 'off',
    payload.ingestionStatus || 'pending',
    payload.ingestionReason || null,
    payload.ingestionError || null,
    payload.embeddedAt || null,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
};

const listBySubmission = async (submissionId, tenantId) => {
  const { rows } = await postgresPool.query(
    `SELECT *
     FROM submission_attachments
     WHERE tenant_id = $1 AND submission_id = $2 AND status <> 'deleted'
     ORDER BY created_at ASC`,
    [tenantId, submissionId]
  );
  return rows;
};

const getById = async (id, tenantId = null) => {
  const query = tenantId
    ? `SELECT *
       FROM submission_attachments
       WHERE id = $1 AND tenant_id = $2 AND status <> 'deleted'
       LIMIT 1`
    : `SELECT *
       FROM submission_attachments
       WHERE id = $1 AND status <> 'deleted'
       LIMIT 1`;
  const values = tenantId ? [id, tenantId] : [id];
  const { rows } = await postgresPool.query(query, values);
  return rows[0] || null;
};

const markIngestionStatus = async (id, status, fields = {}) => {
  const { rows } = await postgresPool.query(
    `UPDATE submission_attachments
     SET ingestion_status = $2,
         ingestion_reason = COALESCE($3, ingestion_reason),
         ingestion_error = $4,
         embedded_at = COALESCE($5, embedded_at),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status,
      fields.ingestionReason || null,
      fields.ingestionError || null,
      fields.embeddedAt || null,
    ]
  );
  return rows[0] || null;
};

const softDelete = async (id, tenantId) => {
  const { rows } = await postgresPool.query(
    `UPDATE submission_attachments
     SET status = 'deleted', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2
     RETURNING *`,
    [id, tenantId]
  );
  return rows[0] || null;
};

const createAttachmentsFromSubmission = async ({
  submission,
  tenantId,
  projectId,
  userId = null,
  nodeId = null,
}) => {
  const submissionData = submission?.data || {};
  const candidates = collectAttachmentCandidates(submissionData);
  if (!candidates.length) {
    return [];
  }

  const projectForm = await ProjectForm.findOne({ projectId, tenantId })
    .select('_id')
    .lean();

  const attachments = [];
  for (const candidate of candidates) {
    const storageFile = await Storage.findOne({
      _id: candidate.storageFileId,
      tenantId,
      status: 'active',
    }).lean();

    if (!storageFile) {
      continue;
    }

    const attachment = await createAttachmentRecord({
      tenantId,
      projectId,
      projectFormId: projectForm?._id ? String(projectForm._id) : null,
      submissionId: submission.id,
      fieldId: candidate.fieldId,
      storageFileId: String(storageFile._id),
      nodeId,
      uploadedBy: userId,
      filename: storageFile.fileName,
      originalName: storageFile.originalName || candidate.originalName || storageFile.fileName,
      mimeType: storageFile.mimeType || candidate.mimeType,
      sizeBytes: storageFile.fileSize || candidate.sizeBytes,
      storageProvider: storageFile.storageProvider,
      storagePath: storageFile.storagePath,
      storageUrl: storageFile.storageUrl || candidate.storageUrl,
      ingestionMode: storageFile.ingestionMode || 'off',
      ingestionStatus: storageFile.ingestionStatus || 'pending',
      ingestionReason: storageFile.ingestionReason || null,
    });

    attachments.push(attachment);

    if (attachment.ingestion_status === 'queued') {
      await queueSubmissionAttachmentIngestion({
        attachmentId: attachment.id,
        tenantId,
      });
    }
  }

  return attachments;
};

module.exports = {
  createAttachmentRecord,
  listBySubmission,
  getById,
  markIngestionStatus,
  softDelete,
  createAttachmentsFromSubmission,
};
