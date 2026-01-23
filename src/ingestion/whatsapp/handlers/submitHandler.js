const whatsappNotificationService = require('../services/whatsappNotification.service');
const logger = require('../../../config/logger');
const formHandler = require('./formHandler');
const authHandler = require('./authHandler');
const {
  queueBatchedSubmission,
} = require('../services/batchedSubmission.service');

const CONFIRM_KEYWORDS = new Set([
  'confirm',
  '✅ confirm',
  'submit',
  '✅ submit',
  'yes',
  'approve',
  'proceed',
]);

const REVIEW_KEYWORDS = new Set(['review', 'summary', '📋 review answers']);

const CANCEL_KEYWORDS = new Set([
  'cancel',
  '❌ cancel',
  'stop',
  'abort',
  'quit',
]);

const START_OVER_KEYWORDS = new Set(['start over', '🔄 start over', 'restart']);

const SUBMIT_ANOTHER_KEYWORDS = new Set([
  '📋 submit another',
  'submit another',
  'new form',
]);

const MAIN_MENU_KEYWORDS = new Set(['🏠 main menu', 'main menu', 'menu']);

const EDIT_BUTTON_TEXT = '✏️ Edit Answers';
const CONFIRM_BUTTON_TEXT = '✅ Confirm';
const STATUS_KEYWORDS = new Set(['status', 'check status', '📊 check status']);

const parseIndexCommand = (input, keyword) => {
  const regex = new RegExp(`^${keyword}\\s+(\\d+)`, 'i');
  const match = input.trim().match(regex);
  if (!match) {
    return null;
  }
  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? null : value;
};

const normalizeInput = (text) => text.trim().toLowerCase();

const handleConfirmSubmission = async (phoneNumber, session) => {
  try {
    const queueResult = await queueBatchedSubmission(phoneNumber, session);

    if (!queueResult?.jobId) {
      await whatsappNotificationService.sendSubmissionFailure(
        phoneNumber,
        'Unable to queue submission. Please try again shortly.',
        queueResult?.projectForm
      );
      return;
    }

    session.lastSubmissionJobId = queueResult.jobId;
    await session.markSubmitted();

    await whatsappNotificationService.sendSubmissionSuccess(
      phoneNumber,
      queueResult.jobId,
      queueResult.projectForm
    );

    await authHandler.requirePasscode(phoneNumber, session, {
      reason: 'post_submission',
    });

    logger.info(
      `✅ Batched submission queued for ${phoneNumber} (Job ID: ${queueResult.jobId})`
    );
  } catch (error) {
    logger.error(
      `❌ Failed to queue batched submission for ${phoneNumber}:`,
      error.message
    );
    await whatsappNotificationService.sendSubmissionFailure(
      phoneNumber,
      'We could not submit your form right now. Please try again later.'
    );
  }
};

const handleCancelSubmission = async (phoneNumber, session) => {
  await formHandler.cancelSubmissionFlow(phoneNumber, session);
};

const handleReviewRequest = async (phoneNumber, session) => {
  await formHandler.presentBatchSummaryForSession(phoneNumber, session);
};

const handleEditButton = async (phoneNumber) => {
  await whatsappNotificationService.sendBatchEditInstructions(phoneNumber);
};

const handleEditCommand = async (phoneNumber, session, command) => {
  const editIndex =
    parseIndexCommand(command, 'edit') || parseIndexCommand(command, 'change');

  if (!editIndex) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Please specify the question number to edit. Example: "edit 2".'
    );
    return;
  }

  await formHandler.startEditStep(phoneNumber, session, editIndex);
};

const handleDeleteCommand = async (phoneNumber, session, command) => {
  const deleteIndex =
    parseIndexCommand(command, 'delete') ||
    parseIndexCommand(command, 'remove') ||
    parseIndexCommand(command, 'clear');

  if (!deleteIndex) {
    await whatsappNotificationService.sendErrorMessage(
      phoneNumber,
      'Please specify the question number to delete. Example: "delete 2".'
    );
    return;
  }

  await formHandler.deleteAnswer(phoneNumber, session, deleteIndex);
};

const handleStartOver = async (phoneNumber, session) => {
  await formHandler.restartForm(phoneNumber, session);
};

const handleSubmitAnother = async (phoneNumber, session) => {
  await formHandler.startNewSubmissionFlow(phoneNumber, session);
};

const handleMainMenu = async (phoneNumber, session) => {
  session.metadata = session.metadata || {};
  if (
    session.metadata.menuContext !== 'main' ||
    !session.metadata.awaitingMenuSelection
  ) {
    session.metadata.menuContext = 'main';
    session.metadata.activeSubmenu = null;
    session.metadata.awaitingMenuSelection = true;
    session.markModified('metadata');
    await session.save();
  }
  const userName = session.metadata?.userName || 'User';
  await whatsappNotificationService.sendMainMenu(phoneNumber, userName);
};

exports.handleBatchCommand = async (phoneNumber, input, session) => {
  const trimmed = input.trim();
  const normalized = normalizeInput(trimmed);

  if (!trimmed) {
    await formHandler.presentBatchSummaryForSession(phoneNumber, session);
    return;
  }

  const numericMatch = trimmed.match(/^(\d+)(?:\s*[\s.\-:,]\s*(\d+))?$/);
  if (numericMatch) {
    const code = numericMatch[1];
    const target = numericMatch[2];
    switch (code) {
      case '1':
        await handleConfirmSubmission(phoneNumber, session);
        return;
      case '2':
        if (!target) {
          await whatsappNotificationService.sendErrorMessage(
            phoneNumber,
            'Use "2 {number}" to edit a question. Example: "2 3".'
          );
          return;
        }
        await handleEditCommand(phoneNumber, session, `edit ${target}`);
        return;
      case '3':
        if (!target) {
          await whatsappNotificationService.sendErrorMessage(
            phoneNumber,
            'Use "3 {number}" to delete a question. Example: "3 2".'
          );
          return;
        }
        await handleDeleteCommand(phoneNumber, session, `delete ${target}`);
        return;
      case '4':
        await handleReviewRequest(phoneNumber, session);
        return;
      case '5':
        await handleCancelSubmission(phoneNumber, session);
        return;
      default:
        break;
    }
  }

  if (trimmed === CONFIRM_BUTTON_TEXT || CONFIRM_KEYWORDS.has(normalized)) {
    await handleConfirmSubmission(phoneNumber, session);
    return;
  }

  if (trimmed === EDIT_BUTTON_TEXT) {
    await handleEditButton(phoneNumber);
    return;
  }

  if (REVIEW_KEYWORDS.has(normalized)) {
    await handleReviewRequest(phoneNumber, session);
    return;
  }

  if (CANCEL_KEYWORDS.has(normalized)) {
    await handleCancelSubmission(phoneNumber, session);
    return;
  }

  if (START_OVER_KEYWORDS.has(normalized)) {
    await handleStartOver(phoneNumber, session);
    return;
  }

  if (SUBMIT_ANOTHER_KEYWORDS.has(normalized)) {
    await handleSubmitAnother(phoneNumber, session);
    return;
  }

  if (MAIN_MENU_KEYWORDS.has(normalized)) {
    await handleMainMenu(phoneNumber, session);
    return;
  }

  if (/^(edit|change)\s+\d+/i.test(trimmed)) {
    await handleEditCommand(phoneNumber, session, trimmed);
    return;
  }

  if (/^(delete|remove|clear)\s+\d+/i.test(trimmed)) {
    await handleDeleteCommand(phoneNumber, session, trimmed);
    return;
  }

  await whatsappNotificationService.sendErrorMessage(
    phoneNumber,
    'Use 1 to confirm, 2 {#} to edit, 3 {#} to delete, 4 to review, or 5 to cancel.'
  );
};

exports.handlePostSubmissionAction = async (phoneNumber, input, session) => {
  const trimmed = input.trim();
  const numericMatch = trimmed.match(/^(\d+)\s*$/);
  if (numericMatch) {
    switch (numericMatch[1]) {
      case '1':
        await handleSubmitAnother(phoneNumber, session);
        return;
      case '2':
        await handleMainMenu(phoneNumber, session);
        return;
      case '3': {
        const userName = session.metadata?.userName || 'User';
        await whatsappNotificationService.sendStatusMessage(
          phoneNumber,
          userName
        );
        return;
      }
      default:
        break;
    }
  }

  const normalized = normalizeInput(input);

  if (SUBMIT_ANOTHER_KEYWORDS.has(normalized)) {
    await handleSubmitAnother(phoneNumber, session);
    return;
  }

  if (MAIN_MENU_KEYWORDS.has(normalized)) {
    await handleMainMenu(phoneNumber, session);
    return;
  }

  if (START_OVER_KEYWORDS.has(normalized)) {
    await handleStartOver(phoneNumber, session);
    return;
  }

  if (STATUS_KEYWORDS.has(normalized)) {
    const userName = session.metadata?.userName || 'User';
    await whatsappNotificationService.sendStatusMessage(phoneNumber, userName);
    return;
  }

  if (CANCEL_KEYWORDS.has(normalized)) {
    await handleCancelSubmission(phoneNumber, session);
    return;
  }

  await whatsappNotificationService.sendErrorMessage(
    phoneNumber,
    'Reply with 1 for another form, 2 for the menu, or 3 to view your status.'
  );
};
