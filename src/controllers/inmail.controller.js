const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { inmailService } = require('../services');

/**
 * Create a new message
 */
const createMessage = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Creating message:', req.body.subject);
  const message = await inmailService.createMessage(req.body, req.user);
  res.status(httpStatus.CREATED).send(message);
});

/**
 * Get message by ID
 */
const getMessageById = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Getting message:', req.params.inmailId);
  const message = await inmailService.getMessageById(req.params.inmailId);
  if (!message) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
  }
  res.send(message);
});

/**
 * Query messages with filters
 */
const queryMessages = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Querying messages:', req.query);

  const filter = pick(req.query, [
    'status',
    'trash',
    'starred',
    'search',
    'read',
    'sent',
    'drafts',
    'inbox',
    'channel',
    'from',
    'to',
  ]);

  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await inmailService.queryMessages(filter, options, req.user);
  res.send(result);
});

/**
 * Update message
 */
const updateMessage = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Updating message:', req.params.inmailId);
  const updated = await inmailService.updateMessage(req.params.inmailId, req.body);
  res.send(updated);
});

/**
 * Delete message (move to trash)
 */
const deleteMessage = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Deleting message:', req.params.inmailId);
  await inmailService.deleteMessage(req.params.inmailId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Send message
 */
const sendMessage = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Sending message:', {
    subject: req.body.subject,
    recipientCount: req.body.recipients?.length || 0,
  });
  const sent = await inmailService.sendMessage(req.body, req.user);
  res.status(httpStatus.CREATED).send(sent);
});

/**
 * Save message as draft
 */
const saveDraft = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Saving draft:', req.body.subject);
  const draft = await inmailService.saveDraft(req.body, req.user);
  res.status(httpStatus.CREATED).send(draft);
});

/**
 * Mark message as read
 */
const markAsRead = catchAsync(async (req, res) => {
  console.log('[InMail Controller] Marking as read:', req.params.inmailId);
  const message = await inmailService.markAsRead(
    req.params.inmailId,
    req.user._id
  );
  res.send(message);
});

/**
 * Get inbox count
 */
const getInboxCount = catchAsync(async (req, res) => {
  console.log(
    '[InMail Controller] Getting inbox count for user:',
    req.user._id
  );
  const count = await inmailService.getInboxCount(
    req.user._id,
    req.user.tenantId
  );
  res.send(count);
});

module.exports = {
  createMessage,
  getMessageById,
  queryMessages,
  updateMessage,
  deleteMessage,
  sendMessage,
  saveDraft,
  markAsRead,
  getInboxCount,
};
