const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createMessage = {
  body: Joi.object().keys({
    to: Joi.array().items(Joi.string().custom(objectId)),
    subject: Joi.string().required(),
    body: Joi.string().required(),
    channel: Joi.string().optional(),
    attachments: Joi.array().items(Joi.string()),
    tenantId: Joi.string(),
    status: Joi.string(),
  }),
};

const updateMessage = {
  params: Joi.object().keys({
    inmailId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    read: Joi.boolean(),
    to: Joi.array().items(Joi.string().custom(objectId)),
    starred: Joi.boolean(),
    status: Joi.string().valid('inbox', 'sent', 'drafts', 'starred', 'trash'),
    subject: Joi.string(),
    body: Joi.string(),
    attachments: Joi.array().items(Joi.string()),
  }),
};

const queryMessages = {
  query: Joi.object().keys({
    status: Joi.string().valid('inbox', 'sent', 'drafts', 'starred', 'trash'),
    search: Joi.string(),
    read: Joi.boolean(),
    starred: Joi.boolean(),
    channel: Joi.string(),
    from: Joi.string().custom(objectId),
    to: Joi.string().custom(objectId),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    tenantId: Joi.string(),
    status: Joi.string(),
  }),
};

const getMessageById = {
  params: Joi.object().keys({
    inmailId: Joi.string().custom(objectId).required(),
  }),
};

const sendMessage = {
  body: Joi.object().keys({
    from: Joi.string().custom(objectId),
    recipients: Joi.array().items(Joi.string().custom(objectId)),
    to: Joi.array().items(Joi.string().custom(objectId)),
    subject: Joi.string().required(),
    body: Joi.string().required(),
    channel: Joi.string().optional(),
    attachments: Joi.array().items(Joi.string()),
    recipients: Joi.array().items(Joi.string().custom(objectId)),
  }),
};

const saveDraft = {
  body: Joi.object().keys({
    to: Joi.array().items(Joi.string().custom(objectId)),
    from: Joi.string().custom(objectId),
    subject: Joi.string().allow(''),
    recipients: Joi.array().items(Joi.string().custom(objectId)),
    body: Joi.string().allow(''),
    channel: Joi.string().optional(),
    attachments: Joi.array().items(Joi.string()),
  }),
};

module.exports = {
  createMessage,
  updateMessage,
  queryMessages,
  getMessageById,
  sendMessage,
  saveDraft,
};
