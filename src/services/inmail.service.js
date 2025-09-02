const InMail = require('../models/inmail.model');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

const createMessage = async (body, user) => {
  body.tenantId = user.tenantId;
  return InMail.create(body);
};

const getMessageById = async (id) => {
  return InMail.findById(id);
};

const queryMessages = async (filter, options, user) => {
  filter.tenantId = user.tenantId;
  if (filter.search) {
    filter.$or = [{ subject: { $regex: filter.search, $options: 'i' } }, { body: { $regex: filter.search, $options: 'i' } }];
    delete filter.search;
  }
  return InMail.paginate(filter, options);
};

const updateMessage = async (id, updateBody) => {
  const message = await InMail.findById(id);
  if (!message) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  Object.assign(message, updateBody);
  await message.save();
  return message;
};

const deleteMessage = async (id) => {
  const message = await InMail.findById(id);
  if (!message) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  message.httpStatus = 'trash';
  message.deletedAt = new Date();
  await message.save();
  return message;
};

const sendMessage = async (body, user) => {
   body.tenantId = user.tenantId;
   body.status = 'sent';
  console.log(body);
  return InMail.create(body);
};

const saveDraft = async (body, user) => {
  body.tenantId = user.tenantId;
  body.from = user.userId || user.email;
  body.status = 'drafts';
  body.read = true;
  return InMail.create(body);
};

module.exports = {
  createMessage,
  getMessageById,
  queryMessages,
  updateMessage,
  deleteMessage,
  sendMessage,
  saveDraft,
};
