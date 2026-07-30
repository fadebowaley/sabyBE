const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { storageService } = require('../services');

const uploadFile = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No file uploaded');
  }

  const fileData = {
    ...req.file,
    folderId: req.body.folderId,
    description: req.body.description,
    tags: req.body.tags,
    ingestionMode: req.body.ingestionMode,
  };

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const file = await storageService.uploadFile(fileData, userInfo);
  res.status(httpStatus.CREATED).send(file);
});

const uploadMultipleFiles = catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No files uploaded');
  }

  const filesData = req.files.map((file) => ({
    ...file,
    folderId: req.body.folderId,
    description: req.body.description,
    tags: req.body.tags,
    ingestionMode: req.body.ingestionMode,
  }));

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const files = await storageService.uploadMultipleFiles(filesData, userInfo);
  res.status(httpStatus.CREATED).send({
    message: `${files.length} files uploaded successfully`,
    files,
  });
});

const getFiles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['folderId', 'mimeType', 'fileExtension']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const result = await storageService.getFiles(filter, options, userInfo);
  res.send(result);
});

const getFile = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const file = await storageService.getFileById(req.params.fileId, userInfo);
  res.send(file);
});

const deleteFile = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  await storageService.deleteFile(req.params.fileId, userInfo);
  res.status(httpStatus.NO_CONTENT).send();
});

const shareFile = catchAsync(async (req, res) => {
  const shareOptions = pick(req.body, [
    'expiryDate',
    'allowDownload',
    'allowPreview',
    'password',
  ]);

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const shareResult = await storageService.shareFile(
    req.params.fileId,
    shareOptions,
    userInfo
  );
  res.send(shareResult);
});

const getSharedFile = catchAsync(async (req, res) => {
  const { shareToken } = req.params;
  const { password } = req.query;

  const file = await storageService.getSharedFile(shareToken, password);
  res.send(file);
});

const downloadSharedFile = catchAsync(async (req, res) => {
  const { shareToken } = req.params;
  const { password } = req.query;

  const file = await storageService.getSharedFile(shareToken, password);

  if (!file.shareSettings.allowDownload) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Download not allowed for this file'
    );
  }

  // Generate presigned URL for download
  const {
    StorageProviderFactory,
  } = require('../services/providers/storageProvider');
  const provider = StorageProviderFactory.create(
    file.storageProvider || 'aws-s3'
  );
  const downloadUrl = await provider.generatePresignedUrl(
    file.storagePath,
    300
  ); // 5 minutes

  res.send({ downloadUrl, fileName: file.originalName });
});

const ALLOWED_DIRECT_DOWNLOAD_PREFIXES = ['public/forms/', 'public/uploads/', 'uploads/'];

const normalizeStorageDownloadKey = (rawKey = '') => {
  const value = String(rawKey || '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    } catch {
      return '';
    }
  }

  return value.replace(/^\/+/, '');
};

const downloadFileByKey = catchAsync(async (req, res) => {
  const rawKey = req.query.key || req.query.url || '';
  const key = normalizeStorageDownloadKey(rawKey);

  if (!key || !ALLOWED_DIRECT_DOWNLOAD_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid storage key');
  }

  const {
    StorageProviderFactory,
  } = require('../services/providers/storageProvider');
  const provider = StorageProviderFactory.create('aws-s3');
  const downloadUrl = await provider.generatePresignedUrl(key, 300);

  res.send({
    downloadUrl,
    fileName: decodeURIComponent(key.split('/').pop() || 'File'),
  });
});

const searchFiles = catchAsync(async (req, res) => {
  const { q: query } = req.query;

  if (!query) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search query is required');
  }

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const files = await storageService.searchFiles(query, userInfo);
  res.send(files);
});

const getStorageStats = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const stats = await storageService.getStorageStats(userInfo);
  res.send(stats);
});

const moveFile = catchAsync(async (req, res) => {
  const { folderId } = req.body;
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };
  const file = await storageService.moveFile(req.params.fileId, folderId, userInfo);
  res.send(file);
});

const copyFile = catchAsync(async (req, res) => {
  const { folderId, newName } = req.body;

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };
  const copiedFile = await storageService.copyFile(req.params.fileId, {
    folderId,
    newName,
  }, userInfo);

  res.status(httpStatus.CREATED).send(copiedFile);
});

const updateFileMetadata = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const file = await storageService.updateFileMetadata(
    req.params.fileId,
    req.body,
    userInfo
  );
  res.send(file);
});

const updateFilePermissions = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const file = await storageService.updateFilePermissions(
    req.params.fileId,
    req.body.permissions,
    req.body.visibility,
    userInfo
  );
  res.send(file);
});

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  getFiles,
  getFile,
  deleteFile,
  shareFile,
  getSharedFile,
  downloadSharedFile,
  downloadFileByKey,
  searchFiles,
  getStorageStats,
  moveFile,
  copyFile,
  updateFileMetadata,
  updateFilePermissions,
};
