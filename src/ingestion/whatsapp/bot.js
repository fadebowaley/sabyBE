const axios = require('axios');
const mongoose = require('mongoose');
const config = require('../../config/config');
const logger = require('../../config/logger');

// Import our services
const whatsappValidationService = require('./services/whatsappValidation.service');
const whatsappNotificationService = require('./services/whatsappNotification.service');
const { projectFormService } = require("../../services");

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
    logger.error('❌ Failed to initialize WhatsApp bot:', error.message);
    throw error;
  }
}

/**
 * Verify WhatsApp Business API connection
 */
async function verifyWhatsAppConnection() {
  try {
    const response = await axios.get(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}`, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    });

    if (response.status === 200) {
      logger.info(`✅ WhatsApp Business API connected for phone number: ${response.data.phone_number}`);
      return true;
    }
  } catch (error) {
    logger.error('❌ Failed to verify WhatsApp connection:', error.message);
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
    logger.error(`❌ Error managing session for phone ${phoneNumber}:`, error.message);
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
    console.log('🔍 RAW WEBHOOK DATA:', webhookData);
    console.log('🔍 RAW WEBHOOK DATA TYPE:', typeof webhookData);
    console.log('🔍 RAW WEBHOOK DATA STRINGIFIED:', JSON.stringify(webhookData));

    logger.info('📨 WhatsApp webhook received:', JSON.stringify(webhookData, null, 2));
    logger.info('🔍 Webhook data keys:', Object.keys(webhookData || {}));
    logger.info('🔍 Webhook data type:', typeof webhookData);
    logger.info('🔍 Webhook data length:', JSON.stringify(webhookData || {}).length);
    logger.info('🔍 Webhook data is null/undefined:', webhookData === null || webhookData === undefined);

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
    logger.info(`🔍 Changes value keys:`, changes.value ? Object.keys(changes.value) : 'No value object');

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
      logger.warn('🔍 Full changes object for debugging:', JSON.stringify(changes, null, 2));

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
    console.error('❌ ERROR STACK:', error.stack);
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
      logger.info('📱 No messages found in webhook (status update or other event)');
      logger.info('📱 Available keys in webhook:', Object.keys(webhookValue));
      return;
    }

    // Process each message
    for (const message of messages) {
      // Check if message has errors
      if (message.errors && message.errors.length > 0) {
        logger.warn(`⚠️ Message has errors:`, JSON.stringify(message.errors, null, 2));

        // Send error message to user
        try {
          await whatsappNotificationService.sendErrorMessage(
            message.from,
            'Sorry, I received your message but it contains an unsupported format. Please try sending a text message instead.'
          );
        } catch (sendError) {
          logger.error(`❌ Failed to send error message:`, sendError.message);
        }
        continue;
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
        continue;
      }

      // Process valid messages
      await processMessage(message);
    }
  } catch (error) {
    logger.error('❌ Error handling WhatsApp Business webhook:', error.message);
  }
}

/**
 * Process individual WhatsApp message
 * @param {Object} message - WhatsApp message object
 */
async function processMessage(message) {
  const phoneNumber = message.from;
  const messageType = message.type;
  const timestamp = message.timestamp;

  try {
    logger.info(`💬 Processing ${messageType} message from ${phoneNumber}`);
    logger.info(`📝 Message content:`, JSON.stringify(message, null, 2));

    // Get or create session
    const session = await getOrCreateSession(phoneNumber);

    // Update session metadata
    session.metadata.lastActivity = new Date(timestamp * 1000);
    await session.save();

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
    logger.error(`❌ Error processing message from ${phoneNumber}:`, error.message);
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
 * Handle text messages
 * @param {Object} message - WhatsApp message object
 * @param {Object} session - User session
 */
async function handleTextMessage(message, session) {
  const phoneNumber = message.from;
  const text = message.text?.body || '';

  try {
    logger.info(`📝 Text message from ${phoneNumber}: ${text}`);

    // Check if it's a command (starts with /)
    if (text.startsWith('/')) {
      await CommandHandler.handleCommand(text, phoneNumber, session);
      return;
    }

    // Handle project selection (when user is authenticated)
    if (session.userId && session.tenantId) {
      // Check if the text is a project name (for project selection)
      try {
        const availableProjects = await formHandler.getAvailableProjects(session.tenantId);

        if (availableProjects && availableProjects.length > 0) {
          const selectedProject = availableProjects.find(
            (project) => project.configuration?.projectName === text || project.projectId === text
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
            const projectForm = await projectFormService.getProjectFormByProjectId(selectedProject.projectId);
            if (projectForm && projectForm.elements && projectForm.elements.length > 0) {
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
        logger.error(`❌ Error checking project selection for ${phoneNumber}:`, error.message);
      }
    }

    // Check if it's a menu option (1, 2, 3, 4) - only if not authenticated
    if (/^[1-4]$/.test(text.trim()) && (!session.userId || !session.tenantId)) {
      await handleMenuOption(text.trim(), phoneNumber, session);
      return;
    }

    // Handle special menu options
    if (text === '🏠 Main Menu' || text === '🏠 Back to Menu') {
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
      return;
    }

    if (text === '📊 My Status') {
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendStatusMessage(phoneNumber, userName);
      return;
    }

    if (text === '❓ Help') {
      await whatsappNotificationService.sendHelpMessage(phoneNumber);
      return;
    }

    if (text === '🔄 Reset Session') {
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendResetConfirmation(phoneNumber, userName);
      return;
    }

    if (text === '✅ Yes, Reset') {
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
      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
      return;
    }

    // Handle based on session status
    switch (session.status) {
      case 'authenticating':
        // Auto-authenticate using WhatsApp phone number
        await authHandler.handlePhoneAuthentication(phoneNumber, session);
        break;
      case 'selecting_project':
        await formHandler.handleProjectSelection(phoneNumber, text, session);
        break;
      case 'filling_form':
        await formHandler.handleFormStep(phoneNumber, text, session);
        break;
      case 'submitting':
        await submitHandler.handleSubmission(phoneNumber, text, session);
        break;
      default:
        // Auto-authenticate using WhatsApp phone number
        await authHandler.handlePhoneAuthentication(phoneNumber, session);
    }
  } catch (error) {
    logger.error(`❌ Error handling text message from ${phoneNumber}:`, error.message);
    logger.error(`❌ Error stack:`, error.stack);
    logger.error(`❌ Session status:`, session.status);
    logger.error(`❌ Text content:`, text);

    try {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to process your message. Please try again.');
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
    logger.error(`❌ Error handling image message from ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to process image. Please try again.');
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
    logger.info(`📄 Document message from ${phoneNumber}, ID: ${documentId}, Name: ${documentName}`);

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
        await formHandler.handleFileUpload(phoneNumber, documentFileInfo, session);
        break;
      default:
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please send text messages only. Documents are not supported in this context.'
        );
    }
  } catch (error) {
    logger.error(`❌ Error handling document message from ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to process document. Please try again.');
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
        await formHandler.handleProjectSelection(phoneNumber, buttonText, session);
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
    logger.error(`❌ Error handling button message from ${phoneNumber}:`, error.message);
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
  const response = message.interactive?.list_reply || message.interactive?.button_reply;

  try {
    logger.info(
      `🔄 Interactive message from ${phoneNumber}, Type: ${interactiveType}, Response: ${JSON.stringify(response)}`
    );

    // Send a helpful message explaining that interactive messages are not supported
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Interactive messages are not supported in this context. Please send text messages or use the number options provided.'
    );
  } catch (error) {
    logger.error(`❌ Error handling interactive message from ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process interactive message. Please try again.'
    );
  }
}

/**
 * Handle menu options
 * @param {string} option - Menu option (1, 2, 3, 4)
 * @param {string} phoneNumber - User phone number
 * @param {Object} session - User session
 */
async function handleMenuOption(option, phoneNumber, session) {
  try {
    logger.info(`📋 Menu option from ${phoneNumber}: ${option}`);

    switch (option) {
      case '1':
        // Start forms - auto-authenticate and start
        await authHandler.handlePhoneAuthentication(phoneNumber, session);
        break;
      case '2':
        await whatsappNotificationService.sendHelpMessage(phoneNumber);
        break;
      case '3':
        await whatsappNotificationService.sendStatusMessage(phoneNumber);
        break;
      case '4':
        await whatsappNotificationService.sendSupportMessage(phoneNumber);
        break;
      default:
        // Auto-authenticate for unknown options
        await authHandler.handlePhoneAuthentication(phoneNumber, session);
    }
  } catch (error) {
    logger.error(`❌ Error handling menu option from ${phoneNumber}:`, error.message);
    logger.error(`❌ Error stack:`, error.stack);
    logger.error(`❌ Option:`, option);

    try {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to process option. Please try again.');
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
  logger.info(`🔍 Webhook verification - Mode: ${mode}, Token: ${token}, Expected: ${VERIFY_TOKEN}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('✅ WhatsApp webhook verification successful');
    return challenge;
  }

  logger.warn('❌ WhatsApp webhook verification failed');
  return false;
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
