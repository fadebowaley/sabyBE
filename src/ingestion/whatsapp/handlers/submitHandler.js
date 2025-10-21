const { submissionService, projectFormService } = require('../../../services');
const whatsappValidationService = require('../services/whatsappValidation.service');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const logger = require('../../../config/logger');

/**
 * Handle form submission
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} userAction - User's action text
 * @param {Object} session - User session object
 */
exports.handleSubmit = async (phoneNumber, userAction, session) => {
  try {
    console.log(`🔍 [DEBUG] Submission action started for ${phoneNumber}`);
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
      `📤 Processing submission action for ${phoneNumber}: "${userAction}"`
    );

    // Handle different submission actions
    switch (userAction) {
      case '✅ Submit Form':
        console.log(`🔍 [DEBUG] Processing form submission`);
        await processFormSubmission(phoneNumber, session);
        break;

      case '📋 Review Answers':
        console.log(`🔍 [DEBUG] Reviewing answers`);
        await reviewAnswers(phoneNumber, session);
        break;

      case '📋 Submit Another':
        console.log(`🔍 [DEBUG] Starting new submission`);
        await startNewSubmission(phoneNumber, session);
        break;

      case '🔄 Start Over':
        console.log(`🔍 [DEBUG] Starting over`);
        await startOver(phoneNumber, session);
        break;

      case '❌ Cancel':
        console.log(`🔍 [DEBUG] Cancelling submission`);
        await cancelSubmission(phoneNumber, session);
        break;

      default:
        console.log(`🔍 [DEBUG] Invalid action: "${userAction}"`);
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Invalid action. Please choose from the available options.'
        );
        break;
    }
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in handleSubmit:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error processing submission action for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process submission. Please try again.'
    );
  }
};

/**
 * Process the actual form submission
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function processFormSubmission(phoneNumber, session) {
  try {
    console.log(`🔍 [DEBUG] processFormSubmission started for ${phoneNumber}`);
    console.log(`🔍 [DEBUG] Session projectId: ${session.projectId}`);

    logger.info(`📤 Processing form submission for ${phoneNumber}`);

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
            projectName:
              projectForm.configuration &&
              projectForm.configuration.projectName,
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
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
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
      nodeId: `whatsapp-node-${Date.now()}`,
      userId: session.userId,
      source: 'whatsapp',
      status: 'submitted',
      metadata: {
        phoneNumber: session.metadata.phoneNumber,
        sessionId: session._id,
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
        text: 'WhatsApp form submission',
        html: 'WhatsApp form submission',
        structured: convertAnswersToStructured(session.answers, projectForm),
        attachments: [], // File attachments would be handled separately
      },
    };

    console.log(`🔍 [DEBUG] Submission data prepared:`, {
      tenantId: submissionData.tenantId,
      projectId: submissionData.projectId,
      project_name: submissionData.project_name,
      userId: submissionData.userId,
      source: submissionData.source,
      answersCount: Object.keys(submissionData.payload.structured).length,
    });

    // Submit the form
    console.log(`🔍 [DEBUG] Submitting form to submission service`);
    const submissionResult = await submissionService.createSubmission(
      submissionData
    );
    console.log(`🔍 [DEBUG] Submission result:`, submissionResult);

    if (submissionResult.success) {
      // Mark session as submitted
      session.status = 'submitted';
      session.submittedAt = new Date();
      await session.save();

      // Send success notification
      await whatsappNotificationService.sendSubmissionSuccess(
        phoneNumber,
        submissionResult.jobId,
        projectForm
      );

      logger.info(
        `✅ Form submitted successfully for ${phoneNumber} (Job ID: ${submissionResult.jobId})`
      );
    } else {
      await whatsappNotificationService.sendSubmissionFailure(
        phoneNumber,
        submissionResult.error
      );
      logger.error(
        `❌ Form submission failed for ${phoneNumber}: ${submissionResult.error}`
      );
    }
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in processFormSubmission:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error processing form submission for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendSubmissionFailure(
      phoneNumber,
      'Failed to submit form. Please try again.'
    );
  }
}

/**
 * Convert answers from session format to structured format
 * @param {Map} answers - Session answers
 * @param {Object} projectForm - Project form object
 * @returns {Object} Structured answers
 */
function convertAnswersToStructured(answers, projectForm) {
  const structuredAnswers = {};
  const formElements = projectForm.elements || [];

  for (let i = 0; i < formElements.length; i++) {
    const element = formElements[i];
    const answerKey = i.toString();
    const answer = answers.get(answerKey);

    if (answer !== undefined) {
      const fieldName =
        element.properties && element.properties.label
          ? element.properties.label
          : element.id;
      const normalizedFieldName = normalizeFieldName(fieldName);
      structuredAnswers[normalizedFieldName] = {
        value: answer,
        type: element.type,
        label: fieldName,
        step: i,
        elementId: element.id,
      };
    }
  }

  return structuredAnswers;
}

/**
 * Normalize field name for consistency
 * @param {string} fieldName - Original field name
 * @returns {string} Normalized field name
 */
function normalizeFieldName(fieldName) {
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
}

/**
 * Review answers before submission
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function reviewAnswers(phoneNumber, session) {
  try {
    logger.info(`📋 Reviewing answers for ${phoneNumber}`);

    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );
    if (!projectForm) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Project form not found.'
      );
      return;
    }

    const elements = projectForm.elements || [];
    let reviewMessage = `📋 *Form Review*\n\n*Project:* ${
      projectForm.configuration?.projectName || session.projectId
    }\n\n`;

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const answer = session.answers.get(i.toString());
      const questionLabel = element.properties?.label || `Question ${i + 1}`;

      if (answer !== undefined) {
        let answerText = '';
        if (typeof answer === 'object' && answer.filename) {
          answerText = `📎 File: ${answer.filename}`;
        } else {
          answerText = String(answer);
        }
        reviewMessage += `*${questionLabel}:*\n${answerText}\n\n`;
      } else {
        reviewMessage += `*${questionLabel}:*\n❌ Not answered\n\n`;
      }
    }

    reviewMessage += `*Total Questions:* ${elements.length}\n*Answered:* ${
      session.answers.size
    }\n*Missing:* ${elements.length - session.answers.size}`;

    await whatsappNotificationService.sendMessageWithClearKeyboard(
      phoneNumber,
      reviewMessage
    );

    // Send submission options
    await whatsappNotificationService.sendFormCompletion(
      phoneNumber,
      projectForm
    );
  } catch (error) {
    logger.error(
      `❌ Error reviewing answers for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to review answers. Please try again.'
    );
  }
}

/**
 * Start over with the same project
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function startOver(phoneNumber, session) {
  try {
    logger.info(`🔄 Starting over for ${phoneNumber}`);

    // Reset session but keep project selection
    session.status = 'filling_form';
    session.currentStep = 0;
    session.answers.clear();
    await session.save();

    // Start form filling again
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );
    if (
      projectForm &&
      projectForm.elements &&
      projectForm.elements.length > 0
    ) {
      const firstQuestion = projectForm.elements[0];
      await whatsappNotificationService.sendFormQuestion(
        phoneNumber,
        firstQuestion,
        0,
        projectForm.elements.length
      );
    } else {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No form questions available for this project.'
      );
    }
  } catch (error) {
    logger.error(`❌ Error starting over for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to start over. Please try again.'
    );
  }
}

/**
 * Start new submission with project selection
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function startNewSubmission(phoneNumber, session) {
  try {
    logger.info(`📋 Starting new submission for ${phoneNumber}`);

    // Reset session completely
    session.status = 'selecting_project';
    session.currentStep = 0;
    session.answers.clear();
    session.projectId = null;
    session.formId = null;
    await session.save();

    // Get available projects and show selection
    const projectFormService = require('../../../services/projectForm.service');
    const availableProjects = await projectFormService.getProjectFormsByTenant(
      session.tenantId,
      {
        status: 'active',
        'metadata.deploymentStatus': 'published',
      }
    );

    if (
      availableProjects &&
      availableProjects.results &&
      availableProjects.results.length > 0
    ) {
      await whatsappNotificationService.sendProjectSelection(
        phoneNumber,
        availableProjects.results
      );
    } else {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No projects available for your account.'
      );
    }
  } catch (error) {
    logger.error(
      `❌ Error starting new submission for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to start new submission. Please try again.'
    );
  }
}

/**
 * Cancel submission and return to main menu
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function cancelSubmission(phoneNumber, session) {
  try {
    logger.info(`❌ Cancelling submission for ${phoneNumber}`);

    // Reset session to authentication state
    session.status = 'authenticating';
    session.currentStep = 0;
    session.answers.clear();
    session.projectId = null;
    session.formId = null;
    await session.save();

    await whatsappNotificationService.sendMessageWithClearKeyboard(
      phoneNumber,
      'Submission cancelled. You can start a new form submission anytime.'
    );

    // Send main menu
    await whatsappNotificationService.sendMainMenu(phoneNumber);
  } catch (error) {
    logger.error(
      `❌ Error cancelling submission for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
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
