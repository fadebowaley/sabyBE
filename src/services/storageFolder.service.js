const httpStatus = require('http-status');
const { StorageFolder, Storage, StorageActivity } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  buildAccessibleStorageQuery,
  canReadStorageEntity,
  canWriteStorageEntity,
  canAdminStorageEntity,
} = require('./storageAccess.service');

const createFolder = async (folderData, userInfo) => {
  const { tenantId, userId } = userInfo;

  // Check if folder name exists in the same parent
  const existingFolder = await StorageFolder.findOne({
    tenantId,
    name: folderData.name,
    parentFolder: folderData.parentFolder || null,
    ownerType: folderData.ownerType || 'user',
    ownerId: folderData.ownerId || String(userId),
    status: 'active',
  });

  if (existingFolder) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Folder with this name already exists'
    );
  }

  const folder = await StorageFolder.create({
    ...folderData,
    tenantId,
    userId,
    ownerType: folderData.ownerType || 'user',
    ownerId: folderData.ownerId || String(userId),
    createdBy: folderData.createdBy || userId,
    visibility: folderData.visibility || 'private',
    permissions: Array.isArray(folderData.permissions) ? folderData.permissions : [],
  });

  // Log activity
  await logFolderActivity({
    tenantId,
    userId,
    folderId: folder._id,
    action: 'create_folder',
    details: { folderName: folder.name },
  });

  return folder;
};

const getFolders = async (filter, options, userInfo) => {
  const { tenantId } = userInfo;
  const accessQuery = buildAccessibleStorageQuery({
    tenantId,
    userInfo,
    permission: 'read',
  });
  const queryFilter = { $and: [accessQuery, filter] };

  return StorageFolder.paginate(queryFilter, {
    ...options,
    populate: 'parentFolder userId createdBy',
  });
};

const getFolderById = async (folderId, userInfo) => {
  const { tenantId } = userInfo;
  const folder = await StorageFolder.findOne({
    _id: folderId,
    tenantId,
    status: 'active',
  }).populate('parentFolder userId createdBy');

  if (!folder || !canReadStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
  }

  return folder;
};

const getFolderContents = async (folderId, userInfo) => {
  const { tenantId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  if (!canReadStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to view this folder');
  }
  const folderAccessQuery = buildAccessibleStorageQuery({
    tenantId,
    userInfo,
    permission: 'read',
  });

  const [subfolders, files] = await Promise.all([
    StorageFolder.find({
      $and: [folderAccessQuery, { parentFolder: folderId }],
    }).sort({ name: 1 }),
    Storage.find({
      $and: [folderAccessQuery, { folderId }],
    }).sort({ originalName: 1 }),
  ]);

  return { subfolders, files };
};

const updateFolder = async (folderId, updateData, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  if (!canWriteStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to update this folder');
  }

  // Check for name conflicts if name is being updated
  if (updateData.name && updateData.name !== folder.name) {
    const existingFolder = await StorageFolder.findOne({
      tenantId,
      name: updateData.name,
      parentFolder: folder.parentFolder,
      ownerType: folder.ownerType || 'user',
      ownerId: folder.ownerId || String(folder.userId),
      status: 'active',
      _id: { $ne: folderId },
    });

    if (existingFolder) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Folder with this name already exists'
      );
    }
  }

  Object.assign(folder, updateData);
  await folder.save();

  return folder;
};

const deleteFolder = async (folderId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  if (!canWriteStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to delete this folder');
  }

  // Check if folder has contents
  const accessQuery = buildAccessibleStorageQuery({
    tenantId,
    userInfo,
    permission: 'read',
  });
  const [subfolders, files] = await Promise.all([
    StorageFolder.countDocuments({
      $and: [accessQuery, { parentFolder: folderId }],
    }),
    Storage.countDocuments({
      $and: [accessQuery, { folderId }],
    }),
  ]);

  if (subfolders > 0 || files > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Cannot delete folder with contents'
    );
  }

  // Soft delete folder
  folder.status = 'deleted';
  folder.deletedAt = new Date();
  await folder.save();

  // Log activity
  await logFolderActivity({
    tenantId,
    userId,
    folderId: folder._id,
    action: 'delete_folder',
    details: { folderName: folder.name },
  });

  return folder;
};

const moveFolder = async (folderId, newParentId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  if (!canWriteStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to move this folder');
  }

  // Validate new parent exists
  if (newParentId) {
    await getFolderById(newParentId, userInfo);

    // Check for circular reference
    if (await isCircularReference(folderId, newParentId)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Cannot move folder to its own subfolder'
      );
    }
  }

  // Check for name conflicts in new location
  const existingFolder = await StorageFolder.findOne({
    tenantId,
    name: folder.name,
    parentFolder: newParentId || null,
    ownerType: folder.ownerType || 'user',
    ownerId: folder.ownerId || String(folder.userId),
    status: 'active',
    _id: { $ne: folderId },
  });

  if (existingFolder) {
    throw new ApiError(
      httpStatus.CONFLICT,
      'Folder with this name already exists in destination'
    );
  }

  const oldPath = folder.path;
  folder.parentFolder = newParentId || null;
  await folder.save();

  // Log activity
  await logFolderActivity({
    tenantId,
    userId,
    folderId: folder._id,
    action: 'move',
    details: {
      folderName: folder.name,
      fromPath: oldPath,
      toPath: folder.path,
    },
  });

  return folder;
};

const shareFolder = async (folderId, shareOptions, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  if (!canAdminStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to share this folder');
  }

  const shareToken = StorageFolder.generateShareToken();

  folder.shareSettings = {
    isShared: true,
    shareToken,
    shareExpiry: shareOptions.expiryDate,
    allowUpload: shareOptions.allowUpload || false,
    password: shareOptions.password,
  };
  folder.visibility = 'public_share';

  await folder.save();

  return {
    shareToken,
    shareUrl: `/api/v1/storage/folders/shared/${shareToken}`,
  };
};

const getFolderHierarchy = async (folderId, userInfo) => {
  const { tenantId } = userInfo;
  const hierarchy = [];
  let currentFolder = await getFolderById(folderId, userInfo);

  while (currentFolder) {
    hierarchy.unshift({
      id: currentFolder._id,
      name: currentFolder.name,
      path: currentFolder.path,
    });

    if (currentFolder.parentFolder) {
      currentFolder = await StorageFolder.findOne({
        _id: currentFolder.parentFolder,
        tenantId,
        status: 'active',
      });
    } else {
      break;
    }
  }

  return hierarchy;
};

const isCircularReference = async (folderId, newParentId) => {
  let currentParent = newParentId;

  while (currentParent) {
    if (currentParent.toString() === folderId.toString()) {
      return true;
    }

    const parent = await StorageFolder.findById(currentParent);
    currentParent = parent?.parentFolder;
  }

  return false;
};

const logFolderActivity = async (activityData) =>
  StorageActivity.create(activityData);

const updateFolderPermissions = async (folderId, permissions, visibility, userInfo) => {
  const folder = await getFolderById(folderId, userInfo);
  if (!canAdminStorageEntity(userInfo, folder)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to update folder permissions');
  }

  if (Array.isArray(permissions)) {
    folder.permissions = permissions;
  }
  if (visibility) {
    folder.visibility = visibility;
  }
  await folder.save();
  return folder;
};

module.exports = {
  createFolder,
  getFolders,
  getFolderById,
  getFolderContents,
  updateFolder,
  deleteFolder,
  moveFolder,
  shareFolder,
  getFolderHierarchy,
  updateFolderPermissions,
};
