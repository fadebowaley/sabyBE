const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createConversation = {
  body: Joi.object().keys({
    type: Joi.string().valid('direct', 'group', 'channel').required(),
    participants: Joi.array()
      .items(Joi.string().custom(objectId))
      .min(1)
      .required(),
    name: Joi.string().trim().optional(),
    description: Joi.string().trim().optional(),
    avatar: Joi.string().uri().optional(),
    nodeId: Joi.string().optional(),
    nodeName: Joi.string().optional(),
    settings: Joi.object()
      .keys({
        isPrivate: Joi.boolean(),
        allowInvites: Joi.boolean(),
        readOnly: Joi.boolean(),
        maxParticipants: Joi.number().integer().min(2).allow(null),
      })
      .optional(),
  }),
};

const updateConversation = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    name: Joi.string().trim(),
    description: Joi.string().trim(),
    avatar: Joi.string().uri(),
    settings: Joi.object().keys({
      isPrivate: Joi.boolean(),
      allowInvites: Joi.boolean(),
      readOnly: Joi.boolean(),
      maxParticipants: Joi.number().integer().min(2).allow(null),
      onlyAdminsCanPost: Joi.boolean(), // Channel-specific
    }),
    metadata: Joi.object().keys({
      tags: Joi.array().items(Joi.string()),
      customFields: Joi.object(),
    }),
  }),
};

const getConversation = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
};

const getConversations = {
  query: Joi.object().keys({
    type: Joi.string().valid('direct', 'group', 'channel'),
    nodeId: Joi.string(),
    isArchived: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const addParticipant = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
};

const removeParticipant = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
};

const addAdmin = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
};

const removeAdmin = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    userId: Joi.string().custom(objectId).required(),
  }),
};

const discoverChannels = {
  query: Joi.object().keys({
    nodeId: Joi.string().optional(),
    search: Joi.string().trim().optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().optional(),
    page: Joi.number().integer().optional(),
  }),
};

module.exports = {
  createConversation,
  updateConversation,
  getConversation,
  getConversations,
  addParticipant,
  removeParticipant,
  addAdmin,
  removeAdmin,
  discoverChannels,
};

