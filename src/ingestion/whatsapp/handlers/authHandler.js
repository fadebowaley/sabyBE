const { userService, projectFormService } = require('../../../services');
const whatsappValidationService = require('../services/whatsappValidation.service');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const formHandler = require('./formHandler');
const logger = require('../../../config/logger');

/**
 * Handle phone number authentication for user
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
exports.handlePhoneAuthentication = async (phoneNumber, session) => {
  try {
    logger.info(`🔐 Processing phone authentication for ${phoneNumber}`);

    // First, get the user by phone number to find their tenant
    const user = await userService.getUserByPhone(phoneNumber);

    if (!user) {
      logger.warn(
        `❌ Phone authentication failed for ${phoneNumber}: User not found`
      );
      await whatsappNotificationService.sendAuthenticationFailure(
        phoneNumber,
        'User not found. Please contact your administrator.'
      );
      return;
    }

    // Use the user's actual tenantId
    const { tenantId } = user;
    logger.info(`🔍 Using user's tenantId: ${tenantId}`);

    // Validate user by phone number with their actual tenant
    const userValidation = await whatsappValidationService.validateUserByPhone(
      phoneNumber,
      tenantId
    );

    if (!userValidation.valid) {
      logger.warn(
        `❌ Phone authentication failed for ${phoneNumber}: ${userValidation.error}`
      );
      await whatsappNotificationService.sendAuthenticationFailure(
        phoneNumber,
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
    const availableProjectsResult = await formHandler.getAvailableProjects(
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
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No projects available for your account. Please contact your administrator.'
      );
      return;
    }

    // Send authentication success message with project selection
    await whatsappNotificationService.sendAuthenticationSuccess(
      phoneNumber,
      validatedUser,
      availableProjects
    );

    logger.info(`✅ Authentication success message sent to ${phoneNumber}`);
  } catch (error) {
    logger.error(
      `❌ Error processing phone authentication for ${phoneNumber}:`,
      error.message
    );
    logger.error(`❌ Full error details:`, error);
    await whatsappNotificationService.sendAuthenticationFailure(
      phoneNumber,
      'Authentication failed. Please try again.'
    );
  }
};

/**
 * Handle project selection
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} selectedProjectName - Selected project name
 * @param {Object} session - User session object
 */
exports.handleProjectSelection = async (
  phoneNumber,
  selectedProjectName,
  session
) => {
  try {
    logger.info(
      `📋 Processing project selection for ${phoneNumber}: "${selectedProjectName}"`
    );

    // Get available projects
    const availableProjectsResult = await formHandler.getAvailableProjects(
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
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Invalid project selection. Please choose from the available projects.'
      );
      return;
    }

    // Validate project access
    const projectValidation =
      await whatsappValidationService.validateProjectForm(
        selectedProject.projectId,
        {
          tenantId: session.tenantId,
        }
      );

    if (!projectValidation.valid) {
      logger.warn(
        `❌ Project validation failed for ${selectedProject.projectId}: ${projectValidation.error}`
      );
      await whatsappNotificationService.sendAuthenticationFailure(
        phoneNumber,
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
      `✅ Project selected: ${selectedProject.projectId} for ${phoneNumber}`
    );

    // Start form filling process
    await startFormFilling(phoneNumber, session);
  } catch (error) {
    logger.error(
      `❌ Error processing project selection for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
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
        'metadata.deploymentStatus': 'published',
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
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function startFormFilling(phoneNumber, session) {
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
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No form questions available for this project.'
      );
      return;
    }

    // Send the first question
    const firstQuestion = projectForm.elements[0];
    await whatsappNotificationService.sendFormQuestion(
      phoneNumber,
      firstQuestion,
      0,
      projectForm.elements.length
    );

    logger.info(
      `✅ Started form filling for ${phoneNumber} (${projectForm.elements.length} questions)`
    );
  } catch (error) {
    logger.error(
      `❌ Error starting form filling for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to start form. Please try again.'
    );
  }
}

/**
 * Handle manual phone input (fallback)
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
exports.handleManualPhone = async (phoneNumber, session) => {
  try {
    logger.info(`📱 Processing manual phone input for ${phoneNumber}`);

    // Basic phone number validation
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
      await whatsappNotificationService.sendValidationError(phoneNumber, {
        field: 'Phone Number',
        error: 'Invalid phone number format. Please enter a valid number.',
      });
      return;
    }

    // Use the same logic as phone authentication
    await exports.handlePhoneAuthentication(phoneNumber, session);
  } catch (error) {
    logger.error(
      `❌ Error processing manual phone input for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process phone number. Please try again.'
    );
  }
};
