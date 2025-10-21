const logger = require('../../../config/logger');
const telegramNotificationService = require('../services/telegramNotification.service');
const sessionManager = require('../session');

/**
 * Handle callback queries from inline keyboards
 */
async function handleCallbackQuery(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const { data } = callbackQuery;
  const userName =
    callbackQuery.from.first_name || callbackQuery.from.username || 'User';

  try {
    logger.info(`🔘 Callback query received from chat ${chatId}: ${data}`);

    // Acknowledge the callback query
    await bot.answerCallbackQuery(callbackQuery.id);

    switch (data) {
      case 'help':
        await handleHelpCallback(chatId, userName);
        break;

      case 'support':
        await handleSupportCallback(chatId, userName);
        break;

      case 'main_menu':
        await handleMainMenuCallback(chatId, userName);
        break;

      case 'start_form':
        await handleStartFormCallback(chatId, userName);
        break;

      case 'check_status':
        await handleCheckStatusCallback(chatId, userName);
        break;

      case 'reset_session':
        await handleResetSessionCallback(chatId, userName);
        break;

      case 'confirm_reset':
        await handleConfirmResetCallback(chatId, userName);
        break;

      case 'cancel_reset':
        await handleCancelResetCallback(chatId, userName);
        break;

      default:
        if (data.startsWith('select_project:')) {
          await handleProjectSelectionCallback(chatId, data);
        } else {
          logger.warn(`Unknown callback data: ${data}`);
          await telegramNotificationService.sendErrorMessage(
            chatId,
            'Unknown action. Please try again.'
          );
        }
    }

    logger.info(`✅ Callback query handled successfully for chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error handling callback query for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'An error occurred. Please try again.'
    );
  }
}

/**
 * Handle help callback
 */
async function handleHelpCallback(chatId, userName) {
  await telegramNotificationService.sendHelpMessage(chatId);
}

/**
 * Handle support callback
 */
async function handleSupportCallback(chatId, userName) {
  await telegramNotificationService.sendSupportMessage(chatId, userName);
}

/**
 * Handle main menu callback
 */
async function handleMainMenuCallback(chatId, userName) {
  await telegramNotificationService.sendMainMenu(chatId, userName);
}

/**
 * Handle start form callback
 */
async function handleStartFormCallback(chatId, userName) {
  const session = await sessionManager.getOrCreate(chatId);

  if (session.status === 'authenticated') {
    // User is already authenticated, show projects
    await telegramNotificationService.sendProjectSelection(chatId, userName);
  } else {
    // User needs to authenticate first
    await telegramNotificationService.sendAuthenticationPrompt(
      chatId,
      userName
    );
  }
}

/**
 * Handle check status callback
 */
async function handleCheckStatusCallback(chatId, userName) {
  await telegramNotificationService.sendStatusMessage(chatId, userName);
}

/**
 * Handle reset session callback
 */
async function handleResetSessionCallback(chatId, userName) {
  await telegramNotificationService.sendResetConfirmation(chatId, userName);
}

/**
 * Handle confirm reset callback
 */
async function handleConfirmResetCallback(chatId, userName) {
  try {
    const session = await sessionManager.getOrCreate(chatId);

    // Reset session data
    session.status = 'new';
    session.currentStep = 0;
    session.answers = {};
    session.projectId = null;
    session.formId = null;
    session.metadata.lastActivity = new Date();
    await session.save();

    await bot.sendMessage(
      chatId,
      `🔄 *Session Reset Complete*

Your session has been successfully reset, ${userName}!

You can now start fresh with a new form submission.

*Next Steps:*
1. Share your phone number to authenticate
2. Select a project
3. Fill out the form

Use /start to begin a new form submission.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Start New Form',
                callback_data: 'start_form',
              },
            ],
            [
              {
                text: '🏠 Main Menu',
                callback_data: 'main_menu',
              },
            ],
          ],
        },
      }
    );

    logger.info(`✅ Session reset completed for chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error resetting session for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to reset session. Please try again.'
    );
  }
}

/**
 * Handle cancel reset callback
 */
async function handleCancelResetCallback(chatId, userName) {
  await bot.sendMessage(
    chatId,
    `✅ *Reset Cancelled*

Your session has been preserved, ${userName}.

You can continue with your current form or start a new one.

What would you like to do?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🏠 Main Menu',
              callback_data: 'main_menu',
            },
          ],
          [
            {
              text: '📊 Check Status',
              callback_data: 'check_status',
            },
          ],
        ],
      },
    }
  );
}

/**
 * Handle project selection callback
 */
async function handleProjectSelectionCallback(chatId, data) {
  try {
    const projectId = data.replace('select_project:', '');
    const session = await sessionManager.getOrCreate(chatId);

    // Update session with selected project
    session.projectId = projectId;
    session.status = 'project_selected';
    session.metadata.lastActivity = new Date();
    await session.save();

    // Redirect to form handler
    const formHandler = require('./formHandler');
    await formHandler.handleProjectSelection(bot, session, projectId);

    logger.info(
      `✅ Project selection handled for chat ${chatId}, project: ${projectId}`
    );
  } catch (error) {
    logger.error(
      `❌ Error handling project selection for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to select project. Please try again.'
    );
  }
}

module.exports = {
  handleCallbackQuery,
};
