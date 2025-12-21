const axios = require('axios');
const mongoose = require('mongoose');
const config = require('../../config/config');
const logger = require('../../config/logger');

// Import our services
const whatsappValidationService = require('./services/whatsappValidation.service');
const whatsappNotificationService = require('./services/whatsappNotification.service');
const { projectFormService } = require('../../services');

// Import handlers
const authHandler = require('./handlers/authHandler');
const formHandler = require('./handlers/formHandler');
const submitHandler = require('./handlers/submitHandler');
const callbackHandler = require('./handlers/callbackHandler');
const CommandHandler = require('./handlers/commandHandler');

// Import session management
const sessionManager = require('./session');

// WhatsApp Business API configuration
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = config.whatsapp.phoneNumberId;
const ACCESS_TOKEN = config.whatsapp.accessToken;
const VERIFY_TOKEN = config.whatsapp.verifyToken;

/**
 * Verify WhatsApp Business API connection
 */
async function verifyWhatsAppConnection() {
  // Validate required credentials are set
  if (!PHONE_NUMBER_ID || PHONE_NUMBER_ID.trim() === '') {
    const errorMsg =
      'PHONE_NUMBER_ID is not set or is empty. Please set PHONE_NUMBER_ID environment variable.';
    logger.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  if (!ACCESS_TOKEN || ACCESS_TOKEN.trim() === '') {
    const errorMsg =
      'WHATSAPP_TOKEN is not set or is empty. Please set WHATSAPP_TOKEN environment variable.';
    logger.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }

  if (!VERIFY_TOKEN || VERIFY_TOKEN.trim() === '') {
    logger.warn(
      '⚠️ VERIFY_TOKEN is not set or is empty. Webhook verification may fail.'
    );
  }

  try {
    logger.info(
      `🔍 Verifying WhatsApp connection with Phone Number ID: ${PHONE_NUMBER_ID.substring(
        0,
        10
      )}...`
    );

    const response = await axios.get(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      params: {
        fields: 'display_phone_number,verified_name',
      },
    });

    if (response.status === 200) {
      const { display_phone_number: displayPhoneNumber, verified_name } =
        response.data || {};
      const resolvedNumber = displayPhoneNumber || verified_name || 'unknown';
      logger.info(
        `✅ WhatsApp Business API connected for phone number: ${resolvedNumber}`
      );
      return true;
    }
  } catch (error) {
    // Enhanced error logging
    let errorDetails = {
      message: error.message || 'Unknown error',
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    };

    logger.error('❌ Failed to verify WhatsApp connection');
    logger.error(`   Error Message: ${errorDetails.message}`);

    if (errorDetails.code) {
      logger.error(`   Error Code: ${errorDetails.code}`);
    }

    if (errorDetails.status) {
      logger.error(
        `   HTTP Status: ${errorDetails.status} ${errorDetails.statusText}`
      );
    }

    if (errorDetails.data) {
      logger.error(
        `   Error Response: ${JSON.stringify(errorDetails.data, null, 2)}`
      );
    }

    if (error.response) {
      // API error response
      const errorMsg = `WhatsApp API Error: ${errorDetails.status} - ${
        errorDetails.statusText || errorDetails.message
      }`;
      throw new Error(errorMsg);
    } else if (error.request) {
      // Network error - no response received
      const errorMsg = `Network Error: Unable to reach WhatsApp API. Check internet connection and API endpoint.`;
      throw new Error(errorMsg);
    } else {
      // Other error
      throw error;
    }
  }
}

/**
 * Initialize the WhatsApp bot with proper error handling and logging
 */
async function initializeWhatsAppBot() {
  try {
    logger.info('🤖 Initializing WhatsApp bot...');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Connected to MongoDB');

    // Verify WhatsApp Business API connection
    await verifyWhatsAppConnection();
    logger.info('✅ WhatsApp Business API connection verified');

    logger.info('✅ WhatsApp bot initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize WhatsApp bot');
    logger.error(`   Error: ${error.message || 'Unknown error'}`);
    if (error.stack) {
      logger.error(`   Stack: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Get or create session for a WhatsApp number
 * @param {string} phoneNumber - WhatsApp phone number
 * @returns {Promise<Object>} Session object
 */
async function getOrCreateSession(phoneNumber) {
  try {
    return await sessionManager.getOrCreate(phoneNumber);
  } catch (error) {
    logger.error(
      `❌ Error managing session for phone ${phoneNumber}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Handle incoming webhook messages from WhatsApp
 * @param {Object} webhookData - Webhook payload from WhatsApp
 */
async function handleWebhook(webhookData) {
  try {
    // Log the raw webhook data first
    logger.info('🔍 RAW WEBHOOK DATA:', webhookData);
    logger.info('🔍 RAW WEBHOOK DATA TYPE:', typeof webhookData);
    logger.info(
      '🔍 RAW WEBHOOK DATA STRINGIFIED:',
      JSON.stringify(webhookData)
    );

    logger.info(
      '📨 WhatsApp webhook received:',
      JSON.stringify(webhookData, null, 2)
    );
    logger.info('🔍 Webhook data keys:', Object.keys(webhookData || {}));
    logger.info('🔍 Webhook data type:', typeof webhookData);
    logger.info(
      '🔍 Webhook data length:',
      JSON.stringify(webhookData || {}).length
    );
    logger.info(
      '🔍 Webhook data is null/undefined:',
      webhookData === null || webhookData === undefined
    );

    // Handle different webhook structures
    if (webhookData.object === 'whatsapp_business_account') {
      // Direct webhook structure - extract the actual value from changes
      logger.info('📱 Direct WhatsApp Business API webhook');

      // Extract messages from the nested structure
      const entry = webhookData.entry?.[0];
      const changes = entry?.changes?.[0];
      const webhookValue = changes?.value;

      if (webhookValue) {
        await handleWhatsAppBusinessWebhook(webhookValue);
      } else {
        logger.warn('❌ No webhook value found in direct structure');
      }
      return;
    }

    // Extract the message data from standard structure
    const entry = webhookData.entry?.[0];
    logger.info('🔍 Entry object:', JSON.stringify(entry, null, 2));

    if (!entry) {
      logger.warn('❌ No entry found in webhook data');

      // Try alternative webhook structures
      if (webhookData.messages) {
        logger.info('📱 Alternative structure: direct messages in webhook');
        await handleWhatsAppBusinessWebhook(webhookData);
        return;
      }

      return;
    }

    logger.info('🔍 Entry keys:', Object.keys(entry));
    const changes = entry.changes?.[0];
    logger.info('🔍 Changes object:', JSON.stringify(changes, null, 2));

    if (!changes) {
      logger.warn('❌ No changes found in webhook data');

      // Try alternative webhook structures
      if (entry.messages) {
        logger.info('📱 Alternative structure: direct messages in entry');
        await handleWhatsAppBusinessWebhook(entry);
        return;
      }

      return;
    }

    // Handle different webhook object types and structures
    const objectType = changes.value?.object;
    logger.info(`🔍 Webhook object type: ${objectType}`);
    logger.info(
      `🔍 Changes value keys:`,
      changes.value ? Object.keys(changes.value) : 'No value object'
    );

    // Handle different webhook structures
    if (objectType === 'whatsapp_business_account') {
      // Standard WhatsApp Business API webhook
      await handleWhatsAppBusinessWebhook(changes.value);
    } else if (objectType === 'application') {
      // Application-level webhook (status updates, etc.)
      logger.info('📱 Application webhook received - status update');
      return;
    } else if (changes.value?.messages) {
      // Direct messages structure (alternative format)
      logger.info('📱 Direct messages structure detected');
      await handleWhatsAppBusinessWebhook(changes.value);
    } else if (changes.value?.statuses) {
      // Status updates
      logger.info('📱 Status updates received');
      return;
    } else {
      logger.warn(`❌ Unsupported webhook object type: ${objectType}`);
      logger.warn(
        '🔍 Full changes object for debugging:',
        JSON.stringify(changes, null, 2)
      );

      // Try to extract messages from any structure
      if (changes.value?.messages) {
        logger.info('📱 Found messages in changes.value, processing...');
        await handleWhatsAppBusinessWebhook(changes.value);
        return;
      }

      if (changes.messages) {
        logger.info('📱 Found messages in changes, processing...');
        await handleWhatsAppBusinessWebhook(changes);
        return;
      }

      logger.warn('❌ No messages found in any structure');
      return;
    }
  } catch (error) {
    logger.error('❌ Error handling WhatsApp webhook:', error.message);
    logger.error('❌ ERROR STACK:', error.stack);
  }
}

/**
 * Handle WhatsApp Business API webhook data
 * @param {Object} webhookValue - The value object from the webhook
 */
async function handleWhatsAppBusinessWebhook(webhookValue) {
  try {
    logger.info('📱 Processing WhatsApp Business API webhook');
    logger.info('📱 Webhook value keys:', Object.keys(webhookValue));
    logger.info('📱 Webhook value:', JSON.stringify(webhookValue, null, 2));

    const messages = webhookValue?.messages;
    logger.info('📱 Messages found:', messages ? messages.length : 0);

    if (!messages || messages.length === 0) {
      logger.info(
        '📱 No messages found in webhook (status update or other event)'
      );
      logger.info('📱 Available keys in webhook:', Object.keys(webhookValue));
      return;
    }
    // Process each message
    // Avoid await-in-loop, use Promise.all for concurrent sending and processing
    await Promise.all(
      messages.map(async (message) => {
        // Check if message has errors
        if (message.errors && message.errors.length > 0) {
          logger.warn(
            `⚠️ Message has errors:`,
            JSON.stringify(message.errors, null, 2)
          );

          // Send error message to user
          try {
            await whatsappNotificationService.sendErrorMessage(
              message.from,
              'Sorry, I received your message but it contains an unsupported format. Please try sending a text message instead.'
            );
          } catch (sendError) {
            logger.error(`❌ Failed to send error message:`, sendError.message);
          }
          // Do not process further
          return;
        }

        // Check if message type is unsupported
        if (message.type === 'unsupported') {
          logger.warn(`⚠️ Unsupported message type from ${message.from}`);

          // Send error message to user
          try {
            await whatsappNotificationService.sendErrorMessage(
              message.from,
              'Sorry, I cannot process this type of message. Please send text, images, or documents only.'
            );
          } catch (sendError) {
            logger.error(`❌ Failed to send error message:`, sendError.message);
          }
          // Do not process further
          return;
        }

        // Process valid messages
        await processMessage(message);
      })
    );
  } catch (error) {
    logger.error('❌ Error handling WhatsApp Business webhook:', error.message);
  }
}

/**
 * Handle text messages
 * @param {Object} message - WhatsApp message object
 * @param {Object} session - User session
 */
async function handleTextMessage(message, session) {
  const phoneNumber = message.from;
  const text = message.text?.body || '';
  const trimmedText = text.trim();
  const lowerText = trimmedText.toLowerCase();

  try {
    logger.info(`📝 Text message from ${phoneNumber}: ${text}`);

    if (await authHandler.ensureNotExpired(phoneNumber, session)) {
      return;
    }

    if (lowerText === 'cancel') {
      await CommandHandler.handleCancel(phoneNumber, session, []);
      return;
    }

    if (session.status === 'awaiting_login') {
      await authHandler.handleLoginChallenge(phoneNumber, session, text);
      return;
    }

    if (
      await authHandler.handleMidSessionPasscode(phoneNumber, session, text)
    ) {
      return;
    }

    if (trimmedText.startsWith('/')) {
      await CommandHandler.handleCommand(trimmedText, phoneNumber, session);
      return;
    }

    const metadata = session.metadata || {};
    const awaitingMenuSelection = !!metadata.awaitingMenuSelection;
    const menuContext = metadata.menuContext;
    const activeSubmenu = metadata.activeSubmenu;

    if (trimmedText === '21') {
      await handleMenuOption('21', phoneNumber, session);
      return;
    }

    if (trimmedText === '20') {
      await handleBackToPreviousMenu(phoneNumber, session);
      return;
    }

    if (['51', '52', '53'].includes(trimmedText)) {
      await handleMenuOption(trimmedText, phoneNumber, session);
      return;
    }

    if (awaitingMenuSelection) {
      if (menuContext === 'main' && MAIN_MENU_OPTIONS.has(trimmedText)) {
        await handleMenuOption(trimmedText, phoneNumber, session);
        return;
      }

      if (
        menuContext === 'submenu' &&
        activeSubmenu &&
        SUBMENU_SHORTCUTS[activeSubmenu] &&
        SUBMENU_SHORTCUTS[activeSubmenu].has(trimmedText)
      ) {
        await handleMenuOption(trimmedText, phoneNumber, session);
        return;
      }
    }

    // Handle project selection (when user is authenticated)
    if (session.userId && session.tenantId) {
      // Check if the text is a project name (for project selection)
      try {
        const availableProjects = await formHandler.getAvailableProjects(
          session.tenantId
        );

        if (availableProjects && availableProjects.length > 0) {
          const selectedProject = availableProjects.find(
            (project) =>
              project.configuration?.projectName === text ||
              project.projectId === text
          );

          if (selectedProject) {
            logger.info(`📋 Project selected for ${phoneNumber}: ${text}`);
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
              await whatsappNotificationService.sendFormQuestion(
                phoneNumber,
                projectForm.elements[0],
                0,
                projectForm.elements.length
              );
            } else {
              await whatsappNotificationService.sendErrorMessage(
                phoneNumber,
                'No form questions available for this project.'
              );
            }
            return;
          }
        }
      } catch (error) {
        logger.error(
          `❌ Error checking project selection for ${phoneNumber}:`,
          error.message
        );
      }
    }

    // Check if it's a menu option (1, 2, 3, 4) - only if not authenticated
    if (/^[1-4]$/.test(trimmedText) && (!session.userId || !session.tenantId)) {
      await handleMenuOption(trimmedText, phoneNumber, session);
      return;
    }

    // Handle special menu options
    if (
      text === '🏠 Main Menu' ||
      text === '🏠 Back to Menu' ||
      text === '🏠 Saby menu'
    ) {
      await handleMenuOption('21', phoneNumber, session);
      return;
    }

    if (text === '📋 Forms') {
      await CommandHandler.handleForms(phoneNumber, session, []);
      return;
    }

    if (text === '📊 My Status') {
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendStatusMessage(
        phoneNumber,
        userName
      );
      return;
    }

    if (text === '🧑 Profile') {
      await CommandHandler.handleProfile(phoneNumber, session);
      return;
    }

    if (text === '❓ Help') {
      await whatsappNotificationService.sendHelpMessage(phoneNumber);
      return;
    }

    if (text === '🆘 Support') {
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendSupportMessage(
        phoneNumber,
        userName
      );
      return;
    }

    if (text === '🔄 Reset Session' || text === '🔄 Reset') {
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendResetConfirmation(
        phoneNumber,
        userName
      );
      return;
    }

    if (text === '✅ Yes, Reset' || text === '✅ Reset') {
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      session.projectId = null;
      session.formId = null;
      session.validationResult = null;
      await session.save();

      await whatsappNotificationService.sendMessageWithClearKeyboard(
        phoneNumber,
        `✅ Session Reset Successfully!

Your session has been reset. You can now start fresh.

Use /start to begin a new form submission.`
      );
      return;
    }

    if (text === '❌ Cancel') {
      await handleMenuOption('21', phoneNumber, session);
      return;
    }

    // Handle based on session status
    switch (session.status) {
      case 'authenticating':
        // Auto-authenticate using WhatsApp phone number
        await authHandler.handlePhoneAuthentication(phoneNumber, session);
        break;
      case 'awaiting_verification_confirmation':
        if (isAffirmativeResponse(text)) {
          await authHandler.confirmAccountDetails(phoneNumber, session);
        } else if (isNegativeResponse(text)) {
          await whatsappNotificationService.sendVerificationMismatch(
            phoneNumber
          );
        } else {
          await whatsappNotificationService.sendVerificationPrompt(
            phoneNumber,
            session.metadata?.profileSnapshot || {}
          );
        }
        break;
      case 'collecting_batch':
        await formHandler.handleBatchCollection(phoneNumber, text, session);
        break;
      case 'updating_profile':
        await authHandler.handleProfileUpdate(phoneNumber, text, session);
        break;
      case 'resetting_password':
        await authHandler.handlePasswordReset(phoneNumber, text, session);
        break;
      case 'selecting_project':
        if (session.metadata?.passwordReset?.stage) {
          session.status = 'resetting_password';
          await authHandler.handlePasswordReset(phoneNumber, text, session);
          break;
        }
        await formHandler.handleProjectSelection(phoneNumber, text, session);
        break;
      case 'updating_node':
        await authHandler.handleNodeUpdate(phoneNumber, text, session);
        break;
      case 'selecting_node':
        await authHandler.handleNodeSelection(phoneNumber, text, session);
        break;
      case 'filling_form':
        await formHandler.handleFormStep(phoneNumber, text, session);
        break;
      case 'ready_to_submit':
        await submitHandler.handleBatchCommand(phoneNumber, text, session);
        break;
      case 'submitting':
        await submitHandler.handleBatchCommand(phoneNumber, text, session);
        break;
      case 'submitted':
      case 'completed':
        await submitHandler.handlePostSubmissionAction(
          phoneNumber,
          text,
          session
        );
        break;
      default:
        // Auto-authenticate using WhatsApp phone number
        await authHandler.handlePhoneAuthentication(phoneNumber, session);
    }
  } catch (error) {
    logger.error(
      `❌ Error handling text message from ${phoneNumber}:`,
      error.message
    );
    logger.error(`❌ Error stack:`, error.stack);
    logger.error(`❌ Session status:`, session.status);
    logger.error(`❌ Text content:`, text);

    try {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to process your message. Please try again.'
      );
    } catch (sendError) {
      logger.error(`❌ Failed to send error message:`, sendError.message);
    }
  }
}

/**
 * Handle image messages
 * @param {Object} message - WhatsApp message object
 * @param {Object} session - User session
 */
async function handleImageMessage(message, session) {
  const phoneNumber = message.from;
  const imageId = message.image?.id;

  try {
    logger.info(`🖼️ Image message from ${phoneNumber}, ID: ${imageId}`);

    // Handle based on session status
    switch (session.status) {
      case 'filling_form':
        // Create file info object for image
        const imageFileInfo = {
          fileId: imageId,
          fileName: `image_${Date.now()}.jpg`,
          fileSize: 0, // WhatsApp doesn't provide file size in webhook
          mimeType: 'image/jpeg',
        };
        await formHandler.handleFileUpload(phoneNumber, imageFileInfo, session);
        break;
      default:
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please send text messages only. Images are not supported in this context.'
        );
    }
  } catch (error) {
    logger.error(
      `❌ Error handling image message from ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process image. Please try again.'
    );
  }
}

/**
 * Handle document messages
 * @param {Object} message - WhatsApp message object
 * @param {Object} session - User session
 */
async function handleDocumentMessage(message, session) {
  const phoneNumber = message.from;
  const documentId = message.document?.id;
  const documentName = message.document?.filename;

  try {
    logger.info(
      `📄 Document message from ${phoneNumber}, ID: ${documentId}, Name: ${documentName}`
    );

    // Handle based on session status
    switch (session.status) {
      case 'filling_form':
        // Create file info object for document
        const documentFileInfo = {
          fileId: documentId,
          fileName: documentName || `document_${Date.now()}`,
          fileSize: 0, // WhatsApp doesn't provide file size in webhook
          mimeType: message.document?.mime_type || 'application/octet-stream',
        };
        await formHandler.handleFileUpload(
          phoneNumber,
          documentFileInfo,
          session
        );
        break;
      default:
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please send text messages only. Documents are not supported in this context.'
        );
    }
  } catch (error) {
    logger.error(
      `❌ Error handling document message from ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process document. Please try again.'
    );
  }
}

/**
 * Handle button messages
 * @param {Object} message - WhatsApp message object
 * @param {Object} session - User session
 */
async function handleButtonMessage(message, session) {
  const phoneNumber = message.from;
  const buttonText = message.button?.text;

  try {
    logger.info(`🔘 Button message from ${phoneNumber}: ${buttonText}`);

    // Handle based on session status
    switch (session.status) {
      case 'selecting_project':
        await formHandler.handleProjectSelection(
          phoneNumber,
          buttonText,
          session
        );
        break;
      case 'filling_form':
        await formHandler.handleFormAnswer(phoneNumber, buttonText, session);
        break;
      default:
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Button interactions are not supported in this context. Please send text messages.'
        );
    }
  } catch (error) {
    logger.error(
      `❌ Error handling button message from ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process button interaction. Please try again.'
    );
  }
}

/**
 * Handle interactive messages (list responses, etc.)
 * @param {Object} message - WhatsApp message object
 * @param {Object} session - User session
 */
async function handleInteractiveMessage(message, session) {
  const phoneNumber = message.from;
  const interactiveType = message.interactive?.type;
  const response =
    message.interactive?.list_reply || message.interactive?.button_reply;

  try {
    logger.info(
      `🔄 Interactive message from ${phoneNumber}, Type: ${interactiveType}, Response: ${JSON.stringify(
        response
      )}`
    );

    // Send a helpful message explaining that interactive messages are not supported
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Interactive messages are not supported in this context. Please send text messages or use the number options provided.'
    );
  } catch (error) {
    logger.error(
      `❌ Error handling interactive message from ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process interactive message. Please try again.'
    );
  }
}

/**
 * Process individual WhatsApp message
 * @param {Object} message - WhatsApp message object
 */
async function processMessage(message) {
  const phoneNumber = message.from;
  const messageType = message.type;
  const { timestamp } = message;
  try {
    logger.info(`💬 Processing ${messageType} message from ${phoneNumber}`);
    logger.info(`📝 Message content:`, JSON.stringify(message, null, 2));

    // Get or create session
    const session = await getOrCreateSession(phoneNumber);

    // Update session metadata
    session.metadata.lastActivity = new Date(timestamp * 1000);
    await session.save();

    if (await authHandler.ensureNotExpired(phoneNumber, session)) {
      return;
    }

    if (
      messageType !== 'text' &&
      (await authHandler.handleMidSessionPasscode(phoneNumber, session))
    ) {
      return;
    }

    // Handle different message types
    switch (messageType) {
      case 'text':
        await handleTextMessage(message, session);
        break;
      case 'image':
        await handleImageMessage(message, session);
        break;
      case 'document':
        await handleDocumentMessage(message, session);
        break;
      case 'button':
        await handleButtonMessage(message, session);
        break;
      case 'interactive':
        await handleInteractiveMessage(message, session);
        break;
      case 'unsupported':
        logger.warn(`⚠️ Unsupported message type from ${phoneNumber}`);
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Sorry, I cannot process this type of message. Please send text, images, or documents only.'
        );
        break;
      default:
        logger.warn(`⚠️ Unknown message type: ${messageType}`);
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Sorry, I received an unknown message type. Please send text, images, or documents only.'
        );
    }
  } catch (error) {
    logger.error(
      `❌ Error processing message from ${phoneNumber}:`,
      error.message
    );
    logger.error(`❌ Error stack:`, error.stack);

    // Send a more helpful error message
    try {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Sorry, there was an issue processing your message. Please try again or contact support if the problem persists.'
      );
    } catch (sendError) {
      logger.error(`❌ Failed to send error message:`, sendError.message);
    }
  }
}

/**
 * Verify webhook signature
 * @param {string} mode - Hub mode
 * @param {string} token - Verify token
 * @param {string} challenge - Challenge string
 * @returns {string|false} Challenge string if valid, false otherwise
 */
function verifyWebhook(mode, token, challenge) {
  logger.info(
    `🔍 Webhook verification - Mode: ${mode}, Token: ${token}, Expected: ${VERIFY_TOKEN}`
  );

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('✅ WhatsApp webhook verification successful');
    return challenge;
  }

  logger.warn('❌ WhatsApp webhook verification failed');
  return false;
}

const MAIN_MENU_OPTIONS = new Set(['1', '2', '3', '4', '5']);
const SUBMENU_SHORTCUTS = {
  authentication: new Set(['11', '12', '13', '14', '20', '21']),
  profile: new Set(['22', '23', '24', '20', '21']),
  unit: new Set(['31', '32', '20', '21']),
  projects: new Set(['41', '42', '43', '20', '21']),
  support: new Set(['51', '52', '53', '20', '21']),
};

function ensureMenuStack(session) {
  if (!session) {
    return [];
  }
  session.metadata = session.metadata || {};
  session.metadata.menuStack = session.metadata.menuStack || [];
  if (session.metadata.menuStack.length === 0) {
    session.metadata.menuStack.push('main');
  }
  return session.metadata.menuStack;
}

function pushMenuStackEntry(session, key) {
  if (!session) {
    return;
  }
  session.metadata = session.metadata || {};
  const stack = ensureMenuStack(session);
  if (stack[stack.length - 1] !== key) {
    stack.push(key);
  }
  session.metadata.menuStack = stack;
}

function pushActionContext(session, optionKey) {
  if (!session) {
    return;
  }
  session.metadata = session.metadata || {};
  const submenu = session.metadata.activeSubmenu;
  if (!submenu) {
    return;
  }
  const key = `action:${submenu}:${optionKey}`;
  pushMenuStackEntry(session, key);
  session.metadata.lastMenuKey = key;
}

async function setMenuContext(session, context, submenu = null) {
  if (!session) {
    return;
  }
  session.metadata = session.metadata || {};
  const stack = ensureMenuStack(session);
  if (context === 'main') {
    session.metadata.menuStack = ['main'];
    session.metadata.lastMenuKey = 'main';
    session.metadata.lastSubmenu = null;
  } else if (context === 'submenu' && submenu) {
    if (stack[stack.length - 1] === 'main' && stack.length === 1) {
      // already ensured main present
    }
    pushMenuStackEntry(session, `submenu:${submenu}`);
    session.metadata.lastMenuKey = `submenu:${submenu}`;
    session.metadata.lastSubmenu = submenu;
  }
  session.metadata.menuContext = context;
  session.metadata.activeSubmenu = submenu;
  session.metadata.awaitingMenuSelection = true;
  session.markModified('metadata');
  await session.save();
}

async function clearMenuContext(session) {
  if (!session) {
    return;
  }
  session.metadata = session.metadata || {};
  session.metadata.menuContext = null;
  session.metadata.activeSubmenu = null;
  session.metadata.awaitingMenuSelection = false;
  session.markModified('metadata');
  await session.save();
}

async function sendSubmenuByKey(phoneNumber, session, submenu) {
  switch (submenu) {
    case 'authentication':
      await whatsappNotificationService.sendAuthenticationMenu(phoneNumber);
      break;
    case 'profile':
      await whatsappNotificationService.sendProfileMenu(phoneNumber);
      break;
    case 'unit':
      await whatsappNotificationService.sendUnitMenu(phoneNumber);
      break;
    case 'projects':
      await whatsappNotificationService.sendProjectMenu(phoneNumber);
      break;
    case 'support':
      await whatsappNotificationService.sendSupportMenu(phoneNumber);
      break;
    default:
      await CommandHandler.handleMenu(phoneNumber, session, []);
  }
}

async function handleBackToPreviousMenu(phoneNumber, session) {
  if (!session) {
    return;
  }
  session.metadata = session.metadata || {};
  const stack = session.metadata.menuStack || [];
  logger.info('🔙 Back command received', {
    phoneNumber,
    stackBefore: Array.from(stack),
  });
  if (stack.length === 0) {
    const fallbackSubmenu = session.metadata.lastSubmenu;
    if (fallbackSubmenu) {
      logger.info('🔙 Stack empty, using last submenu fallback', {
        phoneNumber,
        fallbackSubmenu,
      });
      await setMenuContext(session, 'submenu', fallbackSubmenu);
      await sendSubmenuByKey(phoneNumber, session, fallbackSubmenu);
      return;
    }
    await setMenuContext(session, 'main');
    await CommandHandler.handleMenu(phoneNumber, session, []);
    return;
  }

  let targetKey = stack[stack.length - 1];
  if (targetKey.startsWith('action:')) {
    stack.pop();
    if (stack.length === 0) {
      stack.push('main');
    }
    targetKey = stack[stack.length - 1];
  }

  session.metadata.menuStack = stack;
  session.metadata.lastMenuKey = targetKey;

  if (targetKey.startsWith('submenu:')) {
    const submenu = targetKey.split(':')[1];
    logger.info('🔙 Returning to submenu', {
      phoneNumber,
      submenu,
      stackAfter: Array.from(stack),
    });
    await setMenuContext(session, 'submenu', submenu);
    await sendSubmenuByKey(phoneNumber, session, submenu);
    return;
  }

  const fallbackSubmenu = session.metadata.lastSubmenu;
  if (fallbackSubmenu) {
    logger.info('🔙 Falling back to last submenu', {
      phoneNumber,
      fallbackSubmenu,
      stackAfter: Array.from(stack),
    });
    await setMenuContext(session, 'submenu', fallbackSubmenu);
    await sendSubmenuByKey(phoneNumber, session, fallbackSubmenu);
    return;
  }

  logger.info('🔙 Returning to main menu', {
    phoneNumber,
    stackAfter: Array.from(stack),
  });
  await setMenuContext(session, 'main');
  await CommandHandler.handleMenu(phoneNumber, session, []);
}

function isAffirmativeResponse(text = '') {
  const normalized = text.trim().toLowerCase();
  return [
    'yes',
    'y',
    'confirm',
    'confirmed',
    'correct',
    'ok',
    'okay',
    'sure',
    '1',
    '👍',
    '✅',
  ].includes(normalized);
}

function isNegativeResponse(text = '') {
  const normalized = text.trim().toLowerCase();
  return [
    'no',
    'n',
    'incorrect',
    'not correct',
    'nope',
    'cancel',
    '2',
    '❌',
    '✖️',
  ].includes(normalized);
}

/**
 * Handle menu options
 * @param {string} option - Menu option (1, 2, 3, 4)
 * @param {string} phoneNumber - User phone number
 * @param {Object} session - User session
 */
async function handleMenuOption(option, phoneNumber, session) {
  try {
    const normalizedOption = (option || '').trim();
    logger.info(`📋 Menu option from ${phoneNumber}: ${normalizedOption}`);
    const userName = session?.metadata?.userName || 'User';

    switch (normalizedOption) {
      case '21':
        await setMenuContext(session, 'main');
        await CommandHandler.handleMenu(phoneNumber, session, []);
        break;
      case '1':
        await setMenuContext(session, 'submenu', 'authentication');
        await whatsappNotificationService.sendAuthenticationMenu(phoneNumber);
        break;
      case '11':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await authHandler.handleLogout(phoneNumber, session);
        break;
      case '12':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleResetPassword(phoneNumber, session);
        break;
      case '13':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleVerify(phoneNumber, session);
        break;
      case '2':
        await setMenuContext(session, 'submenu', 'profile');
        await whatsappNotificationService.sendProfileMenu(phoneNumber);
        break;
      case '22':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleProfile(phoneNumber, session);
        break;
      case '23':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleUpdateProfile(phoneNumber, session);
        break;
      case '24':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleReset(phoneNumber, session, []);
        break;
      case '3':
        await setMenuContext(session, 'submenu', 'unit');
        await whatsappNotificationService.sendUnitMenu(phoneNumber);
        break;
      case '31':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleNode(phoneNumber, session);
        break;
      case '32':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleUnitUpdate(phoneNumber, session);
        break;
      case '4':
        await setMenuContext(session, 'submenu', 'projects');
        await whatsappNotificationService.sendProjectMenu(phoneNumber);
        break;
      case '41':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleForms(phoneNumber, session, []);
        break;
      case '42':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleProjects(phoneNumber, session, []);
        break;
      case '43':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleSubmitCommand(phoneNumber, session);
        break;
      case '5':
        await setMenuContext(session, 'submenu', 'support');
        await whatsappNotificationService.sendSupportMenu(phoneNumber);
        break;
      case '51':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleSupport(phoneNumber, session, []);
        break;
      case '52':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleHelp(phoneNumber, session, []);
        break;
      case '53':
        pushActionContext(session, normalizedOption);
        await clearMenuContext(session);
        await CommandHandler.handleStatus(phoneNumber, session, []);
        break;
      default:
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please choose a valid number from the menu (use 21 to show it again or 20 to go back).'
        );
    }
  } catch (error) {
    logger.error(
      `❌ Error handling menu option from ${phoneNumber}:`,
      error.message
    );
    logger.error(`❌ Error stack:`, error.stack);
    logger.error(`❌ Option:`, option);

    try {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to process option. Please try again.'
      );
    } catch (sendError) {
      logger.error(`❌ Failed to send error message:`, sendError.message);
    }
  }
}

module.exports = {
  initializeWhatsAppBot,
  handleWebhook,
  verifyWebhook,
  getOrCreateSession,
  processMessage,
  handleTextMessage,
  handleImageMessage,
  handleDocumentMessage,
  handleButtonMessage,
  handleInteractiveMessage,
  VERIFY_TOKEN,
  PHONE_NUMBER_ID,
  ACCESS_TOKEN,
};
