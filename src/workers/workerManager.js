/**
 * Worker Manager - Automatically start all workers with the application
 * 
 * This module manages all background workers and ensures they start/stop
 * properly with the main application.
 */

const logger = require('../config/logger');

// Import workers - handle gracefully if they don't exist
let createSubmissionWorker,
  createNotificationWorker,
  createPermNotificationWorker,
  createEmailIngestorWorker,
  createAnalyticsRefreshWorker;

try {
  const submissionWorkerModule = require('./submission.worker');
  createSubmissionWorker =
    submissionWorkerModule.createSubmissionWorker || submissionWorkerModule;
} catch (error) {
  logger.warn('⚠️  Submission worker module not found');
}

try {
  const notificationWorkerModule = require('./notification.worker');
  createNotificationWorker =
    notificationWorkerModule.createNotificationWorker ||
    notificationWorkerModule;
} catch (error) {
  logger.warn('⚠️  Notification worker module not found');
}

try {
  const permNotificationWorkerModule = require('./permNotification.worker');
  createPermNotificationWorker =
    permNotificationWorkerModule.createPermNotificationWorker ||
    permNotificationWorkerModule;
} catch (error) {
  logger.warn('⚠️  PERM notification worker module not found');
}

try {
  const emailIngestorWorkerModule = require('./emailIngestor.worker');
  createEmailIngestorWorker =
    emailIngestorWorkerModule.createEmailIngestorWorker ||
    emailIngestorWorkerModule;
} catch (error) {
  logger.warn('⚠️  Email ingestor worker module not found');
}

try {
  const analyticsRefreshWorkerModule = require('./analyticsRefresh.worker');
  createAnalyticsRefreshWorker =
    analyticsRefreshWorkerModule.createAnalyticsRefreshWorker ||
    analyticsRefreshWorkerModule;
} catch (error) {
  logger.warn('⚠️  Analytics refresh worker module not found');
}

class WorkerManager {
  constructor() {
    this.workers = {};
    this.isRunning = false;
  }

  /**
   * Start all workers
   */
  async startAll() {
    if (this.isRunning) {
      logger.warn('⚠️  Workers already running');
      return;
    }

    try {
      logger.info('🚀 Starting all background workers...');

      // Start submission worker
      if (createSubmissionWorker) {
        try {
          this.workers.submission = createSubmissionWorker();
          logger.info('✅ Submission worker started');
        } catch (error) {
          logger.error('❌ Failed to start submission worker:', error.message);
        }
      }

      // Start notification worker (if exists)
      if (createNotificationWorker) {
        try {
          this.workers.notification = createNotificationWorker();
          logger.info('✅ Notification worker started');
        } catch (error) {
          logger.warn(
            '⚠️  Failed to start notification worker:',
            error.message
          );
        }
      }

      // Start PERM notification worker (if exists)
      if (createPermNotificationWorker) {
        try {
          this.workers.permNotification = createPermNotificationWorker();
          logger.info('✅ PERM notification worker started');
        } catch (error) {
          logger.warn(
            '⚠️  Failed to start PERM notification worker:',
            error.message
          );
        }
      }

      // Start email ingestor worker (if exists)
      if (createEmailIngestorWorker) {
        try {
          this.workers.emailIngestor = createEmailIngestorWorker();
          logger.info('✅ Email ingestor worker started');
        } catch (error) {
          logger.warn(
            '⚠️  Failed to start email ingestor worker:',
            error.message
          );
        }
      }

      // Start analytics refresh worker (if exists)
      if (createAnalyticsRefreshWorker) {
        try {
          this.workers.analyticsRefresh = createAnalyticsRefreshWorker();
          logger.info('✅ Analytics refresh worker started');
        } catch (error) {
          logger.warn(
            '⚠️  Failed to start analytics refresh worker:',
            error.message
          );
        }
      }

      this.isRunning = true;
      logger.info(
        `✅ Worker manager started successfully (${
          Object.keys(this.workers).length
        } workers running)`
      );

      // Setup graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('❌ Failed to start worker manager:', error);
      throw error;
    }
  }

  /**
   * Stop all workers gracefully
   */
  async stopAll() {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping all workers...');

    const workerNames = Object.keys(this.workers);

    for (const name of workerNames) {
      try {
        const worker = this.workers[name];
        if (worker && typeof worker.close === 'function') {
          await worker.close();
          logger.info(`✅ ${name} worker stopped`);
        }
      } catch (error) {
        logger.error(`❌ Error stopping ${name} worker:`, error.message);
      }
    }

    this.workers = {};
    this.isRunning = false;
    logger.info('✅ All workers stopped');
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(
        `\n📡 Received ${signal}, shutting down workers gracefully...`
      );
      await this.stopAll();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
      logger.error('💥 Uncaught Exception:', error);
      await this.stopAll();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await this.stopAll();
      process.exit(1);
    });
  }

  /**
   * Get status of all workers
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      workers: Object.keys(this.workers).map((name) => ({
        name,
        status: this.workers[name] ? 'running' : 'stopped',
      })),
    };
  }
}

// Create singleton instance
const workerManager = new WorkerManager();

module.exports = workerManager;

