const InMail = require('../models/inmail.model');

/**
 * Permanently delete InMail messages in the trash older than 30 days
 * Usage: Call this function manually or schedule it with a job runner
 */
async function cleanOldTrashedMessages() {
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await InMail.deleteMany({
    folder: 'trash',
    deletedAt: { $lte: THIRTY_DAYS_AGO },
  });
  console.log(`[InMailJob] Deleted ${result.deletedCount} old trashed messages.`);
  return result;
}

module.exports = {
  cleanOldTrashedMessages,
};
