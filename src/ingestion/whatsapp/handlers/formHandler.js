const { projectFormService } = require('../../../services');
const whatsappValidationService = require('../services/whatsappValidation.service');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const logger = require('../../../config/logger');

/**
 * Handle project selection from user
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} selectedProjectName - Selected project name or number
 * @param {Object} session - User session object
 */
exports.handleProjectSelection = async (phoneNumber, selectedProjectName, session) => {
  try {
    console.log(`🔍 [DEBUG] Project selection started for ${phoneNumber}`);
    console.log(`🔍 [DEBUG] Selected project: "${selectedProjectName}"`);
    console.log(`🔍 [DEBUG] Session tenantId: ${session.tenantId}`);

    logger.info(`📋 Processing project selection for ${phoneNumber}: "${selectedProjectName}"`);

    // Get available projects
    console.log(`🔍 [DEBUG] Calling getAvailableProjects for tenant: ${session.tenantId}`);
    const availableProjects = await exports.getAvailableProjects(session.tenantId);
    console.log(`🔍 [DEBUG] getAvailableProjects returned:`, availableProjects);
    console.log(`🔍 [DEBUG] Type of availableProjects:`, typeof availableProjects);
    console.log(`🔍 [DEBUG] Is array:`, Array.isArray(availableProjects));
    console.log(`🔍 [DEBUG] Length:`, availableProjects ? availableProjects.length : 'undefined');

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
    console.log(`🔍 [DEBUG] Searching for project with name: "${selectedProjectName}"`);

    // Handle numeric selection (1, 2, 3, etc.)
    const projectNumber = parseInt(selectedProjectName);
    let selectedProject = null;

    if (!isNaN(projectNumber) && projectNumber > 0 && projectNumber <= availableProjects.length) {
      // Numeric selection
      selectedProject = availableProjects[projectNumber - 1];
      console.log(`🔍 [DEBUG] Numeric selection: ${projectNumber} -> ${selectedProject.projectId}`);
    } else {
      // Text selection - strip emoji prefixes
      const cleanSelectedName = selectedProjectName
        .replace(
          /^[📋📝📄📊📈📉📋📌📍📎📏📐📑📒📓📔📕📖📗📘📙📚📛📜📝📞📟📠📡📢📣📤📥📦📧📨📩📪📫📬📭📮📯📰📱📲📳📴📵📶📷📸📹📺📻📼📽📾📿🔀🔁🔂🔃🔄🔅🔆🔇🔈🔉🔊🔋🔌🔍🔎🔏🔐🔑🔒🔓🔔🔕🔖🔗🔘🔙🔚🔛🔜🔝🔞🔟🔠🔡🔢🔣🔤🔥🔦🔧🔨🔩🔪🔫🔬🔭🔮🔯🔰🔱🔲🔳🔴🔵🔶🔷🔸🔹🔺🔻🔼🔽🔾🔿🕀🕁🕂🕃🕄🕅🕆🕇🕈🕉🕊🕋🕌🕍🕎🕏🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛🕜🕝🕞🕟🕠🕡🕢🕣🕤🕥🕦🕧🕨🕩🕪🕫🕬🕭🕮🕯🕰🕱🕲🕳🕴🕵🕶🕷🕸🕹🕺🕻🕼🕽🕾🕿🖀🖁🖂🖃🖄🖅🖆🖇🖈🖉🖊🖋🖌🖍🖎🖏🖐🖑🖒🖓🖔🖕🖖🖗🖘🖙🖚🖛🖜🖝🖞🖟🖠🖡🖢🖣🖤🖥🖦🖧🖨🖩🖪🖫🖬🖭🖮🖯🖰🖱🖲🖳🖴🖵🖶🖷🖸🖹🖺🖻🖼🖽🖾🖿🗀🗁🗂🗃🗄🗅🗆🗇🗈🗉🗊🗋🗌🗍🗎🗏🗐🗑🗒🗓🗔🗕🗖🗗🗘🗙🗚🗛🗜🗝🗞🗟🗠🗡🗢🗣🗤🗥🗦🗧🗨🗩🗪🗫🗬🗭🗮🗯🗰🗱🗲🗳🗴🗵🗶🗷🗸🗹🗺🗻🗼🗽🗾🗿😀😁😂🤣😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷😸😹😺😻😼😽😾😿🙀🙁🙂🙃🙄🙅🙆🙇🙈🙉🙊🙋🙌🙍🙎🙏🙐🙑🙒🙓🙔🙕🙖🙗🙘🙙🙚🙛🙜🙝🙞🙟🙠🙡🙢🙣🙤🙥🙦🙧🙨🙩🙪🙫🙬🙭🙮🙯🙰🙱🙲🙳🙴🙵🙶🙷🙸🙹🙺🙻🙼🙽🙾🙿]+\s*/,
          ''
        )
        .trim();
      console.log(`🔍 [DEBUG] Cleaned project name: "${cleanSelectedName}"`);

      selectedProject = availableProjects.find((project) => {
        const matchesName = project.configuration?.projectName === cleanSelectedName;
        const matchesId = project.projectId === cleanSelectedName;
        console.log(
          `🔍 [DEBUG] Project "${project.configuration?.projectName}" (${project.projectId}): name match=${matchesName}, id match=${matchesId}`
        );
        return matchesName || matchesId;
      });
    }

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
      console.log(`🔍 [DEBUG] No project found matching: "${selectedProjectName}"`);
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Invalid project selection. Please choose from the available projects.'
      );
      return;
    }

    // Update session with project information
    console.log(`🔍 [DEBUG] Updating session with project: ${selectedProject.projectId}`);
    session.projectId = selectedProject.projectId;
    session.formId = selectedProject._id;
    session.status = 'filling_form';
    session.currentStep = 0;
    session.answers.clear();
    await session.save();

    logger.info(`✅ Project selected: ${selectedProject.projectId} for ${phoneNumber}`);

    // Start form filling process
    console.log(`🔍 [DEBUG] Starting form filling process`);
    await startFormFilling(phoneNumber, session);
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in project selection:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(`❌ Error processing project selection for ${phoneNumber}:`, error.message);
    logger.error(`❌ Full error details:`, error);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to select project. Please try again.');
  }
};

/**
 * Handle form step (user answering questions)
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} userAnswer - User's answer
 * @param {Object} session - User session object
 */
exports.handleFormStep = async (phoneNumber, userAnswer, session) => {
  try {
    logger.info(`📝 Processing form step for ${phoneNumber} (step ${session.currentStep}): "${userAnswer}"`);

    // Get current project form
    const projectForm = await projectFormService.getProjectFormByProjectId(session.projectId);

    if (!projectForm || !projectForm.elements) {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Form not found or has no questions.');
      return;
    }

    const currentQuestion = projectForm.elements[session.currentStep];

    if (!currentQuestion) {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Invalid form step.');
      return;
    }

    // Validate the answer
    const validationResult = whatsappValidationService.validateFieldValue(userAnswer, currentQuestion);

    if (!validationResult.valid) {
      logger.warn(`❌ Validation failed for step ${session.currentStep}: ${validationResult.error}`);
      await whatsappNotificationService.sendValidationError(phoneNumber, {
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
      await whatsappNotificationService.sendFormQuestion(phoneNumber, nextQuestion, nextStep, projectForm.elements.length);

      logger.info(`✅ Next question sent for step ${nextStep}`);
    } else {
      // Form completed
      session.status = 'ready_to_submit';
      await session.save();

      await whatsappNotificationService.sendFormCompletion(phoneNumber, projectForm);

      logger.info(`✅ Form completed for ${phoneNumber}`);
    }
  } catch (error) {
    logger.error(`❌ Error processing form step for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to process answer. Please try again.');
  }
};

/**
 * Handle file uploads (photos and documents)
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} fileInfo - File information
 * @param {Object} session - User session object
 */
exports.handleFileUpload = async (phoneNumber, fileInfo, session) => {
  try {
    logger.info(`📎 Processing file upload for ${phoneNumber}`);

    // Get current project form
    const projectForm = await projectFormService.getProjectFormByProjectId(session.projectId);

    if (!projectForm || !projectForm.elements) {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Form not found or has no questions.');
      return;
    }

    const currentQuestion = projectForm.elements[session.currentStep];

    if (!currentQuestion) {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Invalid form step.');
      return;
    }

    // Check if current question accepts files
    if (currentQuestion.type !== 'file') {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'This question does not accept file uploads.');
      return;
    }

    // Validate file size (max 20MB for WhatsApp)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (fileInfo.fileSize > maxSize) {
      await whatsappNotificationService.sendValidationError(phoneNumber, {
        field: 'File Upload',
        error: 'File size exceeds maximum limit of 20MB.',
      });
      return;
    }

    // Store file information
    await session.addAnswer(session.currentStep, fileInfo);

    logger.info(`✅ File uploaded for step ${session.currentStep}: ${fileInfo.fileName}`);

    // Check if there are more questions
    const nextStep = session.currentStep + 1;

    if (nextStep < projectForm.elements.length) {
      // Send next question
      const nextQuestion = projectForm.elements[nextStep];
      await whatsappNotificationService.sendFormQuestion(phoneNumber, nextQuestion, nextStep, projectForm.elements.length);
    } else {
      // Form completed
      session.status = 'ready_to_submit';
      await session.save();

      await whatsappNotificationService.sendFormCompletion(phoneNumber, projectForm);
    }
  } catch (error) {
    logger.error(`❌ Error processing file upload for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to process file upload. Please try again.');
  }
};

/**
 * Get available projects for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of available projects
 */
exports.getAvailableProjects = async function getAvailableProjects(tenantId) {
  try {
    console.log(`🔍 [DEBUG] getAvailableProjects called with tenantId: ${tenantId}`);

    // Use direct database query to avoid plugin timeout issues
    console.log(`🔍 [DEBUG] Using direct database query for project forms`);
    const mongoose = require('mongoose');

    // Ensure database connection is established
    if (!mongoose.connection.db) {
      console.log(`🔍 [DEBUG] Database not connected, using projectFormService as fallback`);
      const projectsResult = await projectFormService.getProjectFormsByTenant(tenantId, {
        status: 'active',
        'metadata.deploymentStatus': 'published',
        deletedAt: null,
      });
      const projects = projectsResult && projectsResult.results ? projectsResult.results : projectsResult;
      return projects || [];
    }

    const projects = await mongoose.connection.db
      .collection('projectforms')
      .find({
        tenantId: tenantId,
        status: 'active',
        'metadata.deploymentStatus': 'published',
        deletedAt: null,
      })
      .toArray();

    console.log(`🔍 [DEBUG] Direct database query returned:`, projects);
    console.log(`🔍 [DEBUG] Type of projects:`, typeof projects);
    console.log(`🔍 [DEBUG] Is array:`, Array.isArray(projects));
    console.log(`🔍 [DEBUG] Length:`, projects ? projects.length : 'undefined');

    if (projects && projects.length > 0) {
      console.log(
        `🔍 [DEBUG] Projects found:`,
        projects.map((p) => ({
          projectId: p.projectId,
          projectName: p.configuration?.projectName,
          status: p.status,
          deploymentStatus: p.metadata?.deploymentStatus,
        }))
      );
    }

    logger.info(`🔍 getAvailableProjects for tenant ${tenantId}: found ${projects ? projects.length : 0} projects`);

    return projects || [];
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in getAvailableProjects:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(`❌ Error getting available projects for tenant ${tenantId}:`, error.message);
    return [];
  }
};

/**
 * Start the form filling process
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
async function startFormFilling(phoneNumber, session) {
  try {
    // Get project form details
    const projectForm = await projectFormService.getProjectFormByProjectId(session.projectId);

    if (!projectForm || !projectForm.elements || projectForm.elements.length === 0) {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'No form questions available for this project.');
      return;
    }

    // Send the first question
    const firstQuestion = projectForm.elements[0];
    await whatsappNotificationService.sendFormQuestion(phoneNumber, firstQuestion, 0, projectForm.elements.length);

    logger.info(`✅ Started form filling for ${phoneNumber} (${projectForm.elements.length} questions)`);
  } catch (error) {
    logger.error(`❌ Error starting form filling for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to start form. Please try again.');
  }
}

/**
 * Get current question for a session
 * @param {Object} session - User session object
 * @returns {Promise<Object|null>} Current question object or null
 */
exports.getCurrentQuestion = async (session) => {
  try {
    const projectForm = await projectFormService.getProjectFormByProjectId(session.projectId);

    if (!projectForm || !projectForm.elements) {
      return null;
    }

    return projectForm.elements[session.currentStep] || null;
  } catch (error) {
    logger.error(`❌ Error getting current question for session ${session.phoneNumber}:`, error.message);
    return null;
  }
};

/**
 * Review answers for a session
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
exports.reviewAnswers = async (phoneNumber, session) => {
  try {
    const projectForm = await projectFormService.getProjectFormByProjectId(session.projectId);

    if (!projectForm || !projectForm.elements) {
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Form not found.');
      return;
    }

    let reviewMessage = `📋 *Form Review*\n\n*Project:* ${projectForm.configuration?.projectName || session.projectId}\n\n`;

    for (let i = 0; i < projectForm.elements.length; i++) {
      const question = projectForm.elements[i];
      const answer = session.answers.get(i.toString());

      reviewMessage += `${i + 1}. ${question.properties?.label || question.id}\n`;
      reviewMessage += `   *Answer:* ${
        answer ? (typeof answer === 'object' ? answer.fileName : answer) : 'Not answered'
      }\n\n`;
    }

    await whatsappNotificationService.sendTextMessage(phoneNumber, reviewMessage);
  } catch (error) {
    logger.error(`❌ Error reviewing answers for ${phoneNumber}:`, error.message);
    await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to review answers. Please try again.');
  }
};
