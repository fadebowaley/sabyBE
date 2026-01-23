const Joi = require('joi');
const { objectId } = require('./custom.validation');

// Attachment schema
const attachmentSchema = Joi.object().keys({
  fileId: Joi.string().custom(objectId).optional(),
  url: Joi.string().uri().optional(),
  filename: Joi.string().optional(),
  size: Joi.number().optional(),
  mimeType: Joi.string().optional(),
  thumbnailUrl: Joi.string().uri().optional(),
  width: Joi.number().optional(),
  height: Joi.number().optional(),
});

const createMessage = {
  body: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
    threadId: Joi.string().custom(objectId).optional(),
    replyTo: Joi.string().custom(objectId).optional(),
    content: Joi.string().required(),
    messageType: Joi.string()
      .valid('text', 'file', 'image', 'system', 'location')
      .default('text'),
    attachments: Joi.array().items(attachmentSchema).optional(),
    metadata: Joi.object()
      .keys({
        mentions: Joi.array().items(Joi.string().custom(objectId)).optional(),
        urls: Joi.array().items(Joi.string().uri()).optional(),
        location: Joi.object()
          .keys({
            lat: Joi.number().required(),
            lng: Joi.number().required(),
            address: Joi.string().optional(),
          })
          .optional(),
        poll: Joi.object()
          .keys({
            question: Joi.string().required(),
            options: Joi.array().items(Joi.string()).min(2).required(),
          })
          .optional(),
      })
      .optional(),
  }),
};

const updateMessage = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    content: Joi.string(),
    isPinned: Joi.boolean(),
  }),
};

const getMessage = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
};

const getMessages = {
  params: Joi.object().keys({
    conversationId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    threadId: Joi.string().custom(objectId).optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    page: Joi.number().integer().min(1).default(1),
    sortBy: Joi.string().default('createdAt:desc'),
    before: Joi.date().iso().optional(), // Get messages before this date
    after: Joi.date().iso().optional(), // Get messages after this date
  }),
};

const markAsRead = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
};

const markAsDelivered = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
};

const addReaction = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    emoji: Joi.string().required(),
  }),
};

const removeReaction = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
};

const deleteMessage = {
  params: Joi.object().keys({
    messageId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createMessage,
  updateMessage,
  getMessage,
  getMessages,
  markAsRead,
  markAsDelivered,
  addReaction,
  removeReaction,
  deleteMessage,
};

