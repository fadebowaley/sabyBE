/**
 * Month-End Processor Job
 *
 * Runs on the 1st of every month at 12:01 AM to lock submissions and generate reports
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
 * Get previous month info
 */
const getPreviousMonthInfo = () => {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    year: previousMonth.getFullYear(),
    month: `${previousMonth.getFullYear()}-${(previousMonth.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-01`,
    monthName: previousMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

/**
 * Get all submissions for a month that need to be locked
 */
const getSubmissionsToLock = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      fs.id,
      fs.node_id,
      fs.user_id,
      fs.compliance_percentage,
      fs.is_locked,
      u.email as user_email,
      u.firstname as user_name
    FROM form_submissions fs
    LEFT JOIN users u ON fs.user_id = u.id
    WHERE fs.tenant_id = $1
      AND fs.project_id = $2
      AND fs.month = $3
      AND fs.perm_enabled = true
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
    logger.error('❌ Error getting submissions to lock:', error.message);
    throw error;
  }
};

/**
 * Lock all submissions for a month
 */
const lockMonthSubmissions = async (
  tenantId,
  projectId,
  month,
  lockedBy = 'system'
) => {
  const query = `
    UPDATE form_submissions
    SET 
      is_locked = true,
      locked_at = NOW(),
      locked_by = $4,
      lock_reason = 'month_end_auto_lock',
      updated_at = NOW()
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3
      AND perm_enabled = true
      AND (is_locked = false OR is_locked IS NULL)
    RETURNING id, node_id, compliance_percentage;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
      lockedBy,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error locking submissions:', error.message);
    throw error;
  }
};

/**
 * Get compliance summary for a month
 */
const getComplianceSummary = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      COUNT(*) as total_nodes,
      COUNT(CASE WHEN compliance_percentage = 100 THEN 1 END) as complete_nodes,
      COUNT(CASE WHEN compliance_percentage > 0 AND compliance_percentage < 100 THEN 1 END) as partial_nodes,
      COUNT(CASE WHEN compliance_percentage = 0 OR compliance_percentage IS NULL THEN 1 END) as incomplete_nodes,
      AVG(COALESCE(compliance_percentage, 0)) as overall_percentage
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3
      AND perm_enabled = true;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error getting compliance summary:', error.message);
    throw error;
  }
};

/**
 * Get project administrators
 */
const getProjectAdministrators = async (tenantId, projectId) => {
  const query = `
    SELECT DISTINCT
      u.id,
      u.email,
      u.firstname,
      u.lastname
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.tenant_id = $1
      AND (r.name = 'admin' OR r.name = 'owner')
    LIMIT 5;
  `;

  try {
    const result = await postgresPool.query(query, [tenantId]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting project administrators:', error.message);
    return [];
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
 * Process month-end for a project
 */
const processProjectMonthEnd = async (project, monthInfo) => {
  const { tenant_id, project_id, project_name } = project;
  const { month, monthName } = monthInfo;

  logger.info(
    `🔒 Processing month-end for ${project_name} (${tenant_id}/${project_id}) - ${monthName}`
  );

  try {
    // Get submissions to lock
    const submissionsToLock = await getSubmissionsToLock(
      tenant_id,
      project_id,
      month
    );

    if (submissionsToLock.length === 0) {
      logger.info(`ℹ️ No submissions to lock for ${project_name}`);
      return { locked: 0, notifications: 0 };
    }

    logger.info(
      `🔒 Locking ${submissionsToLock.length} submissions for ${project_name}`
    );

    // Lock all submissions
    const lockedSubmissions = await lockMonthSubmissions(
      tenant_id,
      project_id,
      month
    );

    logger.info(
      `✅ Locked ${lockedSubmissions.length} submissions for ${project_name}`
    );

    // Get compliance summary
    const summary = await getComplianceSummary(tenant_id, project_id, month);

    // Get administrators for notifications
    const administrators = await getProjectAdministrators(
      tenant_id,
      project_id
    );

    let notificationsQueued = 0;

    // Send month-end summary to administrators
    if (administrators.length > 0) {
      for (const admin of administrators) {
        try {
          await permNotificationService.queueMonthEndSummary(
            tenant_id,
            project_id,
            month,
            summary,
            admin
          );
          notificationsQueued++;
        } catch (notificationError) {
          logger.warn(
            `⚠️ Failed to queue month-end summary for ${admin.email}: ${notificationError.message}`
          );
        }
      }
    }

    logger.info(
      `📧 Queued ${notificationsQueued} month-end summaries for ${project_name}`
    );

    return {
      locked: lockedSubmissions.length,
      notifications: notificationsQueued,
      summary,
    };
  } catch (error) {
    logger.error(
      `❌ Error processing month-end for ${project_name}:`,
      error.message
    );
    return { locked: 0, notifications: 0, error: error.message };
  }
};

/**
 * Main month-end processing function
 */
const runMonthEndProcessing = async () => {
  const startTime = new Date();
  const monthInfo = getPreviousMonthInfo();

  logger.info(`🚀 Starting month-end processing for ${monthInfo.monthName}...`);

  try {
    // Get all active PERM projects
    const activeProjects = await getActivePERMProjects();

    if (activeProjects.length === 0) {
      logger.info('ℹ️ No active PERM projects found');
      return;
    }

    logger.info(`📋 Found ${activeProjects.length} active PERM projects`);

    let totalLocked = 0;
    let totalNotifications = 0;
    const errors = [];

    // Process each project
    for (const project of activeProjects) {
      try {
        const result = await processProjectMonthEnd(project, monthInfo);
        totalLocked += result.locked;
        totalNotifications += result.notifications;

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

    logger.info(`✅ Month-end processing completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalLocked} submissions locked, ${totalNotifications} notifications queued`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }
  } catch (error) {
    logger.error('❌ Month-end processing failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the month-end processor
 * Runs on the 1st of every month at 12:01 AM
 */
const scheduleMonthEndProcessing = () => {
  // Cron expression: 1 0 1 * * (1st of every month at 12:01 AM)
  const cronExpression = '1 0 1 * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Month-end processing triggered by cron');
      try {
        await runMonthEndProcessing();
      } catch (error) {
        logger.error('❌ Month-end processing failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(`📅 Month-end processor scheduled: ${cronExpression} (UTC)`);
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerMonthEndProcessing = async () => {
  logger.info('🔧 Manual trigger: Month-end processing');
  await runMonthEndProcessing();
};

module.exports = {
  runMonthEndProcessing,
  scheduleMonthEndProcessing,
  triggerMonthEndProcessing,
  getPreviousMonthInfo,
  getSubmissionsToLock,
  lockMonthSubmissions,
  getComplianceSummary,
  processProjectMonthEnd,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleMonthEndProcessing();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerMonthEndProcessing();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

/**
 * Month-End Processor Job
 *
 * Runs on the 1st of every month at 12:01 AM to lock submissions and generate reports
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
 * Get previous month info
 */
const getPreviousMonthInfo = () => {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    year: previousMonth.getFullYear(),
    month: `${previousMonth.getFullYear()}-${(previousMonth.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-01`,
    monthName: previousMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

/**
 * Get all submissions for a month that need to be locked
 */
const getSubmissionsToLock = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      fs.id,
      fs.node_id,
      fs.user_id,
      fs.compliance_percentage,
      fs.is_locked,
      u.email as user_email,
      u.firstname as user_name
    FROM form_submissions fs
    LEFT JOIN users u ON fs.user_id = u.id
    WHERE fs.tenant_id = $1
      AND fs.project_id = $2
      AND fs.month = $3
      AND fs.perm_enabled = true
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
    logger.error('❌ Error getting submissions to lock:', error.message);
    throw error;
  }
};

/**
 * Lock all submissions for a month
 */
const lockMonthSubmissions = async (
  tenantId,
  projectId,
  month,
  lockedBy = 'system'
) => {
  const query = `
    UPDATE form_submissions
    SET 
      is_locked = true,
      locked_at = NOW(),
      locked_by = $4,
      lock_reason = 'month_end_auto_lock',
      updated_at = NOW()
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3
      AND perm_enabled = true
      AND (is_locked = false OR is_locked IS NULL)
    RETURNING id, node_id, compliance_percentage;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
      lockedBy,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error locking submissions:', error.message);
    throw error;
  }
};

/**
 * Get compliance summary for a month
 */
const getComplianceSummary = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      COUNT(*) as total_nodes,
      COUNT(CASE WHEN compliance_percentage = 100 THEN 1 END) as complete_nodes,
      COUNT(CASE WHEN compliance_percentage > 0 AND compliance_percentage < 100 THEN 1 END) as partial_nodes,
      COUNT(CASE WHEN compliance_percentage = 0 OR compliance_percentage IS NULL THEN 1 END) as incomplete_nodes,
      AVG(COALESCE(compliance_percentage, 0)) as overall_percentage
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3
      AND perm_enabled = true;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error getting compliance summary:', error.message);
    throw error;
  }
};

/**
 * Get project administrators
 */
const getProjectAdministrators = async (tenantId, projectId) => {
  const query = `
    SELECT DISTINCT
      u.id,
      u.email,
      u.firstname,
      u.lastname
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.tenant_id = $1
      AND (r.name = 'admin' OR r.name = 'owner')
    LIMIT 5;
  `;

  try {
    const result = await postgresPool.query(query, [tenantId]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting project administrators:', error.message);
    return [];
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
 * Process month-end for a project
 */
const processProjectMonthEnd = async (project, monthInfo) => {
  const { tenant_id, project_id, project_name } = project;
  const { month, monthName } = monthInfo;

  logger.info(
    `🔒 Processing month-end for ${project_name} (${tenant_id}/${project_id}) - ${monthName}`
  );

  try {
    // Get submissions to lock
    const submissionsToLock = await getSubmissionsToLock(
      tenant_id,
      project_id,
      month
    );

    if (submissionsToLock.length === 0) {
      logger.info(`ℹ️ No submissions to lock for ${project_name}`);
      return { locked: 0, notifications: 0 };
    }

    logger.info(
      `🔒 Locking ${submissionsToLock.length} submissions for ${project_name}`
    );

    // Lock all submissions
    const lockedSubmissions = await lockMonthSubmissions(
      tenant_id,
      project_id,
      month
    );

    logger.info(
      `✅ Locked ${lockedSubmissions.length} submissions for ${project_name}`
    );

    // Get compliance summary
    const summary = await getComplianceSummary(tenant_id, project_id, month);

    // Get administrators for notifications
    const administrators = await getProjectAdministrators(
      tenant_id,
      project_id
    );

    let notificationsQueued = 0;

    // Send month-end summary to administrators
    if (administrators.length > 0) {
      for (const admin of administrators) {
        try {
          await permNotificationService.queueMonthEndSummary(
            tenant_id,
            project_id,
            month,
            summary,
            admin
          );
          notificationsQueued++;
        } catch (notificationError) {
          logger.warn(
            `⚠️ Failed to queue month-end summary for ${admin.email}: ${notificationError.message}`
          );
        }
      }
    }

    logger.info(
      `📧 Queued ${notificationsQueued} month-end summaries for ${project_name}`
    );

    return {
      locked: lockedSubmissions.length,
      notifications: notificationsQueued,
      summary,
    };
  } catch (error) {
    logger.error(
      `❌ Error processing month-end for ${project_name}:`,
      error.message
    );
    return { locked: 0, notifications: 0, error: error.message };
  }
};

/**
 * Main month-end processing function
 */
const runMonthEndProcessing = async () => {
  const startTime = new Date();
  const monthInfo = getPreviousMonthInfo();

  logger.info(`🚀 Starting month-end processing for ${monthInfo.monthName}...`);

  try {
    // Get all active PERM projects
    const activeProjects = await getActivePERMProjects();

    if (activeProjects.length === 0) {
      logger.info('ℹ️ No active PERM projects found');
      return;
    }

    logger.info(`📋 Found ${activeProjects.length} active PERM projects`);

    let totalLocked = 0;
    let totalNotifications = 0;
    const errors = [];

    // Process each project
    for (const project of activeProjects) {
      try {
        const result = await processProjectMonthEnd(project, monthInfo);
        totalLocked += result.locked;
        totalNotifications += result.notifications;

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

    logger.info(`✅ Month-end processing completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalLocked} submissions locked, ${totalNotifications} notifications queued`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }
  } catch (error) {
    logger.error('❌ Month-end processing failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the month-end processor
 * Runs on the 1st of every month at 12:01 AM
 */
const scheduleMonthEndProcessing = () => {
  // Cron expression: 1 0 1 * * (1st of every month at 12:01 AM)
  const cronExpression = '1 0 1 * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Month-end processing triggered by cron');
      try {
        await runMonthEndProcessing();
      } catch (error) {
        logger.error('❌ Month-end processing failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(`📅 Month-end processor scheduled: ${cronExpression} (UTC)`);
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerMonthEndProcessing = async () => {
  logger.info('🔧 Manual trigger: Month-end processing');
  await runMonthEndProcessing();
};

module.exports = {
  runMonthEndProcessing,
  scheduleMonthEndProcessing,
  triggerMonthEndProcessing,
  getPreviousMonthInfo,
  getSubmissionsToLock,
  lockMonthSubmissions,
  getComplianceSummary,
  processProjectMonthEnd,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleMonthEndProcessing();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerMonthEndProcessing();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

/**
 * Month-End Processor Job
 *
 * Runs on the 1st of every month at 12:01 AM to lock submissions and generate reports
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
 * Get previous month info
 */
const getPreviousMonthInfo = () => {
  const now = new Date();
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  return {
    year: previousMonth.getFullYear(),
    month: `${previousMonth.getFullYear()}-${(previousMonth.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-01`,
    monthName: previousMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

/**
 * Get all submissions for a month that need to be locked
 */
const getSubmissionsToLock = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      fs.id,
      fs.node_id,
      fs.user_id,
      fs.compliance_percentage,
      fs.is_locked,
      u.email as user_email,
      u.firstname as user_name
    FROM form_submissions fs
    LEFT JOIN users u ON fs.user_id = u.id
    WHERE fs.tenant_id = $1
      AND fs.project_id = $2
      AND fs.month = $3
      AND fs.perm_enabled = true
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
    logger.error('❌ Error getting submissions to lock:', error.message);
    throw error;
  }
};

/**
 * Lock all submissions for a month
 */
const lockMonthSubmissions = async (
  tenantId,
  projectId,
  month,
  lockedBy = 'system'
) => {
  const query = `
    UPDATE form_submissions
    SET 
      is_locked = true,
      locked_at = NOW(),
      locked_by = $4,
      lock_reason = 'month_end_auto_lock',
      updated_at = NOW()
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3
      AND perm_enabled = true
      AND (is_locked = false OR is_locked IS NULL)
    RETURNING id, node_id, compliance_percentage;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
      lockedBy,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error locking submissions:', error.message);
    throw error;
  }
};

/**
 * Get compliance summary for a month
 */
const getComplianceSummary = async (tenantId, projectId, month) => {
  const query = `
    SELECT 
      COUNT(*) as total_nodes,
      COUNT(CASE WHEN compliance_percentage = 100 THEN 1 END) as complete_nodes,
      COUNT(CASE WHEN compliance_percentage > 0 AND compliance_percentage < 100 THEN 1 END) as partial_nodes,
      COUNT(CASE WHEN compliance_percentage = 0 OR compliance_percentage IS NULL THEN 1 END) as incomplete_nodes,
      AVG(COALESCE(compliance_percentage, 0)) as overall_percentage
    FROM form_submissions
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3
      AND perm_enabled = true;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error getting compliance summary:', error.message);
    throw error;
  }
};

/**
 * Get project administrators
 */
const getProjectAdministrators = async (tenantId, projectId) => {
  const query = `
    SELECT DISTINCT
      u.id,
      u.email,
      u.firstname,
      u.lastname
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE u.tenant_id = $1
      AND (r.name = 'admin' OR r.name = 'owner')
    LIMIT 5;
  `;

  try {
    const result = await postgresPool.query(query, [tenantId]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting project administrators:', error.message);
    return [];
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
 * Process month-end for a project
 */
const processProjectMonthEnd = async (project, monthInfo) => {
  const { tenant_id, project_id, project_name } = project;
  const { month, monthName } = monthInfo;

  logger.info(
    `🔒 Processing month-end for ${project_name} (${tenant_id}/${project_id}) - ${monthName}`
  );

  try {
    // Get submissions to lock
    const submissionsToLock = await getSubmissionsToLock(
      tenant_id,
      project_id,
      month
    );

    if (submissionsToLock.length === 0) {
      logger.info(`ℹ️ No submissions to lock for ${project_name}`);
      return { locked: 0, notifications: 0 };
    }

    logger.info(
      `🔒 Locking ${submissionsToLock.length} submissions for ${project_name}`
    );

    // Lock all submissions
    const lockedSubmissions = await lockMonthSubmissions(
      tenant_id,
      project_id,
      month
    );

    logger.info(
      `✅ Locked ${lockedSubmissions.length} submissions for ${project_name}`
    );

    // Get compliance summary
    const summary = await getComplianceSummary(tenant_id, project_id, month);

    // Get administrators for notifications
    const administrators = await getProjectAdministrators(
      tenant_id,
      project_id
    );

    let notificationsQueued = 0;

    // Send month-end summary to administrators
    if (administrators.length > 0) {
      for (const admin of administrators) {
        try {
          await permNotificationService.queueMonthEndSummary(
            tenant_id,
            project_id,
            month,
            summary,
            admin
          );
          notificationsQueued++;
        } catch (notificationError) {
          logger.warn(
            `⚠️ Failed to queue month-end summary for ${admin.email}: ${notificationError.message}`
          );
        }
      }
    }

    logger.info(
      `📧 Queued ${notificationsQueued} month-end summaries for ${project_name}`
    );

    return {
      locked: lockedSubmissions.length,
      notifications: notificationsQueued,
      summary,
    };
  } catch (error) {
    logger.error(
      `❌ Error processing month-end for ${project_name}:`,
      error.message
    );
    return { locked: 0, notifications: 0, error: error.message };
  }
};

/**
 * Main month-end processing function
 */
const runMonthEndProcessing = async () => {
  const startTime = new Date();
  const monthInfo = getPreviousMonthInfo();

  logger.info(`🚀 Starting month-end processing for ${monthInfo.monthName}...`);

  try {
    // Get all active PERM projects
    const activeProjects = await getActivePERMProjects();

    if (activeProjects.length === 0) {
      logger.info('ℹ️ No active PERM projects found');
      return;
    }

    logger.info(`📋 Found ${activeProjects.length} active PERM projects`);

    let totalLocked = 0;
    let totalNotifications = 0;
    const errors = [];

    // Process each project
    for (const project of activeProjects) {
      try {
        const result = await processProjectMonthEnd(project, monthInfo);
        totalLocked += result.locked;
        totalNotifications += result.notifications;

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

    logger.info(`✅ Month-end processing completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalLocked} submissions locked, ${totalNotifications} notifications queued`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }
  } catch (error) {
    logger.error('❌ Month-end processing failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the month-end processor
 * Runs on the 1st of every month at 12:01 AM
 */
const scheduleMonthEndProcessing = () => {
  // Cron expression: 1 0 1 * * (1st of every month at 12:01 AM)
  const cronExpression = '1 0 1 * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Month-end processing triggered by cron');
      try {
        await runMonthEndProcessing();
      } catch (error) {
        logger.error('❌ Month-end processing failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(`📅 Month-end processor scheduled: ${cronExpression} (UTC)`);
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerMonthEndProcessing = async () => {
  logger.info('🔧 Manual trigger: Month-end processing');
  await runMonthEndProcessing();
};

module.exports = {
  runMonthEndProcessing,
  scheduleMonthEndProcessing,
  triggerMonthEndProcessing,
  getPreviousMonthInfo,
  getSubmissionsToLock,
  lockMonthSubmissions,
  getComplianceSummary,
  processProjectMonthEnd,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleMonthEndProcessing();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerMonthEndProcessing();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

