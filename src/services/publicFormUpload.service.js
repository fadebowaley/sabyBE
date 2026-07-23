const crypto = require('crypto');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { postgresPool } = require('../config/postgres');
const { ProjectForm } = require('../models');
const awsService = require('./aws.service');
const subscriptionService = require('./subscription.service');

const PUBLIC_UPLOAD_TABLE = 'public_form_uploads';
let ensuredTable = false;

const PUBLIC_UPLOAD_STATUS = {
  initiated: 'initiated',
  uploadedPendingVerification: 'uploaded_pending_verification',
  uploaded: 'uploaded',
  submitted: 'submitted',
  cancelled: 'cancelled',
  expired: 'expired',
};

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const bytesToMegabytes = (bytes) =>
  Math.max(0, Number(bytes || 0)) / (1024 * 1024);

const ensureUploadsTable = async () => {
  if (ensuredTable) return;

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS ${PUBLIC_UPLOAD_TABLE} (
      id UUID PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      form_id TEXT NOT NULL,
      field_id TEXT NOT NULL,
      reference TEXT NULL,
      access_token_hash TEXT NULL,
      session_key TEXT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'aws-s3',
      storage_path TEXT NOT NULL,
      storage_url TEXT NOT NULL,
      width INTEGER NULL,
      height INTEGER NULL,
      status TEXT NOT NULL DEFAULT 'initiated',
      submission_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await postgresPool.query(`
    CREATE INDEX IF NOT EXISTS idx_public_form_uploads_form_field
    ON ${PUBLIC_UPLOAD_TABLE} (tenant_id, project_id, form_id, field_id, status);
  `);

  await postgresPool.query(`
    CREATE INDEX IF NOT EXISTS idx_public_form_uploads_reference
    ON ${PUBLIC_UPLOAD_TABLE} (reference);
  `);

  await postgresPool.query(`
    CREATE INDEX IF NOT EXISTS idx_public_form_uploads_submission
    ON ${PUBLIC_UPLOAD_TABLE} (submission_id);
  `);

  ensuredTable = true;
};

const asObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const hashToken = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return crypto.createHash('sha256').update(raw).digest('hex');
};

const sanitizeFileName = (value) => {
  const cleaned = String(value || 'upload.bin')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned || 'upload.bin';
};

const normalizeSpecialFieldType = (element = {}) =>
  String(element?.properties?.fieldType || '').trim().toLowerCase();

const ensureProjectFormAccess = async ({ formId, tenantId = null, projectId = null }) => {
  const filter = {
    deletedAt: null,
  };

  if (/^[0-9a-fA-F]{24}$/.test(String(formId || ''))) {
    filter._id = formId;
  } else {
    filter.formId = String(formId || '').trim();
  }

  if (tenantId) filter.tenantId = String(tenantId);
  if (projectId) filter.projectId = String(projectId);

  const projectForm = await ProjectForm.findOne(filter).lean();
  if (!projectForm) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found.');
  }

  return projectForm;
};

const normalizeMimeTokens = (value) => {
  const tokens = String(value || '')
    .split(',')
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) return [];

  return Array.from(
    new Set(
      tokens.flatMap((token) => {
        if (token === 'jpg' || token === 'jpeg') return ['image/jpeg'];
        if (token === 'png') return ['image/png'];
        if (token === 'webp') return ['image/webp'];
        return [token];
      })
    )
  );
};

const isMimeTypeAllowed = (mimeType, acceptedMimeTypes = [], fileName = '') => {
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  const normalizedFileName = String(fileName || '').trim().toLowerCase();
  if (!normalizedMime) return false;
  if (!acceptedMimeTypes.length) return true;

  return acceptedMimeTypes.some((accepted) => {
    if (accepted === '*/*') {
      return true;
    }
    if (accepted.startsWith('.')) {
      return normalizedFileName.endsWith(accepted);
    }
    if (accepted.endsWith('/*')) {
      return normalizedMime.startsWith(accepted.slice(0, -1));
    }
    return accepted === normalizedMime;
  });
};

const resolveFieldConfig = (projectForm, fieldId) => {
  const elements = Array.isArray(projectForm?.elements) ? projectForm.elements : [];
  const element = elements.find((entry) => String(entry?.id || '').trim() === String(fieldId || '').trim());
  if (!element) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Upload field was not found on this form.');
  }

  const elementType = String(element?.type || '').trim().toLowerCase();
  const specialFieldType = normalizeSpecialFieldType(element);
  const elementLabel = String(
    element?.properties?.label || element?.label || element?.id || ''
  ).toLowerCase();
  const isDocumentUploadField = /\b(document|file|attachment|pdf|doc|upload document)\b/.test(
    elementLabel
  );
  const isProfileImageField =
    specialFieldType === 'profile_image_upload' && !isDocumentUploadField;
  const isGenericFileField =
    elementType === 'fileupload' ||
    elementType === 'file' ||
    specialFieldType === 'fileupload' ||
    (specialFieldType === 'profile_image_upload' && isDocumentUploadField);

  if (!isProfileImageField && !isGenericFileField) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This field does not support file uploads.');
  }

  const acceptedMimeTypes = isProfileImageField
    ? normalizeMimeTokens(element?.properties?.acceptedFormats).length
      ? normalizeMimeTokens(element?.properties?.acceptedFormats)
      : [...IMAGE_MIME_TYPES]
    : normalizeMimeTokens(
        element?.properties?.acceptedFormats || element?.properties?.accept || ''
      );

  const maxSizeMB = Math.max(
    1,
    Number(element?.properties?.maxSizeMB || (isProfileImageField ? 5 : 10))
  );

  return {
    element,
    elementType,
    specialFieldType,
    isProfileImageField,
    acceptedMimeTypes,
    maxSizeBytes: maxSizeMB * 1024 * 1024,
  };
};

const buildStorageKey = ({
  tenantId,
  projectId,
  formId,
  uploadId,
  fileName,
}) =>
  `public/forms/${sanitizeFileName(tenantId)}/${sanitizeFileName(projectId)}/${sanitizeFileName(
    formId
  )}/${uploadId}/${sanitizeFileName(fileName)}`;

const buildStorageUrl = (key) => {
  const bucket = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || 'halocrm-storage';
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

const insertUploadRecord = async (payload) => {
  await ensureUploadsTable();

  const query = `
    INSERT INTO ${PUBLIC_UPLOAD_TABLE} (
      id,
      tenant_id,
      project_id,
      form_id,
      field_id,
      reference,
      access_token_hash,
      session_key,
      original_name,
      mime_type,
      size_bytes,
      storage_provider,
      storage_path,
      storage_url,
      status,
      expires_at,
      metadata
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb
    )
    RETURNING *;
  `;

  const values = [
    payload.id,
    payload.tenantId,
    payload.projectId,
    payload.formId,
    payload.fieldId,
    payload.reference || null,
    payload.accessTokenHash || null,
    payload.sessionKey || null,
    payload.originalName,
    payload.mimeType,
    payload.sizeBytes,
    payload.storageProvider || 'aws-s3',
    payload.storagePath,
    payload.storageUrl,
    payload.status || PUBLIC_UPLOAD_STATUS.initiated,
    payload.expiresAt,
    JSON.stringify(payload.metadata || {}),
  ];

  const result = await postgresPool.query(query, values);
  return result.rows[0] || null;
};

const getUploadById = async (uploadId) => {
  await ensureUploadsTable();
  const result = await postgresPool.query(
    `
      SELECT *
      FROM ${PUBLIC_UPLOAD_TABLE}
      WHERE id = $1
      LIMIT 1
    `,
    [uploadId]
  );
  return result.rows[0] || null;
};

const listUploadsBySubmission = async (submissionId) => {
  await ensureUploadsTable();
  const result = await postgresPool.query(
    `
      SELECT *
      FROM ${PUBLIC_UPLOAD_TABLE}
      WHERE submission_id = $1
      ORDER BY created_at ASC
    `,
    [submissionId]
  );
  return result.rows || [];
};

const initiatePublicUpload = async ({
  formId,
  tenantId = null,
  projectId = null,
  fieldId,
  fileName,
  mimeType,
  sizeBytes,
  reference = null,
  accessToken = null,
  sessionKey = null,
}) => {
  const projectForm = await ensureProjectFormAccess({
    formId,
    tenantId,
    projectId,
  });

  const fieldConfig = resolveFieldConfig(projectForm, fieldId);
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  const normalizedSize = Number(sizeBytes || 0);

  if (!normalizedMime) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A file MIME type is required.');
  }

  if (!Number.isFinite(normalizedSize) || normalizedSize <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A valid file size is required.');
  }

  if (normalizedSize > fieldConfig.maxSizeBytes) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'File exceeds the allowed upload size.');
  }

  if (!isMimeTypeAllowed(normalizedMime, fieldConfig.acceptedMimeTypes, fileName)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This file type is not allowed for the selected field.');
  }

  await subscriptionService.assertSubscriptionLimit({
    tenantId: projectForm.tenantId,
    limitKey: 'storageMb',
    delta: bytesToMegabytes(normalizedSize),
    message:
      'This workspace has reached its storage limit. Upgrade billing before accepting more public file uploads.',
  });

  const uploadId = crypto.randomUUID();
  const key = buildStorageKey({
    tenantId: projectForm.tenantId,
    projectId: projectForm.projectId,
    formId: projectForm.formId || projectForm.projectId || formId,
    uploadId,
    fileName,
  });
  const uploadUrl = await awsService.generatePresignedUploadUrl(
    key,
    normalizedMime,
    600
  );
  const storageUrl = buildStorageUrl(key);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const uploadRecord = await insertUploadRecord({
    id: uploadId,
    tenantId: projectForm.tenantId,
    projectId: projectForm.projectId,
    formId: projectForm.formId || projectForm.projectId || formId,
    fieldId,
    reference: reference || null,
    accessTokenHash: hashToken(accessToken),
    sessionKey: sessionKey || null,
    originalName: sanitizeFileName(fileName),
    mimeType: normalizedMime,
    sizeBytes: normalizedSize,
    storageProvider: 'aws-s3',
    storagePath: key,
    storageUrl,
    expiresAt,
    metadata: {
      fieldType: fieldConfig.specialFieldType || fieldConfig.elementType,
      acceptedMimeTypes: fieldConfig.acceptedMimeTypes,
    },
  });

  return {
    uploadId,
    uploadUrl,
    fileUrl: storageUrl,
    key,
    expiresAt: uploadRecord?.expires_at || expiresAt.toISOString(),
    fieldId,
  };
};

const completePublicUpload = async ({
  uploadId,
  reference = null,
  accessToken = null,
  sessionKey = null,
  width = null,
  height = null,
}) => {
  const upload = await getUploadById(uploadId);
  if (!upload) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Upload record was not found.');
  }

  if (upload.status === PUBLIC_UPLOAD_STATUS.cancelled || upload.status === PUBLIC_UPLOAD_STATUS.expired) {
    throw new ApiError(httpStatus.GONE, 'This upload is no longer available.');
  }

  if (upload.expires_at && new Date(upload.expires_at).getTime() < Date.now()) {
    await postgresPool.query(
      `
        UPDATE ${PUBLIC_UPLOAD_TABLE}
        SET status = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [uploadId, PUBLIC_UPLOAD_STATUS.expired]
    );
    throw new ApiError(httpStatus.GONE, 'This upload session has expired.');
  }

  const expectedAccessTokenHash = upload.access_token_hash || null;
  if (expectedAccessTokenHash && expectedAccessTokenHash !== hashToken(accessToken)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Upload session does not match this secure form session.');
  }

  if (!expectedAccessTokenHash && upload.reference && reference && upload.reference !== reference) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Upload reference does not match this form session.');
  }

  if (upload.session_key && sessionKey && upload.session_key !== sessionKey) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Upload session key does not match this browser session.');
  }

  const nextWidth = width == null ? null : Number(width);
  const nextHeight = height == null ? null : Number(height);
  const nextSize = Number(upload.size_bytes || 0);
  const nextMimeType = String(upload.mime_type || '').trim().toLowerCase();

  const result = await postgresPool.query(
    `
      UPDATE ${PUBLIC_UPLOAD_TABLE}
      SET
        status = $2,
        size_bytes = $3,
        mime_type = $4,
        width = $5,
        height = $6,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
    [
      uploadId,
      PUBLIC_UPLOAD_STATUS.uploadedPendingVerification,
      Number.isFinite(nextSize) && nextSize > 0 ? nextSize : upload.size_bytes,
      nextMimeType || upload.mime_type,
      Number.isFinite(nextWidth) && nextWidth > 0 ? Math.round(nextWidth) : null,
      Number.isFinite(nextHeight) && nextHeight > 0 ? Math.round(nextHeight) : null,
    ]
  );

  const row = result.rows[0];
  return {
    uploadId: row.id,
    fileUrl: row.storage_url,
    key: row.storage_path,
    mimeType: row.mime_type,
    size: Number(row.size_bytes || 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    status: row.status,
    name: row.original_name,
  };
};

const resolveUploadForSubmission = async ({
  uploadId,
  projectForm,
  fieldId,
  reference = null,
  accessToken = null,
  sessionKey = null,
}) => {
  const upload = await getUploadById(uploadId);
  if (!upload) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Uploaded file reference is invalid.');
  }

  if (
    upload.status !== PUBLIC_UPLOAD_STATUS.uploadedPendingVerification &&
    upload.status !== PUBLIC_UPLOAD_STATUS.uploaded &&
    upload.status !== PUBLIC_UPLOAD_STATUS.submitted
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Uploaded file is not complete yet.');
  }

  const normalizedFieldId = String(fieldId || '').trim();
  const expectedFormId = String(projectForm?.formId || projectForm?.projectId || '').trim();
  const expectedTenantId = String(projectForm?.tenantId || '').trim();
  const expectedProjectId = String(projectForm?.projectId || '').trim();

  if (
    String(upload.tenant_id || '').trim() !== expectedTenantId ||
    String(upload.project_id || '').trim() !== expectedProjectId ||
    String(upload.form_id || '').trim() !== expectedFormId ||
    String(upload.field_id || '').trim() !== normalizedFieldId
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Uploaded file does not belong to this form field.');
  }

  const expectedAccessTokenHash = String(upload.access_token_hash || '').trim();
  if (expectedAccessTokenHash && expectedAccessTokenHash !== String(hashToken(accessToken) || '').trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Uploaded file does not belong to this secure form session.');
  }

  if (
    !expectedAccessTokenHash &&
    upload.reference &&
    reference &&
    String(upload.reference) !== String(reference)
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Uploaded file does not belong to this public form session.');
  }

  if (upload.session_key && sessionKey && String(upload.session_key) !== String(sessionKey)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Uploaded file does not belong to this browser session.');
  }

  return {
    upload,
    value: {
      uploadId: String(upload.id),
      name: upload.original_name,
      filename: upload.original_name,
      size: Number(upload.size_bytes || 0),
      type: upload.mime_type,
      mimeType: upload.mime_type,
      url: upload.storage_url,
      key: upload.storage_path,
      storagePath: upload.storage_path,
      storageProvider: upload.storage_provider || 'aws-s3',
      width: upload.width == null ? null : Number(upload.width),
      height: upload.height == null ? null : Number(upload.height),
      status: upload.status,
    },
  };
};

const bindUploadsToSubmission = async ({ submissionId, submissionData = {} }) => {
  await ensureUploadsTable();

  const uploadIds = [];
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.uploadId) {
      uploadIds.push(String(value.uploadId));
    }
    Object.values(value).forEach(walk);
  };
  walk(submissionData);

  const uniqueUploadIds = [...new Set(uploadIds.filter(Boolean))];
  if (!uniqueUploadIds.length) {
    return [];
  }

  const result = await postgresPool.query(
    `
      UPDATE ${PUBLIC_UPLOAD_TABLE}
      SET
        submission_id = $2,
        status = $3,
        updated_at = NOW()
      WHERE id = ANY($1::uuid[])
      RETURNING *;
    `,
    [uniqueUploadIds, submissionId, PUBLIC_UPLOAD_STATUS.submitted]
  );

  return result.rows || [];
};

module.exports = {
  PUBLIC_UPLOAD_STATUS,
  ensureUploadsTable,
  resolveFieldConfig,
  isMimeTypeAllowed,
  initiatePublicUpload,
  completePublicUpload,
  resolveUploadForSubmission,
  bindUploadsToSubmission,
  listUploadsBySubmission,
};
