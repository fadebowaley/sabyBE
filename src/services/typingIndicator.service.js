const { redisClient } = require('../config/redis');
const logger = require('../config/logger');
const { getChatSocketService } = require('./chatSocket.service');
const Conversation = require('../models/conversation.model');

/**
 * Typing Indicator Service
 * Manages typing status using Redis with short TTL (3 seconds)
 */
class TypingIndicatorService {
  /**
   * Set typing status for a user in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @param {boolean} isTyping - Whether user is typing
   * @param {number} ttl - Time to live in seconds (default: 3)
   * @returns {Promise<void>}
   */
  async setTyping(conversationId, userId, isTyping, ttl = 3) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        logger.warn('[Typing Indicator Service] Redis not available, skipping typing update');
        return;
      }

      const key = this.getTypingKey(conversationId, userId);

      if (isTyping) {
        // Set typing status with short TTL
        const value = JSON.stringify({
          conversationId,
          userId,
          isTyping: true,
          timestamp: new Date().toISOString(),
        });

        await redisClient.setex(key, ttl, value);
        logger.debug(`[Typing Indicator Service] User ${userId} is typing in conversation ${conversationId}`);
      } else {
        // Remove typing status
        await redisClient.del(key);
        logger.debug(`[Typing Indicator Service] User ${userId} stopped typing in conversation ${conversationId}`);
      }

      // Broadcast typing indicator to conversation participants
      await this.broadcastTypingIndicator(conversationId, userId, isTyping);
    } catch (error) {
      logger.error('[Typing Indicator Service] Error setting typing status:', error);
      throw error;
    }
  }

  /**
   * Get typing status for a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} excludeUserId - User ID to exclude from results
   * @returns {Promise<Array>} Array of users currently typing
   */
  async getTypingUsers(conversationId, excludeUserId = null) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return [];
      }

      const pattern = this.getTypingKey(conversationId, '*');
      const stream = redisClient.scanStream({
        match: pattern,
        count: 100,
      });

      const typingUsers = [];

      return new Promise((resolve, reject) => {
        stream.on('data', async (keys) => {
          for (const key of keys) {
            try {
              const value = await redisClient.get(key);
              if (value) {
                const typingData = JSON.parse(value);
                if (typingData.isTyping) {
                  // Extract userId from key pattern
                  const userId = key.split(':').pop();
                  if (userId !== excludeUserId) {
                    typingUsers.push({
                      userId,
                      conversationId,
                      timestamp: typingData.timestamp,
                    });
                  }
                }
              }
            } catch (error) {
              logger.error('[Typing Indicator Service] Error parsing typing data:', error);
            }
          }
        });

        stream.on('end', () => {
          resolve(typingUsers);
        });

        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('[Typing Indicator Service] Error getting typing users:', error);
      return [];
    }
  }

  /**
   * Check if a specific user is typing in a conversation
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isUserTyping(conversationId, userId) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return false;
      }

      const key = this.getTypingKey(conversationId, userId);
      const value = await redisClient.get(key);

      if (!value) {
        return false;
      }

      const typingData = JSON.parse(value);
      return typingData.isTyping === true;
    } catch (error) {
      logger.error('[Typing Indicator Service] Error checking typing status:', error);
      return false;
    }
  }

  /**
   * Clean up expired typing indicators (called periodically)
   * Note: Redis TTL handles expiration automatically, but this ensures cleanup
   * @param {string} conversationId - Optional conversation ID to clean up
   * @returns {Promise<number>} Number of cleaned entries
   */
  async cleanupExpiredTyping(conversationId = null) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return 0;
      }

      const pattern = conversationId
        ? this.getTypingKey(conversationId, '*')
        : 'typing:*:*';

      const stream = redisClient.scanStream({
        match: pattern,
        count: 100,
      });

      let cleanedCount = 0;

      return new Promise((resolve, reject) => {
        stream.on('data', async (keys) => {
          for (const key of keys) {
            const ttl = await redisClient.ttl(key);
            // If key is expired (TTL = -2), it doesn't exist anymore
            // If TTL = -1, it has no expiration (shouldn't happen for typing indicators)
            if (ttl === -2) {
              cleanedCount++;
            } else if (ttl === -1) {
              // Key exists but has no expiration, remove it
              await redisClient.del(key);
              cleanedCount++;
            }
          }
        });

        stream.on('end', () => resolve(cleanedCount));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('[Typing Indicator Service] Error cleaning up expired typing:', error);
      return 0;
    }
  }

  /**
   * Broadcast typing indicator to conversation participants
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID who is typing
   * @param {boolean} isTyping - Whether user is typing
   * @returns {Promise<void>}
   */
  async broadcastTypingIndicator(conversationId, userId, isTyping) {
    try {
      const chatSocketService = getChatSocketService();
      const typingData = {
        userId,
        conversationId,
        isTyping,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to all participants in the conversation (except the sender)
      chatSocketService.io
        .to(`conversation:${conversationId}`)
        .emit('chat:typing', typingData);

      logger.debug(
        `[Typing Indicator Service] Broadcasted typing indicator for user ${userId} in conversation ${conversationId}: ${isTyping}`
      );
    } catch (error) {
      logger.error('[Typing Indicator Service] Error broadcasting typing indicator:', error);
    }
  }

  /**
   * Get Redis key for typing indicator
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @returns {string}
   */
  getTypingKey(conversationId, userId) {
    return `typing:${conversationId}:${userId}`;
  }

  /**
   * Debounce typing indicator (prevents excessive updates)
   * Use this wrapper to debounce typing events on the client side
   * Server-side debouncing is handled by Redis TTL (3 seconds)
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID
   * @param {boolean} isTyping - Whether user is typing
   * @param {number} debounceMs - Debounce time in milliseconds (default: 500)
   * @returns {Promise<void>}
   */
  async setTypingDebounced(conversationId, userId, isTyping, debounceMs = 500) {
    // Client-side debouncing is recommended
    // Server-side, we just set the typing status
    // The Redis TTL (3 seconds) acts as a natural debounce
    return this.setTyping(conversationId, userId, isTyping);
  }
}

// Singleton instance
let typingIndicatorServiceInstance = null;

const getTypingIndicatorService = () => {
  if (!typingIndicatorServiceInstance) {
    typingIndicatorServiceInstance = new TypingIndicatorService();
  }
  return typingIndicatorServiceInstance;
};

module.exports = {
  TypingIndicatorService,
  getTypingIndicatorService,
};


