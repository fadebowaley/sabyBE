/**
 * Worker Manager
 *
 * Initializes and manages all background workers.
 * This file is imported by src/index.js to start workers with the app.
 *
 * Workers:
 * - Submission Worker: Processes submission queue (BullMQ)
 * - PERM Notification Worker: Sends compliance notifications
 * - Notification Worker: General notification processing
 * - Email Ingestor Worker: Polls IMAP for email submissions
 *
 * @module workers
 */

const logger = require('../config/logger');
const config = require('../config/config');

// Import worker logic
const { createSubmissionWorker } = require('./submission.worker');
const { createPermNotificationWorker } = require('./permNotification.worker');
const { createNotificationWorker } = require('./notification.worker');
const { createCopilotActionWorker } = require('./copilotAction.worker');
const { createCopilotScoreboardWorker } = require('./copilotScoreboard.worker');
const { createPaymentRemittanceWorker } = require('./paymentRemittance.worker');
const {
  createPaymentReconciliationWorker,
} = require('./paymentReconciliation.worker');
const { initializeBaselineWorkers, shutdownBaselineWorkers } = require('./baseline.worker');

// Email ingestor is optional (requires imap-simple)
let createEmailIngestorWorker = null;
try {
  createEmailIngestorWorker = require('./emailIngestor.worker').createEmailIngestorWorker;
} catch (error) {
  logger.warn('⚠️  Email ingestor worker not available (missing dependencies)');
}

// Worker instances
let submissionWorker = null;
let permNotificationWorker = null;
let notificationWorker = null;
let copilotActionWorker = null;
let copilotScoreboardWorker = null;
let paymentRemittanceWorker = null;
let paymentReconciliationWorker = null;
let emailIngestorWorker = null;
let baselineWorkersInitialized = false;

/**
 * Initialize all workers
 */
const initializeWorkers = async () => {
  try {
    logger.info('🚀 Initializing background workers...');

    // Start submission worker
    submissionWorker = await createSubmissionWorker();
    logger.info('✅ Submission worker started');

    // Start PERM notification worker
    permNotificationWorker = await createPermNotificationWorker();
    logger.info('✅ PERM notification worker started');

    // Start notification worker
    notificationWorker = await createNotificationWorker();
    logger.info('✅ Notification worker started');

    // Start copilot action worker
    copilotActionWorker = await createCopilotActionWorker();
    logger.info('✅ Copilot action worker started');

    // Start copilot scoreboard worker
    copilotScoreboardWorker = await createCopilotScoreboardWorker();
    logger.info('✅ Copilot scoreboard worker started');

    // Start payment remittance worker
    paymentRemittanceWorker = await createPaymentRemittanceWorker();
    logger.info('✅ Payment remittance worker started');

    // Start payment reconciliation worker
    paymentReconciliationWorker = await createPaymentReconciliationWorker();
    logger.info('✅ Payment reconciliation worker started');

    // Start email ingestor worker (if enabled and available)
    if (createEmailIngestorWorker && config.email?.enabled) {
      emailIngestorWorker = await createEmailIngestorWorker();
      logger.info('✅ Email ingestor worker started');
    } else if (!createEmailIngestorWorker) {
      logger.info('⊘ Email ingestor worker not available (missing dependencies)');
    } else {
      logger.info('⊘ Email ingestor worker disabled (EMAIL_ENABLED=false)');
    }

    // Initialize baseline intelligence workers
    try {
      await initializeBaselineWorkers();
      baselineWorkersInitialized = true;
      logger.info('✅ Baseline intelligence workers started');
    } catch (error) {
      logger.error('❌ Failed to initialize baseline workers:', error);
      // Non-critical - continue without baseline workers
    }

    const activeWorkers = [
      submissionWorker ? 'submission' : null,
      permNotificationWorker ? 'perm-notification' : null,
      notificationWorker ? 'notification' : null,
      copilotActionWorker ? 'copilot-action' : null,
      copilotScoreboardWorker ? 'copilot-scoreboard' : null,
      paymentRemittanceWorker ? 'payment-remittance' : null,
      paymentReconciliationWorker ? 'payment-reconciliation' : null,
      emailIngestorWorker ? 'email-ingestor' : null,
      baselineWorkersInitialized ? 'baseline' : null,
    ].filter(Boolean);
    logger.info(`[Workers] Active at boot: ${activeWorkers.join(', ') || 'none'}`);

    logger.info('🎉 All workers initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize workers:', error.message);
    throw error;
  }
};

/**
 * Shutdown all workers gracefully
 */
const shutdownWorkers = async () => {
  logger.info('🛑 Shutting down workers...');

  const shutdownPromises = [];

  if (submissionWorker) {
    shutdownPromises.push(
      submissionWorker
        .close()
        .then(() => logger.info('✅ Submission worker stopped'))
    );
  }

  if (permNotificationWorker) {
    shutdownPromises.push(
      permNotificationWorker
        .close()
        .then(() => logger.info('✅ PERM notification worker stopped'))
    );
  }

  if (notificationWorker) {
    shutdownPromises.push(
      notificationWorker
        .close()
        .then(() => logger.info('✅ Notification worker stopped'))
    );
  }

  if (copilotActionWorker) {
    shutdownPromises.push(
      copilotActionWorker
        .close()
        .then(() => logger.info('✅ Copilot action worker stopped'))
    );
  }

  if (copilotScoreboardWorker) {
    shutdownPromises.push(
      copilotScoreboardWorker
        .close()
        .then(() => logger.info('✅ Copilot scoreboard worker stopped'))
    );
  }

  if (paymentRemittanceWorker) {
    shutdownPromises.push(
      paymentRemittanceWorker
        .close()
        .then(() => logger.info('✅ Payment remittance worker stopped'))
    );
  }

  if (paymentReconciliationWorker) {
    shutdownPromises.push(
      paymentReconciliationWorker
        .close()
        .then(() => logger.info('✅ Payment reconciliation worker stopped'))
    );
  }

  if (emailIngestorWorker) {
    shutdownPromises.push(
      emailIngestorWorker
        .close()
        .then(() => logger.info('✅ Email ingestor worker stopped'))
    );
  }

  // Shutdown baseline workers
  if (baselineWorkersInitialized) {
    shutdownPromises.push(
      shutdownBaselineWorkers()
        .then(() => logger.info('✅ Baseline workers stopped'))
    );
  }

  await Promise.all(shutdownPromises);
  logger.info('🛑 All workers shut down');
};

module.exports = {
  initializeWorkers,
  shutdownWorkers,
};
