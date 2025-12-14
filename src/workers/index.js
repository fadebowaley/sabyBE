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

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const config = require('../config/config');

// Import worker logic
const { createSubmissionWorker } = require('./submission.worker');
const { createPermNotificationWorker } = require('./permNotification.worker');
const { createNotificationWorker } = require('./notification.worker');
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
