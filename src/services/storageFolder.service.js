const httpStatus = require('http-status');
const { StorageFolder, Storage, StorageActivity } = require('../models');
const ApiError = require('../utils/ApiError');

const createFolder = async (folderData, userInfo) => {
  const { tenantId, userId } = userInfo;
  
  // Check if folder name exists in the same parent
  const existingFolder = await StorageFolder.findOne({
    tenantId,
    userId,
    name: folderData.name,
    parentFolder: folderData.parentFolder || null,
    status: 'active',
  });
  
  if (existingFolder) {
    throw new ApiError(httpStatus.CONFLICT, 'Folder with this name already exists');
  }
  
  const folder = await StorageFolder.create({
    ...folderData,
    tenantId,
    userId,
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
  const { tenantId, userId } = userInfo;
  const queryFilter = { ...filter, tenantId, userId, status: 'active' };
  
  return StorageFolder.paginate(queryFilter, {
    ...options,
    populate: 'parentFolder userId',
  });
};

const getFolderById = async (folderId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await StorageFolder.findOne({
    _id: folderId,
    tenantId,
    userId,
    status: 'active',
  }).populate('parentFolder userId');
  
  if (!folder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
  }
  
  return folder;
};

const getFolderContents = async (folderId, userInfo) => {
  const { tenantId, userId } = userInfo;
  
  const [subfolders, files] = await Promise.all([
    StorageFolder.find({
      tenantId,
      userId,
      parentFolder: folderId,
      status: 'active',
    }).sort({ name: 1 }),
    Storage.find({
      tenantId,
      userId,
      folderId,
      status: 'active',
    }).sort({ originalName: 1 }),
  ]);
  
  return { subfolders, files };
};

const updateFolder = async (folderId, updateData, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  
  // Check for name conflicts if name is being updated
  if (updateData.name && updateData.name !== folder.name) {
    const existingFolder = await StorageFolder.findOne({
      tenantId,
      userId,
      name: updateData.name,
      parentFolder: folder.parentFolder,
      status: 'active',
      _id: { $ne: folderId },
    });
    
    if (existingFolder) {
      throw new ApiError(httpStatus.CONFLICT, 'Folder with this name already exists');
    }
  }
  
  Object.assign(folder, updateData);
  await folder.save();
  
  return folder;
};

const deleteFolder = async (folderId, userInfo) => {
  const { tenantId, userId } = userInfo;
  const folder = await getFolderById(folderId, userInfo);
  
  // Check if folder has contents
  const [subfolders, files] = await Promise.all([
    StorageFolder.countDocuments({
      tenantId,
      userId,
      parentFolder: folderId,
      status: 'active',
    }),
    Storage.countDocuments({
      tenantId,
      userId,
      folderId,
      status: 'active',
    }),
  ]);
  
  if (subfolders > 0 || files > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete folder with contents');
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
  
  // Validate new parent exists
  if (newParentId) {
    const newParent = await getFolderById(newParentId, userInfo);
    
    // Check for circular reference
    if (await isCircularReference(folderId, newParentId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot move folder to its own subfolder');
    }
  }
  
  // Check for name conflicts in new location
  const existingFolder = await StorageFolder.findOne({
    tenantId,
    userId,
    name: folder.name,
    parentFolder: newParentId || null,
    status: 'active',
    _id: { $ne: folderId },
  });
  
  if (existingFolder) {
    throw new ApiError(httpStatus.CONFLICT, 'Folder with this name already exists in destination');
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
  
  const shareToken = StorageFolder.generateShareToken();
  
  folder.shareSettings = {
    isShared: true,
    shareToken,
    shareExpiry: shareOptions.expiryDate,
    allowUpload: shareOptions.allowUpload || false,
    password: shareOptions.password,
  };
  
  await folder.save();
  
  return { shareToken, shareUrl: `/api/v1/storage/folders/shared/${shareToken}` };
};

const getFolderHierarchy = async (folderId, userInfo) => {
  const { tenantId, userId } = userInfo;
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
        userId,
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

const logFolderActivity = async (activityData) => {
  return StorageActivity.create(activityData);
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
};