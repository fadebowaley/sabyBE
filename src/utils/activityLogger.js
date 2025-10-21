const { postgresPool } = require('../config/postgres');
const { emitActivityUpdate } = require('../config/socket');
const logger = require('../config/logger');

/**
 * Log submission activity and emit real-time updates
 * @param {Object} activityData - Activity details
 * @param {string} activityData.tenant_id - Tenant identifier
 * @param {string} activityData.project_id - Project identifier
 * @param {string} activityData.project_name - Project name
 * @param {string} activityData.project_category - Project category
 * @param {string} activityData.form_id - Form identifier
 * @param {string} activityData.node_id - Node identifier (optional)
 * @param {string} activityData.user_id - User identifier (optional)
 * @param {string} activityData.action - Action performed (queued, processing, success, failed, retried)
 * @param {string} activityData.status - Current status
 * @param {string} activityData.job_id - Job identifier
 * @param {string} activityData.message - Activity message
 * @returns {Promise<void>}
 */
const logActivity = async (activityData) => {
  const {
    tenant_id,
    project_id,
    project_name,
    project_category,
    form_id,
    node_id,
    user_id,
    action,
    status,
    job_id,
    message,
  } = activityData;

  try {
    await postgresPool.query(
      `INSERT INTO submission_activity_log 
       (tenant_id, project_id, project_name, project_category, form_id, node_id, user_id, action, status, job_id, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        tenant_id,
        project_id,
        project_name,
        project_category,
        form_id,
        node_id,
        user_id,
        action,
        status,
        job_id,
        message,
      ]
    );

    // Emit real-time update via Socket.IO
    if (tenant_id) {
      emitActivityUpdate(tenant_id, {
        ...activityData,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(
      `[Activity] ${action} - ${status} - Job: ${job_id} - ${message}`
    );
  } catch (error) {
    logger.error('[Activity] Failed to log activity:', error);
    // Don't throw - logging failure shouldn't break submission
  }
};

module.exports = { logActivity };

