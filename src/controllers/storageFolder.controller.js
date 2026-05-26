const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { storageFolderService } = require('../services');

const createFolder = catchAsync(async (req, res) => {
  const folderData = pick(req.body, ['name', 'parentFolder', 'metadata']);
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const folder = await storageFolderService.createFolder(folderData, userInfo);
  res.status(httpStatus.CREATED).send(folder);
});

const getFolders = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['parentFolder', 'name']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  console.log('🔍 getFolders filter:', filter);
  console.log('🔍 getFolders options:', options);
  console.log('🔍 getFolders userInfo:', userInfo);

  const result = await storageFolderService.getFolders(
    filter,
    options,
    userInfo
  );
  console.log(result);
  res.send(result);
});

const getFolder = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const folder = await storageFolderService.getFolderById(
    req.params.folderId,
    userInfo
  );
  res.send(folder);
});

const getFolderContents = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const contents = await storageFolderService.getFolderContents(
    req.params.folderId,
    userInfo
  );
  res.send(contents);
});

const updateFolder = catchAsync(async (req, res) => {
  const updateData = pick(req.body, ['name', 'metadata']);

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const folder = await storageFolderService.updateFolder(
    req.params.folderId,
    updateData,
    userInfo
  );
  res.send(folder);
});

const deleteFolder = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  await storageFolderService.deleteFolder(req.params.folderId, userInfo);
  res.status(httpStatus.NO_CONTENT).send();
});

const moveFolder = catchAsync(async (req, res) => {
  const { parentFolder } = req.body;

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const folder = await storageFolderService.moveFolder(
    req.params.folderId,
    parentFolder,
    userInfo
  );
  res.send(folder);
});

const shareFolder = catchAsync(async (req, res) => {
  const shareOptions = pick(req.body, [
    'expiryDate',
    'allowUpload',
    'password',
  ]);

  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const shareResult = await storageFolderService.shareFolder(
    req.params.folderId,
    shareOptions,
    userInfo
  );
  res.send(shareResult);
});

const getSharedFolder = catchAsync(async (req, res) => {
  const { shareToken } = req.params;
  const { password } = req.query;

  const { StorageFolder } = require('../models');
  const folder = await StorageFolder.findOne({
    'shareSettings.shareToken': shareToken,
    'shareSettings.isShared': true,
    status: 'active',
  });

  if (!folder) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Shared folder not found');
  }

  // Check expiry
  if (
    folder.shareSettings.shareExpiry &&
    new Date() > folder.shareSettings.shareExpiry
  ) {
    throw new ApiError(httpStatus.GONE, 'Share link has expired');
  }

  // Check password
  if (
    folder.shareSettings.password &&
    folder.shareSettings.password !== password
  ) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid password');
  }

  // Get folder contents
  const { Storage } = require('../models');
  const [subfolders, files] = await Promise.all([
    StorageFolder.find({
      parentFolder: folder._id,
      status: 'active',
    }).sort({ name: 1 }),
    Storage.find({
      folderId: folder._id,
      status: 'active',
    }).sort({ originalName: 1 }),
  ]);

  res.send({
    folder,
    contents: { subfolders, files },
  });
});

const getFolderHierarchy = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };

  const hierarchy = await storageFolderService.getFolderHierarchy(
    req.params.folderId,
    userInfo
  );
  res.send(hierarchy);
});

const getRootFolders = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
  };

  const filter = { parentFolder: null };
  const options = { sortBy: 'name:asc' };

  const result = await storageFolderService.getFolders(
    filter,
    options,
    userInfo
  );
  res.send(result);
});

const updateFolderPermissions = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: req.user.tenantId,
    userId: req.user._id,
    roles: req.user.roles,
    role: req.user.role,
  };

  const folder = await storageFolderService.updateFolderPermissions(
    req.params.folderId,
    req.body.permissions,
    req.body.visibility,
    userInfo
  );

  res.send(folder);
});

module.exports = {
  createFolder,
  getFolders,
  getFolder,
  getFolderContents,
  updateFolder,
  deleteFolder,
  moveFolder,
  shareFolder,
  getSharedFolder,
  getFolderHierarchy,
  getRootFolders,
  updateFolderPermissions,
};
