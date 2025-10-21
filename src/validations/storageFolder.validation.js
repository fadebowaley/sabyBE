const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createFolder = {
  body: Joi.object().keys({
    name: Joi.string().required().trim().min(1).max(255),
    parentFolder: Joi.string().custom(objectId).optional(),
    metadata: Joi.object()
      .keys({
        description: Joi.string().optional(),
        color: Joi.string()
          .pattern(/^#[0-9A-F]{6}$/i)
          .optional(),
        icon: Joi.string().optional(),
      })
      .optional(),
  }),
};

const getFolders = {
  query: Joi.object().keys({
    parentFolder: Joi.string().custom(objectId).allow(null).optional(),
    name: Joi.string().optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
  }),
};

const getFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
};

const getFolderContents = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
};

const getFolderHierarchy = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
};

const updateFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim().min(1).max(255).optional(),
      metadata: Joi.object()
        .keys({
          description: Joi.string().optional(),
          color: Joi.string()
            .pattern(/^#[0-9A-F]{6}$/i)
            .optional(),
          icon: Joi.string().optional(),
        })
        .optional(),
    })
    .min(1),
};

const deleteFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
};

const moveFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    parentFolder: Joi.string().custom(objectId).allow(null).optional(),
  }),
};

const shareFolder = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    expiryDate: Joi.date().greater('now').optional(),
    allowUpload: Joi.boolean().optional(),
    password: Joi.string().min(4).optional(),
  }),
};

const getSharedFolder = {
  params: Joi.object().keys({
    shareToken: Joi.string().required(),
  }),
  query: Joi.object().keys({
    password: Joi.string().optional(),
  }),
};

const updateFolderPermissions = {
  params: Joi.object().keys({
    folderId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    permissions: Joi.array()
      .items(
        Joi.object().keys({
          userId: Joi.string().custom(objectId).required(),
          permission: Joi.string().valid('read', 'write', 'admin').required(),
        })
      )
      .required(),
  }),
};

module.exports = {
  createFolder,
  getFolders,
  getFolder,
  getFolderContents,
  getFolderHierarchy,
  updateFolder,
  deleteFolder,
  moveFolder,
  shareFolder,
  getSharedFolder,
  updateFolderPermissions,
};
