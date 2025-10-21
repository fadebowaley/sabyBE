/**
 * Weekly Compliance Checker Job
 *
 * Runs every Sunday at 11:59 PM to check compliance and send reminders
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const {
  eventComplianceService,
  permNotificationService,
} = require('../../services');
const { postgresPool } = require('../../config/postgres');

/**
 * Get current week number and month
 */
const getCurrentWeekInfo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Calculate week number within the month (1-4)
  const firstDay = new Date(year, month - 1, 1);
  const firstSunday =
    firstDay.getDay() === 0
      ? firstDay
      : new Date(
          firstDay.getTime() + (7 - firstDay.getDay()) * 24 * 60 * 60 * 1000
        );
  const weekNumber =
    Math.ceil((now - firstSunday) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return {
    year,
    month: `${year}-${month.toString().padStart(2, '0')}-01`,
    week: Math.min(weekNumber, 4), // Cap at 4 weeks
    dayOfWeek: now.getDay(), // 0 = Sunday
  };
};

/**
 * Find incomplete submissions for the current week
 */
const findIncompleteSubmissions = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      fs.id,
      fs.node_id,
      fs.user_id,
      fs.month,
      fs.year,
      fs.compliance_percentage,
      ect.missing_events,
      u.email as user_email,
      u.firstname as user_name
    FROM form_submissions fs
    LEFT JOIN event_compliance_tracking ect ON fs.id = ect.submission_id
    LEFT JOIN users u ON fs.user_id = u.id
    WHERE fs.tenant_id = $1
      AND fs.project_id = $2
      AND fs.month = $3
      AND fs.perm_enabled = true
      AND (fs.compliance_percentage < 100 OR fs.compliance_percentage IS NULL)
      AND (fs.is_locked = false OR fs.is_locked IS NULL)
    ORDER BY fs.node_id;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error finding incomplete submissions:', error.message);
    throw error;
  }
};

/**
 * Get all active PERM projects
 */
const getActivePERMProjects = async () => {
  const query = `
    SELECT DISTINCT 
      tenant_id,
      project_id,
      project_name
    FROM form_submissions
    WHERE perm_enabled = true
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY tenant_id, project_id;
  `;

  try {
    const result = await postgresPool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting active PERM projects:', error.message);
    throw error;
  }
};

/**
 * Process weekly compliance check for a project
 */
const processProjectCompliance = async (project) => {
  const { tenant_id, project_id, project_name } = project;
  const weekInfo = getCurrentWeekInfo();

  logger.info(
    `🔍 Checking compliance for ${project_name} (${tenant_id}/${project_id}) - Week ${weekInfo.week} of ${weekInfo.month}`
  );

  try {
    // Find incomplete submissions
    const incompleteSubmissions = await findIncompleteSubmissions(
      tenant_id,
      project_id,
      weekInfo.month
    );

    if (incompleteSubmissions.length === 0) {
      logger.info(`✅ All submissions complete for ${project_name}`);
      return { processed: 0, queued: 0 };
    }

    logger.info(
      `📊 Found ${incompleteSubmissions.length} incomplete submissions for ${project_name}`
    );

    // Prepare node data for notifications
    const nodesData = incompleteSubmissions.map((submission) => ({
      tenant_id,
      project_id,
      node_id: submission.node_id,
      user_id: submission.user_id,
      user_email: submission.user_email,
      user_name: submission.user_name,
      missing_count: submission.missing_events
        ? submission.missing_events.length
        : 0,
    }));

    // Queue weekly reminders
    const notifications = await permNotificationService.queueWeeklyReminder(
      nodesData,
      weekInfo.week,
      weekInfo.month
    );

    logger.info(
      `📧 Queued ${notifications.length} weekly reminders for ${project_name}`
    );

    return {
      processed: incompleteSubmissions.length,
      queued: notifications.length,
    };
  } catch (error) {
    logger.error(
      `❌ Error processing compliance for ${project_name}:`,
      error.message
    );
    return { processed: 0, queued: 0, error: error.message };
  }
};

/**
 * Main weekly compliance check function
 */
const runWeeklyComplianceCheck = async () => {
  const startTime = new Date();
  logger.info('🚀 Starting weekly compliance check...');

  try {
    // Get all active PERM projects
    const activeProjects = await getActivePERMProjects();

    if (activeProjects.length === 0) {
      logger.info('ℹ️ No active PERM projects found');
      return;
    }

    logger.info(`📋 Found ${activeProjects.length} active PERM projects`);

    let totalProcessed = 0;
    let totalQueued = 0;
    const errors = [];

    // Process each project
    for (const project of activeProjects) {
      try {
        const result = await processProjectCompliance(project);
        totalProcessed += result.processed;
        totalQueued += result.queued;

        if (result.error) {
          errors.push(`${project.project_name}: ${result.error}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to process ${project.project_name}:`,
          error.message
        );
        errors.push(`${project.project_name}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime.getTime();

    logger.info(`✅ Weekly compliance check completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalProcessed} submissions processed, ${totalQueued} notifications queued`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }
  } catch (error) {
    logger.error('❌ Weekly compliance check failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the weekly compliance checker
 * Runs every Sunday at 11:59 PM
 */
const scheduleWeeklyComplianceCheck = () => {
  // Cron expression: 59 23 * * 0 (Sunday at 11:59 PM)
  const cronExpression = '59 23 * * 0';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Weekly compliance check triggered by cron');
      try {
        await runWeeklyComplianceCheck();
      } catch (error) {
        logger.error('❌ Weekly compliance check failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(
    `📅 Weekly compliance checker scheduled: ${cronExpression} (UTC)`
  );
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerWeeklyComplianceCheck = async () => {
  logger.info('🔧 Manual trigger: Weekly compliance check');
  await runWeeklyComplianceCheck();
};

module.exports = {
  runWeeklyComplianceCheck,
  scheduleWeeklyComplianceCheck,
  triggerWeeklyComplianceCheck,
  getCurrentWeekInfo,
  findIncompleteSubmissions,
  processProjectCompliance,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleWeeklyComplianceCheck();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerWeeklyComplianceCheck();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

/**
 * Weekly Compliance Checker Job
 *
 * Runs every Sunday at 11:59 PM to check compliance and send reminders
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const {
  eventComplianceService,
  permNotificationService,
} = require('../../services');
const { postgresPool } = require('../../config/postgres');

/**
 * Get current week number and month
 */
const getCurrentWeekInfo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Calculate week number within the month (1-4)
  const firstDay = new Date(year, month - 1, 1);
  const firstSunday =
    firstDay.getDay() === 0
      ? firstDay
      : new Date(
          firstDay.getTime() + (7 - firstDay.getDay()) * 24 * 60 * 60 * 1000
        );
  const weekNumber =
    Math.ceil((now - firstSunday) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return {
    year,
    month: `${year}-${month.toString().padStart(2, '0')}-01`,
    week: Math.min(weekNumber, 4), // Cap at 4 weeks
    dayOfWeek: now.getDay(), // 0 = Sunday
  };
};

/**
 * Find incomplete submissions for the current week
 */
const findIncompleteSubmissions = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      fs.id,
      fs.node_id,
      fs.user_id,
      fs.month,
      fs.year,
      fs.compliance_percentage,
      ect.missing_events,
      u.email as user_email,
      u.firstname as user_name
    FROM form_submissions fs
    LEFT JOIN event_compliance_tracking ect ON fs.id = ect.submission_id
    LEFT JOIN users u ON fs.user_id = u.id
    WHERE fs.tenant_id = $1
      AND fs.project_id = $2
      AND fs.month = $3
      AND fs.perm_enabled = true
      AND (fs.compliance_percentage < 100 OR fs.compliance_percentage IS NULL)
      AND (fs.is_locked = false OR fs.is_locked IS NULL)
    ORDER BY fs.node_id;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error finding incomplete submissions:', error.message);
    throw error;
  }
};

/**
 * Get all active PERM projects
 */
const getActivePERMProjects = async () => {
  const query = `
    SELECT DISTINCT 
      tenant_id,
      project_id,
      project_name
    FROM form_submissions
    WHERE perm_enabled = true
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY tenant_id, project_id;
  `;

  try {
    const result = await postgresPool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting active PERM projects:', error.message);
    throw error;
  }
};

/**
 * Process weekly compliance check for a project
 */
const processProjectCompliance = async (project) => {
  const { tenant_id, project_id, project_name } = project;
  const weekInfo = getCurrentWeekInfo();

  logger.info(
    `🔍 Checking compliance for ${project_name} (${tenant_id}/${project_id}) - Week ${weekInfo.week} of ${weekInfo.month}`
  );

  try {
    // Find incomplete submissions
    const incompleteSubmissions = await findIncompleteSubmissions(
      tenant_id,
      project_id,
      weekInfo.month
    );

    if (incompleteSubmissions.length === 0) {
      logger.info(`✅ All submissions complete for ${project_name}`);
      return { processed: 0, queued: 0 };
    }

    logger.info(
      `📊 Found ${incompleteSubmissions.length} incomplete submissions for ${project_name}`
    );

    // Prepare node data for notifications
    const nodesData = incompleteSubmissions.map((submission) => ({
      tenant_id,
      project_id,
      node_id: submission.node_id,
      user_id: submission.user_id,
      user_email: submission.user_email,
      user_name: submission.user_name,
      missing_count: submission.missing_events
        ? submission.missing_events.length
        : 0,
    }));

    // Queue weekly reminders
    const notifications = await permNotificationService.queueWeeklyReminder(
      nodesData,
      weekInfo.week,
      weekInfo.month
    );

    logger.info(
      `📧 Queued ${notifications.length} weekly reminders for ${project_name}`
    );

    return {
      processed: incompleteSubmissions.length,
      queued: notifications.length,
    };
  } catch (error) {
    logger.error(
      `❌ Error processing compliance for ${project_name}:`,
      error.message
    );
    return { processed: 0, queued: 0, error: error.message };
  }
};

/**
 * Main weekly compliance check function
 */
const runWeeklyComplianceCheck = async () => {
  const startTime = new Date();
  logger.info('🚀 Starting weekly compliance check...');

  try {
    // Get all active PERM projects
    const activeProjects = await getActivePERMProjects();

    if (activeProjects.length === 0) {
      logger.info('ℹ️ No active PERM projects found');
      return;
    }

    logger.info(`📋 Found ${activeProjects.length} active PERM projects`);

    let totalProcessed = 0;
    let totalQueued = 0;
    const errors = [];

    // Process each project
    for (const project of activeProjects) {
      try {
        const result = await processProjectCompliance(project);
        totalProcessed += result.processed;
        totalQueued += result.queued;

        if (result.error) {
          errors.push(`${project.project_name}: ${result.error}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to process ${project.project_name}:`,
          error.message
        );
        errors.push(`${project.project_name}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime.getTime();

    logger.info(`✅ Weekly compliance check completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalProcessed} submissions processed, ${totalQueued} notifications queued`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }
  } catch (error) {
    logger.error('❌ Weekly compliance check failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the weekly compliance checker
 * Runs every Sunday at 11:59 PM
 */
const scheduleWeeklyComplianceCheck = () => {
  // Cron expression: 59 23 * * 0 (Sunday at 11:59 PM)
  const cronExpression = '59 23 * * 0';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Weekly compliance check triggered by cron');
      try {
        await runWeeklyComplianceCheck();
      } catch (error) {
        logger.error('❌ Weekly compliance check failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(
    `📅 Weekly compliance checker scheduled: ${cronExpression} (UTC)`
  );
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerWeeklyComplianceCheck = async () => {
  logger.info('🔧 Manual trigger: Weekly compliance check');
  await runWeeklyComplianceCheck();
};

module.exports = {
  runWeeklyComplianceCheck,
  scheduleWeeklyComplianceCheck,
  triggerWeeklyComplianceCheck,
  getCurrentWeekInfo,
  findIncompleteSubmissions,
  processProjectCompliance,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleWeeklyComplianceCheck();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerWeeklyComplianceCheck();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

/**
 * Weekly Compliance Checker Job
 *
 * Runs every Sunday at 11:59 PM to check compliance and send reminders
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const {
  eventComplianceService,
  permNotificationService,
} = require('../../services');
const { postgresPool } = require('../../config/postgres');

/**
 * Get current week number and month
 */
const getCurrentWeekInfo = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // Calculate week number within the month (1-4)
  const firstDay = new Date(year, month - 1, 1);
  const firstSunday =
    firstDay.getDay() === 0
      ? firstDay
      : new Date(
          firstDay.getTime() + (7 - firstDay.getDay()) * 24 * 60 * 60 * 1000
        );
  const weekNumber =
    Math.ceil((now - firstSunday) / (7 * 24 * 60 * 60 * 1000)) + 1;

  return {
    year,
    month: `${year}-${month.toString().padStart(2, '0')}-01`,
    week: Math.min(weekNumber, 4), // Cap at 4 weeks
    dayOfWeek: now.getDay(), // 0 = Sunday
  };
};

/**
 * Find incomplete submissions for the current week
 */
const findIncompleteSubmissions = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      fs.id,
      fs.node_id,
      fs.user_id,
      fs.month,
      fs.year,
      fs.compliance_percentage,
      ect.missing_events,
      u.email as user_email,
      u.firstname as user_name
    FROM form_submissions fs
    LEFT JOIN event_compliance_tracking ect ON fs.id = ect.submission_id
    LEFT JOIN users u ON fs.user_id = u.id
    WHERE fs.tenant_id = $1
      AND fs.project_id = $2
      AND fs.month = $3
      AND fs.perm_enabled = true
      AND (fs.compliance_percentage < 100 OR fs.compliance_percentage IS NULL)
      AND (fs.is_locked = false OR fs.is_locked IS NULL)
    ORDER BY fs.node_id;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error finding incomplete submissions:', error.message);
    throw error;
  }
};

/**
 * Get all active PERM projects
 */
const getActivePERMProjects = async () => {
  const query = `
    SELECT DISTINCT 
      tenant_id,
      project_id,
      project_name
    FROM form_submissions
    WHERE perm_enabled = true
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY tenant_id, project_id;
  `;

  try {
    const result = await postgresPool.query(query);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting active PERM projects:', error.message);
    throw error;
  }
};

/**
 * Process weekly compliance check for a project
 */
const processProjectCompliance = async (project) => {
  const { tenant_id, project_id, project_name } = project;
  const weekInfo = getCurrentWeekInfo();

  logger.info(
    `🔍 Checking compliance for ${project_name} (${tenant_id}/${project_id}) - Week ${weekInfo.week} of ${weekInfo.month}`
  );

  try {
    // Find incomplete submissions
    const incompleteSubmissions = await findIncompleteSubmissions(
      tenant_id,
      project_id,
      weekInfo.month
    );

    if (incompleteSubmissions.length === 0) {
      logger.info(`✅ All submissions complete for ${project_name}`);
      return { processed: 0, queued: 0 };
    }

    logger.info(
      `📊 Found ${incompleteSubmissions.length} incomplete submissions for ${project_name}`
    );

    // Prepare node data for notifications
    const nodesData = incompleteSubmissions.map((submission) => ({
      tenant_id,
      project_id,
      node_id: submission.node_id,
      user_id: submission.user_id,
      user_email: submission.user_email,
      user_name: submission.user_name,
      missing_count: submission.missing_events
        ? submission.missing_events.length
        : 0,
    }));

    // Queue weekly reminders
    const notifications = await permNotificationService.queueWeeklyReminder(
      nodesData,
      weekInfo.week,
      weekInfo.month
    );

    logger.info(
      `📧 Queued ${notifications.length} weekly reminders for ${project_name}`
    );

    return {
      processed: incompleteSubmissions.length,
      queued: notifications.length,
    };
  } catch (error) {
    logger.error(
      `❌ Error processing compliance for ${project_name}:`,
      error.message
    );
    return { processed: 0, queued: 0, error: error.message };
  }
};

/**
 * Main weekly compliance check function
 */
const runWeeklyComplianceCheck = async () => {
  const startTime = new Date();
  logger.info('🚀 Starting weekly compliance check...');

  try {
    // Get all active PERM projects
    const activeProjects = await getActivePERMProjects();

    if (activeProjects.length === 0) {
      logger.info('ℹ️ No active PERM projects found');
      return;
    }

    logger.info(`📋 Found ${activeProjects.length} active PERM projects`);

    let totalProcessed = 0;
    let totalQueued = 0;
    const errors = [];

    // Process each project
    for (const project of activeProjects) {
      try {
        const result = await processProjectCompliance(project);
        totalProcessed += result.processed;
        totalQueued += result.queued;

        if (result.error) {
          errors.push(`${project.project_name}: ${result.error}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to process ${project.project_name}:`,
          error.message
        );
        errors.push(`${project.project_name}: ${error.message}`);
      }
    }

    const duration = Date.now() - startTime.getTime();

    logger.info(`✅ Weekly compliance check completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalProcessed} submissions processed, ${totalQueued} notifications queued`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }
  } catch (error) {
    logger.error('❌ Weekly compliance check failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the weekly compliance checker
 * Runs every Sunday at 11:59 PM
 */
const scheduleWeeklyComplianceCheck = () => {
  // Cron expression: 59 23 * * 0 (Sunday at 11:59 PM)
  const cronExpression = '59 23 * * 0';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Weekly compliance check triggered by cron');
      try {
        await runWeeklyComplianceCheck();
      } catch (error) {
        logger.error('❌ Weekly compliance check failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(
    `📅 Weekly compliance checker scheduled: ${cronExpression} (UTC)`
  );
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerWeeklyComplianceCheck = async () => {
  logger.info('🔧 Manual trigger: Weekly compliance check');
  await runWeeklyComplianceCheck();
};

module.exports = {
  runWeeklyComplianceCheck,
  scheduleWeeklyComplianceCheck,
  triggerWeeklyComplianceCheck,
  getCurrentWeekInfo,
  findIncompleteSubmissions,
  processProjectCompliance,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleWeeklyComplianceCheck();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerWeeklyComplianceCheck();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

