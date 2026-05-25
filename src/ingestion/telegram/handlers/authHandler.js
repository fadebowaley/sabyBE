const { userService, projectFormService } = require('../../../services');
const telegramValidationService = require('../services/telegramValidation.service');
const telegramNotificationService = require('../services/telegramNotification.service');
const logger = require('../../../config/logger');

/**
 * Handle phone contact sharing for user authentication
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 */
exports.handlePhoneContact = async (bot, msg, session) => {
  const chatId = msg.chat.id;
  const phoneNumber = msg.contact.phone_number;

  try {
    logger.info(
      `🔐 Processing phone authentication for chat ${chatId} (${phoneNumber})`
    );

    // First, get the user by phone number to find their tenant
    const user = await userService.getUserByPhone(phoneNumber);

    if (!user) {
      logger.warn(
        `❌ Phone authentication failed for ${phoneNumber}: User not found`
      );
      await telegramNotificationService.sendAuthenticationFailure(
        chatId,
        'User not found. Please contact your administrator.'
      );
      return;
    }

    // Use the user's actual tenantId
    const { tenantId } = user;
    logger.info(`🔍 Using user's tenantId: ${tenantId}`);

    // Validate user by phone number with their actual tenant
    const userValidation = await telegramValidationService.validateUserByPhone(
      phoneNumber,
      tenantId
    );

    if (!userValidation.valid) {
      logger.warn(
        `❌ Phone authentication failed for ${phoneNumber}: ${userValidation.error}`
      );
      await telegramNotificationService.sendAuthenticationFailure(
        chatId,
        userValidation.error
      );
      return;
    }

    const validatedUser = userValidation.user;

    // Update session with user information
    session.userId = validatedUser._id;
    session.tenantId = validatedUser.tenantId;
    session.status = 'selecting_project';
    session.metadata.phoneNumber = phoneNumber;
    session.metadata.userEmail = validatedUser.email; // Store user email for notifications
    session.metadata.userName =
      validatedUser.name ||
      `${validatedUser.firstname || ''} ${validatedUser.lastname || ''}`.trim();
    await session.save();

    logger.info(
      `✅ Phone authentication successful for ${phoneNumber} (User ID: ${validatedUser._id})`
    );

    // Get available projects for the user
    logger.info(
      `🔍 Getting available projects for tenant: ${validatedUser.tenantId}`
    );
    const availableProjectsResult = await getAvailableProjects(
      validatedUser.tenantId
    );
    logger.info(`🔍 Available projects result:`, availableProjectsResult);

    // Handle paginated result
    const availableProjects =
      availableProjectsResult && availableProjectsResult.results
        ? availableProjectsResult.results
        : availableProjectsResult;
    logger.info(`🔍 Available projects array:`, availableProjects);

    if (!availableProjects || availableProjects.length === 0) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'No projects available for your account. Please contact your administrator.'
      );
      return;
    }

    // Send authentication success message with project selection
    await telegramNotificationService.sendAuthenticationSuccess(
      chatId,
      validatedUser,
      availableProjects
    );

    logger.info(`✅ Authentication success message sent to chat ${chatId}`);
  } catch (error) {
    logger.error(
      `❌ Error processing phone authentication for chat ${chatId}:`,
      error.message
    );
    logger.error(`❌ Full error details:`, error);
    await telegramNotificationService.sendAuthenticationFailure(
      chatId,
      'Authentication failed. Please try again.'
    );
  }
};

/**
 * Handle project selection
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 */
exports.handleProjectSelection = async (bot, msg, session) => {
  const chatId = msg.chat.id;
  const selectedProjectName = msg.text;

  try {
    logger.info(
      `📋 Processing project selection for chat ${chatId}: "${selectedProjectName}"`
    );

    // Get available projects
    const availableProjectsResult = await getAvailableProjects(
      session.tenantId
    );

    // Handle paginated result
    const availableProjects =
      availableProjectsResult && availableProjectsResult.results
        ? availableProjectsResult.results
        : availableProjectsResult;

    // Find the selected project
    const selectedProject = availableProjects.find(
      (project) =>
        project.configuration?.projectName === selectedProjectName ||
        project.projectId === selectedProjectName
    );

    if (!selectedProject) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Invalid project selection. Please choose from the available projects.'
      );
      return;
    }

    // Validate project access
    const projectValidation =
      await telegramValidationService.validateProjectForm(
        selectedProject.projectId,
        {
          tenantId: session.tenantId,
        }
      );

    if (!projectValidation.valid) {
      logger.warn(
        `❌ Project validation failed for ${selectedProject.projectId}: ${projectValidation.error}`
      );
      await telegramNotificationService.sendAuthenticationFailure(
        chatId,
        projectValidation.error
      );
      return;
    }

    // Update session with project information
    session.projectId = selectedProject.projectId;
    session.formId = selectedProject._id;
    session.status = 'filling_form';
    session.currentStep = 0;
    await session.save();

    logger.info(
      `✅ Project selected: ${selectedProject.projectId} for chat ${chatId}`
    );

    // Start form filling process
    await startFormFilling(bot, session);
  } catch (error) {
    logger.error(
      `❌ Error processing project selection for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to select project. Please try again.'
    );
  }
};

/**
 * Get available projects for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of available projects
 */
async function getAvailableProjects(tenantId) {
  try {
    logger.info(`🔍 getAvailableProjects called with tenantId: ${tenantId}`);

    // Get active and published project forms for the tenant
    const projectsResult = await projectFormService.getProjectFormsByTenant(
      tenantId,
      {
        status: 'active',
        'identity.status': 'published',
        deletedAt: null,
      }
    );

    logger.info(
      `🔍 projectFormService.getProjectFormsByTenant result:`,
      projectsResult
    );

    // Handle paginated result
    const projects =
      projectsResult && projectsResult.results
        ? projectsResult.results
        : projectsResult;
    logger.info(
      `🔍 Projects type: ${typeof projects}, length: ${
        projects ? projects.length : 'undefined'
      }`
    );

    return projects || [];
  } catch (error) {
    logger.error(
      `❌ Error getting available projects for tenant ${tenantId}:`,
      error.message
    );
    logger.error(`❌ Full error details:`, error);
    return [];
  }
}

/**
 * Start the form filling process
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
async function startFormFilling(bot, session) {
  const { chatId } = session;

  try {
    // Get project form details
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
        'No form questions available for this project.'
      );
      return;
    }

    // Send the first question
    const firstQuestion = projectForm.elements[0];
    await telegramNotificationService.sendFormQuestion(
      chatId,
      firstQuestion,
      0,
      projectForm.elements.length
    );

    logger.info(
      `✅ Started form filling for chat ${chatId} (${projectForm.elements.length} questions)`
    );
  } catch (error) {
    logger.error(
      `❌ Error starting form filling for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to start form. Please try again.'
    );
  }
}

/**
 * Handle manual phone input (fallback)
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 */
exports.handleManualPhone = async (bot, msg, session) => {
  const chatId = msg.chat.id;
  const phoneNumber = msg.text;

  try {
    logger.info(
      `📱 Processing manual phone input for chat ${chatId}: ${phoneNumber}`
    );

    // Basic phone number validation
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
      await telegramNotificationService.sendValidationError(chatId, {
        field: 'Phone Number',
        error:
          'Invalid phone number format. Please use the share button or enter a valid number.',
      });
      return;
    }

    // Create a mock contact object for validation
    const mockContact = { phone_number: phoneNumber };
    const mockMsg = { contact: mockContact };

    // Use the same logic as phone contact
    await exports.handlePhoneContact(bot, mockMsg, session);
  } catch (error) {
    logger.error(
      `❌ Error processing manual phone input for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process phone number. Please try again.'
    );
  }
};

/**
 * Send authentication success message with project list
 */
async function sendAuthenticationSuccess(bot, chatId, user, projects) {
  try {
    const userName = user.firstname || user.name || 'User';

    console.log(`🔍 Sending authentication success to chat ${chatId}`);
    console.log(`🔍 User: ${userName}`);
    console.log(`🔍 Available projects: ${projects.length}`);

    // Create project list with emojis
    const projectList = projects.map((project, index) => {
      const emoji = getProjectEmoji(index);
      return `${emoji} ${
        project.configuration?.projectName || project.projectId
      }`;
    });

    // Log projects for debugging
    projects.forEach((project, index) => {
      console.log(
        `🔍 Project ${index + 1}: ${
          project.configuration?.projectName || project.projectId
        }`
      );
    });

    const message =
      `${
        `🎉 *Welcome back, ${userName}!*\n\n` +
        `✅ *Authentication successful*\n` +
        `📱 Phone: ${user.phoneNumber}\n` +
        `🏢 Tenant: ${user.tenantId}\n\n` +
        `📋 *Available Projects (${projects.length}):*\n`
      }${projectList.join('\n')}\n\n` + `*Choose an option:*`;

    // Create inline keyboard with both traditional and Web App options
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📱 Use Web App',
            web_app: {
              url: `${
                process.env.BASE_URL || 'http://localhost:3000'
              }/telegram-webapp`,
            },
          },
        ],
        ...projects.map((project, index) => [
          {
            text: `${getProjectEmoji(index)} ${
              project.configuration?.projectName || project.projectId
            }`,
            callback_data: `select_project:${project.projectId}`,
          },
        ]),
      ],
    };

    console.log(`🔍 Keyboard structure:`, JSON.stringify(keyboard, null, 2));

    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

    console.log(`✅ Authentication success message sent to chat ${chatId}`);
  } catch (error) {
    console.error(
      `❌ Error sending authentication success to chat ${chatId}:`,
      error.message
    );
    throw error;
  }
}
