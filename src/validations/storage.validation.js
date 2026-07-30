const Joi = require('joi');
const { objectId } = require('./custom.validation');

const uploadFile = {
  body: Joi.object().keys({
    folderId: Joi.string().custom(objectId).optional(),
    description: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    ingestionMode: Joi.string().valid('off', 'auto', 'force').optional(),
  }),
};

const uploadMultipleFiles = {
  body: Joi.object().keys({
    folderId: Joi.string().custom(objectId).optional(),
    description: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    ingestionMode: Joi.string().valid('off', 'auto', 'force').optional(),
  }),
};

const getFiles = {
  query: Joi.object().keys({
    folderId: Joi.string().custom(objectId).optional(),
    mimeType: Joi.string().optional(),
    fileExtension: Joi.string().optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

const getFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
};

const deleteFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
};

const shareFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    expiryDate: Joi.date().greater('now').optional(),
    allowDownload: Joi.boolean().optional(),
    allowPreview: Joi.boolean().optional(),
    password: Joi.string().min(4).optional(),
  }),
};

const getSharedFile = {
  params: Joi.object().keys({
    shareToken: Joi.string().required(),
  }),
  query: Joi.object().keys({
    password: Joi.string().optional(),
  }),
};

const downloadSharedFile = {
  params: Joi.object().keys({
    shareToken: Joi.string().required(),
  }),
  query: Joi.object().keys({
    password: Joi.string().optional(),
  }),
};

const downloadFileByKey = {
  query: Joi.object()
    .keys({
      key: Joi.string().optional(),
      url: Joi.string().uri().optional(),
    })
    .or('key', 'url'),
};

const searchFiles = {
  query: Joi.object().keys({
    q: Joi.string().required().min(1),
    limit: Joi.number().integer().min(1).max(50).optional(),
  }),
};

const moveFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    folderId: Joi.string().custom(objectId).allow(null).optional(),
  }),
};

const copyFile = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    folderId: Joi.string().custom(objectId).allow(null).optional(),
    newName: Joi.string().optional(),
  }),
};

const updateFileMetadata = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    description: Joi.string().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    customFields: Joi.object().optional(),
  }),
};

const updateFilePermissions = {
  params: Joi.object().keys({
    fileId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      visibility: Joi.string()
        .valid('private', 'tenant', 'restricted', 'public_share')
        .optional(),
      permissions: Joi.array()
        .items(
          Joi.object().keys({
            subjectType: Joi.string().valid('user', 'role', 'node').required(),
            subjectId: Joi.string().required(),
            permission: Joi.string().valid('read', 'write', 'admin').required(),
          })
        )
        .optional(),
    })
    .min(1),
};

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
  moveFile,
  copyFile,
  updateFileMetadata,
  updateFilePermissions,
};
