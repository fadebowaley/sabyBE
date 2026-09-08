const cron = require('node-cron');
const logger = require('../config/logger');
const reminderTriggerService = require('../services/reminderTrigger.service');

const REMINDER_SWEEP_CRON = process.env.REMINDER_SWEEP_CRON || '*/1 * * * *';

const runReminderSweep = async () => {
  try {
    const results = await reminderTriggerService.queueDueReminders();
    const queued = results.filter((result) => result.queued).length;
    const suppressed = results.filter((result) => result.suppressed).length;
    if (queued || suppressed) {
      logger.info(
        `[Reminder Trigger] Sweep queued=${queued} suppressed=${suppressed}`
      );
    }
  } catch (error) {
    logger.error(`[Reminder Trigger] Sweep failed: ${error.message}`);
  }
};

const startReminderTriggerCron = () => {
  cron.schedule(REMINDER_SWEEP_CRON, runReminderSweep);
  logger.info(`[Reminder Trigger] Cron scheduled: ${REMINDER_SWEEP_CRON}`);
};

module.exports = { runReminderSweep, startReminderTriggerCron };
