/**
 * Activity Log Model
 *
 * Purpose: CRUD operations for submission_activity_log table
 * Author: Saby Backend Team
 * Date: 2025-10-20
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

class ActivityLog {
  /**
   * Get all activity logs with pagination
   */
  async getAllActivityLogs(limit = 100, offset = 0) {
    const query = `
      SELECT * FROM submission_activity_log
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    try {
      const result = await postgresPool.query(query, [limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching all activity logs:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs by filters
   */
  async getActivityLogsByFilter(filters = {}) {
    const {
      tenant_id,
      project_id,
      form_id,
      user_id,
      node_id,
      action,
      status,
      job_id,
      start_date,
      end_date,
      limit = 100,
      offset = 0,
    } = filters;

    let query = `
      SELECT * FROM submission_activity_log
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }
    if (project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      values.push(project_id);
    }
    if (form_id) {
      query += ` AND form_id = $${paramIndex++}`;
      values.push(form_id);
    }
    if (user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(user_id);
    }
    if (node_id) {
      query += ` AND node_id = $${paramIndex++}`;
      values.push(node_id);
    }
    if (action) {
      query += ` AND action = $${paramIndex++}`;
      values.push(action);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(status);
    }
    if (job_id) {
      query += ` AND job_id = $${paramIndex++}`;
      values.push(job_id);
    }
    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      values.push(start_date);
    }
    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    values.push(limit, offset);

    try {
      const result = await postgresPool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching activity logs by filter:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs by user
   */
  async getActivityLogsByUser(user_id, tenant_id, limit = 100, offset = 0) {
    const query = `
      SELECT * FROM submission_activity_log
      WHERE user_id = $1
        AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    try {
      const result = await postgresPool.query(query, [
        user_id,
        tenant_id,
        limit,
        offset,
      ]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching activity logs by user:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs by action
   */
  async getActivityLogsByAction(action, tenant_id, limit = 100, offset = 0) {
    const query = `
      SELECT * FROM submission_activity_log
      WHERE action = $1
        AND tenant_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4
    `;

    try {
      const result = await postgresPool.query(query, [
        action,
        tenant_id,
        limit,
        offset,
      ]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching activity logs by action:', error.message);
      throw error;
    }
  }

  /**
   * Get activity log summary/statistics
   */
  async getActivityLogSummary(filters = {}) {
    const { tenant_id, project_id, start_date, end_date } = filters;

    let query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE action = 'queued') as queued,
        COUNT(*) FILTER (WHERE action = 'processing') as processing,
        COUNT(*) FILTER (WHERE action = 'completed') as completed,
        COUNT(*) FILTER (WHERE action = 'failed') as failed,
        COUNT(*) FILTER (WHERE action = 'retried') as retried,
        COUNT(*) FILTER (WHERE status = 'success') as success,
        COUNT(*) FILTER (WHERE status = 'error') as error,
        COUNT(*) FILTER (WHERE status = 'in progress') as in_progress,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT project_id) as unique_projects,
        COUNT(DISTINCT node_id) as unique_nodes
      FROM submission_activity_log
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }
    if (project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      values.push(project_id);
    }
    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      values.push(start_date);
    }
    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    try {
      const result = await postgresPool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error fetching activity log summary:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs by job ID
   */
  async getActivityLogsByJobId(job_id) {
    const query = `
      SELECT * FROM submission_activity_log
      WHERE job_id = $1
      ORDER BY created_at ASC
    `;

    try {
      const result = await postgresPool.query(query, [job_id]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching activity logs by job ID:', error.message);
      throw error;
    }
  }

  /**
   * Get recent activity logs (last N records)
   */
  async getRecentActivityLogs(tenant_id, limit = 50) {
    const query = `
      SELECT * FROM submission_activity_log
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    try {
      const result = await postgresPool.query(query, [tenant_id, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching recent activity logs:', error.message);
      throw error;
    }
  }

  /**
   * Update activity log status
   */
  async updateActivityLogStatus(id, status, message = null) {
    let query = `
      UPDATE submission_activity_log
      SET status = $1
    `;

    const values = [status];
    let paramIndex = 2;

    if (message) {
      query += `, message = $${paramIndex++}`;
      values.push(message);
    }

    query += ` WHERE id = $${paramIndex} RETURNING *`;
    values.push(id);

    try {
      const result = await postgresPool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating activity log status:', error.message);
      throw error;
    }
  }

  /**
   * Delete activity log by ID
   */
  async deleteActivityLog(id) {
    const query = `
      DELETE FROM submission_activity_log
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await postgresPool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting activity log:', error.message);
      throw error;
    }
  }

  /**
   * Bulk delete activity logs (by filters)
   */
  async bulkDeleteActivityLogs(filters = {}) {
    const { tenant_id, project_id, older_than_days, status } = filters;

    if (!tenant_id) {
      throw new Error('tenant_id is required for bulk delete');
    }

    let query = `
      DELETE FROM submission_activity_log
      WHERE tenant_id = $1
    `;

    const values = [tenant_id];
    let paramIndex = 2;

    if (project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      values.push(project_id);
    }

    if (older_than_days) {
      query += ` AND created_at < NOW() - INTERVAL '${parseInt(
        older_than_days
      )} days'`;
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(status);
    }

    query += ` RETURNING id`;

    try {
      const result = await postgresPool.query(query, values);
      return result.rows.length;
    } catch (error) {
      logger.error('Error bulk deleting activity logs:', error.message);
      throw error;
    }
  }

  /**
   * Get activity logs count by filters
   */
  async getActivityLogsCount(filters = {}) {
    const {
      tenant_id,
      project_id,
      user_id,
      action,
      status,
      start_date,
      end_date,
    } = filters;

    let query = `
      SELECT COUNT(*) as count
      FROM submission_activity_log
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }
    if (project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      values.push(project_id);
    }
    if (user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(user_id);
    }
    if (action) {
      query += ` AND action = $${paramIndex++}`;
      values.push(action);
    }
    if (status) {
      query += ` AND status = $${paramIndex++}`;
      values.push(status);
    }
    if (start_date) {
      query += ` AND created_at >= $${paramIndex++}`;
      values.push(start_date);
    }
    if (end_date) {
      query += ` AND created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    try {
      const result = await postgresPool.query(query, values);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Error counting activity logs:', error.message);
      throw error;
    }
  }
}

module.exports = new ActivityLog();
