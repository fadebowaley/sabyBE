const logger = require('../../../config/logger');
const { submissionService, projectFormService } = require('../../../services');

/**
 * Convert answers from session format to structured format
 * @param {Map} answers - Session answers map
 * @param {Object} projectForm - Project form object
 * @returns {Object} Structured answers object
 */
const convertAnswersToStructured = (answers, projectForm) => {
  const structuredAnswers = {};
  const formElements = projectForm.elements || [];

  for (let i = 0; i < formElements.length; i += 1) {
    const element = formElements[i];
    const answerKey = i.toString();
    const answer = answers.get(answerKey);

    if (answer !== undefined) {
      const fieldName =
        element.properties?.label || element.id || `Field ${i + 1}`;
      const normalizedFieldName = fieldName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .trim();

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
};

/**
 * Build submission payload from session context
 * @param {Object} session - WhatsApp session document
 * @param {Object} projectForm - Project form mongoose document
 * @returns {Object} submission payload
 */
const buildSubmissionPayload = (session, projectForm) => {
  const profileSnapshot = session.metadata?.profileSnapshot || {};
  const selectedNode = session.metadata?.selectedNode;
  const answersMap =
    session.batchAnswers && session.batchAnswers.size > 0
      ? session.batchAnswers
      : session.answers;

  const structuredAnswers = convertAnswersToStructured(answersMap, projectForm);

  return {
    tenantId: session.tenantId,
    projectId: session.projectId,
    project_name: projectForm.configuration?.projectName || session.projectId,
    project_category: projectForm.configuration?.projectCategory || 'General',
    formId: session.formId,
    nodeId: selectedNode?.id || selectedNode?.nodeId || null,
    userId: session.userId,
    source: 'whatsapp',
    status: 'submitted',
    metadata: {
      phoneNumber: session.metadata.phoneNumber,
      sessionId: session._id,
      submittedAt: new Date(),
      selectedNode,
      blueprint: {
        user_name:
          profileSnapshot.displayName ||
          profileSnapshot.name ||
          session.metadata.userName ||
          'WhatsApp User',
        user_email:
          profileSnapshot.email ||
          session.metadata.userEmail ||
          'unknown@saby.ai',
        user_phone: profileSnapshot.phoneNumber || session.metadata.phoneNumber,
        saby_id: profileSnapshot.sabyId,
        node_reference: selectedNode?.nodeId,
        node_name: selectedNode?.name,
        node_city: selectedNode?.city,
        node_state: selectedNode?.state,
        node_country: selectedNode?.country,
        form_reference: projectForm.formReference,
      },
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
      structured: structuredAnswers,
      attachments: [],
    },
    user_name:
      profileSnapshot.displayName ||
      profileSnapshot.name ||
      session.metadata.userName ||
      'WhatsApp User',
    user_email:
      profileSnapshot.email || session.metadata.userEmail || 'unknown@saby.ai',
    user_phone: profileSnapshot.phoneNumber || session.metadata.phoneNumber,
    saby_id: profileSnapshot.sabyId,
    node_reference: selectedNode?.nodeId,
    node_name: selectedNode?.name,
    node_city: selectedNode?.city,
    node_state: selectedNode?.state,
    node_country: selectedNode?.country,
    form_reference: projectForm.formReference,
    perm_enabled: !!projectForm.permSettings?.enabled,
  };
};

/**
 * Queue a WhatsApp submission in batch mode
 * @param {string} phoneNumber - User phone number
 * @param {Object} session - WhatsApp session document
 * @returns {Promise<{ jobId: string, projectForm: Object }>} queue result
 */
const queueBatchedSubmission = async (phoneNumber, session) => {
  logger.info(
    `📦 Queueing batched submission for ${phoneNumber} (session ${session._id})`
  );

  const projectForm = await projectFormService.getProjectFormByProjectId(
    session.projectId
  );

  if (!projectForm) {
    throw new Error('Project form not found.');
  }

  if (!session.metadata?.selectedNode) {
    throw new Error('A location must be selected before submitting.');
  }

  const submissionData = buildSubmissionPayload(session, projectForm);

  const queueResult = await submissionService.queueSubmission(submissionData);

  return {
    jobId: queueResult?.jobId,
    projectForm,
  };
};

module.exports = {
  queueBatchedSubmission,
  convertAnswersToStructured,
};
