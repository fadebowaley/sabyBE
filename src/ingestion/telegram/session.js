const TelegramSession = require('../../models/telegramSession.model');
const logger = require('../../config/logger');

const SESSION_TTL_MINUTES = 15;

const hasSessionExpired = (session, now = new Date()) => {
  if (!session) {
    return false;
  }
  const lastActivity =
    session.lastActivity ||
    session.metadata?.lastActivity ||
    session.updatedAt ||
    session.createdAt;
  if (!lastActivity) {
    return false;
  }
  const last = new Date(lastActivity).getTime();
  if (Number.isNaN(last)) {
    return false;
  }
  return now.getTime() - last > SESSION_TTL_MINUTES * 60 * 1000;
};

class SessionManager {
  /**
   * Get or create session for a chat
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<Object>} Session object
   */
  async getOrCreate(chatId) {
    try {
      const now = new Date();
      let session = await TelegramSession.findByChatId(chatId);

      if (session && hasSessionExpired(session, now)) {
        logger.info(
          `⏱️ Telegram session expired for ${chatId} after ${SESSION_TTL_MINUTES} minutes of inactivity`
        );
        await session.deleteOne();
        session = null;
      }

      if (!session) {
        // Create new session for authentication phase
        session = new TelegramSession({
          chatId,
          status: 'authenticating',
          metadata: {
            sessionStartTime: now,
            lastActivity: now,
          },
          lastActivity: now,
          // These fields will be populated during authentication
          userId: null,
          tenantId: null,
          projectId: null,
          formId: null,
        });
        await session.save();
        logger.info(`📝 Created new authentication session for chat ${chatId}`);
      } else {
        // Update activity
        await session.updateActivity(now);
      }

      return session;
    } catch (error) {
      logger.error(
        `❌ Error managing session for chat ${chatId}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Get session by chat ID
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<Object|null>} Session object or null
   */
  async get(chatId) {
    try {
      return await TelegramSession.findByChatId(chatId);
    } catch (error) {
      logger.error(
        `❌ Error getting session for chat ${chatId}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Update session
   * @param {string} chatId - Telegram chat ID
   * @param {Object} updates - Session updates
   * @returns {Promise<Object>} Updated session
   */
  async update(chatId, updates) {
    try {
      const session = await TelegramSession.findByChatId(chatId);

      if (!session) {
        throw new Error(`Session not found for chat ${chatId}`);
      }

      // Apply updates
      Object.assign(session, updates);
      await session.save();

      logger.info(`✅ Session updated for chat ${chatId}`);
      return session;
    } catch (error) {
      logger.error(
        `❌ Error updating session for chat ${chatId}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Delete session
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<boolean>} Success status
   */
  async delete(chatId) {
    try {
      const session = await TelegramSession.findByChatId(chatId);

      if (session) {
        await session.deleteOne();
        logger.info(`🗑️ Session deleted for chat ${chatId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(
        `❌ Error deleting session for chat ${chatId}:`,
        error.message
      );
      return false;
    }
  }

  /**
   * Reset session to initial state
   * @param {string} chatId - Telegram chat ID
   * @returns {Promise<Object>} Reset session
   */
  async reset(chatId) {
    try {
      const session = await TelegramSession.findByChatId(chatId);

      if (!session) {
        throw new Error(`Session not found for chat ${chatId}`);
      }

      // Reset to initial state
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      session.validationResult = null;
      session.submittedAt = null;
      session.completedAt = null;

      await session.save();

      logger.info(`🔄 Session reset for chat ${chatId}`);
      return session;
    } catch (error) {
      logger.error(
        `❌ Error resetting session for chat ${chatId}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   * @param {number} ttlHours - Time to live in hours
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupExpired(ttlMinutes = SESSION_TTL_MINUTES) {
    try {
      const result = await TelegramSession.cleanupExpiredSessions(ttlMinutes);
      logger.info(`🧹 Cleaned up ${result.deletedCount} expired sessions`);
      return result.deletedCount;
    } catch (error) {
      logger.error(`❌ Error cleaning up expired sessions:`, error.message);
      return 0;
    }
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>} Session statistics
   */
  async getStats() {
    try {
      const stats = await TelegramSession.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const totalSessions = await TelegramSession.countDocuments();
      const activeSessions = await TelegramSession.countDocuments({
        lastActivity: {
          $gte: new Date(Date.now() - SESSION_TTL_MINUTES * 60 * 1000),
        },
      });

      return {
        total: totalSessions,
        active: activeSessions,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
      };
    } catch (error) {
      logger.error(`❌ Error getting session stats:`, error.message);
      return { total: 0, active: 0, byStatus: {} };
    }
  }

  /**
   * Get active sessions for a user
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID (optional)
   * @returns {Promise<Array>} Active sessions
   */
  async getActiveSessions(userId, projectId = null) {
    try {
      const query = {
        userId,
        status: { $in: ['authenticating', 'filling_form', 'ready_to_submit'] },
      };

      if (projectId) {
        query.projectId = projectId;
      }

      return await TelegramSession.find(query).sort({
        'metadata.lastActivity': -1,
      });
    } catch (error) {
      logger.error(
        `❌ Error getting active sessions for user ${userId}:`,
        error.message
      );
      return [];
    }
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

// Legacy compatibility functions
const legacySession = {
  get: (chatId) => sessionManager.get(chatId),
  set: (chatId, data) => sessionManager.update(chatId, data),
  delete: (chatId) => sessionManager.delete(chatId),

  // Middleware for legacy compatibility
  middleware: async (ctx, next) => {
    const chatId = ctx.chat?.id || ctx.message?.chat?.id;

    if (chatId) {
      ctx.session = await sessionManager.getOrCreate(chatId);
    }

    await next();
  },
};

module.exports = sessionManager;
module.exports.legacy = legacySession;
