const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const {
  userService,
  projectFormService,
  submissionService,
} = require('../services');
const telegramValidationService = require('../ingestion/telegram/services/telegramValidation.service');
const logger = require('../config/logger');

/**
 * Authenticate user via phone number
 */
const authenticate = catchAsync(async (req, res) => {
  const { phoneNumber, chatId } = req.body;

  console.log(
    `🔍 [DEBUG] Web App authentication attempt for phone: ${phoneNumber}`
  );
  console.log(`🔍 [DEBUG] Chat ID: ${chatId}`);

  try {
    // Validate user by phone number
    console.log(
      `🔍 [DEBUG] Calling telegramValidationService.getUserByPhone(${phoneNumber})`
    );
    const user = await telegramValidationService.getUserByPhone(phoneNumber);

    console.log(
      `🔍 [DEBUG] getUserByPhone result:`,
      user ? 'User found' : 'User not found'
    );

    if (!user) {
      console.log(`❌ [DEBUG] User not found for phone: ${phoneNumber}`);
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        'User not found with this phone number'
      );
    }

    console.log(`🔍 [DEBUG] User found:`, {
      id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      tenantId: user.tenantId,
    });

    // Generate a simple token for Web App session
    const token = Buffer.from(`${user._id}:${Date.now()}`).toString('base64');

    // Store session info (in production, use proper JWT tokens)
    user.webAppToken = token;
    user.webAppChatId = chatId;
    await user.save();

    logger.info(
      `✅ Web App authentication successful for user ${user._id} (${phoneNumber})`
    );

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Authentication successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        tenantId: user.tenantId,
        token,
      },
    });
  } catch (error) {
    console.error(`❌ [DEBUG] Web App authentication error:`, error.message);
    logger.error(
      `❌ Web App authentication failed for ${phoneNumber}:`,
      error.message
    );
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication failed');
  }
});

/**
 * Get available projects for authenticated user
 */
const getProjects = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  try {
    // Get projects for the user's tenant
    const projectsResult = await projectFormService.getProjectFormsByTenant(
      tenantId
    );
    const projects = projectsResult.results || [];

    logger.info(
      `✅ Web App loaded ${projects.length} projects for tenant ${tenantId}`
    );

    res.status(httpStatus.OK).json({
      success: true,
      projects: projects.map((project) => ({
        projectId: project.projectId,
        projectName: project.configuration?.projectName || 'Unnamed Project',
        description:
          project.configuration?.description ||
          'Complete this form to submit your data',
        elementsCount: project.elements ? project.elements.length : 0,
        createdAt: project.createdAt,
      })),
    });
  } catch (error) {
    logger.error(
      `❌ Web App failed to load projects for tenant ${tenantId}:`,
      error.message
    );
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to load projects'
    );
  }
});

/**
 * Get form data for a specific project
 */
const getForm = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { tenantId } = req.user;

  try {
    // Get project form
    const projectForm = await projectFormService.getProjectFormByProjectId(
      projectId
    );

    if (!projectForm) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Project form not found');
    }

    // Validate that the project belongs to the user's tenant
    if (projectForm.tenantId !== tenantId) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this project');
    }

    logger.info(`✅ Web App loaded form for project ${projectId}`);

    res.status(httpStatus.OK).json({
      success: true,
      form: {
        formId: projectForm._id,
        projectId: projectForm.projectId,
        projectName: projectForm.configuration?.projectName,
        elements: projectForm.elements || [],
        configuration: projectForm.configuration,
      },
    });
  } catch (error) {
    logger.error(
      `❌ Web App failed to load form for project ${projectId}:`,
      error.message
    );
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to load form');
  }
});

/**
 * Submit form data
 */
const submitForm = catchAsync(async (req, res) => {
  const { projectId, answers, formId } = req.body;
  const { tenantId, _id: userId } = req.user;

  try {
    // Get project form for validation
    const projectForm = await projectFormService.getProjectFormByProjectId(
      projectId
    );

    if (!projectForm) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Project form not found');
    }

    // Validate that the project belongs to the user's tenant
    if (projectForm.tenantId !== tenantId) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied to this project');
    }

    // Prepare submission data
    const submissionData = {
      tenantId,
      projectId,
      project_name: projectForm.configuration?.projectName || projectId,
      project_category: projectForm.configuration?.projectCategory || 'General',
      formId,
      nodeId: `webapp-node-${Date.now()}`,
      userId,
      source: 'telegram-webapp',
      status: 'submitted',
      metadata: {
        submittedAt: new Date(),
        validation: {
          validated: true,
          senderId: userId,
          projectFormId: formId,
          validationErrors: [],
          validationWarnings: [],
        },
      },
      payload: {
        text: 'Web App form submission',
        html: 'Web App form submission',
        structured: convertAnswersToStructured(answers, projectForm),
        attachments: [],
      },
    };

    // Validate submission
    const validationResult =
      await telegramValidationService.validateTelegramSubmission(
        {
          phoneNumber: req.user.phoneNumber,
          tenantId,
        },
        submissionData.payload.structured,
        projectId
      );

    if (!validationResult.valid) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Form validation failed');
    }

    // Queue submission
    const queueResult = await submissionService.queueSubmission(submissionData);

    if (!queueResult || queueResult.status !== 'queued') {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to queue submission'
      );
    }

    logger.info(
      `✅ Web App submission successful for project ${projectId} (Job ID: ${queueResult.jobId})`
    );

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Form submitted successfully',
      jobId: queueResult.jobId,
    });
  } catch (error) {
    logger.error(
      `❌ Web App submission failed for project ${projectId}:`,
      error.message
    );
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Submission failed');
  }
});

/**
 * Get Web App status and user info
 */
const getStatus = catchAsync(async (req, res) => {
  const { _id: userId, name, email, phoneNumber, tenantId } = req.user;

  res.status(httpStatus.OK).json({
    success: true,
    user: {
      id: userId,
      name,
      email,
      phoneNumber,
      tenantId,
    },
    status: 'authenticated',
  });
});

/**
 * Convert answers to structured format
 */
function convertAnswersToStructured(answers, projectForm) {
  const structured = {};

  if (!projectForm.elements) {
    return structured;
  }

  projectForm.elements.forEach((element) => {
    const fieldName = element.name;
    const answer = answers[fieldName];

    if (answer !== undefined && answer !== null && answer !== '') {
      // Normalize field name
      const normalizedName = normalizeFieldName(fieldName);
      structured[normalizedName] = answer;
    }
  });

  return structured;
}

/**
 * Normalize field name for consistency
 */
function normalizeFieldName(fieldName) {
  return fieldName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

module.exports = {
  authenticate,
  getProjects,
  getForm,
  submitForm,
  getStatus,
};
