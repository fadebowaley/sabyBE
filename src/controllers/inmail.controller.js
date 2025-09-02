const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { inmailService } = require('../services');

const createMessage = catchAsync(async (req, res) => {
  const message = await inmailService.createMessage(req.body, req.user);
  res.status(httpStatus.CREATED).send(message);
});

const getMessageById = catchAsync(async (req, res) => {
  const message = await inmailService.getMessageById(req.params.inmailId);
  if (!message) throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  res.send(message);
});
//inbox', 'sent', 'drafts', 'starred', 'trash'
const queryMessages = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    'status',
    'trash',
    'starred',
    'search',
    'read',
    'sent',
    'drafts',
    'starred',
    'channel',
    'from',
    'to',
    'inbox',
  ]);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'users';
  console.log('this option', options);
    // options.populate = 'level,structure,users';
  const result = await inmailService.queryMessages(filter, options);
  res.send(result);
});

const updateMessage = catchAsync(async (req, res) => {
  const updated = await inmailService.updateMessage(req.params.inmailId, req.body);
  res.send(updated);
});

const deleteMessage = catchAsync(async (req, res) => {
  await inmailService.deleteMessage(req.params.inmailId);
  res.status(httpStatus.NO_CONTENT).send();
});

const sendMessage = catchAsync(async (req, res) => {
  const sent = await inmailService.sendMessage(req.body, req.user);
  res.status(httpStatus.CREATED).send(sent);
});

const saveDraft = catchAsync(async (req, res) => {
  const draft = await inmailService.saveDraft(req.body, req.user);
  res.status(httpStatus.CREATED).send(draft);
});

module.exports = {
  createMessage,
  getMessageById,
  queryMessages,
  updateMessage,
  deleteMessage,
  sendMessage,
  saveDraft,
};
