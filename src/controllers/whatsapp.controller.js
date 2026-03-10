const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const whatsappBot = require('../ingestion/whatsapp/bot');
const sessionManager = require('../ingestion/whatsapp/session');
const logger = require('../config/logger');

const extractHubQueryParams = (req) => {
  const fromQuery = {
    mode: req.query?.['hub.mode'] || req.query?.hub?.mode,
    token:
      req.query?.['hub.verify_token'] || req.query?.hub?.verify_token,
    challenge:
      req.query?.['hub.challenge'] || req.query?.hub?.challenge,
  };
  if (fromQuery.mode || fromQuery.token || fromQuery.challenge) {
    return fromQuery;
  }
  try {
    const parsed = new URL(req.originalUrl, 'http://localhost');
    return {
      mode: parsed.searchParams.get('hub.mode'),
      token: parsed.searchParams.get('hub.verify_token'),
      challenge: parsed.searchParams.get('hub.challenge'),
    };
  } catch (error) {
    return fromQuery;
  }
};

/**
 * Verify WhatsApp webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyWebhook = catchAsync(async (req, res) => {
  const { mode, token, challenge } = extractHubQueryParams(req);

  logger.info(`🔍 Controller received - Query: ${JSON.stringify(req.query)}`);
  logger.info(
    `🔍 Controller extracted - Mode: ${mode}, Token: ${token}, Challenge: ${challenge}`
  );

  const verificationResult = whatsappBot.verifyWebhook(mode, token, challenge);

  if (verificationResult) {
    logger.info('✅ WhatsApp webhook verification successful');
    res.status(200).send(verificationResult);
  } else {
    logger.warn('❌ WhatsApp webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

/**
 * Handle WhatsApp webhook messages
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const handleWebhook = catchAsync(async (req, res) => {
  try {
    logger.info('📨 WhatsApp webhook received');

    // Process the webhook data
    await whatsappBot.handleWebhook(req.body);

    // Send 200 OK response
    res.status(200).send('OK');
  } catch (error) {
    logger.error('❌ Error handling WhatsApp webhook:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Send a message via WhatsApp
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const sendMessage = catchAsync(async (req, res) => {
  const { phoneNumber, message, type = 'text' } = req.body;

  try {
    const whatsappNotificationService = require('../ingestion/whatsapp/services/whatsappNotification.service');

    let result;
    switch (type) {
      case 'text':
        result = await whatsappNotificationService.sendTextMessage(
          phoneNumber,
          message
        );
        break;
      case 'button':
        const { buttons } = req.body;
        result = await whatsappNotificationService.sendButtonMessage(
          phoneNumber,
          message,
          buttons
        );
        break;
      case 'list':
        const { buttonText, items } = req.body;
        result = await whatsappNotificationService.sendListMessage(
          phoneNumber,
          message,
          buttonText,
          items
        );
        break;
      default:
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid message type');
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Message sent successfully',
      data: result,
    });
  } catch (error) {
    logger.error(
      `❌ Error sending WhatsApp message to ${phoneNumber}:`,
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to send message'
    );
  }
});

/**
 * Get WhatsApp bot status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getStatus = catchAsync(async (req, res) => {
  try {
    // Get session statistics
    const sessionStats = await sessionManager.getStats();

    // Get bot status
    const botStatus = {
      status: 'running',
      phoneNumberId: whatsappBot.PHONE_NUMBER_ID,
      apiUrl: whatsappBot.WHATSAPP_API_URL,
      lastActivity: new Date(),
    };

    res.status(httpStatus.OK).json({
      success: true,
      data: {
        bot: botStatus,
        sessions: sessionStats,
      },
    });
  } catch (error) {
    logger.error('❌ Error getting WhatsApp bot status:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to get bot status'
    );
  }
});

/**
 * Restart WhatsApp bot
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const restartBot = catchAsync(async (req, res) => {
  try {
    logger.info('🔄 Restarting WhatsApp bot...');

    // Reinitialize the bot
    await whatsappBot.initializeWhatsAppBot();

    res.status(httpStatus.OK).json({
      success: true,
      message: 'WhatsApp bot restarted successfully',
    });
  } catch (error) {
    logger.error('❌ Error restarting WhatsApp bot:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to restart bot'
    );
  }
});

/**
 * Get active WhatsApp sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSessions = catchAsync(async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    // Get session statistics
    const sessionStats = await sessionManager.getStats();

    // Get active sessions (you might want to add pagination to the session manager)
    const activeSessions = await sessionManager.getActiveSessions(null, null);

    res.status(httpStatus.OK).json({
      success: true,
      data: {
        stats: sessionStats,
        sessions: activeSessions.slice(skip, skip + parseInt(limit)),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: activeSessions.length,
          pages: Math.ceil(activeSessions.length / limit),
        },
      },
    });
  } catch (error) {
    logger.error('❌ Error getting WhatsApp sessions:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to get sessions'
    );
  }
});

/**
 * Delete a WhatsApp session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteSession = catchAsync(async (req, res) => {
  const { phoneNumber } = req.params;

  try {
    const result = await sessionManager.delete(phoneNumber);

    if (result) {
      res.status(httpStatus.OK).json({
        success: true,
        message: 'Session deleted successfully',
      });
    } else {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }
  } catch (error) {
    logger.error(
      `❌ Error deleting WhatsApp session for ${phoneNumber}:`,
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to delete session'
    );
  }
});

module.exports = {
  verifyWebhook,
  handleWebhook,
  sendMessage,
  getStatus,
  restartBot,
  getSessions,
  deleteSession,
};
