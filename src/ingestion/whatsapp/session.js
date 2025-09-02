const WhatsAppSession = require('../../models/whatsappSession.model');
const logger = require('../../config/logger');

/**
 * Enhanced Session Management for WhatsApp Bot
 * Integrates with database models for persistent session storage
 */

class SessionManager {
  /**
   * Get or create session for a phone number
   * @param {string} phoneNumber - WhatsApp phone number
   * @returns {Promise<Object>} Session object
   */
  async getOrCreate(phoneNumber) {
    try {
      let session = await WhatsAppSession.findByPhoneNumber(phoneNumber);

      if (!session) {
        // Create new session for authentication phase
        session = new WhatsAppSession({
          phoneNumber: phoneNumber,
          status: 'authenticating',
          metadata: {
            sessionStartTime: new Date(),
            lastActivity: new Date(),
          },
          // These fields will be populated during authentication
          userId: null,
          tenantId: null,
          projectId: null,
          formId: null,
        });
        await session.save();
        logger.info(`📝 Created new authentication session for phone ${phoneNumber}`);
      } else {
        // Update activity
        await session.updateActivity();
      }

      return session;
    } catch (error) {
      logger.error(`❌ Error managing session for phone ${phoneNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Get session by phone number
   * @param {string} phoneNumber - WhatsApp phone number
   * @returns {Promise<Object|null>} Session object or null
   */
  async get(phoneNumber) {
    try {
      return await WhatsAppSession.findByPhoneNumber(phoneNumber);
    } catch (error) {
      logger.error(`❌ Error getting session for phone ${phoneNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Update session
   * @param {string} phoneNumber - WhatsApp phone number
   * @param {Object} updates - Session updates
   * @returns {Promise<Object>} Updated session
   */
  async update(phoneNumber, updates) {
    try {
      const session = await WhatsAppSession.findByPhoneNumber(phoneNumber);

      if (!session) {
        throw new Error(`Session not found for phone ${phoneNumber}`);
      }

      // Apply updates
      Object.assign(session, updates);
      await session.save();

      logger.info(`✅ Session updated for phone ${phoneNumber}`);
      return session;
    } catch (error) {
      logger.error(`❌ Error updating session for phone ${phoneNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete session
   * @param {string} phoneNumber - WhatsApp phone number
   * @returns {Promise<boolean>} Success status
   */
  async delete(phoneNumber) {
    try {
      const session = await WhatsAppSession.findByPhoneNumber(phoneNumber);

      if (session) {
        await session.deleteOne();
        logger.info(`🗑️ Session deleted for phone ${phoneNumber}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`❌ Error deleting session for phone ${phoneNumber}:`, error.message);
      return false;
    }
  }

  /**
   * Reset session to initial state
   * @param {string} phoneNumber - WhatsApp phone number
   * @returns {Promise<Object>} Reset session
   */
  async reset(phoneNumber) {
    try {
      const session = await WhatsAppSession.findByPhoneNumber(phoneNumber);

      if (!session) {
        throw new Error(`Session not found for phone ${phoneNumber}`);
      }

      // Reset to initial state
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      session.validationResult = null;
      session.submittedAt = null;
      session.completedAt = null;

      await session.save();

      logger.info(`🔄 Session reset for phone ${phoneNumber}`);
      return session;
    } catch (error) {
      logger.error(`❌ Error resetting session for phone ${phoneNumber}:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   * @param {number} ttlHours - Time to live in hours
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupExpired(ttlHours = 24) {
    try {
      const result = await WhatsAppSession.cleanupExpiredSessions(ttlHours);
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
      const stats = await WhatsAppSession.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const totalSessions = await WhatsAppSession.countDocuments();
      const activeSessions = await WhatsAppSession.countDocuments({
        'metadata.lastActivity': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
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
        userId: userId,
        status: { $in: ['authenticating', 'filling_form', 'ready_to_submit'] },
      };

      if (projectId) {
        query.projectId = projectId;
      }

      return await WhatsAppSession.find(query).sort({ 'metadata.lastActivity': -1 });
    } catch (error) {
      logger.error(`❌ Error getting active sessions for user ${userId}:`, error.message);
      return [];
    }
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

// Legacy compatibility functions
const legacySession = {
  get: (phoneNumber) => sessionManager.get(phoneNumber),
  set: (phoneNumber, data) => sessionManager.update(phoneNumber, data),
  delete: (phoneNumber) => sessionManager.delete(phoneNumber),

  // Middleware for legacy compatibility
  middleware: async (ctx, next) => {
    const phoneNumber = ctx.phoneNumber || ctx.message?.from;

    if (phoneNumber) {
      ctx.session = await sessionManager.getOrCreate(phoneNumber);
    }

    await next();
  },
};

module.exports = sessionManager;
module.exports.legacy = legacySession;
