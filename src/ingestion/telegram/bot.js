const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const config = require('../../config/config');
const logger = require('../../config/logger');

// Import our new services
const telegramValidationService = require('./services/telegramValidation.service');
const telegramNotificationService = require('./services/telegramNotification.service');

// Import handlers
const authHandler = require('./handlers/authHandler');
const formHandler = require('./handlers/formHandler');
const submitHandler = require('./handlers/submitHandler');
const callbackHandler = require('./handlers/callbackHandler');

// Import session management
const sessionManager = require('./session');

// Create bot instance
const bot = new TelegramBot(config.telegram.botToken, {
  polling: config.env === 'development',
  webHook: config.env === 'production' ? { port: 8443 } : false,
});

/**
 * Initialize the bot with proper error handling and logging
 */
async function initializeBot() {
  try {
    logger.info('🤖 Initializing Telegram bot...');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Set up webhook for production
    if (config.env === 'production' && config.telegram.webhookUrl) {
      await bot.setWebHook(
        `${config.telegram.webhookUrl}/bot${config.telegram.botToken}`
      );
      logger.info('✅ Webhook set successfully');
    }

    // Set up polling for development
    if (config.env === 'development') {
      logger.info('✅ Bot polling enabled for development');
    }

    logger.info('✅ Telegram bot initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize Telegram bot:', error.message);
    throw error;
  }
}

/**
 * Get or create session for a chat
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Session object
 */
async function getOrCreateSession(chatId) {
  try {
    return await sessionManager.getOrCreate(chatId);
  } catch (error) {
    logger.error(
      `❌ Error managing session for chat ${chatId}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle callback queries from inline keyboards
 */
bot.on('callback_query', async (callbackQuery) => {
  try {
    await callbackHandler.handleCallbackQuery(bot, callbackQuery);
  } catch (error) {
    logger.error(`❌ Error handling callback query:`, error.message);
  }
});

/**
 * Handle /start command with enhanced welcome
 */
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'User';

  try {
    logger.info(`🚀 /start command received from chat ${chatId} (${userName})`);

    // Get or create session
    const session = await getOrCreateSession(chatId);

    // Update session metadata
    session.metadata.firstName = msg.from.first_name;
    session.metadata.lastName = msg.from.last_name;
    session.metadata.username = msg.from.username;
    session.metadata.languageCode = msg.from.language_code;
    await session.save();

    // Send enhanced welcome message
    await telegramNotificationService.sendEnhancedWelcomeMessage(
      chatId,
      userName
    );

    logger.info(`✅ Enhanced welcome message sent to chat ${chatId}`);
  } catch (error) {
    logger.error(`❌ Error handling /start for chat ${chatId}:`, error.message);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to start bot. Please try again.'
    );
  }
});

/**
 * Handle /help command with comprehensive help
 */
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'User';

  try {
    logger.info(`❓ /help command received from chat ${chatId} (${userName})`);
    await telegramNotificationService.sendHelpMessage(chatId);
    logger.info(`✅ Help message sent to chat ${chatId}`);
  } catch (error) {
    logger.error(`❌ Error handling /help for chat ${chatId}:`, error.message);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to show help. Please try again.'
    );
  }
});

/**
 * Handle /support command
 */
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'User';

  try {
    logger.info(
      `🆘 /support command received from chat ${chatId} (${userName})`
    );
    await telegramNotificationService.sendSupportMessage(chatId, userName);
    logger.info(`✅ Support message sent to chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error handling /support for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to show support. Please try again.'
    );
  }
});

/**
 * Handle /status command to check user status
 */
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'User';

  try {
    logger.info(
      `📊 /status command received from chat ${chatId} (${userName})`
    );
    await telegramNotificationService.sendStatusMessage(chatId, userName);
    logger.info(`✅ Status message sent to chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error handling /status for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to show status. Please try again.'
    );
  }
});

/**
 * Handle /menu command to show main menu
 */
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'User';

  try {
    logger.info(`🏠 /menu command received from chat ${chatId} (${userName})`);
    await telegramNotificationService.sendMainMenu(chatId, userName);
    logger.info(`✅ Main menu sent to chat ${chatId}`);
  } catch (error) {
    logger.error(`❌ Error handling /menu for chat ${chatId}:`, error.message);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to show menu. Please try again.'
    );
  }
});

/**
 * Handle /reset command to reset user session
 */
bot.onText(/\/reset/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || msg.from.username || 'User';

  try {
    logger.info(`🔄 /reset command received from chat ${chatId} (${userName})`);
    await telegramNotificationService.sendResetConfirmation(chatId, userName);
    logger.info(`✅ Reset confirmation sent to chat ${chatId}`);
  } catch (error) {
    logger.error(`❌ Error handling /reset for chat ${chatId}:`, error.message);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to reset session. Please try again.'
    );
  }
});

/**
 * Handle /cancel command
 */
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    logger.info(`❌ /cancel command received from chat ${chatId}`);

    const session = await TelegramSession.findByChatId(chatId);
    if (session) {
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      await session.save();
    }

    await telegramNotificationService.sendMessageWithClearKeyboard(
      chatId,
      'Operation cancelled. Type /start to begin again.'
    );
  } catch (error) {
    logger.error(
      `❌ Error handling /cancel for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to cancel operation. Please try again.'
    );
  }
});

/**
 * Handle contact sharing (phone number)
 */
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const { contact } = msg;

  try {
    logger.info(
      `📱 Contact received from chat ${chatId} (${contact.phone_number})`
    );

    // Update session with phone number
    const session = await getOrCreateSession(chatId);
    session.metadata.phoneNumber = contact.phone_number;
    await session.save();

    // Handle phone contact through auth handler
    await authHandler.handlePhoneContact(bot, msg, session);
  } catch (error) {
    logger.error(
      `❌ Error handling contact for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process phone number. Please try again.'
    );
  }
});

/**
 * Handle text messages
 */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const { text } = msg;

  // Skip commands and non-text messages
  if (!text || text.startsWith('/')) return;

  try {
    logger.info(`💬 Text message received from chat ${chatId}: "${text}"`);

    // Get session
    const session = await getOrCreateSession(chatId);

    // Handle special buttons first (regardless of session status)
    if (text === '🔄 Try Again') {
      logger.info(`🔄 Try Again button pressed for chat ${chatId}`);
      // Reset session to authentication state
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      await session.save();

      // Send welcome message with phone number request
      await telegramNotificationService.sendWelcomeMessage(
        chatId,
        msg.from.first_name
      );
      return;
    }

    if (text === '📞 Contact Support') {
      logger.info(`📞 Contact Support button pressed for chat ${chatId}`);
      await telegramNotificationService.sendSupportMessage(
        chatId,
        msg.from.first_name
      );
      return;
    }

    if (text === '📧 Email Support') {
      logger.info(`📧 Email Support button pressed for chat ${chatId}`);
      await telegramNotificationService.sendMessageWithClearKeyboard(
        chatId,
        `📧 Email Support

Please send an email to: support@haloforms.com

Include your chat ID: ${chatId} in the subject line for faster response.

We'll get back to you within 2-4 hours during business hours.`
      );
      return;
    }

    if (text === '📱 WhatsApp Support') {
      logger.info(`📱 WhatsApp Support button pressed for chat ${chatId}`);
      await telegramNotificationService.sendMessageWithClearKeyboard(
        chatId,
        `📱 WhatsApp Support

Contact us on WhatsApp: +234 814 504 5108

Please mention your chat ID: ${chatId} for faster assistance.

Available: 9 AM - 6 PM WAT (Monday - Friday)`
      );
      return;
    }

    if (text === '🏠 Back to Menu') {
      logger.info(`🏠 Back to Menu button pressed for chat ${chatId}`);
      await telegramNotificationService.sendMainMenu(
        chatId,
        msg.from.first_name
      );
      return;
    }

    if (text === '🏠 Main Menu') {
      logger.info(`🏠 Main Menu button pressed for chat ${chatId}`);
      await telegramNotificationService.sendMainMenu(
        chatId,
        msg.from.first_name
      );
      return;
    }

    if (text === '📊 My Status') {
      logger.info(`📊 My Status button pressed for chat ${chatId}`);
      await telegramNotificationService.sendStatusMessage(
        chatId,
        msg.from.first_name
      );
      return;
    }

    if (text === '❓ Help') {
      logger.info(`❓ Help button pressed for chat ${chatId}`);
      await telegramNotificationService.sendHelpMessage(chatId);
      return;
    }

    if (text === '🔄 Reset Session') {
      logger.info(`🔄 Reset Session button pressed for chat ${chatId}`);
      await telegramNotificationService.sendResetConfirmation(
        chatId,
        msg.from.first_name
      );
      return;
    }

    if (text === '✅ Yes, Reset') {
      logger.info(`✅ Reset confirmed for chat ${chatId}`);
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      session.projectId = null;
      session.formId = null;
      session.validationResult = null;
      await session.save();

      await telegramNotificationService.sendMessageWithClearKeyboard(
        chatId,
        `✅ Session Reset Successfully!

Your session has been reset. You can now start fresh.

Use /start to begin a new form submission.`
      );
      return;
    }

    if (text === '❌ Cancel') {
      logger.info(`❌ Reset cancelled for chat ${chatId}`);
      await telegramNotificationService.sendMainMenu(
        chatId,
        msg.from.first_name
      );
      return;
    }

    // Ignore separator lines in keyboard
    if (text === '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━') {
      return;
    }

    // Check if the text is a project name (for project selection)
    if (session && session.userId && session.tenantId) {
      try {
        const projectFormService = require('../../services/projectForm.service');
        const availableProjects =
          await projectFormService.getProjectFormsByTenant(session.tenantId, {
            status: 'active',
            'metadata.deploymentStatus': 'published',
          });

        if (availableProjects && availableProjects.results) {
          const selectedProject = availableProjects.results.find(
            (project) =>
              project.configuration?.projectName === text ||
              project.projectId === text
          );

          if (selectedProject) {
            logger.info(`📋 Project selected for chat ${chatId}: ${text}`);
            // Set the project in session and start form filling
            session.projectId = selectedProject.projectId;
            session.formId = selectedProject._id;
            session.status = 'filling_form';
            session.currentStep = 0;
            session.answers.clear();
            await session.save();

            // Get the first question
            const projectForm =
              await projectFormService.getProjectFormByProjectId(
                selectedProject.projectId
              );
            if (
              projectForm &&
              projectForm.elements &&
              projectForm.elements.length > 0
            ) {
              await telegramNotificationService.sendFormQuestion(
                chatId,
                projectForm.elements[0],
                0,
                projectForm.elements.length
              );
            } else {
              await telegramNotificationService.sendErrorMessage(
                chatId,
                'No form questions available for this project.'
              );
            }
            return;
          }
        }
      } catch (error) {
        logger.error(
          `❌ Error checking project selection for chat ${chatId}:`,
          error.message
        );
      }
    }

    // Route message based on session status
    switch (session.status) {
      case 'authenticating':
        // Still authenticating - should have shared phone number
        await telegramNotificationService.sendErrorMessage(
          chatId,
          'Please share your phone number first using the button below.'
        );
        break;

      case 'selecting_project':
        // User is selecting a project
        await formHandler.handleProjectSelection(bot, msg, session);
        break;

      case 'filling_form':
        // User is filling out form
        await formHandler.handleFormStep(bot, msg, session);
        break;

      case 'ready_to_submit':
        // User is ready to submit
        await submitHandler.handleSubmit(bot, msg, session);
        break;

      default:
        // Unknown status - reset to authentication
        session.status = 'authenticating';
        await session.save();
        await telegramNotificationService.sendWelcomeMessage(
          chatId,
          msg.from.first_name
        );
        break;
    }
  } catch (error) {
    logger.error(
      `❌ Error handling message for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process message. Please try again.'
    );
  }
});

/**
 * Handle photo messages (file uploads)
 */
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;

  try {
    logger.info(`📷 Photo received from chat ${chatId}`);

    const session = await getOrCreateSession(chatId);

    if (session.status === 'filling_form') {
      await formHandler.handleFileUpload(bot, msg, session, 'photo');
    } else {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Please complete the form first before uploading files.'
      );
    }
  } catch (error) {
    logger.error(`❌ Error handling photo for chat ${chatId}:`, error.message);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process photo. Please try again.'
    );
  }
});

/**
 * Handle document messages (file uploads)
 */
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;

  try {
    logger.info(`📄 Document received from chat ${chatId}`);

    const session = await getOrCreateSession(chatId);

    if (session.status === 'filling_form') {
      await formHandler.handleFileUpload(bot, msg, session, 'document');
    } else {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Please complete the form first before uploading files.'
      );
    }
  } catch (error) {
    logger.error(
      `❌ Error handling document for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process document. Please try again.'
    );
  }
});

/**
 * Error handling for bot
 */
bot.on('error', (error) => {
  logger.error('❌ Telegram bot error:', error.message);
});

bot.on('polling_error', (error) => {
  logger.error('❌ Telegram bot polling error:', error.message);
});

/**
 * Graceful shutdown
 */
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down Telegram bot...');
  await bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down Telegram bot...');
  await bot.stopPolling();
  process.exit(0);
});

// Initialize bot when module is loaded
if (require.main === module) {
  initializeBot().catch((error) => {
    logger.error('❌ Failed to initialize bot:', error.message);
    process.exit(1);
  });
}

module.exports = {
  bot,
  initializeBot,
  getOrCreateSession,
};
