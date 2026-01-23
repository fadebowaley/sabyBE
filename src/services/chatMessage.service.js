const httpStatus = require('http-status');
const ChatMessage = require('../models/chatMessage.model');
const Conversation = require('../models/conversation.model');
const User = require('../models/user.model');
const Storage = require('../models/storage.model');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { getChatSocketService } = require('./chatSocket.service');
const { nodeAccessService } = require('./nodeAccess.service');
const { conversationService } = require('./conversation.service');
const { checkAbuse } = require('./abusePrevention.service');

/**
 * Process attachments - validate and store references
 * @param {Array} attachments - Array of attachment objects
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Processed attachments
 */
const processAttachments = async (attachments, tenantId, userId) => {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  logger.info(`[ChatMessage Service] Processing ${attachments.length} attachments`);

  const processedAttachments = [];

  for (const attachment of attachments) {
    // If fileId is provided, verify it exists
    if (attachment.fileId) {
      const file = await Storage.findOne({
        _id: attachment.fileId,
        tenantId,
        userId,
      });

      if (file) {
        processedAttachments.push({
          fileId: file._id,
          url: file.storageUrl,
          filename: file.originalName,
          size: file.fileSize,
          mimeType: file.mimeType,
          thumbnailUrl: attachment.thumbnailUrl,
          width: attachment.width,
          height: attachment.height,
        });
        logger.debug(`[ChatMessage Service] Attached file: ${file.originalName}`);
      } else {
        logger.warn(
          `[ChatMessage Service] File ${attachment.fileId} not found, skipping`
        );
      }
    } else if (attachment.url) {
      // Direct URL provided
      processedAttachments.push({
        url: attachment.url,
        filename: attachment.filename || 'attachment',
        size: attachment.size || 0,
        mimeType: attachment.mimeType || 'application/octet-stream',
        thumbnailUrl: attachment.thumbnailUrl,
        width: attachment.width,
        height: attachment.height,
      });
    }
  }

  return processedAttachments;
};

/**
 * Send a chat message
 * @param {Object} user - User object
 * @param {Object} messageData - Message data
 * @param {string} messageData.conversationId - Conversation ID
 * @param {string} messageData.content - Message content
 * @param {string} messageData.messageType - Message type (text, file, image, etc.)
 * @param {Array} messageData.attachments - Attachments
 * @param {Object} messageData.metadata - Metadata (mentions, urls, etc.)
 * @param {string} messageData.threadId - Thread ID (for threaded replies)
 * @param {string} messageData.replyTo - Message ID this is replying to
 * @returns {Promise<Object>} Created message
 */
const sendMessage = async (user, messageData) => {
  try {
    const {
      conversationId,
      content,
      messageType = 'text',
      attachments = [],
      metadata = {},
      threadId,
      replyTo,
    } = messageData;

    // Verify conversation exists and user has access
    const conversation = await Conversation.findOne({
      _id: conversationId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!conversation) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Conversation not found or access denied'
      );
    }

    // Verify user is a participant
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === user._id.toString()
    );

    if (!isParticipant) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You are not a participant in this conversation'
      );
    }

    // For channels, check posting permissions
    if (conversation.type === 'channel') {
      const canPost = conversation.canPost(user._id);
      if (!canPost) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You do not have permission to post in this channel'
        );
      }
    }

    // Check for abuse (spam detection, flood prevention)
    if (content && messageType === 'text') {
      const abuseCheck = await checkAbuse({
        userId: user._id.toString(),
        tenantId: user.tenantId,
        content,
      });

      if (!abuseCheck.allowed) {
        logger.warn({
          event: 'MESSAGE_BLOCKED_BY_ABUSE_PREVENTION',
          userId: user._id,
          tenantId: user.tenantId,
          conversationId,
          reason: abuseCheck.reason,
          violations: abuseCheck.violations,
        });

        throw new ApiError(
          httpStatus.TOO_MANY_REQUESTS,
          abuseCheck.message || 'Message blocked due to abuse prevention policies'
        );
      }
    }

    // Process attachments
    const processedAttachments = await processAttachments(
      attachments,
      user.tenantId,
      user._id
    );

    // Create message
    const message = await ChatMessage.create({
      tenantId: user.tenantId,
      conversationId,
      from: user._id,
      to: conversation.participants.filter(
        (p) => p.toString() !== user._id.toString()
      ),
      nodeId: conversation.nodeId,
      content,
      messageType,
      attachments: processedAttachments,
      metadata,
      threadId,
      replyTo,
      status: 'sent',
    });

    // Update conversation last message
    await conversation.updateLastMessage(message._id, user._id);

    // Emit via Socket.IO
    const chatSocketService = getChatSocketService();
    chatSocketService.emitMessage(conversationId, {
      ...message.toJSON(),
      id: message._id,
    });

    // Send notifications to offline recipients (async, don't wait)
    sendNotificationsToOfflineUsers({
      conversation,
      message,
      sender: user,
      tenantId: user.tenantId,
    }).catch((error) => {
      logger.error(
        '[ChatMessage Service] Error in notification sending (non-blocking):',
        error
      );
    });

    // Structured logging with correlation ID
    logger.info({
      event: 'CHAT_MESSAGE_SENT',
      messageId: message._id.toString(),
      conversationId: conversationId.toString(),
      userId: user._id.toString(),
      tenantId: user.tenantId,
      messageType,
      hasAttachments: processedAttachments.length > 0,
      attachmentCount: processedAttachments.length,
      timestamp: new Date().toISOString(),
    });

    return message;
  } catch (error) {
    logger.error({
      event: 'CHAT_MESSAGE_SEND_ERROR',
      conversationId: conversationId?.toString(),
      userId: user?._id?.toString(),
      tenantId: user?.tenantId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * Get messages in a conversation
 * @param {Object} user - User object
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Number of messages per page
 * @param {number} options.page - Page number
 * @param {Date} options.before - Get messages before this date
 * @param {Date} options.after - Get messages after this date
 * @param {string} options.threadId - Filter by thread ID
 * @returns {Promise<Object>} Paginated messages
 */
const getMessages = async (user, conversationId, options = {}) => {
  try {
    const {
      limit = 50,
      page = 1,
      before,
      after,
      threadId,
      sortBy = 'createdAt:desc',
    } = options;

    // Verify conversation exists and user has access
    // Use conversationService to ensure proper access checks including node access
    const conversation = await conversationService.getConversationById(
      user,
      conversationId
    );

    if (!conversation) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Conversation not found or access denied'
      );
    }

    // Build filter
    const filter = {
      conversationId,
      tenantId: user.tenantId,
      deletedAt: null,
    };

    if (threadId) {
      filter.threadId = threadId;
    }

    if (before) {
      filter.createdAt = { ...filter.createdAt, $lt: new Date(before) };
    }

    if (after) {
      filter.createdAt = { ...filter.createdAt, $gt: new Date(after) };
    }

    // Get messages with pagination
    const result = await ChatMessage.paginate(filter, {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sortBy,
      populate: ['from', 'replyTo', 'attachments.fileId'],
    });

    return result;
  } catch (error) {
    logger.error('[ChatMessage Service] Error getting messages:', error);
    throw error;
  }
};

/**
 * Get message by ID
 * @param {Object} user - User object
 * @param {string} messageId - Message ID
 * @returns {Promise<Object>} Message
 */
const getMessageById = async (user, messageId) => {
  try {
    const message = await ChatMessage.findOne({
      _id: messageId,
      tenantId: user.tenantId,
      deletedAt: null,
    })
      .populate('from', 'name email')
      .populate('replyTo')
      .populate('attachments.fileId');

    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
    }

    // Verify user has access to the conversation (includes node access checks)
    await conversationService.getConversationById(
      user,
      message.conversationId
    );

    return message;
  } catch (error) {
    logger.error('[ChatMessage Service] Error getting message:', error);
    throw error;
  }
};

/**
 * Update message (edit content)
 * @param {Object} user - User object
 * @param {string} messageId - Message ID
 * @param {Object} updateData - Update data
 * @param {string} updateData.content - New content
 * @returns {Promise<Object>} Updated message
 */
const updateMessage = async (user, messageId, updateData) => {
  try {
    const message = await ChatMessage.findOne({
      _id: messageId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
    }

    // Only message sender can edit
    if (message.from.toString() !== user._id.toString()) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You can only edit your own messages'
      );
    }

    // Edit message
    if (updateData.content) {
      await message.edit(updateData.content);
    }

    if (updateData.isPinned !== undefined) {
      message.isPinned = updateData.isPinned;
      if (updateData.isPinned) {
        message.pinnedAt = new Date();
      } else {
        message.pinnedAt = null;
      }
      await message.save();
    }

    // Emit update via Socket.IO
    const chatSocketService = getChatSocketService();
    chatSocketService.emitMessage(message.conversationId.toString(), {
      ...message.toJSON(),
      id: message._id,
      type: 'update',
    });

    logger.info(`[ChatMessage Service] Message ${messageId} updated`);

    return message;
  } catch (error) {
    logger.error('[ChatMessage Service] Error updating message:', error);
    throw error;
  }
};

/**
 * Delete message (soft delete)
 * @param {Object} user - User object
 * @param {string} messageId - Message ID
 * @returns {Promise<void>}
 */
const deleteMessage = async (user, messageId) => {
  try {
    const message = await ChatMessage.findOne({
      _id: messageId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
    }

    // Only message sender can delete (or admins - TODO: add admin check)
    if (message.from.toString() !== user._id.toString()) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You can only delete your own messages'
      );
    }

    // Soft delete
    await message.softDelete(user._id);

    // Emit deletion via Socket.IO
    const chatSocketService = getChatSocketService();
    chatSocketService.emitMessage(message.conversationId.toString(), {
      id: message._id,
      type: 'delete',
      deletedAt: message.deletedAt,
    });

    logger.info(`[ChatMessage Service] Message ${messageId} deleted`);

    return message;
  } catch (error) {
    logger.error('[ChatMessage Service] Error deleting message:', error);
    throw error;
  }
};

/**
 * Mark message as read
 * @param {Object} user - User object
 * @param {string} messageId - Message ID
 * @returns {Promise<Object>} Updated message
 */
const markAsRead = async (user, messageId) => {
  try {
    const message = await ChatMessage.findOne({
      _id: messageId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
    }

    // Mark as read
    await message.markAsRead(user._id);

    // Update conversation unread count
    const conversation = await Conversation.findById(message.conversationId);
    if (conversation) {
      await conversation.markAsRead(user._id);
    }

    // Emit read receipt via Socket.IO
    const chatSocketService = getChatSocketService();
    chatSocketService.emitReadReceipt(
      message.conversationId.toString(),
      messageId,
      user._id
    );

    logger.debug({
      event: 'CHAT_MESSAGE_READ',
      messageId: messageId.toString(),
      conversationId: message.conversationId.toString(),
      userId: user._id.toString(),
      tenantId: user.tenantId,
      timestamp: new Date().toISOString(),
    });

    return message;
  } catch (error) {
    logger.error({
      event: 'CHAT_MESSAGE_READ_ERROR',
      messageId: messageId?.toString(),
      userId: user?._id?.toString(),
      tenantId: user?.tenantId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * Mark message as delivered
 * @param {Object} user - User object
 * @param {string} messageId - Message ID
 * @returns {Promise<Object>} Updated message
 */
const markAsDelivered = async (user, messageId) => {
  try {
    const message = await ChatMessage.findOne({
      _id: messageId,
      tenantId: user.tenantId,
      deletedAt: null,
    });

    if (!message) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Message not found');
    }

    // Mark as delivered
    await message.markAsDelivered(user._id);

    // Emit delivery receipt via Socket.IO
    const chatSocketService = getChatSocketService();
    chatSocketService.emitDeliveryReceipt(
      message.conversationId.toString(),
      messageId,
      user._id
    );

    logger.debug({
      event: 'CHAT_MESSAGE_DELIVERED',
      messageId: messageId.toString(),
      conversationId: message.conversationId.toString(),
      userId: user._id.toString(),
      tenantId: user.tenantId,
      timestamp: new Date().toISOString(),
    });

    return message;
  } catch (error) {
    logger.error({
      event: 'CHAT_MESSAGE_DELIVERED_ERROR',
      messageId: messageId?.toString(),
      userId: user?._id?.toString(),
      tenantId: user?.tenantId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
};

/**
 * Send notifications to offline users who are participants
 * @param {Object} params - Notification parameters
 * @param {Object} params.conversation - Conversation object
 * @param {Object} params.message - Message object
 * @param {Object} params.sender - Sender user object
 * @param {string} params.tenantId - Tenant ID
 * @returns {Promise<void>}
 */
const sendNotificationsToOfflineUsers = async ({
  conversation,
  message,
  sender,
  tenantId,
}) => {
  try {
    // Skip notifications for system messages or if user is sending to themselves
    if (
      message.messageType === 'system' ||
      conversation.participants.length <= 1
    ) {
      return;
    }

    const presenceService = getPresenceService();
    const participants = await User.find({
      _id: { $in: conversation.participants },
      tenantId,
    })
      .select('_id email firstname lastname')
      .lean();

    // Get conversation name for notification
    const conversationName =
      conversation.name ||
      (conversation.type === 'direct'
        ? participants
            .find((p) => p._id.toString() !== sender._id.toString())
            ?.firstname || 'Conversation'
        : conversation.name || 'Conversation');

    // Check each participant's online status
    for (const participant of participants) {
      // Skip sender
      if (participant._id.toString() === sender._id.toString()) {
        continue;
      }

      // Check if user is online
      const isOnline = await presenceService.isOnline(
        participant._id.toString(),
        tenantId
      );

      // Only send notification if user is offline
      if (!isOnline && participant.email) {
        // Queue email notification (30-second delay to avoid spamming if user comes online)
        await notificationQueueService.queueChatNotification({
          recipientUserId: participant._id.toString(),
          recipientEmail: participant.email,
          recipientName: `${participant.firstname || ''} ${participant.lastname || ''}`.trim() || participant.email,
          senderName: `${sender.firstname || ''} ${sender.lastname || ''}`.trim() || sender.email || 'Someone',
          conversationName,
          conversationId: conversation._id.toString(),
          messagePreview: message.content ? message.content.substring(0, 100) : 'New message',
          tenantId,
          notificationType: 'email',
        });

        logger.debug({
          event: 'CHAT_NOTIFICATION_QUEUED',
          recipientUserId: participant._id.toString(),
          recipientEmail: participant.email,
          conversationId: conversation._id.toString(),
          conversationName,
          senderId: sender._id.toString(),
          tenantId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    // Don't fail message sending if notification fails
    logger.error({
      event: 'CHAT_NOTIFICATION_ERROR',
      conversationId: conversation?._id?.toString(),
      senderId: sender?._id?.toString(),
      tenantId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getMessageById,
  updateMessage,
  deleteMessage,
  markAsRead,
  markAsDelivered,
};

