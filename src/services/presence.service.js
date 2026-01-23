const { redisClient } = require('../config/redis');
const logger = require('../config/logger');
const { getChatSocketService } = require('./chatSocket.service');
const Conversation = require('../models/conversation.model');

/**
 * Presence Service
 * Manages user online/offline status using Redis with TTL
 */
class PresenceService {
  /**
   * Set user online status
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {number} ttl - Time to live in seconds (default: 60)
   * @returns {Promise<void>}
   */
  async setOnline(userId, tenantId, ttl = 60) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        logger.warn('[Presence Service] Redis not available, skipping presence update');
        return;
      }

      const key = this.getPresenceKey(userId, tenantId);
      const value = JSON.stringify({
        userId,
        tenantId,
        status: 'online',
        lastSeen: new Date().toISOString(),
      });

      // Set with expiration (TTL)
      await redisClient.setex(key, ttl, value);
      logger.debug(`[Presence Service] User ${userId} set to online`);

      // Broadcast presence change to user's conversations
      await this.broadcastPresenceChange(userId, tenantId, 'online');
    } catch (error) {
      logger.error('[Presence Service] Error setting online status:', error);
      throw error;
    }
  }

  /**
   * Set user offline status
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<void>}
   */
  async setOffline(userId, tenantId) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        logger.warn('[Presence Service] Redis not available, skipping presence update');
        return;
      }

      const key = this.getPresenceKey(userId, tenantId);
      const value = JSON.stringify({
        userId,
        tenantId,
        status: 'offline',
        lastSeen: new Date().toISOString(),
      });

      // Store offline status (no expiration for offline status)
      await redisClient.set(key, value);
      logger.debug(`[Presence Service] User ${userId} set to offline`);

      // Broadcast presence change to user's conversations
      await this.broadcastPresenceChange(userId, tenantId, 'offline');
    } catch (error) {
      logger.error('[Presence Service] Error setting offline status:', error);
      throw error;
    }
  }

  /**
   * Check if user is online
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<boolean>}
   */
  async isOnline(userId, tenantId) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return false;
      }

      const key = this.getPresenceKey(userId, tenantId);
      const value = await redisClient.get(key);

      if (!value) {
        return false;
      }

      const presence = JSON.parse(value);
      return presence.status === 'online';
    } catch (error) {
      logger.error('[Presence Service] Error checking online status:', error);
      return false;
    }
  }

  /**
   * Get user presence info
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object|null>}
   */
  async getPresence(userId, tenantId) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return null;
      }

      const key = this.getPresenceKey(userId, tenantId);
      const value = await redisClient.get(key);

      if (!value) {
        return {
          userId,
          tenantId,
          status: 'offline',
          lastSeen: null,
        };
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error('[Presence Service] Error getting presence:', error);
      return null;
    }
  }

  /**
   * Get presence for multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Map of userId -> presence info
   */
  async getMultiplePresence(userIds, tenantId) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return {};
      }

      const keys = userIds.map((userId) => this.getPresenceKey(userId, tenantId));
      const values = await redisClient.mget(...keys);

      const presenceMap = {};
      userIds.forEach((userId, index) => {
        const value = values[index];
        if (value) {
          try {
            presenceMap[userId] = JSON.parse(value);
          } catch (error) {
            presenceMap[userId] = {
              userId,
              tenantId,
              status: 'offline',
              lastSeen: null,
            };
          }
        } else {
          presenceMap[userId] = {
            userId,
            tenantId,
            status: 'offline',
            lastSeen: null,
          };
        }
      });

      return presenceMap;
    } catch (error) {
      logger.error('[Presence Service] Error getting multiple presence:', error);
      return {};
    }
  }

  /**
   * Refresh online status (heartbeat)
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {number} ttl - Time to live in seconds (default: 60)
   * @returns {Promise<void>}
   */
  async refreshHeartbeat(userId, tenantId, ttl = 60) {
    try {
      const wasOnline = await this.isOnline(userId, tenantId);
      await this.setOnline(userId, tenantId, ttl);

      // Only broadcast if status changed from offline to online
      if (!wasOnline) {
        await this.broadcastPresenceChange(userId, tenantId, 'online');
      }
    } catch (error) {
      logger.error('[Presence Service] Error refreshing heartbeat:', error);
    }
  }

  /**
   * Broadcast presence change to user's conversations
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @param {string} status - 'online' or 'offline'
   * @returns {Promise<void>}
   */
  async broadcastPresenceChange(userId, tenantId, status) {
    try {
      // Find all conversations where user is a participant
      const conversations = await Conversation.find({
        tenantId,
        participants: userId,
        deletedAt: null,
      }).select('_id');

      const chatSocketService = getChatSocketService();
      const presenceData = {
        userId,
        tenantId,
        status,
        lastSeen: new Date().toISOString(),
      };

      // Broadcast to each conversation
      conversations.forEach((conversation) => {
        chatSocketService.io
          .to(`conversation:${conversation._id}`)
          .emit('chat:presence', presenceData);
      });

      logger.debug(
        `[Presence Service] Broadcasted ${status} status for user ${userId} to ${conversations.length} conversations`
      );
    } catch (error) {
      logger.error('[Presence Service] Error broadcasting presence change:', error);
    }
  }

  /**
   * Get Redis key for presence
   * @param {string} userId - User ID
   * @param {string} tenantId - Tenant ID
   * @returns {string}
   */
  getPresenceKey(userId, tenantId) {
    return `presence:${tenantId}:${userId}`;
  }

  /**
   * Clean up expired presence entries (can be called periodically)
   * Note: Redis TTL handles expiration automatically, but this can be used for cleanup
   * @param {string} tenantId - Optional tenant ID to clean up
   * @returns {Promise<number>} Number of cleaned entries
   */
  async cleanupExpiredPresence(tenantId = null) {
    try {
      if (!redisClient || redisClient.status !== 'ready') {
        return 0;
      }

      const pattern = tenantId
        ? `presence:${tenantId}:*`
        : 'presence:*';

      // Use SCAN to find keys (more efficient than KEYS for production)
      const stream = redisClient.scanStream({
        match: pattern,
        count: 100,
      });

      let cleanedCount = 0;

      stream.on('data', async (keys) => {
        for (const key of keys) {
          const ttl = await redisClient.ttl(key);
          // If key doesn't exist or is expired
          if (ttl === -2 || ttl === -1) {
            // Key doesn't exist or has no expiration (offline status)
            // Optionally remove offline status after a certain period
            const value = await redisClient.get(key);
            if (value) {
              try {
                const presence = JSON.parse(value);
                if (presence.status === 'offline') {
                  // Remove offline status after 24 hours
                  const lastSeen = new Date(presence.lastSeen);
                  const hoursSinceOffline =
                    (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);

                  if (hoursSinceOffline > 24) {
                    await redisClient.del(key);
                    cleanedCount++;
                  }
                }
              } catch (error) {
                // Invalid data, remove it
                await redisClient.del(key);
                cleanedCount++;
              }
            }
          }
        }
      });

      return new Promise((resolve, reject) => {
        stream.on('end', () => resolve(cleanedCount));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('[Presence Service] Error cleaning up expired presence:', error);
      return 0;
    }
  }
}

// Singleton instance
let presenceServiceInstance = null;

const getPresenceService = () => {
  if (!presenceServiceInstance) {
    presenceServiceInstance = new PresenceService();
  }
  return presenceServiceInstance;
};

module.exports = {
  PresenceService,
  getPresenceService,
};


