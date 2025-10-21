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
  };

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
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
  }));

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
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
  };

  const result = await storageService.getFiles(filter, options, userInfo);
  res.send(result);
});

const getFile = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };

  const file = await storageService.getFileById(req.params.fileId, userInfo);
  res.send(file);
});

const deleteFile = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
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

const searchFiles = catchAsync(async (req, res) => {
  const { q: query } = req.query;

  if (!query) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Search query is required');
  }

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };

  const files = await storageService.searchFiles(query, userInfo);
  res.send(files);
});

const getStorageStats = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };

  const stats = await storageService.getStorageStats(userInfo);
  res.send(stats);
});

const moveFile = catchAsync(async (req, res) => {
  const { folderId } = req.body;
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };
  const file = await storageService.getFileById(req.params.fileId, userInfo);
  file.folderId = folderId || null;
  await file.save();
  res.send(file);
});

const copyFile = catchAsync(async (req, res) => {
  const { folderId, newName } = req.body;

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };

  const originalFile = await storageService.getFileById(
    req.params.fileId,
    userInfo
  );

  // Copy file in cloud storage
  const {
    StorageProviderFactory,
  } = require('../services/providers/storageProvider');
  const { nanoid } = require('nanoid');
  const path = require('path');

  const fileExtension = path.extname(originalFile.originalName);
  const uniqueFileName = `${nanoid(16)}${fileExtension}`;
  const newStoragePath = `${userInfo.tenantId}/${userInfo.userId}/${uniqueFileName}`;

  const provider = StorageProviderFactory.create(
    originalFile.storageProvider || 'aws-s3'
  );
  await provider.copy(originalFile.storagePath, newStoragePath);

  // Create new file record
  const { Storage } = require('../models');
  const copiedFile = await Storage.create({
    tenantId: userInfo.tenantId,
    userId: userInfo.userId,
    folderId: folderId || originalFile.folderId,
    originalName: newName || `Copy of ${originalFile.originalName}`,
    fileName: uniqueFileName,
    fileSize: originalFile.fileSize,
    mimeType: originalFile.mimeType,
    fileExtension: originalFile.fileExtension,
    storageProvider: originalFile.storageProvider,
    storagePath: newStoragePath,
    storageUrl: originalFile.storageUrl.replace(
      originalFile.storagePath,
      newStoragePath
    ),
  });

  res.status(httpStatus.CREATED).send(copiedFile);
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
  searchFiles,
  getStorageStats,
  moveFile,
  copyFile,
};
