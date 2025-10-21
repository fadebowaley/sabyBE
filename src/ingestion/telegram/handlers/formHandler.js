const { projectFormService } = require('../../../services');
const telegramValidationService = require('../services/telegramValidation.service');
const telegramNotificationService = require('../services/telegramNotification.service');
const logger = require('../../../config/logger');

/**
 * Handle project selection from user
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 */
exports.handleProjectSelection = async (bot, msg, session) => {
  const chatId = msg.chat.id;
  const selectedProjectName = msg.text;

  try {
    console.log(`🔍 [DEBUG] Project selection started for chat ${chatId}`);
    console.log(`🔍 [DEBUG] Selected project name: "${selectedProjectName}"`);
    console.log(`🔍 [DEBUG] Session tenantId: ${session.tenantId}`);

    logger.info(
      `📋 Processing project selection for chat ${chatId}: "${selectedProjectName}"`
    );

    // Get available projects
    console.log(
      `🔍 [DEBUG] Calling getAvailableProjects for tenant: ${session.tenantId}`
    );
    const availableProjects = await getAvailableProjects(session.tenantId);
    console.log(`🔍 [DEBUG] getAvailableProjects returned:`, availableProjects);
    console.log(
      `🔍 [DEBUG] Type of availableProjects:`,
      typeof availableProjects
    );
    console.log(`🔍 [DEBUG] Is array:`, Array.isArray(availableProjects));
    console.log(
      `🔍 [DEBUG] Length:`,
      availableProjects ? availableProjects.length : 'undefined'
    );

    if (availableProjects && availableProjects.length > 0) {
      console.log(
        `🔍 [DEBUG] Available projects:`,
        availableProjects.map((p) => ({
          projectId: p.projectId,
          projectName: p.configuration?.projectName,
          id: p._id,
        }))
      );
    }

    // Find the selected project
    console.log(
      `🔍 [DEBUG] Searching for project with name: "${selectedProjectName}"`
    );

    // Strip emoji prefixes from the selected project name
    const cleanSelectedName = selectedProjectName
      .replace(
        /^[📋📝📄📊📈📉📋📌📍📎📏📐📑📒📓📔📕📖📗📘📙📚📛📜📝📞📟📠📡📢📣📤📥📦📧📨📩📪📫📬📭📮📯📰📱📲📳📴📵📶📷📸📹📺📻📼📽📾📿🔀🔁🔂🔃🔄🔅🔆🔇🔈🔉🔊🔋🔌🔍🔎🔏🔐🔑🔒🔓🔔🔕🔖🔗🔘🔙🔚🔛🔜🔝🔞🔟🔠🔡🔢🔣🔤🔥🔦🔧🔨🔩🔪🔫🔬🔭🔮🔯🔰🔱🔲🔳🔴🔵🔶🔷🔸🔹🔺🔻🔼🔽🔾🔿🕀🕁🕂🕃🕄🕅🕆🕇🕈🕉🕊🕋🕌🕍🕎🕏🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛🕜🕝🕞🕟🕠🕡🕢🕣🕤🕥🕦🕧🕨🕩🕪🕫🕬🕭🕮🕯🕰🕱🕲🕳🕴🕵🕶🕷🕸🕹🕺🕻🕼🕽🕾🕿🖀🖁🖂🖃🖄🖅🖆🖇🖈🖉🖊🖋🖌🖍🖎🖏🖐🖑🖒🖓🖔🖕🖖🖗🖘🖙🖚🖛🖜🖝🖞🖟🖠🖡🖢🖣🖤🖥🖦🖧🖨🖩🖪🖫🖬🖭🖮🖯🖰🖱🖲🖳🖴🖵🖶🖷🖸🖹🖺🖻🖼🖽🖾🖿🗀🗁🗂🗃🗄🗅🗆🗇🗈🗉🗊🗋🗌🗍🗎🗏🗐🗑🗒🗓🗔🗕🗖🗗🗘🗙🗚🗛🗜🗝🗞🗟🗠🗡🗢🗣🗤🗥🗦🗧🗨🗩🗪🗫🗬🗭🗮🗯🗰🗱🗲🗳🗴🗵🗶🗷🗸🗹🗺🗻🗼🗽🗾🗿😀😁😂🤣😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷😸😹😺😻😼😽😾😿🙀🙁🙂🙃🙄🙅🙆🙇🙈🙉🙊🙋🙌🙍🙎🙏🙐🙑🙒🙓🙔🙕🙖🙗🙘🙙🙚🙛🙜🙝🙞🙟🙠🙡🙢🙣🙤🙥🙦🙧🙨🙩🙪🙫🙬🙭🙮🙯🙰🙱🙲🙳🙴🙵🙶🙷🙸🙹🙺🙻🙼🙽🙾🙿]+\s*/,
        ''
      )
      .trim();
    console.log(`🔍 [DEBUG] Cleaned project name: "${cleanSelectedName}"`);

    const selectedProject = availableProjects.find((project) => {
      const matchesName =
        project.configuration?.projectName === cleanSelectedName;
      const matchesId = project.projectId === cleanSelectedName;
      console.log(
        `🔍 [DEBUG] Project "${project.configuration?.projectName}" (${project.projectId}): name match=${matchesName}, id match=${matchesId}`
      );
      return matchesName || matchesId;
    });

    console.log(
      `🔍 [DEBUG] Selected project found:`,
      selectedProject
        ? {
            projectId: selectedProject.projectId,
            projectName: selectedProject.configuration?.projectName,
            id: selectedProject._id,
          }
        : 'NOT FOUND'
    );

    if (!selectedProject) {
      console.log(
        `🔍 [DEBUG] No project found matching: "${selectedProjectName}"`
      );
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Invalid project selection. Please choose from the available projects.'
      );
      return;
    }

    // Update session with project information
    console.log(
      `🔍 [DEBUG] Updating session with project: ${selectedProject.projectId}`
    );
    session.projectId = selectedProject.projectId;
    session.formId = selectedProject._id;
    session.status = 'filling_form';
    session.currentStep = 0;
    await session.save();

    logger.info(
      `✅ Project selected: ${selectedProject.projectId} for chat ${chatId}`
    );

    // Start form filling process
    console.log(`🔍 [DEBUG] Starting form filling process`);
    await startFormFilling(bot, session);
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in project selection:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error processing project selection for chat ${chatId}:`,
      error.message
    );
    logger.error(`❌ Full error details:`, error);
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to select project. Please try again.'
    );
  }
};

/**
 * Handle form step (user answering questions)
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 */
exports.handleFormStep = async (bot, msg, session) => {
  const chatId = msg.chat.id;
  const userAnswer = msg.text;

  try {
    logger.info(
      `📝 Processing form step for chat ${chatId} (step ${session.currentStep}): "${userAnswer}"`
    );

    // Get current project form
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Form not found or has no questions.'
      );
      return;
    }

    const currentQuestion = projectForm.elements[session.currentStep];

    if (!currentQuestion) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Invalid form step.'
      );
      return;
    }

    // Validate the answer
    const validationResult = telegramValidationService.validateFieldValue(
      userAnswer,
      currentQuestion
    );

    if (!validationResult.valid) {
      logger.warn(
        `❌ Validation failed for step ${session.currentStep}: ${validationResult.error}`
      );
      await telegramNotificationService.sendValidationError(chatId, {
        field: currentQuestion.properties?.label || currentQuestion.id,
        error: validationResult.error,
      });
      return;
    }

    // Store the validated answer
    await session.addAnswer(session.currentStep, validationResult.value);

    logger.info(`✅ Answer stored for step ${session.currentStep}`);

    // Check if there are more questions
    const nextStep = session.currentStep + 1;

    if (nextStep < projectForm.elements.length) {
      // Send next question
      const nextQuestion = projectForm.elements[nextStep];
      await telegramNotificationService.sendFormQuestion(
        chatId,
        nextQuestion,
        nextStep,
        projectForm.elements.length
      );

      logger.info(`✅ Next question sent for step ${nextStep}`);
    } else {
      // Form completed
      session.status = 'ready_to_submit';
      await session.save();

      await telegramNotificationService.sendFormCompletion(chatId, projectForm);

      logger.info(`✅ Form completed for chat ${chatId}`);
    }
  } catch (error) {
    logger.error(
      `❌ Error processing form step for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process answer. Please try again.'
    );
  }
};

/**
 * Handle file uploads (photos and documents)
 * @param {Object} bot - Telegram bot instance
 * @param {Object} msg - Telegram message object
 * @param {Object} session - User session object
 * @param {string} fileType - Type of file ('photo' or 'document')
 */
exports.handleFileUpload = async (bot, msg, session, fileType) => {
  const chatId = msg.chat.id;

  try {
    logger.info(`📎 Processing ${fileType} upload for chat ${chatId}`);

    // Get current project form
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Form not found or has no questions.'
      );
      return;
    }

    const currentQuestion = projectForm.elements[session.currentStep];

    if (!currentQuestion) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Invalid form step.'
      );
      return;
    }

    // Check if current question accepts files
    if (currentQuestion.type !== 'file') {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'This question does not accept file uploads.'
      );
      return;
    }

    // Get file information
    let fileInfo = null;

    if (fileType === 'photo') {
      const photo = msg.photo[msg.photo.length - 1]; // Get the largest photo
      fileInfo = {
        fileId: photo.file_id,
        fileName: `photo_${Date.now()}.jpg`,
        fileSize: photo.file_size,
        mimeType: 'image/jpeg',
      };
    } else if (fileType === 'document') {
      const { document } = msg;
      fileInfo = {
        fileId: document.file_id,
        fileName: document.file_name,
        fileSize: document.file_size,
        mimeType: document.mime_type,
      };
    }

    if (!fileInfo) {
      await telegramNotificationService.sendErrorMessage(
        chatId,
        'Failed to process file upload.'
      );
      return;
    }

    // Validate file size (max 20MB for Telegram)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (fileInfo.fileSize > maxSize) {
      await telegramNotificationService.sendValidationError(chatId, {
        field: 'File Upload',
        error: 'File size exceeds maximum limit of 20MB.',
      });
      return;
    }

    // Store file information
    await session.addAnswer(session.currentStep, fileInfo);

    logger.info(
      `✅ File uploaded for step ${session.currentStep}: ${fileInfo.fileName}`
    );

    // Check if there are more questions
    const nextStep = session.currentStep + 1;

    if (nextStep < projectForm.elements.length) {
      // Send next question
      const nextQuestion = projectForm.elements[nextStep];
      await telegramNotificationService.sendFormQuestion(
        chatId,
        nextQuestion,
        nextStep,
        projectForm.elements.length
      );
    } else {
      // Form completed
      session.status = 'ready_to_submit';
      await session.save();

      await telegramNotificationService.sendFormCompletion(chatId, projectForm);
    }
  } catch (error) {
    logger.error(
      `❌ Error processing file upload for chat ${chatId}:`,
      error.message
    );
    await telegramNotificationService.sendErrorMessage(
      chatId,
      'Failed to process file upload. Please try again.'
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
    console.log(
      `🔍 [DEBUG] getAvailableProjects called with tenantId: ${tenantId}`
    );

    // Get active and published project forms for the tenant
    console.log(
      `🔍 [DEBUG] Calling projectFormService.getProjectFormsByTenant`
    );
    const projectsResult = await projectFormService.getProjectFormsByTenant(
      tenantId,
      {
        status: 'active',
        'metadata.deploymentStatus': 'published',
        deletedAt: null,
      }
    );

    console.log(
      `🔍 [DEBUG] projectFormService.getProjectFormsByTenant returned:`,
      projectsResult
    );
    console.log(`🔍 [DEBUG] Type of projectsResult:`, typeof projectsResult);
    console.log(
      `🔍 [DEBUG] Has results property:`,
      projectsResult && projectsResult.hasOwnProperty('results')
    );
    console.log(
      `🔍 [DEBUG] Results property:`,
      projectsResult ? projectsResult.results : 'undefined'
    );

    // Handle paginated result
    const projects =
      projectsResult && projectsResult.results
        ? projectsResult.results
        : projectsResult;
    console.log(`🔍 [DEBUG] Final projects array:`, projects);
    console.log(`🔍 [DEBUG] Type of final projects:`, typeof projects);
    console.log(`🔍 [DEBUG] Is array:`, Array.isArray(projects));
    console.log(`🔍 [DEBUG] Length:`, projects ? projects.length : 'undefined');

    logger.info(
      `🔍 getAvailableProjects for tenant ${tenantId}: found ${
        projects ? projects.length : 0
      } projects`
    );

    return projects || [];
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in getAvailableProjects:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error getting available projects for tenant ${tenantId}:`,
      error.message
    );
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
 * Get current question for a session
 * @param {Object} session - User session object
 * @returns {Promise<Object|null>} Current question object or null
 */
exports.getCurrentQuestion = async (session) => {
  try {
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      return null;
    }

    return projectForm.elements[session.currentStep] || null;
  } catch (error) {
    logger.error(
      `❌ Error getting current question for session ${session.chatId}:`,
      error.message
    );
    return null;
  }
};

/**
 * Review answers for a session
 * @param {Object} bot - Telegram bot instance
 * @param {Object} session - User session object
 */
exports.reviewAnswers = async (bot, session) => {
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
      reviewMessage += `   Answer: ${
        answer
          ? typeof answer === 'object'
            ? answer.fileName
            : answer
          : 'Not answered'
      }\n\n`;
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
};
