const httpStatus = require('http-status');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { cmsPageService, storageService } = require('../services');
const { CmsPage, Storage } = require('../models');
const { StorageProviderFactory } = require('../services/providers/storageProvider');

const ensureSabyUser = (user) => {
  if (!user || user.isSaby !== true) {
    throw new ApiError(httpStatus.FORBIDDEN, 'This action is restricted to Saby users only');
  }
};

const listPages = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const pages = await cmsPageService.listPages({ status: req.query.status });
  res.send({ pages });
});

const getPage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const page = await cmsPageService.getPageByKey(req.params.key);
  if (!page) throw new ApiError(httpStatus.NOT_FOUND, 'CMS page not found');
  res.send({ page });
});

const createPage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const page = await cmsPageService.createPage(req.body, req.user);
  res.status(httpStatus.CREATED).send({ page });
});

const updatePage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const page = await cmsPageService.upsertPageByKey(req.params.key, req.body, req.user);
  res.send({ page });
});

const publishPage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const page = await cmsPageService.publishPage(req.params.key, req.user);
  res.send({ page });
});

const unpublishPage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const page = await cmsPageService.unpublishPage(req.params.key, req.user);
  res.send({ page });
});

const getPublishedPage = catchAsync(async (req, res) => {
  const page = await cmsPageService.getPageByKey(req.params.key, { publishedOnly: true });
  if (!page) throw new ApiError(httpStatus.NOT_FOUND, 'Published CMS page not found');
  res.send({ page });
});

const getEditorImage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  const fileId = String(req.params.fileId || '').trim();
  if (!fileId) throw new ApiError(httpStatus.BAD_REQUEST, 'Image id is required');

  const fileFilter = mongoose.Types.ObjectId.isValid(fileId)
    ? { $or: [{ fileId }, { _id: fileId }] }
    : { fileId };
  const file = await Storage.findOne({
    ...fileFilter,
    status: 'active',
    mimeType: /^image\//,
  }).lean();
  if (!file) throw new ApiError(httpStatus.NOT_FOUND, 'CMS image not found');

  const provider = StorageProviderFactory.create(file.storageProvider || process.env.STORAGE_PROVIDER || 'aws-s3');
  const signedUrl = await provider.generatePresignedUrl(file.storagePath, 300);
  res.set('Cache-Control', 'private, max-age=60');
  res.redirect(302, signedUrl || file.storageUrl);
});

const getPublicImage = catchAsync(async (req, res) => {
  const fileId = String(req.params.fileId || '').trim();
  if (!fileId) throw new ApiError(httpStatus.BAD_REQUEST, 'Image id is required');

  const fileFilter = mongoose.Types.ObjectId.isValid(fileId)
    ? { $or: [{ fileId }, { _id: fileId }] }
    : { fileId };
  const file = await Storage.findOne({
    ...fileFilter,
    status: 'active',
    mimeType: /^image\//,
  }).lean();
  if (!file) throw new ApiError(httpStatus.NOT_FOUND, 'CMS image not found');

  const legacyImageReferences = [
    { 'images.fileId': file.fileId },
    { 'images.fileId': String(file._id) },
    { 'sections.image.fileId': file.fileId },
    { 'sections.image.fileId': String(file._id) },
    { 'sections.items.image.fileId': file.fileId },
    { 'sections.items.image.fileId': String(file._id) },
  ];
  const publishedImageReferences = [
    { 'publishedContent.images.fileId': file.fileId },
    { 'publishedContent.images.fileId': String(file._id) },
    { 'publishedContent.sections.image.fileId': file.fileId },
    { 'publishedContent.sections.image.fileId': String(file._id) },
    { 'publishedContent.sections.items.image.fileId': file.fileId },
    { 'publishedContent.sections.items.image.fileId': String(file._id) },
  ];

  const publishedReference = await CmsPage.exists({
    status: 'published',
    $or: [
      { $and: [{ publishedContent: { $ne: null } }, { $or: publishedImageReferences }] },
      { $and: [{ publishedContent: null }, { $or: legacyImageReferences }] },
      { $and: [{ publishedContent: { $exists: false } }, { $or: legacyImageReferences }] },
    ],
  });
  if (!publishedReference) throw new ApiError(httpStatus.NOT_FOUND, 'CMS image is not published');

  const provider = StorageProviderFactory.create(file.storageProvider || process.env.STORAGE_PROVIDER || 'aws-s3');
  const signedUrl = await provider.generatePresignedUrl(file.storagePath, 300);
  res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.redirect(302, signedUrl || file.storageUrl);
});

const uploadImage = catchAsync(async (req, res) => {
  ensureSabyUser(req.user);
  if (!req.file) throw new ApiError(httpStatus.BAD_REQUEST, 'No image uploaded');

  if (!/^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(req.file.mimetype)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only image uploads are allowed');
  }

  const file = await storageService.uploadFile(
    {
      ...req.file,
      description: req.body.description || 'CMS image',
      tags: ['cms', req.body.pageKey].filter(Boolean),
      ingestionMode: 'off',
      ownerType: 'tenant',
      ownerId: req.user.tenantId || 'saby-public',
      createdBy: req.user._id,
      visibility: 'tenant',
    },
    {
      tenantId: req.user.tenantId || 'saby-public',
      userId: req.user._id,
      roles: req.user.roles,
      role: req.user.role,
      isSaby: req.user.isSaby,
      isSuper: req.user.isSuper,
    }
  );

  res.status(httpStatus.CREATED).send({
    image: {
      fileId: file.fileId || file.id || String(file._id),
      url: `/api/public/cms/images/${encodeURIComponent(file.fileId || file.id || String(file._id))}`,
      alt: req.body.alt || '',
      caption: req.body.caption || '',
    },
    file,
  });
});

module.exports = {
  listPages,
  getPage,
  createPage,
  updatePage,
  publishPage,
  unpublishPage,
  getPublishedPage,
  getEditorImage,
  getPublicImage,
  uploadImage,
};
