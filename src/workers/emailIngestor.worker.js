/**
 * Email Ingestor Worker (Modularized)
 */

const mongoose = require('mongoose');
const logger = require('../config/logger');
const config = require('../config/config');
const { runEmailIngestor } = require('../ingestion/email/email.ingestor');

const INTERVAL_MS = process.env.EMAIL_INGESTOR_INTERVAL_MS
  ? Number(process.env.EMAIL_INGESTOR_INTERVAL_MS)
  : 60000;

let intervalHandle = null;

const createEmailIngestorWorker = async () => {
  logger.info(
    `📧 Email Ingestor Worker starting - polling every ${INTERVAL_MS / 1000}s`
  );

  // Connect to MongoDB if not already connected.
  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(config.mongoose.url, config.mongoose.options);
      logger.info('✅ Email Ingestor Worker connected to MongoDB');
    } catch (error) {
      logger.error(
        '❌ Email Ingestor Worker failed to connect to MongoDB:',
        error.message
      );
      throw error;
    }
  }

  const cycle = async () => {
    try {
      logger.debug('[EmailIngestor] Starting cycle');
      await runEmailIngestor();
      logger.debug('[EmailIngestor] Cycle complete');
    } catch (error) {
      logger.error(`[EmailIngestor] Cycle failed: ${error.message}`);
    }
  };

  // Run immediately, then on interval.
  await cycle();
  intervalHandle = setInterval(cycle, INTERVAL_MS);

  return {
    close: async () => {
      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
        logger.info('🛑 Email ingestor worker stopped');
      }
    },
  };
};

if (require.main === module) {
  logger.info('🚀 Starting email ingestor worker (standalone mode)...');
  createEmailIngestorWorker();
}

module.exports = { createEmailIngestorWorker };
