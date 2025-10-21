// src/scripts/worker/email.ingestor.worker.js

/*
 * Email Ingestor Worker
 * ---------------------
 * Periodically polls IMAP inboxes for configured tenants and queues the
 * resulting submissions.  Runs in its own PM2 process (see ecosystem config)
 * so it operates independently of the main web server.
 */

const mongoose = require('mongoose');
const logger = require('../../config/logger');
const config = require('../../config/config');
const { runEmailIngestor } = require('../../ingestion/email/email.ingestor');

// Default to 60 000 ms (1 min) unless overridden via ENV.
const envInterval = process.env.EMAIL_INGESTOR_INTERVAL_MS;
let INTERVAL_MS = envInterval ? Number(envInterval) : 60000;

if (Number.isNaN(INTERVAL_MS) || INTERVAL_MS < 10000) {
  logger.error(
    `Invalid EMAIL_INGESTOR_INTERVAL_MS: "${envInterval}". Using default 60000ms`
  );
  INTERVAL_MS = 60000;
}

logger.info(
  `📧 Email Ingestor Worker started – polling every ${INTERVAL_MS / 1000}s`
);

// Connect to MongoDB
const connectToDatabase = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('✅ Email Ingestor Worker connected to MongoDB');
  } catch (error) {
    logger.error(
      '❌ Email Ingestor Worker failed to connect to MongoDB:',
      error.message
    );
    process.exit(1);
  }
};

async function cycle() {
  try {
    logger.debug('[EmailIngestor] Starting cycle');
    await runEmailIngestor();
    logger.debug('[EmailIngestor] Cycle complete');
  } catch (err) {
    logger.error(`[EmailIngestor] Cycle failed: ${err.message}`);
  }
}

// Initialize database connection and start the worker
const initializeWorker = async () => {
  await connectToDatabase();

  // Run immediately, then on interval
  cycle();
  setInterval(cycle, INTERVAL_MS);
};

initializeWorker();
