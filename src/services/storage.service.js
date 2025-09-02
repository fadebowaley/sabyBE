const httpStatus = require('http-status');
const { Storage, StorageFolder, StorageSettings, StorageActivity } = require('../models');
const ApiError = require('../utils/ApiError');
const { StorageProviderFactory } = require('./providers/storageProvider');
const path = require('path');
const { nanoid } = require('nanoid');

const uploadFile = async (fileData, userInfo) => {
  const { tenantId, userId } = userInfo;
  
  // Check storage quota
  await checkStorageQuota(tenantId, fileData.size);
  
  // Generate unique filename
  const fileExtension = path.extname(fileData.originalname);
  const uniqueFileName = `${nanoid(16)}${fileExtension}`;
  const storagePath = `${tenantId}/${userId}/${uniqueFileName}`;
  
  // Get storage provider
  const provider = StorageProviderFactory.create(process.env.STORAGE_PROVIDER || 'aws-s3');
  
  // Upload to cloud storage
  const uploadResult = await provider.upload(fileData.buffer, storagePath, fileData.mimetype);
  
  // Create file record
  const fileRecord = await Storage.create({
    tenantId,
    userId,
    folderId: fileData.folderId || null,
    originalName: fileData.originalname,
    fileName: uniqueFileName,
    fileSize: fileData.size,
    mimeType: fileData.mimetype,
    fileExtension,
    storagePath,
    storageUrl: uploadResult.url,
    storageProvider: uploadResult.provider,
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
  const uploadPromises = filesData.map(fileData => uploadFile(fileData, userInfo));
  return Promise.all(uploadPromises);
};

const getFiles = async (filter, options, userInfo) => {
  const { tenantId, userId } = userInfo;
  const queryFilter = { ...filter, tenantId, userId, status: 'active' };
  
  return Storage.paginate(queryFilter, {
    ...options,
    populate: 'folderId userId',
  });
};

const getFileById = async (fileId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const file = await Storage.findOne({
    _id: fileId,
    tenantId,
    userId,
    status: 'active',
  }).populate('folderId userId');
  
  if (!file) {
    throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
  }
  
  return file;
};

const deleteFile = async (fileId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const file = await getFileById(fileId, userInfo);
  
  // Get storage provider and delete from cloud storage
  const provider = StorageProviderFactory.create(file.storageProvider || 'aws-s3');
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
  
  const shareToken = Storage.generateShareToken();
  
  file.shareSettings = {
    isShared: true,
    shareToken,
    shareExpiry: shareOptions.expiryDate,
    allowDownload: shareOptions.allowDownload !== false,
    allowPreview: shareOptions.allowPreview !== false,
    password: shareOptions.password,
  };
  
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
  if (file.shareSettings.shareExpiry && new Date() > file.shareSettings.shareExpiry) {
    throw new ApiError(httpStatus.GONE, 'Share link has expired');
  }
  
  // Check password
  if (file.shareSettings.password && file.shareSettings.password !== password) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid password');
  }
  
  return file;
};

const searchFiles = async (query, userInfo) => {
  const { tenantId, userId } = userInfo;
  
  const searchFilter = {
    tenantId,
    userId,
    status: 'active',
    $or: [
      { originalName: { $regex: query, $options: 'i' } },
      { 'metadata.description': { $regex: query, $options: 'i' } },
      { 'metadata.tags': { $in: [new RegExp(query, 'i')] } },
    ],
  };
  
  return Storage.find(searchFilter).populate('folderId');
};

const checkStorageQuota = async (tenantId, fileSize) => {
  const settings = await StorageSettings.findOne({ tenantId });
  if (!settings) return;
  
  const { totalQuota, usedStorage } = settings.storageQuota;
  if (usedStorage + fileSize > totalQuota) {
    throw new ApiError(httpStatus.INSUFFICIENT_STORAGE, 'Storage quota exceeded');
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

const logActivity = async (activityData) => {
  return StorageActivity.create(activityData);
};

const getStorageStats = async (userInfo) => {
  const { tenantId, userId } = userInfo;
  
  const [fileStats, settings] = await Promise.all([
    Storage.aggregate([
      { $match: { tenantId, userId, status: 'active' } },
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
    usagePercentage: quota.totalQuota > 0 ? (quota.usedStorage / quota.totalQuota) * 100 : 0,
  };
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
};