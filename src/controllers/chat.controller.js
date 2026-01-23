const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { chatMessageService, conversationService } = require('../services');
const logger = require('../config/logger');

// ==================== Conversation Controllers ====================

/**
 * Create a new conversation
 */
const createConversation = catchAsync(async (req, res) => {
  logger.info({
    event: 'API_CONVERSATION_CREATE',
    userId: req.user._id.toString(),
    tenantId: req.user.tenantId,
    type: req.body.type,
    timestamp: new Date().toISOString(),
  });
  const conversation = await conversationService.createConversation(
    req.user,
    req.body
  );
  res.status(httpStatus.CREATED).send(conversation);
});

/**
 * Get conversations for user
 */
const getConversations = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Getting conversations for user:', req.user._id);

  const filter = pick(req.query, ['type', 'nodeId', 'isArchived']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await conversationService.getConversations(
    req.user,
    filter,
    options
  );
  res.send(result);
});

/**
 * Get conversation by ID
 */
const getConversationById = catchAsync(async (req, res) => {
  logger.info(
    '[Chat Controller] Getting conversation:',
    req.params.conversationId
  );
  const conversation = await conversationService.getConversationById(
    req.user,
    req.params.conversationId
  );
  res.send(conversation);
});

/**
 * Update conversation
 */
const updateConversation = catchAsync(async (req, res) => {
  logger.info(
    '[Chat Controller] Updating conversation:',
    req.params.conversationId
  );
  const conversation = await conversationService.updateConversation(
    req.user,
    req.params.conversationId,
    req.body
  );
  res.send(conversation);
});

/**
 * Add participant to conversation
 */
const addParticipant = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Adding participant:', {
    conversationId: req.params.conversationId,
    userId: req.body.userId,
  });

  if (!req.body.userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const conversation = await conversationService.addParticipant(
    req.user,
    req.params.conversationId,
    req.body.userId
  );
  res.send(conversation);
});

/**
 * Remove participant from conversation
 */
const removeParticipant = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Removing participant:', {
    conversationId: req.params.conversationId,
    userId: req.params.userId || req.body.userId,
  });

  const userId = req.params.userId || req.body.userId;
  if (!userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const conversation = await conversationService.removeParticipant(
    req.user,
    req.params.conversationId,
    userId
  );
  res.send(conversation);
});

/**
 * Add admin to group/channel
 */
const addAdmin = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Adding admin:', {
    conversationId: req.params.conversationId,
    userId: req.body.userId,
  });

  if (!req.body.userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const conversation = await conversationService.addAdmin(
    req.user,
    req.params.conversationId,
    req.body.userId
  );
  res.send(conversation);
});

/**
 * Remove admin from group/channel
 */
const removeAdmin = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Removing admin:', {
    conversationId: req.params.conversationId,
    userId: req.body.userId,
  });

  if (!req.body.userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const conversation = await conversationService.removeAdmin(
    req.user,
    req.params.conversationId,
    req.body.userId
  );
  res.send(conversation);
});

/**
 * Discover public channels
 */
const discoverChannels = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Discovering channels:', {
    userId: req.user._id,
  });

  const filter = pick(req.query, ['nodeId', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  const result = await conversationService.discoverChannels(
    req.user,
    filter,
    options
  );
  res.send(result);
});

/**
 * Add moderator to channel
 */
const addModerator = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Adding moderator:', {
    conversationId: req.params.conversationId,
    userId: req.body.userId,
  });

  if (!req.body.userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const conversation = await conversationService.addModerator(
    req.user,
    req.params.conversationId,
    req.body.userId
  );
  res.send(conversation);
});

/**
 * Remove moderator from channel
 */
const removeModerator = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Removing moderator:', {
    conversationId: req.params.conversationId,
    userId: req.body.userId,
  });

  if (!req.body.userId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'userId is required');
  }

  const conversation = await conversationService.removeModerator(
    req.user,
    req.params.conversationId,
    req.body.userId
  );
  res.send(conversation);
});

// ==================== Message Controllers ====================

/**
 * Send a chat message
 */
const sendMessage = catchAsync(async (req, res) => {
  logger.info({
    event: 'API_MESSAGE_SEND',
    userId: req.user._id.toString(),
    tenantId: req.user.tenantId,
    conversationId: req.body.conversationId,
    messageType: req.body.messageType || 'text',
    timestamp: new Date().toISOString(),
  });

  const message = await chatMessageService.sendMessage(req.user, req.body);
  res.status(httpStatus.CREATED).send(message);
});

/**
 * Get messages in a conversation
 */
const getMessages = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Getting messages:', {
    conversationId: req.params.conversationId,
    userId: req.user._id,
  });

  const options = pick(req.query, [
    'limit',
    'page',
    'before',
    'after',
    'threadId',
    'sortBy',
  ]);

  const result = await chatMessageService.getMessages(
    req.user,
    req.params.conversationId,
    options
  );
  res.send(result);
});

/**
 * Get message by ID
 */
const getMessageById = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Getting message:', req.params.messageId);
  const message = await chatMessageService.getMessageById(
    req.user,
    req.params.messageId
  );
  res.send(message);
});

/**
 * Update message (edit or pin)
 */
const updateMessage = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Updating message:', req.params.messageId);
  const message = await chatMessageService.updateMessage(
    req.user,
    req.params.messageId,
    req.body
  );
  res.send(message);
});

/**
 * Delete message
 */
const deleteMessage = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Deleting message:', req.params.messageId);
  await chatMessageService.deleteMessage(req.user, req.params.messageId);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Mark message as read
 */
const markMessageAsRead = catchAsync(async (req, res) => {
  logger.info('[Chat Controller] Marking message as read:', req.params.messageId);
  const message = await chatMessageService.markAsRead(
    req.user,
    req.params.messageId
  );
  res.send(message);
});

/**
 * Mark message as delivered
 */
const markMessageAsDelivered = catchAsync(async (req, res) => {
  logger.info(
    '[Chat Controller] Marking message as delivered:',
    req.params.messageId
  );
  const message = await chatMessageService.markAsDelivered(
    req.user,
    req.params.messageId
  );
  res.send(message);
});

module.exports = {
  // Conversation endpoints
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  addParticipant,
  removeParticipant,
  addAdmin,
  removeAdmin,
  // Channel endpoints
  discoverChannels,
  addModerator,
  removeModerator,
  // Message endpoints
  sendMessage,
  getMessages,
  getMessageById,
  updateMessage,
  deleteMessage,
  markMessageAsRead,
  markMessageAsDelivered,
};


