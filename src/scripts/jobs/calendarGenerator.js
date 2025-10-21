/**
 * Calendar Auto-Generator Job
 *
 * Runs on the 25th of every month to generate calendars for the next month
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { eventCalendarService } = require('../../services');
const { postgresPool } = require('../../config/postgres');
const { ProjectForm } = require('../../models');

/**
 * Get next month info
 */
const getNextMonthInfo = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    year: nextMonth.getFullYear(),
    month: `${nextMonth.getFullYear()}-${(nextMonth.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-01`,
    monthName: nextMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

/**
 * Get all projects with PERM enabled
 */
const getPERMEnabledProjects = async () => {
  try {
    const projects = await ProjectForm.find({
      'permConfig.enabled': true,
      deletedAt: null,
    }).select('projectId tenantId projectName permConfig');

    return projects;
  } catch (error) {
    logger.error('❌ Error getting PERM-enabled projects:', error.message);
    throw error;
  }
};

/**
 * Check if calendar already exists for a month
 */
const calendarExists = async (tenantId, projectId, month) => {
  const query = `
    SELECT COUNT(*) as count
    FROM event_calendar
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error('❌ Error checking calendar existence:', error.message);
    return false;
  }
};

/**
 * Generate calendar for a project
 */
const generateProjectCalendar = async (project, monthInfo) => {
  const { projectId, tenantId, projectName, permConfig } = project;
  const { month, monthName } = monthInfo;

  logger.info(
    `📅 Generating calendar for ${projectName} (${tenantId}/${projectId}) - ${monthName}`
  );

  try {
    // Check if calendar already exists
    const exists = await calendarExists(tenantId, projectId, month);

    if (exists) {
      logger.info(
        `ℹ️ Calendar already exists for ${projectName} - ${monthName}`
      );
      return { generated: 0, skipped: 1 };
    }

    // Extract event types from permConfig
    const eventTypes = permConfig?.eventCalendar?.eventTypes || [];

    if (eventTypes.length === 0) {
      logger.warn(`⚠️ No event types configured for ${projectName}`);
      return { generated: 0, skipped: 1, reason: 'No event types configured' };
    }

    logger.info(`📋 Found ${eventTypes.length} event types for ${projectName}`);

    // Generate calendar
    const result = await eventCalendarService.generateCalendar(
      tenantId,
      projectId,
      month,
      eventTypes
    );

    logger.info(
      `✅ Generated ${result.count} calendar entries for ${projectName}`
    );

    return {
      generated: result.count,
      skipped: 0,
      eventTypes: eventTypes.length,
    };
  } catch (error) {
    logger.error(
      `❌ Error generating calendar for ${projectName}:`,
      error.message
    );
    return { generated: 0, skipped: 0, error: error.message };
  }
};

/**
 * Get calendar generation statistics
 */
const getCalendarStats = async (month) => {
  const query = `
    SELECT 
      COUNT(DISTINCT tenant_id) as tenants,
      COUNT(DISTINCT project_id) as projects,
      COUNT(*) as total_entries
    FROM event_calendar
    WHERE month = $1;
  `;

  try {
    const result = await postgresPool.query(query, [month]);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error getting calendar stats:', error.message);
    return { tenants: 0, projects: 0, total_entries: 0 };
  }
};

/**
 * Main calendar generation function
 */
const runCalendarGeneration = async () => {
  const startTime = new Date();
  const monthInfo = getNextMonthInfo();

  logger.info(`🚀 Starting calendar generation for ${monthInfo.monthName}...`);

  try {
    // Get all PERM-enabled projects
    const permProjects = await getPERMEnabledProjects();

    if (permProjects.length === 0) {
      logger.info('ℹ️ No PERM-enabled projects found');
      return;
    }

    logger.info(`📋 Found ${permProjects.length} PERM-enabled projects`);

    let totalGenerated = 0;
    let totalSkipped = 0;
    const errors = [];
    const results = [];

    // Process each project
    for (const project of permProjects) {
      try {
        const result = await generateProjectCalendar(project, monthInfo);
        totalGenerated += result.generated;
        totalSkipped += result.skipped;

        results.push({
          project: project.projectName,
          tenant: project.tenantId,
          ...result,
        });

        if (result.error) {
          errors.push(`${project.projectName}: ${result.error}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to process ${project.projectName}:`,
          error.message
        );
        errors.push(`${project.projectName}: ${error.message}`);
      }
    }

    // Get final statistics
    const stats = await getCalendarStats(monthInfo.month);
    const duration = Date.now() - startTime.getTime();

    logger.info(`✅ Calendar generation completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalGenerated} entries generated, ${totalSkipped} projects skipped`
    );
    logger.info(
      `📈 Final stats: ${stats.tenants} tenants, ${stats.projects} projects, ${stats.total_entries} total entries`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }

    // Log detailed results
    results.forEach((result) => {
      if (result.generated > 0) {
        logger.info(
          `✅ ${result.project}: ${result.generated} entries generated`
        );
      } else if (result.skipped > 0) {
        logger.info(
          `⏭️ ${result.project}: Skipped (${result.reason || 'already exists'})`
        );
      }
    });
  } catch (error) {
    logger.error('❌ Calendar generation failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the calendar generator
 * Runs on the 25th of every month at 2:00 AM
 */
const scheduleCalendarGeneration = () => {
  // Cron expression: 0 2 25 * * (25th of every month at 2:00 AM)
  const cronExpression = '0 2 25 * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Calendar generation triggered by cron');
      try {
        await runCalendarGeneration();
      } catch (error) {
        logger.error('❌ Calendar generation failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(`📅 Calendar generator scheduled: ${cronExpression} (UTC)`);
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerCalendarGeneration = async () => {
  logger.info('🔧 Manual trigger: Calendar generation');
  await runCalendarGeneration();
};

/**
 * Generate calendar for specific project (manual)
 */
const generateProjectCalendarManual = async (tenantId, projectId, month) => {
  try {
    const project = await ProjectForm.findOne({
      projectId,
      tenantId,
      'permConfig.enabled': true,
      deletedAt: null,
    }).select('projectName permConfig');

    if (!project) {
      throw new Error(
        `PERM-enabled project not found: ${tenantId}/${projectId}`
      );
    }

    const monthInfo = {
      month,
      monthName: new Date(month).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
    };
    const result = await generateProjectCalendar(project, monthInfo);

    return result;
  } catch (error) {
    logger.error('❌ Manual calendar generation failed:', error.message);
    throw error;
  }
};

module.exports = {
  runCalendarGeneration,
  scheduleCalendarGeneration,
  triggerCalendarGeneration,
  generateProjectCalendarManual,
  getNextMonthInfo,
  getPERMEnabledProjects,
  calendarExists,
  generateProjectCalendar,
  getCalendarStats,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleCalendarGeneration();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerCalendarGeneration();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

/**
 * Calendar Auto-Generator Job
 *
 * Runs on the 25th of every month to generate calendars for the next month
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { eventCalendarService } = require('../../services');
const { postgresPool } = require('../../config/postgres');
const { ProjectForm } = require('../../models');

/**
 * Get next month info
 */
const getNextMonthInfo = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    year: nextMonth.getFullYear(),
    month: `${nextMonth.getFullYear()}-${(nextMonth.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-01`,
    monthName: nextMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

/**
 * Get all projects with PERM enabled
 */
const getPERMEnabledProjects = async () => {
  try {
    const projects = await ProjectForm.find({
      'permConfig.enabled': true,
      deletedAt: null,
    }).select('projectId tenantId projectName permConfig');

    return projects;
  } catch (error) {
    logger.error('❌ Error getting PERM-enabled projects:', error.message);
    throw error;
  }
};

/**
 * Check if calendar already exists for a month
 */
const calendarExists = async (tenantId, projectId, month) => {
  const query = `
    SELECT COUNT(*) as count
    FROM event_calendar
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error('❌ Error checking calendar existence:', error.message);
    return false;
  }
};

/**
 * Generate calendar for a project
 */
const generateProjectCalendar = async (project, monthInfo) => {
  const { projectId, tenantId, projectName, permConfig } = project;
  const { month, monthName } = monthInfo;

  logger.info(
    `📅 Generating calendar for ${projectName} (${tenantId}/${projectId}) - ${monthName}`
  );

  try {
    // Check if calendar already exists
    const exists = await calendarExists(tenantId, projectId, month);

    if (exists) {
      logger.info(
        `ℹ️ Calendar already exists for ${projectName} - ${monthName}`
      );
      return { generated: 0, skipped: 1 };
    }

    // Extract event types from permConfig
    const eventTypes = permConfig?.eventCalendar?.eventTypes || [];

    if (eventTypes.length === 0) {
      logger.warn(`⚠️ No event types configured for ${projectName}`);
      return { generated: 0, skipped: 1, reason: 'No event types configured' };
    }

    logger.info(`📋 Found ${eventTypes.length} event types for ${projectName}`);

    // Generate calendar
    const result = await eventCalendarService.generateCalendar(
      tenantId,
      projectId,
      month,
      eventTypes
    );

    logger.info(
      `✅ Generated ${result.count} calendar entries for ${projectName}`
    );

    return {
      generated: result.count,
      skipped: 0,
      eventTypes: eventTypes.length,
    };
  } catch (error) {
    logger.error(
      `❌ Error generating calendar for ${projectName}:`,
      error.message
    );
    return { generated: 0, skipped: 0, error: error.message };
  }
};

/**
 * Get calendar generation statistics
 */
const getCalendarStats = async (month) => {
  const query = `
    SELECT 
      COUNT(DISTINCT tenant_id) as tenants,
      COUNT(DISTINCT project_id) as projects,
      COUNT(*) as total_entries
    FROM event_calendar
    WHERE month = $1;
  `;

  try {
    const result = await postgresPool.query(query, [month]);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error getting calendar stats:', error.message);
    return { tenants: 0, projects: 0, total_entries: 0 };
  }
};

/**
 * Main calendar generation function
 */
const runCalendarGeneration = async () => {
  const startTime = new Date();
  const monthInfo = getNextMonthInfo();

  logger.info(`🚀 Starting calendar generation for ${monthInfo.monthName}...`);

  try {
    // Get all PERM-enabled projects
    const permProjects = await getPERMEnabledProjects();

    if (permProjects.length === 0) {
      logger.info('ℹ️ No PERM-enabled projects found');
      return;
    }

    logger.info(`📋 Found ${permProjects.length} PERM-enabled projects`);

    let totalGenerated = 0;
    let totalSkipped = 0;
    const errors = [];
    const results = [];

    // Process each project
    for (const project of permProjects) {
      try {
        const result = await generateProjectCalendar(project, monthInfo);
        totalGenerated += result.generated;
        totalSkipped += result.skipped;

        results.push({
          project: project.projectName,
          tenant: project.tenantId,
          ...result,
        });

        if (result.error) {
          errors.push(`${project.projectName}: ${result.error}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to process ${project.projectName}:`,
          error.message
        );
        errors.push(`${project.projectName}: ${error.message}`);
      }
    }

    // Get final statistics
    const stats = await getCalendarStats(monthInfo.month);
    const duration = Date.now() - startTime.getTime();

    logger.info(`✅ Calendar generation completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalGenerated} entries generated, ${totalSkipped} projects skipped`
    );
    logger.info(
      `📈 Final stats: ${stats.tenants} tenants, ${stats.projects} projects, ${stats.total_entries} total entries`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }

    // Log detailed results
    results.forEach((result) => {
      if (result.generated > 0) {
        logger.info(
          `✅ ${result.project}: ${result.generated} entries generated`
        );
      } else if (result.skipped > 0) {
        logger.info(
          `⏭️ ${result.project}: Skipped (${result.reason || 'already exists'})`
        );
      }
    });
  } catch (error) {
    logger.error('❌ Calendar generation failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the calendar generator
 * Runs on the 25th of every month at 2:00 AM
 */
const scheduleCalendarGeneration = () => {
  // Cron expression: 0 2 25 * * (25th of every month at 2:00 AM)
  const cronExpression = '0 2 25 * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Calendar generation triggered by cron');
      try {
        await runCalendarGeneration();
      } catch (error) {
        logger.error('❌ Calendar generation failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(`📅 Calendar generator scheduled: ${cronExpression} (UTC)`);
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerCalendarGeneration = async () => {
  logger.info('🔧 Manual trigger: Calendar generation');
  await runCalendarGeneration();
};

/**
 * Generate calendar for specific project (manual)
 */
const generateProjectCalendarManual = async (tenantId, projectId, month) => {
  try {
    const project = await ProjectForm.findOne({
      projectId,
      tenantId,
      'permConfig.enabled': true,
      deletedAt: null,
    }).select('projectName permConfig');

    if (!project) {
      throw new Error(
        `PERM-enabled project not found: ${tenantId}/${projectId}`
      );
    }

    const monthInfo = {
      month,
      monthName: new Date(month).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
    };
    const result = await generateProjectCalendar(project, monthInfo);

    return result;
  } catch (error) {
    logger.error('❌ Manual calendar generation failed:', error.message);
    throw error;
  }
};

module.exports = {
  runCalendarGeneration,
  scheduleCalendarGeneration,
  triggerCalendarGeneration,
  generateProjectCalendarManual,
  getNextMonthInfo,
  getPERMEnabledProjects,
  calendarExists,
  generateProjectCalendar,
  getCalendarStats,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleCalendarGeneration();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerCalendarGeneration();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

/**
 * Calendar Auto-Generator Job
 *
 * Runs on the 25th of every month to generate calendars for the next month
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const cron = require('node-cron');
const logger = require('../../config/logger');
const { eventCalendarService } = require('../../services');
const { postgresPool } = require('../../config/postgres');
const { ProjectForm } = require('../../models');

/**
 * Get next month info
 */
const getNextMonthInfo = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    year: nextMonth.getFullYear(),
    month: `${nextMonth.getFullYear()}-${(nextMonth.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-01`,
    monthName: nextMonth.toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
  };
};

/**
 * Get all projects with PERM enabled
 */
const getPERMEnabledProjects = async () => {
  try {
    const projects = await ProjectForm.find({
      'permConfig.enabled': true,
      deletedAt: null,
    }).select('projectId tenantId projectName permConfig');

    return projects;
  } catch (error) {
    logger.error('❌ Error getting PERM-enabled projects:', error.message);
    throw error;
  }
};

/**
 * Check if calendar already exists for a month
 */
const calendarExists = async (tenantId, projectId, month) => {
  const query = `
    SELECT COUNT(*) as count
    FROM event_calendar
    WHERE tenant_id = $1
      AND project_id = $2
      AND month = $3;
  `;

  try {
    const result = await postgresPool.query(query, [
      tenantId,
      projectId,
      month,
    ]);
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error('❌ Error checking calendar existence:', error.message);
    return false;
  }
};

/**
 * Generate calendar for a project
 */
const generateProjectCalendar = async (project, monthInfo) => {
  const { projectId, tenantId, projectName, permConfig } = project;
  const { month, monthName } = monthInfo;

  logger.info(
    `📅 Generating calendar for ${projectName} (${tenantId}/${projectId}) - ${monthName}`
  );

  try {
    // Check if calendar already exists
    const exists = await calendarExists(tenantId, projectId, month);

    if (exists) {
      logger.info(
        `ℹ️ Calendar already exists for ${projectName} - ${monthName}`
      );
      return { generated: 0, skipped: 1 };
    }

    // Extract event types from permConfig
    const eventTypes = permConfig?.eventCalendar?.eventTypes || [];

    if (eventTypes.length === 0) {
      logger.warn(`⚠️ No event types configured for ${projectName}`);
      return { generated: 0, skipped: 1, reason: 'No event types configured' };
    }

    logger.info(`📋 Found ${eventTypes.length} event types for ${projectName}`);

    // Generate calendar
    const result = await eventCalendarService.generateCalendar(
      tenantId,
      projectId,
      month,
      eventTypes
    );

    logger.info(
      `✅ Generated ${result.count} calendar entries for ${projectName}`
    );

    return {
      generated: result.count,
      skipped: 0,
      eventTypes: eventTypes.length,
    };
  } catch (error) {
    logger.error(
      `❌ Error generating calendar for ${projectName}:`,
      error.message
    );
    return { generated: 0, skipped: 0, error: error.message };
  }
};

/**
 * Get calendar generation statistics
 */
const getCalendarStats = async (month) => {
  const query = `
    SELECT 
      COUNT(DISTINCT tenant_id) as tenants,
      COUNT(DISTINCT project_id) as projects,
      COUNT(*) as total_entries
    FROM event_calendar
    WHERE month = $1;
  `;

  try {
    const result = await postgresPool.query(query, [month]);
    return result.rows[0];
  } catch (error) {
    logger.error('❌ Error getting calendar stats:', error.message);
    return { tenants: 0, projects: 0, total_entries: 0 };
  }
};

/**
 * Main calendar generation function
 */
const runCalendarGeneration = async () => {
  const startTime = new Date();
  const monthInfo = getNextMonthInfo();

  logger.info(`🚀 Starting calendar generation for ${monthInfo.monthName}...`);

  try {
    // Get all PERM-enabled projects
    const permProjects = await getPERMEnabledProjects();

    if (permProjects.length === 0) {
      logger.info('ℹ️ No PERM-enabled projects found');
      return;
    }

    logger.info(`📋 Found ${permProjects.length} PERM-enabled projects`);

    let totalGenerated = 0;
    let totalSkipped = 0;
    const errors = [];
    const results = [];

    // Process each project
    for (const project of permProjects) {
      try {
        const result = await generateProjectCalendar(project, monthInfo);
        totalGenerated += result.generated;
        totalSkipped += result.skipped;

        results.push({
          project: project.projectName,
          tenant: project.tenantId,
          ...result,
        });

        if (result.error) {
          errors.push(`${project.projectName}: ${result.error}`);
        }
      } catch (error) {
        logger.error(
          `❌ Failed to process ${project.projectName}:`,
          error.message
        );
        errors.push(`${project.projectName}: ${error.message}`);
      }
    }

    // Get final statistics
    const stats = await getCalendarStats(monthInfo.month);
    const duration = Date.now() - startTime.getTime();

    logger.info(`✅ Calendar generation completed in ${duration}ms`);
    logger.info(
      `📊 Summary: ${totalGenerated} entries generated, ${totalSkipped} projects skipped`
    );
    logger.info(
      `📈 Final stats: ${stats.tenants} tenants, ${stats.projects} projects, ${stats.total_entries} total entries`
    );

    if (errors.length > 0) {
      logger.warn(`⚠️ Errors encountered: ${errors.join(', ')}`);
    }

    // Log detailed results
    results.forEach((result) => {
      if (result.generated > 0) {
        logger.info(
          `✅ ${result.project}: ${result.generated} entries generated`
        );
      } else if (result.skipped > 0) {
        logger.info(
          `⏭️ ${result.project}: Skipped (${result.reason || 'already exists'})`
        );
      }
    });
  } catch (error) {
    logger.error('❌ Calendar generation failed:', error.message);
    throw error;
  }
};

/**
 * Schedule the calendar generator
 * Runs on the 25th of every month at 2:00 AM
 */
const scheduleCalendarGeneration = () => {
  // Cron expression: 0 2 25 * * (25th of every month at 2:00 AM)
  const cronExpression = '0 2 25 * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('⏰ Calendar generation triggered by cron');
      try {
        await runCalendarGeneration();
      } catch (error) {
        logger.error('❌ Calendar generation failed:', error.message);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );

  logger.info(`📅 Calendar generator scheduled: ${cronExpression} (UTC)`);
  return task;
};

/**
 * Manual trigger for testing
 */
const triggerCalendarGeneration = async () => {
  logger.info('🔧 Manual trigger: Calendar generation');
  await runCalendarGeneration();
};

/**
 * Generate calendar for specific project (manual)
 */
const generateProjectCalendarManual = async (tenantId, projectId, month) => {
  try {
    const project = await ProjectForm.findOne({
      projectId,
      tenantId,
      'permConfig.enabled': true,
      deletedAt: null,
    }).select('projectName permConfig');

    if (!project) {
      throw new Error(
        `PERM-enabled project not found: ${tenantId}/${projectId}`
      );
    }

    const monthInfo = {
      month,
      monthName: new Date(month).toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
    };
    const result = await generateProjectCalendar(project, monthInfo);

    return result;
  } catch (error) {
    logger.error('❌ Manual calendar generation failed:', error.message);
    throw error;
  }
};

module.exports = {
  runCalendarGeneration,
  scheduleCalendarGeneration,
  triggerCalendarGeneration,
  generateProjectCalendarManual,
  getNextMonthInfo,
  getPERMEnabledProjects,
  calendarExists,
  generateProjectCalendar,
  getCalendarStats,
};

// Auto-start if this file is run directly
if (require.main === module) {
  scheduleCalendarGeneration();

  // Also run immediately for testing
  setTimeout(async () => {
    try {
      await triggerCalendarGeneration();
    } catch (error) {
      logger.error('❌ Manual trigger failed:', error.message);
      process.exit(1);
    }
  }, 2000);
}

