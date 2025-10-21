/**
 * PERM Notification Worker
 *
 * Processes notification_queue_perm to send compliance alerts, reminders, and summaries
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../../config/redis');
const logger = require('../../config/logger');
const { permNotificationService } = require('../../services');
const emailService = require('../../services/email.service');

const PERM_NOTIFICATION_QUEUE_NAME = 'permNotificationQueue';

// Optional: log queue events like completed/failed
const permNotificationQueueEvents = new QueueEvents(
  PERM_NOTIFICATION_QUEUE_NAME,
  {
    connection: getRedisConnectionOptions(),
  }
);

permNotificationQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`✅ PERM Notification job completed - ID: ${jobId}`);
});

permNotificationQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(
    `❌ PERM Notification job failed - ID: ${jobId}, Reason: ${failedReason}`
  );
});

/**
 * Send email notification
 */
const sendEmailNotification = async (notification) => {
  const {
    recipient_email,
    recipient_name,
    subject,
    message,
    notification_type,
  } = notification;

  try {
    const emailData = {
      to: recipient_email,
      subject: `[PERM] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0;">PERM Compliance Notification</h2>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">
              Hello ${recipient_name || 'User'},
            </p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; margin: 0; color: #2c3e50;">${message}</pre>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
              <p style="color: #6c757d; font-size: 14px; margin: 0;">
                This is an automated notification from the PERM (Per Event Reporting Model) system.
              </p>
              <p style="color: #6c757d; font-size: 14px; margin: 5px 0 0 0;">
                Notification Type: ${notification_type}
              </p>
            </div>
          </div>
        </div>
      `,
    };

    await emailService.sendEmail(emailData);
    logger.info(`📧 Email sent successfully to ${recipient_email}`);
    return { success: true };
  } catch (error) {
    logger.error(
      `❌ Failed to send email to ${recipient_email}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Process different notification types
 */
const processNotification = async (notification) => {
  const { notification_type, data } = notification;

  try {
    switch (notification_type) {
      case 'incomplete_alert':
        logger.info(
          `📧 Processing incomplete alert for ${notification.node_id}`
        );
        break;

      case 'late_submission_warning':
        logger.info(
          `⚠️ Processing late submission warning for ${notification.node_id}`
        );
        break;

      case 'completion_confirmation':
        logger.info(
          `✅ Processing completion confirmation for ${notification.node_id}`
        );
        break;

      case 'weekly_reminder':
        logger.info(
          `📅 Processing weekly reminder for ${notification.node_id}`
        );
        break;

      case 'month_end_summary':
        logger.info(
          `📊 Processing month-end summary for ${notification.tenant_id}/${notification.project_id}`
        );
        break;

      default:
        logger.warn(`⚠️ Unknown notification type: ${notification_type}`);
    }

    // Send email notification
    const emailResult = await sendEmailNotification(notification);

    if (emailResult.success) {
      // Mark as sent
      await permNotificationService.markNotificationSent(notification.id);
      logger.info(`✅ Notification ${notification.id} marked as sent`);
    } else {
      // Mark as failed
      await permNotificationService.markNotificationFailed(
        notification.id,
        emailResult.error
      );
      logger.error(
        `❌ Notification ${notification.id} marked as failed: ${emailResult.error}`
      );
    }

    return emailResult;
  } catch (error) {
    logger.error(
      `❌ Error processing notification ${notification.id}:`,
      error.message
    );

    // Mark as failed
    await permNotificationService.markNotificationFailed(
      notification.id,
      error.message
    );

    throw error;
  }
};

// Worker for processing PERM notification jobs
const permNotificationWorker = new Worker(
  PERM_NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const { notification } = job.data;

    logger.info(
      `📧 Processing PERM notification: ${notification.id} (${notification.notification_type})`
    );

    try {
      const result = await processNotification(notification);

      logger.info(
        `✅ PERM notification processed successfully: ${notification.id}`
      );
      return result;
    } catch (error) {
      logger.error(
        `❌ PERM notification processing failed: ${notification.id}`,
        error.message
      );
      throw error;
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 3, // Process 3 notifications at a time
  }
);

permNotificationWorker.on('error', (err) => {
  logger.error('❌ PERM Notification Worker error:', err);
});

/**
 * Process pending notifications (manual trigger)
 */
const processPendingNotifications = async (limit = 50) => {
  try {
    logger.info('🔧 Processing pending PERM notifications...');

    const pendingNotifications =
      await permNotificationService.getPendingNotifications(limit);

    if (pendingNotifications.length === 0) {
      logger.info('ℹ️ No pending notifications found');
      return { processed: 0 };
    }

    logger.info(
      `📋 Found ${pendingNotifications.length} pending notifications`
    );

    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications) {
      try {
        await processNotification(notification);
        processed++;
      } catch (error) {
        logger.error(
          `❌ Failed to process notification ${notification.id}:`,
          error.message
        );
        failed++;
      }
    }

    logger.info(`✅ Processed ${processed} notifications, ${failed} failed`);
    return { processed, failed };
  } catch (error) {
    logger.error('❌ Error processing pending notifications:', error.message);
    throw error;
  }
};

/**
 * Start the worker
 */
const startWorker = () => {
  logger.info('👷‍♂️ PERM Notification Worker is running...');
  return permNotificationWorker;
};

/**
 * Stop the worker
 */
const stopWorker = async () => {
  logger.info('🛑 Stopping PERM Notification Worker...');
  await permNotificationWorker.close();
};

module.exports = {
  permNotificationWorker,
  startWorker,
  stopWorker,
  processPendingNotifications,
  processNotification,
  sendEmailNotification,
};

// Auto-start if this file is run directly
if (require.main === module) {
  startWorker();

  // Also process pending notifications for testing
  setTimeout(async () => {
    try {
      await processPendingNotifications();
    } catch (error) {
      logger.error('❌ Manual processing failed:', error.message);
    }
  }, 2000);
}

/**
 * PERM Notification Worker
 *
 * Processes notification_queue_perm to send compliance alerts, reminders, and summaries
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../../config/redis');
const logger = require('../../config/logger');
const { permNotificationService } = require('../../services');
const emailService = require('../../services/email.service');

const PERM_NOTIFICATION_QUEUE_NAME = 'permNotificationQueue';

// Optional: log queue events like completed/failed
const permNotificationQueueEvents = new QueueEvents(
  PERM_NOTIFICATION_QUEUE_NAME,
  {
    connection: getRedisConnectionOptions(),
  }
);

permNotificationQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`✅ PERM Notification job completed - ID: ${jobId}`);
});

permNotificationQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(
    `❌ PERM Notification job failed - ID: ${jobId}, Reason: ${failedReason}`
  );
});

/**
 * Send email notification
 */
const sendEmailNotification = async (notification) => {
  const {
    recipient_email,
    recipient_name,
    subject,
    message,
    notification_type,
  } = notification;

  try {
    const emailData = {
      to: recipient_email,
      subject: `[PERM] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0;">PERM Compliance Notification</h2>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">
              Hello ${recipient_name || 'User'},
            </p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; margin: 0; color: #2c3e50;">${message}</pre>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
              <p style="color: #6c757d; font-size: 14px; margin: 0;">
                This is an automated notification from the PERM (Per Event Reporting Model) system.
              </p>
              <p style="color: #6c757d; font-size: 14px; margin: 5px 0 0 0;">
                Notification Type: ${notification_type}
              </p>
            </div>
          </div>
        </div>
      `,
    };

    await emailService.sendEmail(emailData);
    logger.info(`📧 Email sent successfully to ${recipient_email}`);
    return { success: true };
  } catch (error) {
    logger.error(
      `❌ Failed to send email to ${recipient_email}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Process different notification types
 */
const processNotification = async (notification) => {
  const { notification_type, data } = notification;

  try {
    switch (notification_type) {
      case 'incomplete_alert':
        logger.info(
          `📧 Processing incomplete alert for ${notification.node_id}`
        );
        break;

      case 'late_submission_warning':
        logger.info(
          `⚠️ Processing late submission warning for ${notification.node_id}`
        );
        break;

      case 'completion_confirmation':
        logger.info(
          `✅ Processing completion confirmation for ${notification.node_id}`
        );
        break;

      case 'weekly_reminder':
        logger.info(
          `📅 Processing weekly reminder for ${notification.node_id}`
        );
        break;

      case 'month_end_summary':
        logger.info(
          `📊 Processing month-end summary for ${notification.tenant_id}/${notification.project_id}`
        );
        break;

      default:
        logger.warn(`⚠️ Unknown notification type: ${notification_type}`);
    }

    // Send email notification
    const emailResult = await sendEmailNotification(notification);

    if (emailResult.success) {
      // Mark as sent
      await permNotificationService.markNotificationSent(notification.id);
      logger.info(`✅ Notification ${notification.id} marked as sent`);
    } else {
      // Mark as failed
      await permNotificationService.markNotificationFailed(
        notification.id,
        emailResult.error
      );
      logger.error(
        `❌ Notification ${notification.id} marked as failed: ${emailResult.error}`
      );
    }

    return emailResult;
  } catch (error) {
    logger.error(
      `❌ Error processing notification ${notification.id}:`,
      error.message
    );

    // Mark as failed
    await permNotificationService.markNotificationFailed(
      notification.id,
      error.message
    );

    throw error;
  }
};

// Worker for processing PERM notification jobs
const permNotificationWorker = new Worker(
  PERM_NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const { notification } = job.data;

    logger.info(
      `📧 Processing PERM notification: ${notification.id} (${notification.notification_type})`
    );

    try {
      const result = await processNotification(notification);

      logger.info(
        `✅ PERM notification processed successfully: ${notification.id}`
      );
      return result;
    } catch (error) {
      logger.error(
        `❌ PERM notification processing failed: ${notification.id}`,
        error.message
      );
      throw error;
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 3, // Process 3 notifications at a time
  }
);

permNotificationWorker.on('error', (err) => {
  logger.error('❌ PERM Notification Worker error:', err);
});

/**
 * Process pending notifications (manual trigger)
 */
const processPendingNotifications = async (limit = 50) => {
  try {
    logger.info('🔧 Processing pending PERM notifications...');

    const pendingNotifications =
      await permNotificationService.getPendingNotifications(limit);

    if (pendingNotifications.length === 0) {
      logger.info('ℹ️ No pending notifications found');
      return { processed: 0 };
    }

    logger.info(
      `📋 Found ${pendingNotifications.length} pending notifications`
    );

    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications) {
      try {
        await processNotification(notification);
        processed++;
      } catch (error) {
        logger.error(
          `❌ Failed to process notification ${notification.id}:`,
          error.message
        );
        failed++;
      }
    }

    logger.info(`✅ Processed ${processed} notifications, ${failed} failed`);
    return { processed, failed };
  } catch (error) {
    logger.error('❌ Error processing pending notifications:', error.message);
    throw error;
  }
};

/**
 * Start the worker
 */
const startWorker = () => {
  logger.info('👷‍♂️ PERM Notification Worker is running...');
  return permNotificationWorker;
};

/**
 * Stop the worker
 */
const stopWorker = async () => {
  logger.info('🛑 Stopping PERM Notification Worker...');
  await permNotificationWorker.close();
};

module.exports = {
  permNotificationWorker,
  startWorker,
  stopWorker,
  processPendingNotifications,
  processNotification,
  sendEmailNotification,
};

// Auto-start if this file is run directly
if (require.main === module) {
  startWorker();

  // Also process pending notifications for testing
  setTimeout(async () => {
    try {
      await processPendingNotifications();
    } catch (error) {
      logger.error('❌ Manual processing failed:', error.message);
    }
  }, 2000);
}

/**
 * PERM Notification Worker
 *
 * Processes notification_queue_perm to send compliance alerts, reminders, and summaries
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../../config/redis');
const logger = require('../../config/logger');
const { permNotificationService } = require('../../services');
const emailService = require('../../services/email.service');

const PERM_NOTIFICATION_QUEUE_NAME = 'permNotificationQueue';

// Optional: log queue events like completed/failed
const permNotificationQueueEvents = new QueueEvents(
  PERM_NOTIFICATION_QUEUE_NAME,
  {
    connection: getRedisConnectionOptions(),
  }
);

permNotificationQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`✅ PERM Notification job completed - ID: ${jobId}`);
});

permNotificationQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(
    `❌ PERM Notification job failed - ID: ${jobId}, Reason: ${failedReason}`
  );
});

/**
 * Send email notification
 */
const sendEmailNotification = async (notification) => {
  const {
    recipient_email,
    recipient_name,
    subject,
    message,
    notification_type,
  } = notification;

  try {
    const emailData = {
      to: recipient_email,
      subject: `[PERM] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin: 0;">PERM Compliance Notification</h2>
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <p style="color: #34495e; font-size: 16px; line-height: 1.6;">
              Hello ${recipient_name || 'User'},
            </p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; margin: 0; color: #2c3e50;">${message}</pre>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
              <p style="color: #6c757d; font-size: 14px; margin: 0;">
                This is an automated notification from the PERM (Per Event Reporting Model) system.
              </p>
              <p style="color: #6c757d; font-size: 14px; margin: 5px 0 0 0;">
                Notification Type: ${notification_type}
              </p>
            </div>
          </div>
        </div>
      `,
    };

    await emailService.sendEmail(emailData);
    logger.info(`📧 Email sent successfully to ${recipient_email}`);
    return { success: true };
  } catch (error) {
    logger.error(
      `❌ Failed to send email to ${recipient_email}:`,
      error.message
    );
    return { success: false, error: error.message };
  }
};

/**
 * Process different notification types
 */
const processNotification = async (notification) => {
  const { notification_type, data } = notification;

  try {
    switch (notification_type) {
      case 'incomplete_alert':
        logger.info(
          `📧 Processing incomplete alert for ${notification.node_id}`
        );
        break;

      case 'late_submission_warning':
        logger.info(
          `⚠️ Processing late submission warning for ${notification.node_id}`
        );
        break;

      case 'completion_confirmation':
        logger.info(
          `✅ Processing completion confirmation for ${notification.node_id}`
        );
        break;

      case 'weekly_reminder':
        logger.info(
          `📅 Processing weekly reminder for ${notification.node_id}`
        );
        break;

      case 'month_end_summary':
        logger.info(
          `📊 Processing month-end summary for ${notification.tenant_id}/${notification.project_id}`
        );
        break;

      default:
        logger.warn(`⚠️ Unknown notification type: ${notification_type}`);
    }

    // Send email notification
    const emailResult = await sendEmailNotification(notification);

    if (emailResult.success) {
      // Mark as sent
      await permNotificationService.markNotificationSent(notification.id);
      logger.info(`✅ Notification ${notification.id} marked as sent`);
    } else {
      // Mark as failed
      await permNotificationService.markNotificationFailed(
        notification.id,
        emailResult.error
      );
      logger.error(
        `❌ Notification ${notification.id} marked as failed: ${emailResult.error}`
      );
    }

    return emailResult;
  } catch (error) {
    logger.error(
      `❌ Error processing notification ${notification.id}:`,
      error.message
    );

    // Mark as failed
    await permNotificationService.markNotificationFailed(
      notification.id,
      error.message
    );

    throw error;
  }
};

// Worker for processing PERM notification jobs
const permNotificationWorker = new Worker(
  PERM_NOTIFICATION_QUEUE_NAME,
  async (job) => {
    const { notification } = job.data;

    logger.info(
      `📧 Processing PERM notification: ${notification.id} (${notification.notification_type})`
    );

    try {
      const result = await processNotification(notification);

      logger.info(
        `✅ PERM notification processed successfully: ${notification.id}`
      );
      return result;
    } catch (error) {
      logger.error(
        `❌ PERM notification processing failed: ${notification.id}`,
        error.message
      );
      throw error;
    }
  },
  {
    connection: getRedisConnectionOptions(),
    concurrency: 3, // Process 3 notifications at a time
  }
);

permNotificationWorker.on('error', (err) => {
  logger.error('❌ PERM Notification Worker error:', err);
});

/**
 * Process pending notifications (manual trigger)
 */
const processPendingNotifications = async (limit = 50) => {
  try {
    logger.info('🔧 Processing pending PERM notifications...');

    const pendingNotifications =
      await permNotificationService.getPendingNotifications(limit);

    if (pendingNotifications.length === 0) {
      logger.info('ℹ️ No pending notifications found');
      return { processed: 0 };
    }

    logger.info(
      `📋 Found ${pendingNotifications.length} pending notifications`
    );

    let processed = 0;
    let failed = 0;

    for (const notification of pendingNotifications) {
      try {
        await processNotification(notification);
        processed++;
      } catch (error) {
        logger.error(
          `❌ Failed to process notification ${notification.id}:`,
          error.message
        );
        failed++;
      }
    }

    logger.info(`✅ Processed ${processed} notifications, ${failed} failed`);
    return { processed, failed };
  } catch (error) {
    logger.error('❌ Error processing pending notifications:', error.message);
    throw error;
  }
};

/**
 * Start the worker
 */
const startWorker = () => {
  logger.info('👷‍♂️ PERM Notification Worker is running...');
  return permNotificationWorker;
};

/**
 * Stop the worker
 */
const stopWorker = async () => {
  logger.info('🛑 Stopping PERM Notification Worker...');
  await permNotificationWorker.close();
};

module.exports = {
  permNotificationWorker,
  startWorker,
  stopWorker,
  processPendingNotifications,
  processNotification,
  sendEmailNotification,
};

// Auto-start if this file is run directly
if (require.main === module) {
  startWorker();

  // Also process pending notifications for testing
  setTimeout(async () => {
    try {
      await processPendingNotifications();
    } catch (error) {
      logger.error('❌ Manual processing failed:', error.message);
    }
  }, 2000);
}

