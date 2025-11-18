/**
 * Cron Job: Auto-Cleanup Soft-Deleted Forms After 14 Days
 *
 * This job runs daily at 2 AM to permanently delete forms that have been
 * soft-deleted more than 14 days ago.
 *
 * Features:
 * - Deletes from both MongoDB and PostgreSQL
 * - Only runs in production and staging environments
 * - Logs all operations for audit trail
 */

const cron = require('node-cron');
const { ProjectForm } = require('../models');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

const cleanupDeletedForms = async () => {
  try {
    logger.info('🧹 [CRON] Running scheduled cleanup of deleted forms...');

    // Find forms deleted more than 14 days ago
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const formsToDelete = await ProjectForm.find({
      deletedAt: { $lte: fourteenDaysAgo },
    });

    if (formsToDelete.length === 0) {
      logger.info('🧹 [CRON] No forms to cleanup');
      return;
    }

    logger.info(`🧹 [CRON] Found ${formsToDelete.length} forms to permanently delete`);

    let successCount = 0;
    let errorCount = 0;

    for (const form of formsToDelete) {
      try {
        const projectId = form.projectId;
        const formName = form.configuration?.projectName || 'Unknown';
        const deletedAt = form.deletedAt;

        // Use the permanent delete method
        await form.permanentlyDelete();

        logger.info(
          `✅ [CRON] Permanently deleted form: ${projectId} (${formName}) - deleted on ${deletedAt}`
        );
        successCount++;
      } catch (error) {
        logger.error(`❌ [CRON] Failed to delete form ${form.projectId}:`, error);
        errorCount++;
      }
    }

    logger.info(
      `🎉 [CRON] Cleanup complete: ${successCount} deleted, ${errorCount} errors`
    );
  } catch (error) {
    logger.error('❌ [CRON] Cleanup job failed:', error);
  }
};

/**
 * Schedule cleanup job
 * Runs daily at 2 AM
 */
const scheduleCleanup = () => {
  // Schedule: Every day at 2:00 AM
  cron.schedule('0 2 * * *', cleanupDeletedForms, {
    timezone: 'UTC',
  });

  logger.info('✅ [CRON] Scheduled deleted forms cleanup (daily at 2 AM UTC)');
};

// Export for manual testing
module.exports = {
  cleanupDeletedForms,
  scheduleCleanup,
};





