// middleware/queues.js

const { Queue } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'queue_stats.log');

// Central job queue for form submissions
const submissionQueue = new Queue('submissionQueue', {
  connection: getRedisConnectionOptions(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Simple job processing log
const jobStats = {
  success: 0,
  failed: 0,
  waiting: 0,
};

function logJobStats() {
  const logLine = `[Queue Stats] Success: ${jobStats.success}, Failed: ${jobStats.failed}, Waiting: ${jobStats.waiting}\n`;
  console.log(logLine.trim());
  fs.appendFileSync(LOG_FILE, logLine);
}

// Only run logging if this file is executed directly
if (require.main === module) {
  const { Worker } = require('bullmq');
  const worker = new Worker('submissionQueue', async () => {}, { connection: getRedisConnectionOptions() });

  worker.on('completed', () => {
    jobStats.success++;
  });
  worker.on('failed', () => {
    jobStats.failed++;
  });

  setInterval(async () => {
    jobStats.waiting = await submissionQueue.getWaitingCount();
    logJobStats();
  }, 5000);
}

module.exports = {
  submissionQueue,
};
