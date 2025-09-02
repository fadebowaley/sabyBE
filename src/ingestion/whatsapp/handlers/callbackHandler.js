const logger = require('../../../config/logger');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const sessionManager = require('../session');

/**
 * Handle button press from WhatsApp
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} buttonText - Button text that was pressed
 * @param {Object} session - User session object
 */
async function handleButtonPress(phoneNumber, buttonText, session) {
  try {
    logger.info(`🔘 Button pressed from ${phoneNumber}: "${buttonText}"`);

    switch (buttonText) {
      case 'Help':
        await handleHelpCallback(phoneNumber);
        break;

      case 'Support':
        await handleSupportCallback(phoneNumber);
        break;

      case 'Main Menu':
        await handleMainMenuCallback(phoneNumber);
        break;

      case 'Start Form':
        await handleStartFormCallback(phoneNumber, session);
        break;

      case 'Check Status':
        await handleCheckStatusCallback(phoneNumber);
        break;

      case 'Reset Session':
        await handleResetSessionCallback(phoneNumber);
        break;

      case 'Yes, Reset':
        await handleConfirmResetCallback(phoneNumber, session);
        break;

      case 'Cancel':
        await handleCancelResetCallback(phoneNumber);
        break;

      default:
        logger.warn(`Unknown button text: ${buttonText}`);
        await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Unknown action. Please try again.');
    }

    logger.info(`✅ Button press handled successfully for ${phoneNumber}`);
  } catch (error) {
    logger.error(`❌ Error handling button press for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'An error occurred. Please try again.');
  }
}

/**
 * Handle list selection from WhatsApp
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} selectedId - Selected item ID
 * @param {string} selectedTitle - Selected item title
 * @param {Object} session - User session object
 */
async function handleListSelection(phoneNumber, selectedId, selectedTitle, session) {
  try {
    logger.info(`📋 List selection from ${phoneNumber}: "${selectedTitle}" (ID: ${selectedId})`);

    if (selectedId.startsWith('project_')) {
      const projectId = selectedId.replace('project_', '');
      await handleProjectSelectionCallback(phoneNumber, projectId, session);
    } else {
      logger.warn(`Unknown list selection ID: ${selectedId}`);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Unknown selection. Please try again.');
    }
  } catch (error) {
    logger.error(`❌ Error handling list selection for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'An error occurred. Please try again.');
  }
}

/**
 * Handle help callback
 */
async function handleHelpCallback(phoneNumber) {
  await whatsappNotificationService.sendHelpMessage(phoneNumber);
}

/**
 * Handle support callback
 */
async function handleSupportCallback(phoneNumber) {
  await whatsappNotificationService.sendSupportMessage(phoneNumber);
}

/**
 * Handle main menu callback
 */
async function handleMainMenuCallback(phoneNumber) {
  await whatsappNotificationService.sendMainMenu(phoneNumber);
}

/**
 * Handle start form callback
 */
async function handleStartFormCallback(phoneNumber, session) {
  if (session.status === 'authenticated') {
    // User is already authenticated, show projects
    await whatsappNotificationService.sendProjectSelection(phoneNumber);
  } else {
    // User needs to authenticate first
    await whatsappNotificationService.sendAuthenticationPrompt(phoneNumber);
  }
}

/**
 * Handle check status callback
 */
async function handleCheckStatusCallback(phoneNumber) {
  await whatsappNotificationService.sendStatusMessage(phoneNumber);
}

/**
 * Handle reset session callback
 */
async function handleResetSessionCallback(phoneNumber) {
  await whatsappNotificationService.sendResetConfirmation(phoneNumber);
}

/**
 * Handle confirm reset callback
 */
async function handleConfirmResetCallback(phoneNumber, session) {
  try {
    // Reset session data
    session.status = 'authenticating';
    session.currentStep = 0;
    session.answers.clear();
    session.projectId = null;
    session.formId = null;
    session.metadata.lastActivity = new Date();
    await session.save();

    await whatsappNotificationService.sendMessageWithClearKeyboard(
      phoneNumber,
      `🔄 *Session Reset Complete*

Your session has been successfully reset!

You can now start fresh with a new form submission.

*Next Steps:*
1. Share your phone number to authenticate
2. Select a project
3. Fill out the form

Send "start" to begin a new form submission.`
    );

    logger.info(`✅ Session reset completed for ${phoneNumber}`);
  } catch (error) {
    logger.error(`❌ Error resetting session for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to reset session. Please try again.');
  }
}

/**
 * Handle cancel reset callback
 */
async function handleCancelResetCallback(phoneNumber) {
  await whatsappNotificationService.sendMessageWithClearKeyboard(
    phoneNumber,
    `✅ *Reset Cancelled*

Your session has been preserved.

You can continue with your current form or start a new one.

What would you like to do?`
  );

  // Send main menu options
  await whatsappNotificationService.sendMainMenu(phoneNumber);
}

/**
 * Handle project selection callback
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} projectId - Selected project ID
 * @param {Object} session - User session object
 */
async function handleProjectSelectionCallback(phoneNumber, projectId, session) {
  try {
    // Update session with selected project
    session.projectId = projectId;
    session.status = 'filling_form';
    session.currentStep = 0;
    session.metadata.lastActivity = new Date();
    await session.save();

    // Redirect to form handler
    const formHandler = require('./formHandler');
    await formHandler.startFormFilling(phoneNumber, session);

    logger.info(`✅ Project selection handled for ${phoneNumber}, project: ${projectId}`);
  } catch (error) {
    logger.error(`❌ Error handling project selection for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to select project. Please try again.');
  }
}

module.exports = {
  handleButtonPress,
  handleListSelection,
};
