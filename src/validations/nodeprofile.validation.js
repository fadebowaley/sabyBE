const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createProfile = {
  body: Joi.object().keys({
    tenantId: Joi.string()
      .required()
      .pattern(/^[a-zA-Z0-9\-_]+$/),
    church: Joi.string().custom(objectId).required(),
    dateOfEstablishment: Joi.date().optional(),
    propertyStatus: Joi.string()
      .valid('Owned', 'Rented', 'Leased', 'Other')
      .optional(),
    estimatedValue: Joi.number().optional(),
    buildingType: Joi.string().optional(),
    status: Joi.string()
      .valid('Active', 'Inactive', 'Under Construction')
      .optional(),
  }),
};

const getProfileByNode = {
  params: Joi.object().keys({
    nodeId: Joi.string().custom(objectId).required(),
  }),
};

const getProfile = {
  params: Joi.object().keys({
    profileId: Joi.string().custom(objectId).required(),
  }),
};

const updateProfile = {
  params: Joi.object().keys({
    profileId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      dateOfEstablishment: Joi.date().optional(),
      propertyStatus: Joi.string()
        .valid('Owned', 'Rented', 'Leased', 'Other')
        .optional(),
      estimatedValue: Joi.number().optional(),
      buildingType: Joi.string().optional(),
      status: Joi.string()
        .valid('Active', 'Inactive', 'Under Construction')
        .optional(),
    })
    .min(1),
};

const deleteProfile = {
  params: Joi.object().keys({
    profileId: Joi.string().custom(objectId).required(),
  }),
};

const upsertProfile = {
  body: Joi.object().keys({
    tenantId: Joi.string()
      .required()
      .pattern(/^[a-zA-Z0-9\-_]+$/),
    church: Joi.string().custom(objectId).required(),
    dateOfEstablishment: Joi.date().optional(),
    propertyStatus: Joi.string()
      .valid('Owned', 'Rented', 'Leased', 'Other')
      .optional(),
    estimatedValue: Joi.number().optional(),
    buildingType: Joi.string().optional(),
    status: Joi.string()
      .valid('Active', 'Inactive', 'Under Construction')
      .optional(),
  }),
};

module.exports = {
  createProfile,
  getProfileByNode,
  getProfile,
  updateProfile,
  deleteProfile,
  upsertProfile,
};
