const httpStatus = require('http-status');
const path = require('path');
const { nanoid } = require('nanoid');
const {
  Storage,
  StorageFolder,
  StorageSettings,
  StorageActivity,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { StorageProviderFactory } = require('./providers/storageProvider');
const {
  buildAccessibleStorageQuery,
  canReadStorageEntity,
  canWriteStorageEntity,
  canAdminStorageEntity,
} = require('./storageAccess.service');
const { resolveIngestionDecision } = require('./storageIngestionPolicy.service');

const mergeWithAccessQuery = (accessQuery, extra = {}) => ({
  $and: [accessQuery, extra],
});

const uploadFile = async (fileData, userInfo) => {
  const { tenantId, userId } = userInfo;

  // Check storage quota
  await checkStorageQuota(tenantId, fileData.size);

  // Generate unique filename
  const fileExtension = path.extname(fileData.originalname);
  const uniqueFileName = `${nanoid(16)}${fileExtension}`;
  const storagePath = `${tenantId}/${userId}/${uniqueFileName}`;
  const ingestionDecision = await resolveIngestionDecision({
    tenantId,
    uploadInput: { ingestionMode: fileData.ingestionMode },
    file: {
      mimeType: fileData.mimetype,
      fileExtension,
      storagePath,
      originalName: fileData.originalname,
    },
    ownerType: fileData.ownerType || 'user',
    sourceType: fileData.sourceType || 'manual_upload',
  });

  // Get storage provider
  const provider = StorageProviderFactory.create(
    process.env.STORAGE_PROVIDER || 'aws-s3'
  );

  // Upload to cloud storage
  const uploadResult = await provider.upload(
    fileData.buffer,
    storagePath,
    fileData.mimetype
  );

  // Create file record
  const fileRecord = await Storage.create({
    tenantId,
    userId,
    ownerType: fileData.ownerType || 'user',
    ownerId: fileData.ownerId || String(userId),
    createdBy: fileData.createdBy || userId,
    visibility: fileData.visibility || 'private',
    folderId: fileData.folderId || null,
    originalName: fileData.originalname,
    fileName: uniqueFileName,
    fileSize: fileData.size,
    mimeType: fileData.mimetype,
    fileExtension,
    storagePath,
    storageUrl: uploadResult.url,
    storageProvider: uploadResult.provider,
    metadata: {
      description: fileData.description,
      tags: Array.isArray(fileData.tags) ? fileData.tags : [],
    },
    permissions: Array.isArray(fileData.permissions) ? fileData.permissions : [],
    ingestionMode: ingestionDecision.mode,
    ingestionStatus: ingestionDecision.shouldQueue ? 'queued' : 'skipped',
    ingestionReason: ingestionDecision.reason,
  });

  // Update storage usage
  await updateStorageUsage(tenantId, fileData.size, 1);

  // Log activity
  await logActivity({
    tenantId,
    userId,
    fileId: fileRecord._id,
    action: 'upload',
    details: {
      fileName: fileData.originalname,
      fileSize: fileData.size,
    },
  });

  return fileRecord;
};

const uploadMultipleFiles = async (filesData, userInfo) => {
  const uploadPromises = filesData.map((fileData) =>
    uploadFile(fileData, userInfo)
  );
  return Promise.all(uploadPromises);
};

const getFiles = async (filter, options, userInfo) => {
  const { tenantId } = userInfo;
  const accessQuery = buildAccessibleStorageQuery({
    tenantId,
    userInfo,
    permission: 'read',
  });
  const queryFilter = mergeWithAccessQuery(accessQuery, filter);

  return Storage.paginate(queryFilter, {
    ...options,
    populate: 'folderId userId createdBy',
  });
};

const getFileById = async (fileId, userInfo) => {
  const { tenantId } = userInfo;
  const file = await Storage.findOne({
    _id: fileId,
    tenantId,
    status: 'active'
  }).populate('folderId userId createdBy');

  if (!file || !canReadStorageEntity(userInfo, file)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }

  return file;
};

const deleteFile = async (fileId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const file = await getFileById(fileId, userInfo);
  if (!canWriteStorageEntity(userInfo, file)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this file');
  }

  // Get storage provider and delete from cloud storage
  const provider = StorageProviderFactory.create(
    file.storageProvider || 'aws-s3'
  );
  await provider.delete(file.storagePath);

  // Soft delete file record
  file.status = 'deleted';
  file.deletedAt = new Date();
  await file.save();

  // Update storage usage
  await updateStorageUsage(tenantId, -file.fileSize, -1);

  // Log activity
  await logActivity({
    tenantId,
    userId,
    fileId: file._id,
    action: 'delete',
    details: { fileName: file.originalName },
  });

  return file;
};

const shareFile = async (fileId, shareOptions, userInfo) => {
  const { tenantId, userId } = userInfo;
  const file = await getFileById(fileId, userInfo);
  if (!canAdminStorageEntity(userInfo, file)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to share this file');
  }

  const shareToken = Storage.generateShareToken();

  file.shareSettings = {
    isShared: true,
    shareToken,
    shareExpiry: shareOptions.expiryDate,
    allowDownload: shareOptions.allowDownload !== false,
    allowPreview: shareOptions.allowPreview !== false,
    password: shareOptions.password,
  };
  file.visibility = 'public_share';

  await file.save();

  // Log activity
  await logActivity({
    tenantId,
    userId,
    fileId: file._id,
    action: 'share',
    details: { shareToken },
  });

  return { shareToken, shareUrl: `/api/v1/storage/shared/${shareToken}` };
};

const getSharedFile = async (shareToken, password = null) => {
  const file = await Storage.findOne({
    'shareSettings.shareToken': shareToken,
    'shareSettings.isShared': true,
    status: 'active',
  });

  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shared file not found');
  }

  // Check expiry
  if (
    file.shareSettings.shareExpiry &&
    new Date() > file.shareSettings.shareExpiry
  ) {
    throw new ApiError(httpStatus.GONE, 'Share link has expired');
  }

  // Check password
  if (file.shareSettings.password && file.shareSettings.password !== password) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid password');
  }

  return file;
};

const searchFiles = async (query, userInfo) => {
  const { tenantId } = userInfo;
  const accessQuery = buildAccessibleStorageQuery({
    tenantId,
    userInfo,
    permission: 'read',
  });

  const searchFilter = {
    $and: [
      accessQuery,
      {
        $or: [
          { originalName: { $regex: query, $options: 'i' } },
          { 'metadata.description': { $regex: query, $options: 'i' } },
          { 'metadata.tags': { $in: [new RegExp(query, 'i')] } },
        ],
      },
    ],
  };

  return Storage.find(searchFilter).populate('folderId');
};

const checkStorageQuota = async (tenantId, fileSize) => {
  const settings = await StorageSettings.findOne({ tenantId });
  if (!settings) return;

  const { totalQuota, usedStorage } = settings.storageQuota;
  if (usedStorage + fileSize > totalQuota) {
    throw new ApiError(
      httpStatus.INSUFFICIENT_STORAGE,
      'Storage quota exceeded'
    );
  }
};

const updateStorageUsage = async (tenantId, sizeChange, fileCountChange) => {
  await StorageSettings.findOneAndUpdate(
    { tenantId },
    {
      $inc: {
        'storageQuota.usedStorage': sizeChange,
        'storageQuota.fileCount': fileCountChange,
      },
    },
    { upsert: true }
  );
};

const logActivity = async (activityData) =>
  StorageActivity.create(activityData);

const getStorageStats = async (userInfo) => {
  const { tenantId } = userInfo;
  const accessQuery = buildAccessibleStorageQuery({
    tenantId,
    userInfo,
    permission: 'read',
  });

  const [fileStats, settings] = await Promise.all([
    Storage.aggregate([
      { $match: accessQuery },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          avgFileSize: { $avg: '$fileSize' },
        },
      },
    ]),
    StorageSettings.findOne({ tenantId }),
  ]);

  const stats = fileStats[0] || { totalFiles: 0, totalSize: 0, avgFileSize: 0 };
  const quota = settings?.storageQuota || { totalQuota: 0, usedStorage: 0 };

  return {
    ...stats,
    quota,
    usagePercentage:
      quota.totalQuota > 0 ? (quota.usedStorage / quota.totalQuota) * 100 : 0,
  };
};

const updateFileMetadata = async (fileId, metadata, userInfo) => {
  const file = await getFileById(fileId, userInfo);
  if (!canWriteStorageEntity(userInfo, file)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to update this file');
  }

  file.metadata = {
    ...(file.metadata || {}),
    ...(metadata || {}),
  };

  await file.save();
  return file;
};

const updateFilePermissions = async (fileId, permissions, visibility, userInfo) => {
  const file = await getFileById(fileId, userInfo);
  if (!canAdminStorageEntity(userInfo, file)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to update file permissions');
  }

  if (Array.isArray(permissions)) {
    file.permissions = permissions;
  }
  if (visibility) {
    file.visibility = visibility;
  }
  await file.save();
  return file;
};

const moveFile = async (fileId, folderId, userInfo) => {
  const file = await getFileById(fileId, userInfo);
  if (!canWriteStorageEntity(userInfo, file)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to move this file');
  }

  if (folderId) {
    const folder = await StorageFolder.findOne({
      _id: folderId,
      tenantId: userInfo.tenantId,
      status: 'active',
    });
    if (!folder) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Destination folder not found');
    }
  }

  file.folderId = folderId || null;
  await file.save();
  return file;
};

const copyFile = async (fileId, payload, userInfo) => {
  const originalFile = await getFileById(fileId, userInfo);
  if (!canReadStorageEntity(userInfo, originalFile)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to copy this file');
  }

  const fileExtension = path.extname(originalFile.originalName);
  const uniqueFileName = `${nanoid(16)}${fileExtension}`;
  const newStoragePath = `${userInfo.tenantId}/${userInfo.userId}/${uniqueFileName}`;

  const provider = StorageProviderFactory.create(
    originalFile.storageProvider || 'aws-s3'
  );
  await provider.copy(originalFile.storagePath, newStoragePath);

  const copiedFile = await Storage.create({
    tenantId: userInfo.tenantId,
    userId: userInfo.userId,
    ownerType: 'user',
    ownerId: String(userInfo.userId),
    createdBy: userInfo.userId,
    visibility: 'private',
    folderId: payload.folderId || originalFile.folderId,
    originalName: payload.newName || `Copy of ${originalFile.originalName}`,
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
    metadata: originalFile.metadata || {},
    ingestionMode: 'off',
    ingestionStatus: 'skipped',
    ingestionReason: 'copied_file_defaults_to_no_ingestion',
  });

  return copiedFile;
};

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  getFiles,
  getFileById,
  deleteFile,
  shareFile,
  getSharedFile,
  searchFiles,
  getStorageStats,
  updateFileMetadata,
  updateFilePermissions,
  moveFile,
  copyFile,
};
