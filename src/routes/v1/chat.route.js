const express = require('express');
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');
const validate = require('../../middlewares/validate');
const chatController = require('../../controllers/chat.controller');
const conversationValidation = require('../../validations/conversation.validation');
const chatMessageValidation = require('../../validations/chatMessage.validation');

const router = express.Router();

// ==================== Conversation Routes ====================

/**
 * Create a new conversation
 * POST /v1/chat/conversations
 */
router
  .route('/conversations')
  .post(
    hybridAuth(),
    requireAccess('chat:conversation:create'),
    validate(conversationValidation.createConversation),
    chatController.createConversation
  )
  .get(
    hybridAuth(),
    requireAccess('chat:conversation:read'),
    validate(conversationValidation.getConversations),
    chatController.getConversations
  );

/**
 * Get, update conversation by ID
 * GET, PATCH /v1/chat/conversations/:conversationId
 */
router
  .route('/conversations/:conversationId')
  .get(
    hybridAuth(),
    requireAccess('chat:conversation:read'),
    validate(conversationValidation.getConversation),
    chatController.getConversationById
  )
  .patch(
    hybridAuth(),
    requireAccess('chat:conversation:update'),
    validate(conversationValidation.updateConversation),
    chatController.updateConversation
  );

/**
 * Add participant to conversation
 * POST /v1/chat/conversations/:conversationId/participants
 */
router
  .route('/conversations/:conversationId/participants')
  .post(
    hybridAuth(),
    requireAccess('chat:conversation:update'),
    validate(conversationValidation.addParticipant),
    chatController.addParticipant
  );

/**
 * Remove participant from conversation
 * DELETE /v1/chat/conversations/:conversationId/participants/:userId
 */
router
  .route('/conversations/:conversationId/participants/:userId')
  .delete(
    hybridAuth(),
    requireAccess('chat:conversation:update'),
    validate(conversationValidation.removeParticipant),
    chatController.removeParticipant
  );

/**
 * Add admin to group/channel
 * POST /v1/chat/conversations/:conversationId/admins
 */
router
  .route('/conversations/:conversationId/admins')
  .post(
    hybridAuth(),
    requireAccess('chat:group:manage'),
    validate(conversationValidation.addAdmin),
    chatController.addAdmin
  );

/**
 * Remove admin from group/channel
 * DELETE /v1/chat/conversations/:conversationId/admins
 */
router
  .route('/conversations/:conversationId/admins')
  .delete(
    hybridAuth(),
    requireAccess('chat:group:manage'),
    validate(conversationValidation.removeAdmin),
    chatController.removeAdmin
  );

/**
 * Discover public channels
 * GET /v1/chat/channels/discover
 */
router
  .route('/channels/discover')
  .get(
    hybridAuth(),
    requireAccess('chat:conversation:read'),
    validate(conversationValidation.discoverChannels),
    chatController.discoverChannels
  );

/**
 * Add/remove moderator to/from channel
 * POST, DELETE /v1/chat/conversations/:conversationId/moderators
 */
router
  .route('/conversations/:conversationId/moderators')
  .post(
    hybridAuth(),
    requireAccess('chat:channel:manage'),
    validate(conversationValidation.addAdmin), // Reuse same validation
    chatController.addModerator
  )
  .delete(
    hybridAuth(),
    requireAccess('chat:channel:manage'),
    validate(conversationValidation.removeAdmin), // Reuse same validation
    chatController.removeModerator
  );

// ==================== Message Routes ====================

/**
 * Send a message in a conversation
 * POST /v1/chat/conversations/:conversationId/messages
 */
router
  .route('/conversations/:conversationId/messages')
  .post(
    hybridAuth(),
    requireAccess('chat:message:create'),
    validate(chatMessageValidation.createMessage),
    chatController.sendMessage
  )
  .get(
    hybridAuth(),
    requireAccess('chat:message:read'),
    validate(chatMessageValidation.getMessages),
    chatController.getMessages
  );

/**
 * Get, update, delete message by ID
 * GET, PATCH, DELETE /v1/chat/messages/:messageId
 */
router
  .route('/messages/:messageId')
  .get(
    hybridAuth(),
    requireAccess('chat:message:read'),
    validate(chatMessageValidation.getMessage),
    chatController.getMessageById
  )
  .patch(
    hybridAuth(),
    requireAccess('chat:message:update'),
    validate(chatMessageValidation.updateMessage),
    chatController.updateMessage
  )
  .delete(
    hybridAuth(),
    requireAccess('chat:message:delete'),
    validate(chatMessageValidation.getMessage),
    chatController.deleteMessage
  );

/**
 * Mark message as read
 * POST /v1/chat/messages/:messageId/read
 */
router
  .route('/messages/:messageId/read')
  .post(
    hybridAuth(),
    requireAccess('chat:message:update'),
    validate(chatMessageValidation.getMessage),
    chatController.markMessageAsRead
  );

/**
 * Mark message as delivered
 * POST /v1/chat/messages/:messageId/delivered
 */
router
  .route('/messages/:messageId/delivered')
  .post(
    hybridAuth(),
    requireAccess('chat:message:update'),
    validate(chatMessageValidation.getMessage),
    chatController.markMessageAsDelivered
  );

module.exports = router;
