const { submissionService, projectFormService } = require('../../../services');
const telegramValidationService = require('../services/telegramValidation.service');
const telegramNotificationService = require('../services/telegramNotification.service');
const logger = require('../../../config/logger');

/**
 * Handle form submission
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 */
exports.handleSubmit = async (bot, msg, session) => {
  const chatId = msg.chat.id;
  const userAction = msg.text;

  try {
    console.log(`🔍 [DEBUG] Submission action started for chat ${chatId}`);
    console.log(`🔍 [DEBUG] User action: "${userAction}"`);
    console.log(`🔍 [DEBUG] Session data:`, {
      projectId: session.projectId,
      formId: session.formId,
      tenantId: session.tenantId,
      userId: session.userId,
      status: session.status,
      currentStep: session.currentStep,
      answersCount: session.answers ? session.answers.size : 0,
    });

    logger.info(
      `📤 Processing submission action for chat ${chatId}: "${userAction}"`
    );

    // Handle different submission actions
    switch (userAction) {
      case '✅ Submit Form':
        console.log(`🔍 [DEBUG] Processing form submission`);
        await processFormSubmission(bot, session);
        break;

      case '📋 Review Answers':
        console.log(`🔍 [DEBUG] Reviewing answers`);
        await reviewAnswers(bot, session);
        break;

      case '📋 Submit Another':
        console.log(`🔍 [DEBUG] Starting new submission`);
        await startNewSubmission(bot, session);
        break;

      case '🔄 Start Over':
        console.log(`🔍 [DEBUG] Starting over`);
        await startOver(bot, session);
        break;

      case '❌ Cancel':
        console.log(`🔍 [DEBUG] Cancelling submission`);
        await cancelSubmission(bot, session);
        break;

      default:
        console.log(`🔍 [DEBUG] Invalid action: "${userAction}"`);
        await telegramNotificationService.sendErrorMessage(
          chatId,
          'Invalid action. Please choose from the available options.'
        );
        break;
    }
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in handleSubmit:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error processing submission action for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process submission. Please try again.'
    );
  }
};

/**
 * Process the actual form submission
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
async function processFormSubmission(bot, session) {
  const { chatId } = session;

  try {
    console.log(`🔍 [DEBUG] processFormSubmission started for chat ${chatId}`);
    console.log(`🔍 [DEBUG] Session projectId: ${session.projectId}`);

    logger.info(`📤 Processing form submission for chat ${chatId}`);

    // Get project form details
    console.log(
      `🔍 [DEBUG] Getting project form by projectId: ${session.projectId}`
    );
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );
    console.log(
      `🔍 [DEBUG] Project form found:`,
      projectForm
        ? {
            projectId: projectForm.projectId,
            projectName: projectForm.identity && projectForm.identity.name,
            elementsCount: projectForm.elements
              ? projectForm.elements.length
              : 0,
          }
        : 'NOT FOUND'
    );

    if (!projectForm) {
      console.log(
        `🔍 [DEBUG] Project form not found for projectId: ${session.projectId}`
      );
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Project form not found.'
      );
      return;
    }

    // Prepare submission data
    console.log(`🔍 [DEBUG] Preparing submission data`);
    const submissionData = {
      tenantId: session.tenantId,
      projectId: session.projectId,
      project_name: projectForm.configuration?.projectName || session.projectId,
      project_category: projectForm.configuration?.projectCategory || 'General',
      formId: session.formId,
      nodeId: `telegram-node-${Date.now()}`,
      userId: session.userId,
      source: 'telegram',
      status: 'submitted',
      metadata: {
        chatId: session.chatId,
        phoneNumber: session.metadata.phoneNumber,
        firstName: session.metadata.firstName,
        lastName: session.metadata.lastName,
        username: session.metadata.username,
        languageCode: session.metadata.languageCode,
        sessionStartTime: session.metadata.sessionStartTime,
        submittedAt: new Date(),
        validation: {
          validated: true,
          senderId: session.userId,
          projectFormId: session.formId,
          validationErrors: [],
          validationWarnings: [],
          verifiedPhone: session.metadata.phoneNumber,
        },
      },
      payload: {
        text: 'Telegram form submission',
        html: 'Telegram form submission',
        structured: convertAnswersToStructured(session.answers, projectForm),
        attachments: [], // File attachments would be handled separately
      },
    };

    console.log(`🔍 [DEBUG] Submission data prepared:`, {
      tenantId: submissionData.tenantId,
      projectId: submissionData.projectId,
      project_name: submissionData.project_name,
      userId: submissionData.userId,
      structuredDataKeys: Object.keys(submissionData.payload.structured),
    });

    // Validate submission data
    const validationResult =
      await telegramValidationService.validateTelegramSubmission(
        {
          phoneNumber: session.metadata.phoneNumber,
          tenantId: session.tenantId,
        },
        submissionData.payload.structured,
        session.projectId
      );

    if (!validationResult.valid) {
      logger.warn(
        `❌ Submission validation failed for chat ${chatId}:`,
        validationResult.errors
      );

      // Update session with validation result
      session.validationResult = {
        valid: false,
        errors: validationResult.errors.map((e) => e.error),
        warnings: validationResult.warnings.map((w) => w.warning),
      };
      await session.save();

      await telegramNotificationService.sendSubmissionFailure(
        chatId,
        'Form validation failed. Please check your answers and try again.'
      );
      return;
    }

    // Queue submission for processing
    console.log(`🔍 [DEBUG] Calling submissionService.queueSubmission`);
    const queueResult = await submissionService.queueSubmission(submissionData);
    console.log(`🔍 [DEBUG] queueSubmission result:`, queueResult);
    console.log(
      `🔍 [DEBUG] queueResult.status:`,
      queueResult ? queueResult.status : 'undefined'
    );
    console.log(
      `🔍 [DEBUG] queueResult.jobId:`,
      queueResult ? queueResult.jobId : 'undefined'
    );

    if (!queueResult || queueResult.status !== 'queued') {
      console.log(
        `🔍 [DEBUG] Queue submission failed - queueResult:`,
        queueResult
      );
      logger.error(
        `❌ Failed to queue submission for chat ${chatId}:`,
        queueResult ? queueResult.error : 'No result returned'
      );
      await telegramNotificationService.sendSubmissionFailure(
        chatId,
        'Failed to submit form. Please try again later.'
      );
      return;
    }

    // Send success message to user
    await telegramNotificationService.sendSubmissionSuccess(
      chatId,
      queueResult.jobId
    );

    // Send dual email notifications (to sender and admin)
    try {
      console.log(
        `🔍 [DEBUG] Starting email notification process for chat ${chatId}`
      );
      console.log(
        `🔍 [DEBUG] Session metadata:`,
        JSON.stringify(session.metadata, null, 2)
      );
      console.log(`🔍 [DEBUG] Session userId:`, session.userId);
      console.log(`🔍 [DEBUG] Session tenantId:`, session.tenantId);

      // Use the email stored in session metadata during authentication
      let { userEmail } = session.metadata;
      let { userName } = session.metadata;
      let userPhone = session.metadata.phoneNumber;

      console.log(`🔍 [DEBUG] Initial email from session:`, userEmail);
      console.log(`🔍 [DEBUG] Initial name from session:`, userName);
      console.log(`🔍 [DEBUG] Initial phone from session:`, userPhone);

      // Fallback: If email not in session, fetch from database
      if (!userEmail && session.userId) {
        console.log(
          `🔍 [DEBUG] Email not in session, fetching from database for user ID: ${session.userId}`
        );
        console.log(
          `🔍 [DEBUG] Using phone number: ${session.metadata.phoneNumber}`
        );

        const userValidation =
          await telegramValidationService.validateUserByPhone(
            session.metadata.phoneNumber,
            session.tenantId
          );
        console.log(`🔍 [DEBUG] User validation result:`, userValidation);

        if (userValidation.valid && userValidation.user) {
          const { user } = userValidation;
          userEmail = user.email;
          userName =
            user.name ||
            `${user.firstname || ''} ${user.lastname || ''}`.trim();
          userPhone = user.phoneNumber;

          console.log(`🔍 [DEBUG] Updated email:`, userEmail);
          console.log(`🔍 [DEBUG] Updated name:`, userName);
          console.log(`🔍 [DEBUG] Updated phone:`, userPhone);

          // Update session with email for future use
          session.metadata.userEmail = userEmail;
          session.metadata.userName = userName;
          await session.save();
          console.log(`🔍 [DEBUG] Session updated with email: ${userEmail}`);
        } else {
          console.log(
            `🔍 [DEBUG] User validation failed:`,
            userValidation.error
          );
        }
      }

      if (userEmail) {
        // Create user object for email notifications
        const user = {
          _id: session.userId,
          email: userEmail,
          name: userName,
          phoneNumber: userPhone,
          tenantId: session.tenantId,
        };

        console.log(`🔍 [DEBUG] User object for email notifications:`, user);
        console.log(
          `🔍 [DEBUG] Submission data for email:`,
          JSON.stringify(submissionData, null, 2)
        );

        await telegramNotificationService.sendDualEmailNotifications(
          submissionData,
          user
        );
        console.log(`🔍 [DEBUG] Email notifications sent successfully`);
      } else {
        console.log(
          `🔍 [DEBUG] No user email found - cannot send notifications`
        );
        logger.warn(`⚠️ No user email found in session for chat ${chatId}`);
      }
    } catch (error) {
      console.log(`🔍 [DEBUG] Email notification error:`, error);
      console.log(`🔍 [DEBUG] Error stack:`, error.stack);
      logger.error(`❌ Failed to send email notifications:`, error.message);
      // Don't fail the submission if email fails
    }

    logger.info(
      `✅ Form submission queued successfully for chat ${chatId} (Job ID: ${queueResult.jobId})`
    );
  } catch (error) {
    logger.error(
      `❌ Error processing form submission for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendSubmissionFailure(
      chatId,
      'Failed to submit form. Please try again.'
    );
  }
}

/**
 * Convert session answers to structured format
 * @param {Map} answers - Session answers
 * @param {Object} projectForm - Project form object
 * @returns {Object} Structured data
 */
function convertAnswersToStructured(answers, projectForm) {
  const structured = {};

  if (!projectForm.elements) {
    return structured;
  }

  for (let i = 0; i < projectForm.elements.length; i++) {
    const element = projectForm.elements[i];
    const answer = answers.get(i.toString());

    if (answer !== undefined) {
      const fieldName = element.properties?.label || element.id;
      const fieldKey = normalizeFieldName(fieldName);

      // Handle file uploads
      if (typeof answer === 'object' && answer.fileId) {
        structured[fieldKey] = {
          type: 'file',
          fileName: answer.fileName,
          fileId: answer.fileId,
          fileSize: answer.fileSize,
          mimeType: answer.mimeType,
        };
      } else {
        structured[fieldKey] = answer;
      }
    }
  }

  return structured;
}

/**
 * Normalize field name for consistency
 * @param {string} fieldName - Original field name
 * @returns {string} Normalized field name
 */
function normalizeFieldName(fieldName) {
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/**
 * Review answers before submission
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
async function reviewAnswers(bot, session) {
  const { chatId } = session;

  try {
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Form not found.'
      );
      return;
    }

    let reviewMessage = `📋 Form Review\n\nProject: ${
      projectForm.configuration?.projectName || session.projectId
    }\n\n`;

    for (let i = 0; i < projectForm.elements.length; i++) {
      const question = projectForm.elements[i];
      const answer = session.answers.get(i.toString());

      reviewMessage += `${i + 1}. ${
        question.properties?.label || question.id
      }\n`;

      if (answer) {
        if (typeof answer === 'object' && answer.fileId) {
          reviewMessage += `   Answer: 📎 ${answer.fileName} (${formatFileSize(
            answer.fileSize
          )})\n`;
        } else {
          reviewMessage += `   Answer: ${answer}\n`;
        }
      } else {
        reviewMessage += `   Answer: ❌ Not answered\n`;
      }

      reviewMessage += '\n';
    }

    await bot.sendMessage(chatId, reviewMessage, {
      reply_markup: {
        keyboard: [
          [{ text: '✅ Submit Form' }],
          [{ text: '🔄 Start Over' }],
          [{ text: '❌ Cancel' }],
        ],
        resize_keyboard: true,
      },
    });
  } catch (error) {
    logger.error(
      `❌ Error reviewing answers for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to review answers. Please try again.'
    );
  }
}

/**
 * Start over with form filling
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
async function startOver(bot, session) {
  const { chatId } = session;

  try {
    // Reset session
    session.currentStep = 0;
    session.answers.clear();
    session.status = 'filling_form';
    await session.save();

    // Start form filling again
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (
      !projectForm ||
      !projectForm.elements ||
      projectForm.elements.length === 0
    ) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'No form questions available.'
      );
      return;
    }

    const firstQuestion = projectForm.elements[0];
    await telegramNotificationService.sendFormQuestion(
      chatId,
      firstQuestion,
      0,
      projectForm.elements.length
    );

    logger.info(`✅ Form restarted for chat ${chatId}`);
  } catch (error) {
    logger.error(`❌ Error starting over for chat ${chatId}:`, error.message);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to start over. Please try again.'
    );
  }
}

/**
 * Start a new form submission
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
async function startNewSubmission(bot, session) {
  const { chatId } = session;

  try {
    // Clear current session data
    session.currentStep = 0;
    session.answers.clear();
    session.status = 'filling_form';
    session.validationResult = null; // Clear previous validation results
    await session.save();

    // Get a new project form
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (
      !projectForm ||
      !projectForm.elements ||
      projectForm.elements.length === 0
    ) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'No form questions available for a new submission.'
      );
      return;
    }

    const firstQuestion = projectForm.elements[0];
    await telegramNotificationService.sendFormQuestion(
      chatId,
      firstQuestion,
      0,
      projectForm.elements.length
    );

    logger.info(`✅ New form submission started for chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error starting new submission for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to start new submission. Please try again.'
    );
  }
}

/**
 * Cancel submission and return to main menu
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
async function cancelSubmission(bot, session) {
  const { chatId } = session;

  try {
    // Reset session to authentication
    session.status = 'authenticating';
    session.currentStep = 0;
    session.answers.clear();
    await session.save();

    await telegramNotificationService.sendMessageWithClearKeyboard(
      chatId,
      'Submission cancelled. Type /start to begin again.'
    );

    logger.info(`✅ Submission cancelled for chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error cancelling submission for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to cancel submission. Please try again.'
    );
  }
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
