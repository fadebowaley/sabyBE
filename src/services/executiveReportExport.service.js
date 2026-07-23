const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const ExecutiveIntelligenceReportExport = require('../models/executiveIntelligenceReportExport.model');
const { StorageProviderFactory } = require('./providers/storageProvider');

const DEFAULT_EXPORT_TTL_HOURS = 24;
const DOWNLOAD_URL_TTL_SECONDS = 300;

const normalizeUserId = (user = {}) =>
  String(user.id || user._id || user.userId || '').trim();

const isPrivileged = (user = {}) =>
  Boolean(user.isOwner || user.isSuper || user.isAdmin || user.isSaby);

const getDownloadEndpoint = (exportId) =>
  `/v1/executive-intelligence/exports/${encodeURIComponent(exportId)}/download`;

const buildBuffer = (artifact = {}) => {
  if (artifact.format === 'csv') {
    return Buffer.from(String(artifact.content || ''), 'utf8');
  }
  if (['xlsx', 'pdf', 'docx'].includes(artifact.format)) {
    return Buffer.from(String(artifact.content_base64 || ''), 'base64');
  }
  if (artifact.format === 'html') {
    return Buffer.from(String(artifact.content || ''), 'utf8');
  }
  throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported export format');
};

const publicDescriptor = (record) => ({
  export_id: record.exportId,
  format: record.format,
  filename: record.filename,
  content_type: record.contentType,
  byte_size: record.byteSize,
  download_endpoint: getDownloadEndpoint(record.exportId),
  expires_at: record.expiresAt?.toISOString ? record.expiresAt.toISOString() : record.expiresAt,
  persisted: true,
});

const persistOne = async ({ tenantId, userId, requestId, reportModel, artifact }) => {
  const providerName = process.env.STORAGE_PROVIDER || 'aws-s3';
  const provider = StorageProviderFactory.create(providerName);
  const buffer = buildBuffer(artifact);
  const expiresAt = new Date(Date.now() + DEFAULT_EXPORT_TTL_HOURS * 60 * 60 * 1000);
  const uploadResult = await provider.upload(buffer, artifact.storage_key, artifact.content_type);

  const record = await ExecutiveIntelligenceReportExport.create({
    tenantId,
    userId,
    requestId,
    reportId: reportModel.report_id,
    format: artifact.format,
    filename: artifact.filename,
    contentType: artifact.content_type,
    byteSize: buffer.byteLength,
    storageProvider: uploadResult.provider || providerName,
    storageKey: uploadResult.key || artifact.storage_key,
    storageUrl: uploadResult.url || null,
    expiresAt,
    metadata: {
      reportTitle: reportModel.title,
      reportKind: reportModel.kind,
      artifactVersion: reportModel.audit?.artifact_version || null,
      reportArtifactVersion: reportModel.audit?.report_artifact_version || null,
      generatedAt: artifact.generated_at || null,
    },
  });

  return publicDescriptor(record);
};

const persistRenderedReportExports = async ({ tenantId, userId, requestId, reportModel, renderedReport = {} }) => {
  const persisted = {};

  if (renderedReport.csv?.content) {
    persisted.csv = await persistOne({
      tenantId,
      userId,
      requestId,
      reportModel,
      artifact: renderedReport.csv,
    });
  }

  if (renderedReport.xlsx?.content_base64) {
    persisted.xlsx = await persistOne({
      tenantId,
      userId,
      requestId,
      reportModel,
      artifact: renderedReport.xlsx,
    });
  }

  if (renderedReport.html?.content) {
    persisted.html = await persistOne({
      tenantId,
      userId,
      requestId,
      reportModel,
      artifact: renderedReport.html,
    });
  }

  if (renderedReport.pdf?.content_base64) {
    persisted.pdf = await persistOne({
      tenantId,
      userId,
      requestId,
      reportModel,
      artifact: renderedReport.pdf,
    });
  }

  if (renderedReport.docx?.content_base64) {
    persisted.docx = await persistOne({
      tenantId,
      userId,
      requestId,
      reportModel,
      artifact: renderedReport.docx,
    });
  }

  return persisted;
};

const getExportDownload = async ({ tenantId, user, exportId }) => {
  const record = await ExecutiveIntelligenceReportExport.findOne({
    exportId,
    tenantId,
    status: 'active',
  }).lean();

  if (!record) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Intelligence export not found');
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    await ExecutiveIntelligenceReportExport.updateOne(
      { _id: record._id },
      { $set: { status: 'expired' } }
    );
    throw new ApiError(httpStatus.GONE, 'Intelligence export has expired');
  }

  const userId = normalizeUserId(user);
  if (!isPrivileged(user) && String(record.userId) !== userId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this Intelligence export');
  }

  const provider = StorageProviderFactory.create(record.storageProvider || process.env.STORAGE_PROVIDER || 'aws-s3');
  const downloadUrl = await provider.generatePresignedUrl(record.storageKey, DOWNLOAD_URL_TTL_SECONDS);

  return {
    downloadUrl,
    fileName: record.filename,
    contentType: record.contentType,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  };
};

module.exports = {
  persistRenderedReportExports,
  getExportDownload,
};
