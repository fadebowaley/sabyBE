const { getIO } = require('../config/socket');
const logger = require('../config/logger');
const User = require('../models/user.model');
const { chatMessageService } = require('./chatMessage.service');
const { conversationService } = require('./conversation.service');
const { getPresenceService } = require('./presence.service');
const { getTypingIndicatorService } = require('./typingIndicator.service');
const {
  checkMessageRateLimit,
  checkTypingRateLimit,
} = require('./socketRateLimit.service');

/**
 * Chat Socket Service
 * Handles Socket.IO events for real-time chat functionality
 */
class ChatSocketService {
  constructor() {
    this.io = null;
    this.setupSocketHandlers();
  }

  /**
   * Initialize socket handlers when Socket.IO is ready
   */
  setupSocketHandlers() {
    // Get IO instance (may not be initialized yet, will be set when socket is initialized)
    try {
      this.io = getIO();
      this.attachHandlers();
    } catch (error) {
      // Socket.IO not initialized yet, handlers will be attached when socket initializes
      logger.warn(
        'Socket.IO not initialized yet, handlers will be attached later'
      );
    }
  }

  /**
   * Set IO instance
   */
  setIO(ioInstance) {
    this.io = ioInstance;
  }

  /**
   * Attach event handlers to Socket.IO
   * Called after Socket.IO is initialized
   */
  attachHandlers() {
    if (!this.io) {
      try {
        this.io = getIO();
      } catch (error) {
        logger.error('Socket.IO not initialized yet');
        return;
      }
    }

    this.io.on('connection', (socket) => {
      // Chat-specific event handlers
      this.handleChatJoin(socket);
      this.handleChatLeave(socket);
      this.handleChatMessage(socket);
      this.handleChatTyping(socket);
      this.handleChatRead(socket);
      this.handleChatDelivered(socket);
      this.handlePresenceHeartbeat(socket);
    });

    logger.info('✅ Chat Socket.IO event handlers attached');
  }

  /**
   * Handle joining a conversation room
   */
  handleChatJoin(socket) {
    socket.on('chat:join', async (data) => {
      try {
        const { conversationId } = data;

        if (!conversationId) {
          socket.emit('error', { message: 'conversationId is required' });
          return;
        }

        // Fetch full user document for node access checks
        const userDoc = await User.findById(socket.userId).lean();
        if (!userDoc) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Verify user has access to conversation (includes node access checks)
        const user = {
          _id: socket.userId,
          tenantId: socket.tenantId,
          isOwner: userDoc.isOwner,
          isSuper: userDoc.isSuper,
          isSaby: userDoc.isSaby,
        };
        await conversationService.getConversationById(user, conversationId);

        // Join the room
        socket.join(`conversation:${conversationId}`);
        logger.info({
          event: 'CHAT_JOINED',
          userId: socket.userId,
          tenantId: socket.tenantId,
          conversationId,
          timestamp: new Date().toISOString(),
        });

        socket.emit('chat:joined', {
          conversationId,
          timestamp: new Date(),
        });

        // Notify others in the conversation (optional)
        socket.to(`conversation:${conversationId}`).emit('chat:user:joined', {
          userId: socket.userId,
          conversationId,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error({
          event: 'CHAT_JOIN_ERROR',
          userId: socket.userId,
          tenantId: socket.tenantId,
          conversationId: data?.conversationId,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        socket.emit('error', {
          message: 'Failed to join conversation',
          error: error.message,
        });
      }
    });
  }

  /**
   * Handle leaving a conversation room
   */
  handleChatLeave(socket) {
    socket.on('chat:leave', async (data) => {
      try {
        const { conversationId } = data;

        if (!conversationId) {
          socket.emit('error', { message: 'conversationId is required' });
          return;
        }

        socket.leave(`conversation:${conversationId}`);
        logger.info({
          event: 'CHAT_LEFT',
          userId: socket.userId,
          tenantId: socket.tenantId,
          conversationId,
          timestamp: new Date().toISOString(),
        });

        socket.emit('chat:left', {
          conversationId,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Error handling chat:leave:', error);
        socket.emit('error', {
          message: 'Failed to leave conversation',
          error: error.message,
        });
      }
    });
  }

  /**
   * Handle incoming chat messages
   */
  handleChatMessage(socket) {
    socket.on('chat:message', async (data) => {
      try {
        const {
          conversationId,
          content,
          messageType,
          attachments,
          metadata,
          threadId,
          replyTo,
        } = data;

        if (!conversationId || !content) {
          socket.emit('error', {
            message: 'conversationId and content are required',
          });
          return;
        }

        // Check rate limit for messages
        if (!socket.userId || !socket.tenantId) {
          socket.emit('error', {
            message: 'User authentication required',
          });
          return;
        }

        const rateLimitResult = await checkMessageRateLimit(
          socket.userId,
          socket.tenantId
        );

        if (!rateLimitResult.allowed) {
          socket.emit('rate-limit-exceeded', {
            type: 'MESSAGE',
            message: `Rate limit exceeded. Maximum ${rateLimitResult.limit} messages per minute.`,
            remaining: rateLimitResult.remaining,
            resetAt: rateLimitResult.resetAt,
            limit: rateLimitResult.limit,
          });
          logger.warn(
            `🚫 Rate limit exceeded for user ${socket.userId} (${rateLimitResult.currentCount}/${rateLimitResult.limit} messages)`
          );
          return;
        }

        // Fetch full user document for node access checks
        const userDoc = await User.findById(socket.userId).lean();
        if (!userDoc) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Get user object with full properties for node access
        const user = {
          _id: socket.userId,
          tenantId: socket.tenantId,
          isOwner: userDoc.isOwner,
          isSuper: userDoc.isSuper,
          isSaby: userDoc.isSaby,
        };

        // Save message to database and broadcast
        const message = await chatMessageService.sendMessage(user, {
          conversationId,
          content,
          messageType,
          attachments,
          metadata,
          threadId,
          replyTo,
        });

        logger.info({
          event: 'CHAT_MESSAGE_SENT_VIA_SOCKET',
          messageId: message._id.toString(),
          conversationId,
          userId: socket.userId,
          tenantId: socket.tenantId,
          rateLimitRemaining: rateLimitResult.remaining,
          rateLimitLimit: rateLimitResult.limit,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error({
          event: 'CHAT_MESSAGE_SOCKET_ERROR',
          userId: socket.userId,
          tenantId: socket.tenantId,
          conversationId: data?.conversationId,
          error: error.message,
          errorCode: error.statusCode,
          timestamp: new Date().toISOString(),
        });
        socket.emit('error', {
          message: 'Failed to send message',
          error: error.message,
        });
      }
    });
  }

  /**
   * Handle typing indicators
   */
  handleChatTyping(socket) {
    socket.on('chat:typing', async (data) => {
      try {
        const { conversationId, isTyping } = data;

        if (!conversationId) {
          socket.emit('error', { message: 'conversationId is required' });
          return;
        }

        // Check rate limit for typing indicators (only when starting to type)
        if (isTyping !== false && socket.userId && socket.tenantId) {
          const rateLimitResult = await checkTypingRateLimit(
            socket.userId,
            socket.tenantId,
            socket.id
          );

          if (!rateLimitResult.allowed) {
            // Silently ignore typing rate limit exceeded (non-critical)
            logger.debug(
              `🚫 Typing rate limit exceeded for user ${socket.userId} socket ${socket.id} (${rateLimitResult.currentCount}/${rateLimitResult.limit} events)`
            );
            return;
          }
        }

        // Fetch full user document for node access checks
        const userDoc = await User.findById(socket.userId).lean();
        if (!userDoc) {
          return; // Silently fail for typing indicators
        }

        // Verify user has access to conversation (includes node access checks)
        const user = {
          _id: socket.userId,
          tenantId: socket.tenantId,
          isOwner: userDoc.isOwner,
          isSuper: userDoc.isSuper,
          isSaby: userDoc.isSaby,
        };
        try {
          await conversationService.getConversationById(user, conversationId);
        } catch (error) {
          logger.warn(
            `User ${socket.userId} attempted to send typing indicator for inaccessible conversation ${conversationId}`
          );
          return;
        }

        // Set typing status in Redis and broadcast
        const typingIndicatorService = getTypingIndicatorService();
        await typingIndicatorService.setTyping(
          conversationId,
          socket.userId,
          isTyping !== false // Default to true if not specified
        );

        logger.debug(
          `⌨️  User ${socket.userId} ${
            isTyping !== false ? 'is typing' : 'stopped typing'
          } in conversation ${conversationId}`
        );
      } catch (error) {
        logger.error('Error handling chat:typing:', error);
        // Don't emit error for typing indicators (non-critical)
      }
    });
  }

  /**
   * Handle message read receipts
   */
  handleChatRead(socket) {
    socket.on('chat:read', async (data) => {
      try {
        const { messageId } = data;

        if (!messageId) {
          socket.emit('error', { message: 'messageId is required' });
          return;
        }

        // Update message read status in database
        const user = { _id: socket.userId, tenantId: socket.tenantId };
        await chatMessageService.markAsRead(user, messageId);

        logger.debug(
          `👁️  Message ${messageId} marked as read by user ${socket.userId}`
        );
      } catch (error) {
        logger.error('Error handling chat:read:', error);
        socket.emit('error', {
          message: 'Failed to mark message as read',
          error: error.message,
        });
      }
    });
  }

  /**
   * Handle presence heartbeat (refresh online status)
   */
  handlePresenceHeartbeat(socket) {
    socket.on('chat:presence:heartbeat', async () => {
      try {
        if (!socket.userId || !socket.tenantId) {
          return;
        }

        const presenceService = getPresenceService();
        await presenceService.refreshHeartbeat(socket.userId, socket.tenantId);

        logger.debug(`💓 Presence heartbeat from user ${socket.userId}`);
      } catch (error) {
        logger.error('Error handling presence heartbeat:', error);
        // Don't emit error for heartbeat (non-critical)
      }
    });
  }

  /**
   * Handle message delivery receipts
   */
  handleChatDelivered(socket) {
    socket.on('chat:delivered', async (data) => {
      try {
        const { messageId } = data;

        if (!messageId) {
          socket.emit('error', { message: 'messageId is required' });
          return;
        }

        // Update message delivery status in database
        const user = { _id: socket.userId, tenantId: socket.tenantId };
        await chatMessageService.markAsDelivered(user, messageId);

        logger.debug({
          event: 'CHAT_MESSAGE_DELIVERED_VIA_SOCKET',
          messageId,
          userId: socket.userId,
          tenantId: socket.tenantId,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error handling chat:delivered:', error);
        // Don't emit error for delivery receipts (non-critical)
      }
    });
  }

  /**
   * Emit message to conversation room
   * Used by services to send messages via Socket.IO
   */
  emitMessage(conversationId, message) {
    if (!this.io) {
      this.io = getIO();
    }
    this.io.to(`conversation:${conversationId}`).emit('chat:message', message);
  }

  /**
   * Emit typing indicator
   */
  emitTyping(conversationId, userId, isTyping) {
    if (!this.io) {
      this.io = getIO();
    }
    this.io.to(`conversation:${conversationId}`).emit('chat:typing', {
      userId,
      conversationId,
      isTyping,
      timestamp: new Date(),
    });
  }

  /**
   * Emit read receipt
   */
  emitReadReceipt(conversationId, messageId, userId) {
    if (!this.io) {
      this.io = getIO();
    }
    this.io.to(`conversation:${conversationId}`).emit('chat:read', {
      messageId,
      readBy: userId,
      readAt: new Date(),
    });
  }

  /**
   * Emit delivery receipt
   */
  emitDeliveryReceipt(conversationId, messageId, userId) {
    if (!this.io) {
      this.io = getIO();
    }
    this.io.to(`conversation:${conversationId}`).emit('chat:delivered', {
      messageId,
      deliveredTo: userId,
      deliveredAt: new Date(),
    });
  }
}

// Singleton instance
let chatSocketServiceInstance = null;

const getChatSocketService = () => {
  if (!chatSocketServiceInstance) {
    chatSocketServiceInstance = new ChatSocketService();
  }
  return chatSocketServiceInstance;
};

module.exports = {
  ChatSocketService,
  getChatSocketService,
};
