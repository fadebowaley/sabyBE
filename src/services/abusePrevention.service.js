const logger = require('../config/logger');
const { redisClient } = require('../config/redis');

const ABUSE_KEY_PREFIX = 'abuse';
const SPAM_DETECTION_WINDOW_MS = 60000; // 1 minute
const FLOOD_PREVENTION_MS = 1000; // Minimum 1 second between messages
const MAX_REPEATED_CHARS = 5; // Maximum consecutive identical characters
const MAX_CAPS_RATIO = 0.7; // 70% caps = spam

/**
 * Check for spam patterns in message content
 * @param {string} content - Message content
 * @returns {Object} { isSpam: boolean, reason?: string }
 */
const detectSpamContent = (content) => {
  if (!content || typeof content !== 'string') {
    return { isSpam: false };
  }

  // Check for repeated characters (e.g., "aaaaaaaa" or "!!!!!!!")
  const repeatedCharPattern = /(.)\1{5,}/;
  if (repeatedCharPattern.test(content)) {
    return {
      isSpam: true,
      reason: 'repeated_characters',
      message: 'Message contains too many repeated characters',
    };
  }

  // Check for excessive caps (more than 70% caps)
  const capsCount = (content.match(/[A-Z]/g) || []).length;
  const lettersCount = (content.match(/[A-Za-z]/g) || []).length;
  if (lettersCount > 10 && capsCount / lettersCount > MAX_CAPS_RATIO) {
    return {
      isSpam: true,
      reason: 'excessive_caps',
      message: 'Message contains too many capital letters',
    };
  }

  // Check for suspicious patterns (e.g., too many URLs)
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const urlMatches = content.match(urlPattern) || [];
  if (urlMatches.length > 3) {
    return {
      isSpam: true,
      reason: 'excessive_urls',
      message: 'Message contains too many URLs',
    };
  }

  return { isSpam: false };
};

/**
 * Check flood prevention (minimum time between messages)
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<{ allowed: boolean, waitTime?: number }>}
 */
const checkFloodPrevention = async (userId, tenantId) => {
  try {
    const key = `${ABUSE_KEY_PREFIX}:flood:${tenantId}:${userId}`;
    const lastMessageTime = await redisClient.get(key);

    if (lastMessageTime) {
      const timeSinceLastMessage = Date.now() - parseInt(lastMessageTime, 10);
      if (timeSinceLastMessage < FLOOD_PREVENTION_MS) {
        const waitTime = FLOOD_PREVENTION_MS - timeSinceLastMessage;
        return {
          allowed: false,
          waitTime: Math.ceil(waitTime / 1000), // Return in seconds
        };
      }
    }

    // Update last message time
    await redisClient.setex(key, 60, Date.now().toString()); // Store for 60 seconds

    return { allowed: true };
  } catch (error) {
    logger.error('[Abuse Prevention] Error checking flood prevention:', error);
    // Fail open - allow message if Redis is unavailable
    return { allowed: true };
  }
};

/**
 * Track user violation count
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @param {string} violationType - Type of violation (spam, flood, etc.)
 * @returns {Promise<{ violations: number, shouldMute: boolean }>}
 */
const trackViolation = async (userId, tenantId, violationType) => {
  try {
    const key = `${ABUSE_KEY_PREFIX}:violations:${tenantId}:${userId}`;
    const windowKey = `${ABUSE_KEY_PREFIX}:violations:window:${tenantId}:${userId}`;

    // Get current violation count
    const violationsStr = await redisClient.get(key);
    const violations = violationsStr ? parseInt(violationsStr, 10) : 0;

    // Get violation window timestamp
    const windowStr = await redisClient.get(windowKey);
    const violationWindow = windowStr ? parseInt(windowStr, 10) : Date.now();
    const timeSinceWindowStart = Date.now() - violationWindow;

    // Reset window if more than 1 hour has passed
    if (timeSinceWindowStart > 3600000) {
      // 1 hour
      await redisClient.setex(key, 3600, '1'); // Reset to 1 violation
      await redisClient.setex(windowKey, 3600, Date.now().toString());
      return { violations: 1, shouldMute: false };
    }

    // Increment violation count
    const newViolations = violations + 1;
    await redisClient.setex(key, 3600, newViolations.toString());

    // Auto-mute if 5 or more violations in 1 hour
    const shouldMute = newViolations >= 5;

    if (shouldMute) {
      logger.warn({
        event: 'AUTO_MUTE_TRIGGERED',
        userId,
        tenantId,
        violations: newViolations,
        violationType,
      });
    }

    logger.warn({
      event: 'VIOLATION_TRACKED',
      userId,
      tenantId,
      violationType,
      violations: newViolations,
      shouldMute,
    });

    return { violations: newViolations, shouldMute };
  } catch (error) {
    logger.error('[Abuse Prevention] Error tracking violation:', error);
    return { violations: 0, shouldMute: false };
  }
};

/**
 * Reset violation count for a user (admin function)
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<boolean>}
 */
const resetViolations = async (userId, tenantId) => {
  try {
    const key = `${ABUSE_KEY_PREFIX}:violations:${tenantId}:${userId}`;
    const windowKey = `${ABUSE_KEY_PREFIX}:violations:window:${tenantId}:${userId}`;

    await redisClient.del(key);
    await redisClient.del(windowKey);

    logger.info({
      event: 'VIOLATIONS_RESET',
      userId,
      tenantId,
    });

    return true;
  } catch (error) {
    logger.error('[Abuse Prevention] Error resetting violations:', error);
    return false;
  }
};

/**
 * Get user violation count
 * @param {string} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>}
 */
const getViolationCount = async (userId, tenantId) => {
  try {
    const key = `${ABUSE_KEY_PREFIX}:violations:${tenantId}:${userId}`;
    const violationsStr = await redisClient.get(key);
    return violationsStr ? parseInt(violationsStr, 10) : 0;
  } catch (error) {
    logger.error('[Abuse Prevention] Error getting violation count:', error);
    return 0;
  }
};

/**
 * Main abuse prevention check
 * @param {Object} params - Check parameters
 * @param {string} params.userId - User ID
 * @param {string} params.tenantId - Tenant ID
 * @param {string} params.content - Message content
 * @returns {Promise<{ allowed: boolean, reason?: string, waitTime?: number, violations?: number }>}
 */
const checkAbuse = async ({ userId, tenantId, content }) => {
  try {
    // 1. Check spam content
    const spamCheck = detectSpamContent(content);
    if (spamCheck.isSpam) {
      await trackViolation(userId, tenantId, spamCheck.reason);
      return {
        allowed: false,
        reason: spamCheck.reason,
        message: spamCheck.message,
      };
    }

    // 2. Check flood prevention
    const floodCheck = await checkFloodPrevention(userId, tenantId);
    if (!floodCheck.allowed) {
      await trackViolation(userId, tenantId, 'flood');
      return {
        allowed: false,
        reason: 'flood',
        waitTime: floodCheck.waitTime,
        message: `Please wait ${floodCheck.waitTime} seconds before sending another message`,
      };
    }

    // 3. Check if user is already muted (5+ violations)
    const violations = await getViolationCount(userId, tenantId);
    if (violations >= 5) {
      return {
        allowed: false,
        reason: 'muted',
        violations,
        message: 'You have been temporarily muted due to repeated violations. Please contact an administrator.',
      };
    }

    return { allowed: true };
  } catch (error) {
    logger.error('[Abuse Prevention] Error in abuse check:', error);
    // Fail open - allow message if there's an error
    return { allowed: true };
  }
};

module.exports = {
  detectSpamContent,
  checkFloodPrevention,
  trackViolation,
  resetViolations,
  getViolationCount,
  checkAbuse,
  ABUSE_KEY_PREFIX,
  SPAM_DETECTION_WINDOW_MS,
  FLOOD_PREVENTION_MS,
};
