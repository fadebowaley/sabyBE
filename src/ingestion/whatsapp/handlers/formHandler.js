const {
  projectFormService,
  calendarEnforcementService,
} = require('../../../services');
const whatsappValidationService = require('../services/whatsappValidation.service');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const logger = require('../../../config/logger');

const BATCH_MODE_SINGLE_PROMPT = 'single_prompt';
const WHATSAPP_INTEGRATION_KEY = 'whatsapp';
const COMMA_SPLIT_REGEX = /[,،؛]+/;
const INDEXED_LINE_REGEX = /^(\d+)[\).\s-]*\s*(.*)$/;
const KEY_VALUE_REGEX = /^([^:=]+)\s*[:=]\s*(.+)$/;

function normalizeIntegrationValue(value) {
  return String(value).trim().toLowerCase();
}

function extractIntegrations(metadata) {
  if (!metadata) {
    return [];
  }

  if (typeof metadata.get === 'function') {
    const mapValue = metadata.get('integrations');
    if (Array.isArray(mapValue)) {
      return mapValue.map((value) => normalizeIntegrationValue(value));
    }
    if (mapValue && typeof mapValue === 'object') {
      return extractIntegrations({ integrations: mapValue });
    }
  }

  const { integrations } = metadata;
  if (Array.isArray(integrations)) {
    return integrations.map((value) => normalizeIntegrationValue(value));
  }

  if (integrations && typeof integrations === 'object') {
    const enabled = new Set();

    if (Array.isArray(integrations.channels)) {
      integrations.channels.forEach((channel) => {
        if (typeof channel === 'string' && channel.trim()) {
          enabled.add(normalizeIntegrationValue(channel));
        }
      });
    }

    Object.entries(integrations).forEach(([key, config]) => {
      if (key === 'channels') {
        return;
      }

      if (!Number.isNaN(Number(key))) {
        return;
      }

      if (config === false || config === null || config === undefined) {
        return;
      }

      if (config === true) {
        enabled.add(normalizeIntegrationValue(key));
        return;
      }

      if (typeof config === 'object') {
        const isEnabled =
          Object.prototype.hasOwnProperty.call(config, 'enabled') === false
            ? true
            : Boolean(config.enabled);
        if (isEnabled) {
          enabled.add(normalizeIntegrationValue(key));
        }
        return;
      }

      enabled.add(normalizeIntegrationValue(key));
    });

    return Array.from(enabled);
  }

  return [];
}

function projectSupportsIntegration(
  project,
  integrationKey = WHATSAPP_INTEGRATION_KEY
) {
  const normalizedKey = normalizeIntegrationValue(integrationKey);
  const allowValues = new Set([normalizedKey, 'all', 'any', 'global']);

  const { metadata: projectMetadata } = project || {};
  let resolvedMetadata = projectMetadata;
  if (!resolvedMetadata && typeof project?.get === 'function') {
    resolvedMetadata = project.get('metadata');
  }

  const integrations = extractIntegrations(resolvedMetadata);
  return integrations.some((value) => allowValues.has(value));
}

function normalizeLabel(label = '') {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripWrappingQuotes(value) {
  if (typeof value !== 'string') {
    return value;
  }

  let trimmed = value.trim();
  const quotePairs = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'],
    ['‘', '’'],
  ];

  quotePairs.forEach(([open, close]) => {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) {
      trimmed = trimmed.slice(open.length, -close.length).trim();
    }
  });

  return trimmed;
}

function splitMessageIntoSegments(message = '') {
  return message
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      if (COMMA_SPLIT_REGEX.test(line)) {
        const parts = line
          .split(COMMA_SPLIT_REGEX)
          .map((segment) => segment.trim())
          .filter((segment) => segment.length > 0);
        return parts.length > 0 ? parts : [line];
      }
      return [line];
    });
}

function resolveIntegrationsObject(metadata) {
  if (!metadata) {
    return {};
  }

  const integrations =
    typeof metadata.get === 'function'
      ? metadata.get('integrations')
      : metadata.integrations;

  if (Array.isArray(integrations)) {
    return integrations.reduce((acc, entry) => {
      if (typeof entry === 'string' && entry.trim()) {
        acc[entry] = { enabled: true };
      }
      return acc;
    }, {});
  }

  if (integrations && typeof integrations === 'object') {
    return integrations;
  }

  return {};
}

function getWhatsappConfig(metadata) {
  const integrations = resolveIntegrationsObject(metadata);
  return integrations && typeof integrations === 'object'
    ? integrations.whatsapp || {}
    : {};
}

function getVisibleElements(projectForm) {
  const elements = projectForm?.elements || [];
  return elements.filter((element) => {
    const hidden =
      element?.metadata && element.metadata.whatsapp
        ? element.metadata.whatsapp.hidden
        : false;
    return hidden !== true;
  });
}

function normalizeProjectFormForWhatsApp(projectForm) {
  if (!projectForm) {
    return null;
  }

  const baseForm =
    typeof projectForm.toObject === 'function'
      ? projectForm.toObject()
      : { ...projectForm };

  baseForm.elements = getVisibleElements(projectForm);
  return baseForm;
}

function buildBatchTemplate(projectForm) {
  const elements = getVisibleElements(projectForm);
  return elements.map((element, index) => {
    const label =
      element.properties?.label || element.title || `Question ${index + 1}`;
    const keyCandidates = [
      element.properties?.fieldKey,
      element.properties?.key,
      element.properties?.name,
      element.properties?.shortLabel,
      element.properties?.identifier,
      element.name,
      element.id,
    ].filter((candidate) => typeof candidate === 'string' && candidate.trim());
    const primaryKey =
      keyCandidates.find((candidate) => candidate.trim().length > 0) ||
      element.id ||
      `field_${index + 1}`;
    const displayKey = primaryKey.trim();
    const normalizedKey = normalizeLabel(displayKey);

    const normalizedAliases = new Set();
    const displayAliases = new Set();
    const addAlias = (value, includeInDisplay = true) => {
      if (!value || typeof value !== 'string') return;
      const normalized = normalizeLabel(value);
      if (!normalized) return;
      normalizedAliases.add(normalized);
      if (
        includeInDisplay &&
        value.trim() &&
        value.trim() !== displayKey &&
        value.trim() !== label
      ) {
        displayAliases.add(value.trim());
      }
    };

    addAlias(displayKey, false);
    addAlias(label, false);
    keyCandidates.forEach((candidate) =>
      addAlias(candidate, candidate !== displayKey && candidate !== label)
    );
    if (element.id) addAlias(element.id, element.id !== displayKey);
    const propertyAliases = element.properties?.aliases;
    if (Array.isArray(propertyAliases)) {
      propertyAliases.forEach((alias) => addAlias(alias, true));
    }
    const elementAliases = Array.isArray(element.aliases)
      ? element.aliases
      : [];
    elementAliases.forEach((alias) => addAlias(alias, true));
    const whatsappAliases =
      element.metadata?.whatsapp &&
      Array.isArray(element.metadata.whatsapp.aliases)
        ? element.metadata.whatsapp.aliases
        : [];
    whatsappAliases.forEach((alias) => addAlias(alias, true));

    return {
      index: index + 1,
      id: element.id,
      key: displayKey,
      normalizedKey,
      aliases: Array.from(normalizedAliases),
      displayAliases: Array.from(displayAliases),
      type: element.type,
      label,
      properties: element.properties || {},
    };
  });
}

function buildAnswerSummary(projectForm, session) {
  const elements = getVisibleElements(projectForm);
  const answers =
    session.batchAnswers && session.batchAnswers.size > 0
      ? session.batchAnswers
      : session.answers;

  return elements.map((element, index) => {
    const label =
      element.properties?.label || element.title || `Question ${index + 1}`;
    const rawAnswer = answers.get(index.toString());
    const formattedValue =
      whatsappNotificationService.formatSummaryValue(rawAnswer);

    return {
      index: index + 1,
      label,
      value: formattedValue,
      raw: rawAnswer,
    };
  });
}

async function presentBatchSummary(phoneNumber, session, projectForm) {
  const summary = buildAnswerSummary(projectForm, session);
  session.batchStatus = 'pending_confirmation';
  session.metadata.batchStartedAt =
    session.metadata.batchStartedAt || new Date();
  session.batchMeta = {
    ...(session.batchMeta || {}),
    pendingEditIndex: null,
    lastSummaryAt: new Date(),
  };
  session.markModified('batchStatus');
  session.markModified('metadata');
  session.markModified('batchMeta');
  await session.save();

  logger.info(
    `📦 Presenting batch summary to ${phoneNumber} with ${summary.length} items`
  );

  await whatsappNotificationService.sendBatchSummary(
    phoneNumber,
    projectForm,
    summary
  );
}

async function startBatchCollection(
  phoneNumber,
  session,
  projectForm,
  whatsappConfig = {}
) {
  const template = buildBatchTemplate(projectForm);
  session.status = 'collecting_batch';
  session.currentStep = 0;
  session.batchStatus = 'collecting';
  session.batchAnswers.clear();
  session.answers.clear();
  session.metadata = session.metadata || {};
  session.metadata.batchTemplate = template;
  session.metadata.batchStartedAt = null;
  session.metadata.batchConfirmedAt = null;
  session.batchMeta = {};
  session.markModified('metadata');
  session.markModified('batchAnswers');
  session.markModified('answers');
  session.markModified('batchMeta');
  await session.save();

  await whatsappNotificationService.sendBatchInputInstructions(
    phoneNumber,
    projectForm,
    template,
    whatsappConfig
  );
}

function parseBatchInput(message, template) {
  const segments = splitMessageIntoSegments(message);
  const indexedMap = new Map();
  const labelMap = new Map();
  const orderedValues = [];

  segments.forEach((segment) => {
    if (!segment) return;

    const indexMatch = segment.match(INDEXED_LINE_REGEX);
    if (indexMatch) {
      const index = parseInt(indexMatch[1], 10);
      const value = stripWrappingQuotes(indexMatch[2].trim());
      if (!Number.isNaN(index) && value) {
        indexedMap.set(index, value);
      }
      return;
    }

    const keyValueMatch = segment.match(KEY_VALUE_REGEX);
    if (keyValueMatch) {
      const normalizedKey = normalizeLabel(keyValueMatch[1]);
      const value = stripWrappingQuotes(keyValueMatch[2]);
      if (normalizedKey) {
        labelMap.set(normalizedKey, value);
      }
      return;
    }

    orderedValues.push(stripWrappingQuotes(segment));
  });

  const answers = new Map();
  const missing = [];
  let sequentialIndex = 0;

  template.forEach((field, index) => {
    let value = null;
    if (indexedMap.has(field.index)) {
      value = indexedMap.get(field.index);
    } else {
      const labelKey = normalizeLabel(field.label);
      const candidateKeys = new Set([
        labelKey,
        field.normalizedKey,
        ...(field.aliases || []),
      ]);
      for (const candidate of candidateKeys) {
        if (candidate && labelMap.has(candidate)) {
          value = labelMap.get(candidate);
          break;
        }
      }
      if (
        (value === null || value === undefined) &&
        sequentialIndex < orderedValues.length
      ) {
        value = orderedValues[sequentialIndex];
        sequentialIndex += 1;
      }
    }

    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      if (field.properties?.required) {
        missing.push(field.label);
      }
    } else {
      answers.set((field.index - 1).toString(), value);
    }
  });

  return { answers, missing };
}

async function processBatchSubmission(
  phoneNumber,
  session,
  projectForm,
  input
) {
  const template =
    session.metadata?.batchTemplate || buildBatchTemplate(projectForm);
  const whatsappConfig = getWhatsappConfig(projectForm.metadata || {});
  const { answers, missing } = parseBatchInput(input, template);

  if (missing.length > 0) {
    logger.warn(
      `⚠️ Batch submission missing fields for ${phoneNumber}: ${missing.join(
        ', '
      )}`
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      `I could not find answers for: ${missing.join(
        ', '
      )}. Please reply again following the template.`,
      projectForm
    );
    await whatsappNotificationService.sendBatchInputInstructions(
      phoneNumber,
      projectForm,
      template,
      whatsappConfig
    );
    return;
  }

  const validationErrors = [];
  const normalizedAnswers = new Map();

  template.forEach((field) => {
    const rawValue = answers.get((field.index - 1).toString());
    const validation = whatsappValidationService.validateFieldValue(rawValue, {
      type: field.type,
      properties: field.properties,
    });

    if (!validation.valid) {
      validationErrors.push({
        field: field.label,
        error: validation.error,
      });
    } else {
      normalizedAnswers.set((field.index - 1).toString(), validation.value);
      try {
        const safeValue =
          validation.value === null || validation.value === undefined
            ? validation.value
            : typeof validation.value === 'object'
            ? JSON.stringify(validation.value)
            : validation.value.toString();
        logger.info('🗂️ Captured batch answer', {
          phoneNumber,
          index: field.index,
          question: field.label,
          type: field.type,
          value: safeValue,
        });
      } catch (logError) {
        logger.warn('⚠️ Failed to log batch answer', {
          phoneNumber,
          index: field.index,
          reason: logError.message,
        });
      }
    }
  });

  if (validationErrors.length > 0) {
    logger.warn(
      `⚠️ Batch submission validation errors for ${phoneNumber}:`,
      validationErrors
    );
    const errorLines = validationErrors
      .map((err) => `• ${err.field}: ${err.error}`)
      .join('\n');
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      `Some details need attention:\n${errorLines}\n\nPlease correct them and reply again using the template.`,
      projectForm
    );
    await whatsappNotificationService.sendBatchInputInstructions(
      phoneNumber,
      projectForm,
      template,
      whatsappConfig
    );
    return;
  }

  session.batchAnswers.clear();
  session.answers.clear();
  normalizedAnswers.forEach((value, key) => {
    session.batchAnswers.set(key, value);
    session.answers.set(key, value);
  });
  session.currentStep = template.length;
  session.markModified('batchAnswers');
  session.markModified('answers');

  await session.markReadyToSubmit();
  await presentBatchSummary(phoneNumber, session, projectForm);
}

/**
 * Handle project selection from user
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} selectedProjectName - Selected project name or number
 * @param {Object} session - User session object
 */
exports.handleProjectSelection = async (
  phoneNumber,
  selectedProjectName,
  session
) => {
  try {
    console.log(`🔍 [DEBUG] Project selection started for ${phoneNumber}`);
    console.log(`🔍 [DEBUG] Selected project: "${selectedProjectName}"`);
    console.log(`🔍 [DEBUG] Session tenantId: ${session.tenantId}`);

    logger.info(
      `📋 Processing project selection for ${phoneNumber}: "${selectedProjectName}"`
    );

    // Get available projects
    console.log(
      `🔍 [DEBUG] Calling getAvailableProjects for tenant: ${session.tenantId}`
    );
    const availableProjects = await exports.getAvailableProjects(
      session.tenantId
    );
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

    // Handle numeric selection (1, 2, 3, etc.)
    const projectNumber = parseInt(selectedProjectName);
    let selectedProject = null;

    if (
      !isNaN(projectNumber) &&
      projectNumber > 0 &&
      projectNumber <= availableProjects.length
    ) {
      // Numeric selection
      selectedProject = availableProjects[projectNumber - 1];
      console.log(
        `🔍 [DEBUG] Numeric selection: ${projectNumber} -> ${selectedProject.projectId}`
      );
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
        const matchesName =
          project.configuration?.projectName === cleanSelectedName;
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
      console.log(
        `🔍 [DEBUG] No project found matching: "${selectedProjectName}"`
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
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
    session.answers.clear();
    session.batchAnswers.clear();
    session.batchStatus = 'collecting';
    session.batchMeta = {};
    session.metadata.batchStartedAt = new Date();
    session.metadata.batchConfirmedAt = null;
    session.markModified('batchAnswers');
    session.markModified('batchMeta');
    session.markModified('metadata');
    await session.save();

    logger.info(
      `✅ Project selected: ${selectedProject.projectId} for ${phoneNumber}`
    );

    // Start form filling process
    console.log(`🔍 [DEBUG] Starting form filling process`);
    await startFormFilling(phoneNumber, session);
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in project selection:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error processing project selection for ${phoneNumber}:`,
      error.message
    );
    logger.error(`❌ Full error details:`, error);
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to select project. Please try again.'
    );
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
    logger.info(
      `🧾 Handling form step ${session.currentStep} for ${phoneNumber} with answer: ${userAnswer}`
    );
    logger.info(
      `📝 Processing form step for ${phoneNumber} (step ${session.currentStep}): "${userAnswer}"`
    );

    // Get current project form
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Form not found or has no questions.'
      );
      return;
    }

    const currentQuestion = projectForm.elements[session.currentStep];

    if (!currentQuestion) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Invalid form step.'
      );
      return;
    }

    // Validate the answer
    const validationResult = whatsappValidationService.validateFieldValue(
      userAnswer,
      currentQuestion
    );

    if (!validationResult.valid) {
      logger.warn(
        `❌ Validation failed for step ${session.currentStep}: ${validationResult.error}`
      );
      await whatsappNotificationService.sendValidationError(phoneNumber, {
        field: currentQuestion.properties?.label || currentQuestion.id,
        error: validationResult.error,
      });
      return;
    }

    // Store the validated answer
    await session.addAnswer(session.currentStep, validationResult.value);

    try {
      const safeValue =
        validationResult.value === null || validationResult.value === undefined
          ? validationResult.value
          : typeof validationResult.value === 'object'
          ? JSON.stringify(validationResult.value)
          : validationResult.value.toString();
      logger.info('🗂️ Captured answer', {
        phoneNumber,
        step: session.currentStep - 1,
        question:
          currentQuestion.properties?.label || currentQuestion.id || 'unknown',
        type: currentQuestion.type,
        value: safeValue,
      });
    } catch (logError) {
      logger.warn('⚠️ Failed to log captured answer', {
        phoneNumber,
        step: session.currentStep - 1,
        reason: logError.message,
      });
    }

    logger.info(
      `✅ Answer accepted for step ${session.currentStep - 1} (${
        currentQuestion.type
      })`
    );

    const totalQuestions = projectForm.elements.length;
    const nextStepIndex = session.currentStep;
    const pendingEditIndex =
      session.batchMeta && session.batchMeta.pendingEditIndex;
    const wasEditing =
      session.batchStatus === 'editing' || typeof pendingEditIndex === 'number';

    if (wasEditing) {
      session.batchStatus = 'pending_confirmation';
      if (session.batchMeta) {
        session.batchMeta.pendingEditIndex = null;
        session.batchMeta.lastEditedAt = new Date();
        session.markModified('batchMeta');
      }
      session.currentStep = totalQuestions;
      session.markModified('batchStatus');
      await session.save();

      await presentBatchSummary(phoneNumber, session, projectForm);
      return;
    }

    // Check if there are more questions
    if (nextStepIndex < totalQuestions) {
      const nextQuestion = projectForm.elements[nextStepIndex];
      await whatsappNotificationService.sendFormQuestion(
        phoneNumber,
        nextQuestion,
        nextStepIndex,
        projectForm.elements.length
      );

      logger.info(`✅ Next question sent for step ${nextStepIndex}`);
    } else {
      session.status = 'ready_to_submit';
      session.batchStatus = 'pending_confirmation';
      session.metadata.batchStartedAt =
        session.metadata.batchStartedAt || new Date();
      session.currentStep = totalQuestions;
      session.markModified('batchStatus');
      session.markModified('metadata');
      await session.save();

      await presentBatchSummary(phoneNumber, session, projectForm);

      logger.info(`✅ Form completed for ${phoneNumber}`);
    }
  } catch (error) {
    logger.error(
      `❌ Error processing form step for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process answer. Please try again.'
    );
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
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Form not found or has no questions.'
      );
      return;
    }

    const currentQuestion = projectForm.elements[session.currentStep];

    if (!currentQuestion) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Invalid form step.'
      );
      return;
    }

    // Check if current question accepts files
    if (currentQuestion.type !== 'file') {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'This question does not accept file uploads.'
      );
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

    logger.info(
      `✅ File uploaded for step ${session.currentStep}: ${fileInfo.fileName}`
    );

    // Check if there are more questions
    const nextStep = session.currentStep + 1;

    const totalQuestions = projectForm.elements.length;
    const nextStepIndex = session.currentStep;
    const pendingEditIndex =
      session.batchMeta && session.batchMeta.pendingEditIndex;
    const wasEditing =
      session.batchStatus === 'editing' || typeof pendingEditIndex === 'number';

    if (wasEditing) {
      session.batchStatus = 'pending_confirmation';
      if (session.batchMeta) {
        session.batchMeta.pendingEditIndex = null;
        session.batchMeta.lastEditedAt = new Date();
        session.markModified('batchMeta');
      }
      session.currentStep = totalQuestions;
      session.markModified('batchStatus');
      await session.save();

      await presentBatchSummary(phoneNumber, session, projectForm);
      return;
    }

    if (nextStepIndex < totalQuestions) {
      const nextQuestion = projectForm.elements[nextStepIndex];
      await whatsappNotificationService.sendFormQuestion(
        phoneNumber,
        nextQuestion,
        nextStepIndex,
        projectForm.elements.length
      );
    } else {
      session.status = 'ready_to_submit';
      session.batchStatus = 'pending_confirmation';
      session.metadata.batchStartedAt =
        session.metadata.batchStartedAt || new Date();
      session.currentStep = totalQuestions;
      session.markModified('batchStatus');
      session.markModified('metadata');
      await session.save();

      await presentBatchSummary(phoneNumber, session, projectForm);
    }
  } catch (error) {
    logger.error(
      `❌ Error processing file upload for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Failed to process file upload. Please try again.'
    );
  }
};

/**
 * Get available projects for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of available projects
 */
exports.getAvailableProjects = async function getAvailableProjects(tenantId) {
  try {
    console.log(
      `🔍 [DEBUG] getAvailableProjects called with tenantId: ${tenantId}`
    );

    const integrationFilter = {
      $or: [
        {
          'metadata.integrations': {
            $in: [WHATSAPP_INTEGRATION_KEY, 'all', 'any', 'global'],
          },
        },
        {
          'metadata.integrations.channels': {
            $in: [WHATSAPP_INTEGRATION_KEY, 'all', 'any', 'global'],
          },
        },
        { 'metadata.integrations.whatsapp.enabled': true },
        { 'metadata.integrations.whatsapp': true },
      ],
    };

    // Use direct database query to avoid plugin timeout issues
    console.log(`🔍 [DEBUG] Using direct database query for project forms`);
    const mongoose = require('mongoose');

    // Ensure database connection is established
    if (!mongoose.connection.db) {
      console.log(
        `🔍 [DEBUG] Database not connected, using projectFormService as fallback`
      );
      const projectsResult = await projectFormService.getProjectFormsByTenant(
        tenantId,
        {
          status: 'active',
          'metadata.deploymentStatus': 'published',
          deletedAt: null,
          ...integrationFilter,
        }
      );
      const projects =
        projectsResult && projectsResult.results
          ? projectsResult.results
          : projectsResult;
      return (projects || []).filter((project) =>
        projectSupportsIntegration(project)
      );
    }

    const projects = await mongoose.connection.db
      .collection('projectforms')
      .find({
        tenantId,
        status: 'active',
        'metadata.deploymentStatus': 'published',
        deletedAt: null,
        ...integrationFilter,
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

    logger.info(
      `🔍 getAvailableProjects for tenant ${tenantId}: found ${
        projects ? projects.length : 0
      } projects`
    );

    return (projects || []).filter((project) =>
      projectSupportsIntegration(project)
    );
  } catch (error) {
    console.log(`🔍 [DEBUG] ERROR in getAvailableProjects:`, error);
    console.log(`🔍 [DEBUG] Error stack:`, error.stack);
    logger.error(
      `❌ Error getting available projects for tenant ${tenantId}:`,
      error.message
    );
    return [];
  }
};

async function redirectToProjectSelection(phoneNumber, session) {
  session.status = 'selecting_project';
  session.projectId = null;
  session.formId = null;
  session.currentStep = 0;
  session.batchStatus = 'collecting';
  session.batchMeta = {};
  session.metadata = session.metadata || {};
  session.metadata.batchStartedAt = null;
  session.metadata.batchConfirmedAt = null;
  if (session.answers && typeof session.answers.clear === 'function') {
    session.answers.clear();
  }
  if (
    session.batchAnswers &&
    typeof session.batchAnswers.clear === 'function'
  ) {
    session.batchAnswers.clear();
  }
  session.markModified('batchAnswers');
  session.markModified('batchMeta');
  session.markModified('metadata');
  await session.save();

  const projects = await exports.getAvailableProjects(session.tenantId);
  if (!projects || projects.length === 0) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'No projects are currently available for your account. Please contact your administrator.'
    );
    return;
  }

  await whatsappNotificationService.sendFormSelectionMenu(
    phoneNumber,
    projects
  );
}

/**
 * Start the form filling process
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {Object} session - User session object
 */
function formatCalendarDate(dateStr) {
  if (!dateStr) return 'N/A';
  const safeDate = new Date(dateStr);
  if (Number.isNaN(safeDate.getTime())) {
    return dateStr;
  }
  return safeDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildCalendarClosureMessage(projectName, status) {
  const baseName = projectName || 'This form';
  const reasonMap = {
    no_calendar:
      'No submission calendar is configured yet. An administrator must publish dates before responses can be collected.',
    date_not_on_schedule: `Today (${formatCalendarDate(
      status.referenceDate
    )}) is not on the published schedule.`,
    quota_reached:
      status.slotCapacity > 0
        ? `All ${status.slotCapacity} submission slot${
            status.slotCapacity === 1 ? '' : 's'
          } for ${formatCalendarDate(
            status.referenceDate
          )} have already been used.`
        : 'All slots for today have already been used.',
    locked:
      status.lockMessage ||
      'Submissions are temporarily locked by your administrator for review.',
  };

  const reasonText =
    reasonMap[status.statusReason] ||
    'Submissions are not open right now for this date.';

  const nextWindowText = status.nextAvailableDate
    ? `Next available date: ${formatCalendarDate(status.nextAvailableDate)}.`
    : 'No upcoming submission window is configured yet.';

  return `${baseName} is not accepting submissions right now.

Reason: ${reasonText}
${nextWindowText}

Need it reopened? Ask your administrator to update the calendar in Calendar Management.

What next?
1. Choose another project (sending the list now)
2. Review your saved answers
3. /node – change location`;
}

async function startFormFilling(phoneNumber, session) {
  try {
    // Get project form details
    const projectFormDoc = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectSupportsIntegration(projectFormDoc)) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'This project is not available on WhatsApp. Please choose a different project.'
      );
      return;
    }

    const projectFormObject =
      normalizeProjectFormForWhatsApp(projectFormDoc) || projectFormDoc;

    if (
      !projectFormObject ||
      !projectFormObject.elements ||
      projectFormObject.elements.length === 0
    ) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'No form questions available for this project.'
      );
      return;
    }

    const tenantId = session.tenantId;
    const projectId = session.projectId || projectFormObject.projectId;
    let selectedNode =
      session.metadata?.selectedNode ||
      session.node ||
      session.metadata?.node ||
      null;
    const nodesCache = session.metadata?.nodesCache || [];

    if (!selectedNode && nodesCache.length === 1) {
      selectedNode = nodesCache[0];
      session.metadata.selectedNode = selectedNode;
      session.metadata.selectedNodeAt = new Date();
      session.markModified('metadata');
      await session.save();
      await whatsappNotificationService.sendInfoMessage(
        phoneNumber,
        `📍 Using ${
          selectedNode.name || selectedNode.nodeId
        } for this submission.`
      );
    }

    if (!selectedNode) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Please choose a location before continuing. Reply with /node and select from the list.'
      );
      return;
    }
    const nodeId =
      selectedNode?.nodeId ||
      selectedNode?._id ||
      selectedNode?.id ||
      selectedNode?.reference ||
      null;

    if (tenantId && projectId) {
      try {
        const status =
          await calendarEnforcementService.getSubmissionWindowStatus({
            tenantId,
            projectId,
            nodeId,
          });

        if (!status.isAccepting) {
          const projectName =
            projectFormObject.configuration?.projectName || projectId;
          const closureMessage = buildCalendarClosureMessage(
            projectName,
            status
          );

          await whatsappNotificationService.sendTextMessage(
            phoneNumber,
            `🚫 ${closureMessage}`
          );
          await redirectToProjectSelection(phoneNumber, session);
          return;
        }
      } catch (calendarError) {
        logger.warn(
          `[WhatsApp] Unable to evaluate calendar window for ${projectId}: ${calendarError.message}`
        );
      }
    }

    const projectMetadata = projectFormObject.metadata || {};
    const batchModeRaw =
      (typeof projectMetadata.get === 'function'
        ? projectMetadata.get('batchMode')
        : projectMetadata.batchMode) || null;

    const batchMode =
      batchModeRaw && typeof batchModeRaw === 'string'
        ? batchModeRaw.toLowerCase()
        : null;

    console.log('🔍 [BATCH DEBUG] projectMetadata:', projectMetadata);
    console.log('🔍 [BATCH DEBUG] batchModeRaw:', batchModeRaw);
    console.log('🔍 [BATCH DEBUG] normalizedBatchMode:', batchMode);

    session.metadata = session.metadata || {};
    const whatsappConfig = getWhatsappConfig(projectMetadata);
    await whatsappNotificationService.sendFormIntro(
      phoneNumber,
      projectFormObject,
      whatsappConfig
    );
    session.metadata.lastBatchModeCheck = batchMode;
    session.markModified('metadata');
    await session.save();

    logger.info('🧪 Batch mode evaluation', {
      phoneNumber,
      projectId: projectFormObject.projectId,
      batchMode,
      metadataKeys: Object.keys(projectMetadata || {}),
    });

    const shouldUseSinglePrompt =
      batchMode === BATCH_MODE_SINGLE_PROMPT ||
      (!batchMode && projectSupportsIntegration(projectFormObject));

    if (shouldUseSinglePrompt) {
      logger.info(
        `📦 Initiating single-prompt batch collection for ${phoneNumber}`
      );
      if (logger.debug) {
        logger.debug(
          'Batch mode metadata',
          batchMode || 'default',
          projectMetadata
        );
      }
      await startBatchCollection(
        phoneNumber,
        session,
        projectFormObject,
        whatsappConfig
      );
      return;
    }

    // Send the first question
    const firstQuestion = projectFormObject.elements[0];
    await whatsappNotificationService.sendFormQuestion(
      phoneNumber,
      firstQuestion,
      0,
      projectFormObject.elements.length
    );

    logger.info(
      `✅ Started form filling for ${phoneNumber} (${projectFormObject.elements.length} questions)`
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
      `❌ Error getting current question for session ${session.phoneNumber}:`,
      error.message
    );
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
    const projectForm = await projectFormService.getProjectFormByProjectId(
      session.projectId
    );

    if (!projectForm || !projectForm.elements) {
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Form not found.'
      );
      return;
    }

    await presentBatchSummary(phoneNumber, session, projectForm);
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
};

exports.presentBatchSummaryForSession = async (phoneNumber, session) => {
  const projectForm = await projectFormService.getProjectFormByProjectId(
    session.projectId
  );

  if (!projectForm || !projectForm.elements) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Form not found.'
    );
    return;
  }

  await presentBatchSummary(phoneNumber, session, projectForm);
};

exports.startEditStep = async (phoneNumber, session, stepNumber) => {
  const projectForm = await projectFormService.getProjectFormByProjectId(
    session.projectId
  );

  if (!projectForm || !projectForm.elements) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Form not found.'
    );
    return;
  }

  const zeroIndex = stepNumber - 1;
  if (
    Number.isNaN(zeroIndex) ||
    zeroIndex < 0 ||
    zeroIndex >= projectForm.elements.length
  ) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Invalid question number. Please provide a valid question index.'
    );
    return;
  }

  const question = projectForm.elements[zeroIndex];
  session.batchStatus = 'editing';
  session.batchMeta = {
    ...(session.batchMeta || {}),
    pendingEditIndex: zeroIndex,
    lastEditRequestedAt: new Date(),
  };
  session.currentStep = zeroIndex;
  session.markModified('batchStatus');
  session.markModified('batchMeta');
  await session.save();

  await whatsappNotificationService.sendTextMessage(
    phoneNumber,
    `✏️ Updating *${
      question.properties?.label || `Question ${stepNumber}`
    }*.\nPlease provide the new response.`
  );
  await whatsappNotificationService.sendFormQuestion(
    phoneNumber,
    question,
    zeroIndex,
    projectForm.elements.length
  );
};

async function restartForm(phoneNumber, session) {
  session.status = 'filling_form';
  session.currentStep = 0;
  session.answers.clear();
  session.batchAnswers.clear();
  session.batchStatus = 'collecting';
  session.batchMeta = {};
  session.metadata.batchStartedAt = new Date();
  session.metadata.batchConfirmedAt = null;
  session.markModified('batchAnswers');
  session.markModified('batchMeta');
  session.markModified('metadata');
  await session.save();

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
      'No questions available for this form.'
    );
    return;
  }

  await whatsappNotificationService.sendTextMessage(
    phoneNumber,
    '🔄 Restarting this form. Let’s begin again.'
  );
  await whatsappNotificationService.sendFormQuestion(
    phoneNumber,
    projectForm.elements[0],
    0,
    projectForm.elements.length
  );
}

async function startNewSubmissionFlow(phoneNumber, session) {
  session.status = 'selecting_project';
  session.currentStep = 0;
  session.answers.clear();
  session.batchAnswers.clear();
  session.batchStatus = 'collecting';
  session.batchMeta = {};
  session.projectId = null;
  session.formId = null;
  session.metadata.batchStartedAt = null;
  session.metadata.batchConfirmedAt = null;
  session.markModified('batchAnswers');
  session.markModified('batchMeta');
  session.markModified('metadata');
  await session.save();

  const projects = await exports.getAvailableProjects(session.tenantId);

  if (!projects || projects.length === 0) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'No projects available for your account. Please contact your administrator.'
    );
    return;
  }

  await whatsappNotificationService.sendProjectSelection(phoneNumber, projects);
}

async function cancelSubmissionFlow(phoneNumber, session) {
  session.status = 'authenticating';
  session.currentStep = 0;
  session.answers.clear();
  session.batchAnswers.clear();
  session.batchStatus = 'collecting';
  session.batchMeta = {};
  session.projectId = null;
  session.formId = null;
  session.metadata.batchStartedAt = null;
  session.metadata.batchConfirmedAt = null;
  session.markModified('batchAnswers');
  session.markModified('batchMeta');
  session.markModified('metadata');
  await session.save();

  await whatsappNotificationService.sendMessageWithClearKeyboard(
    phoneNumber,
    'Submission cancelled. Type /start to begin a new session anytime.'
  );
}

exports.restartForm = restartForm;
exports.startNewSubmissionFlow = startNewSubmissionFlow;
exports.cancelSubmissionFlow = cancelSubmissionFlow;

exports.deleteAnswer = async (phoneNumber, session, stepNumber) => {
  const projectForm = await projectFormService.getProjectFormByProjectId(
    session.projectId
  );

  if (!projectForm || !projectForm.elements) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Form not found.'
    );
    return;
  }

  const zeroIndex = stepNumber - 1;
  if (
    Number.isNaN(zeroIndex) ||
    zeroIndex < 0 ||
    zeroIndex >= projectForm.elements.length
  ) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Invalid question number. Please provide a valid question index.'
    );
    return;
  }

  const key = zeroIndex.toString();
  session.answers.delete(key);
  session.batchAnswers.delete(key);
  session.markModified('answers');
  session.markModified('batchAnswers');

  session.batchStatus = 'editing';
  session.batchMeta = {
    ...(session.batchMeta || {}),
    pendingEditIndex: zeroIndex,
    lastEditRequestedAt: new Date(),
  };
  session.currentStep = zeroIndex;
  session.markModified('batchStatus');
  session.markModified('batchMeta');
  await session.save();

  const question = projectForm.elements[zeroIndex];
  await whatsappNotificationService.sendTextMessage(
    phoneNumber,
    `🗑️ Cleared response for *${
      question.properties?.label || `Question ${stepNumber}`
    }*. Please provide a new answer.`
  );
  await whatsappNotificationService.sendFormQuestion(
    phoneNumber,
    question,
    zeroIndex,
    projectForm.elements.length
  );
};

exports.handleBatchCollection = async (phoneNumber, input, session) => {
  const projectForm = await projectFormService.getProjectFormByProjectId(
    session.projectId
  );

  if (!projectForm) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Form not found. Please select a project again.'
    );
    session.status = 'selecting_project';
    await session.save();
    return;
  }

  await processBatchSubmission(phoneNumber, session, projectForm, input);
};
