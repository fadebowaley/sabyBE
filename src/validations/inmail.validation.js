const Joi = require('joi');
const { objectId } = require('./custom.validation');

// Attachment schema
const attachmentSchema = Joi.object().keys({
  fileId: Joi.string().custom(objectId).optional(),
  url: Joi.string().uri().optional(),
  filename: Joi.string().optional(),
  size: Joi.number().optional(),
  mimeType: Joi.string().optional(),
});

// Recipient can be a user ID or a group identifier (allofus, alladmins, all+rolename)
const recipientSchema = Joi.alternatives().try(
  Joi.string().custom(objectId),
  Joi.string().pattern(/^(allofus|alladmins|all\+.+)$/i)
);

const createMessage = {
  body: Joi.object().keys({
    to: Joi.array().items(recipientSchema),
    recipients: Joi.array().items(recipientSchema),
    subject: Joi.string().required(),
    body: Joi.string().required(),
    channel: Joi.string().optional(),
    attachments: Joi.array().items(attachmentSchema),
    tenantId: Joi.string().optional(),
    status: Joi.string().optional(),
  }),
};

const updateMessage = {
  params: Joi.object().keys({
    inmailId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    read: Joi.boolean(),
    to: Joi.array().items(recipientSchema),
    recipients: Joi.array().items(recipientSchema),
    starred: Joi.boolean(),
    status: Joi.string().valid('inbox', 'sent', 'drafts', 'starred', 'trash'),
    subject: Joi.string(),
    body: Joi.string(),
    attachments: Joi.array().items(attachmentSchema),
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
    inbox: Joi.boolean(),
    sent: Joi.boolean(),
    drafts: Joi.boolean(),
    trash: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
    tenantId: Joi.string().optional(),
  }),
};

const getMessageById = {
  params: Joi.object().keys({
    inmailId: Joi.string().custom(objectId).required(),
  }),
};

const sendMessage = {
  body: Joi.object().keys({
    from: Joi.string().custom(objectId).optional(),
    recipients: Joi.array().items(recipientSchema).required().min(1),
    to: Joi.array().items(recipientSchema).optional(),
    subject: Joi.string().required(),
    body: Joi.string().required(),
    channel: Joi.string().optional(),
    attachments: Joi.array().items(attachmentSchema).optional(),
  }),
};

const saveDraft = {
  body: Joi.object().keys({
    to: Joi.array().items(recipientSchema).optional(),
    from: Joi.string().custom(objectId).optional(),
    subject: Joi.string().allow(''),
    recipients: Joi.array().items(recipientSchema).optional(),
    body: Joi.string().allow(''),
    channel: Joi.string().optional(),
    attachments: Joi.array().items(attachmentSchema).optional(),
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
