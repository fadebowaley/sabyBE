/**
 * Export Report Service
 *
 * Service layer for data export functionality.
 * Handles CSV, JSON, and Excel export operations for all reporting data.
 *
 * @module services/exportReport
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

/**
 * Export submissions data to CSV format
 */
const exportSubmissionsCSV = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      status,
      month,
      year,
      node_id,
      user_id,
      perm_enabled,
      limit = 1000,
      offset = 0,
    } = filters;

    let query = `
      SELECT 
        fs.id,
        fs.tenant_id,
        fs.project_id,
        fs.form_id,
        fs.node_id,
        fs.user_id,
        fs.status,
        fs.data,
        fs.meta,
        fs.perm_enabled,
        fs.month,
        fs.event_compliance_percentage,
        fs.completeness_status,
        fs.is_locked,
        fs.validation_status,
        fs.created_at,
        fs.updated_at
      FROM form_submissions fs
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND fs.tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }

    if (project_id) {
      query += ` AND fs.project_id = $${paramIndex++}`;
      values.push(project_id);
    }

    if (status) {
      query += ` AND fs.status = $${paramIndex++}`;
      values.push(status);
    }

    if (month) {
      query += ` AND fs.month = $${paramIndex++}`;
      values.push(month);
    }

    if (year) {
      query += ` AND EXTRACT(YEAR FROM fs.month) = $${paramIndex++}`;
      values.push(year);
    }

    if (node_id) {
      query += ` AND fs.node_id = $${paramIndex++}`;
      values.push(node_id);
    }

    if (user_id) {
      query += ` AND fs.user_id = $${paramIndex++}`;
      values.push(user_id);
    }

    if (perm_enabled !== undefined) {
      query += ` AND fs.perm_enabled = $${paramIndex++}`;
      values.push(perm_enabled);
    }

    query += ` ORDER BY fs.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error exporting submissions CSV:', error.message);
    throw error;
  }
};

/**
 * Export submissions data to JSON format
 */
const exportSubmissionsJSON = async (filters = {}) => {
  try {
    const data = await exportSubmissionsCSV(filters);

    // Transform data for JSON export
    return data.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      form_id: row.form_id,
      node_id: row.node_id,
      user_id: row.user_id,
      status: row.status,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      meta: typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta,
      perm_enabled: row.perm_enabled,
      month: row.month,
      event_compliance_percentage: row.event_compliance_percentage,
      completeness_status: row.completeness_status,
      is_locked: row.is_locked,
      validation_status: row.validation_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    logger.error('❌ Error exporting submissions JSON:', error.message);
    throw error;
  }
};

/**
 * Export compliance data to CSV format
 */
const exportComplianceCSV = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      node_id,
      month,
      year,
      compliance_status,
      limit = 1000,
      offset = 0,
    } = filters;

    let query = `
      SELECT 
        ect.id,
        ect.tenant_id,
        ect.project_id,
        ect.node_id,
        ect.month,
        ect.completeness_percentage,
        ect.compliance_status,
        ect.total_events_submitted,
        ect.events_breakdown,
        ect.created_at,
        ect.updated_at
      FROM event_compliance_tracking ect
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND ect.tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }

    if (project_id) {
      query += ` AND ect.project_id = $${paramIndex++}`;
      values.push(project_id);
    }

    if (node_id) {
      query += ` AND ect.node_id = $${paramIndex++}`;
      values.push(node_id);
    }

    if (month) {
      query += ` AND ect.month = $${paramIndex++}`;
      values.push(month);
    }

    if (year) {
      query += ` AND EXTRACT(YEAR FROM ect.month) = $${paramIndex++}`;
      values.push(year);
    }

    if (compliance_status) {
      query += ` AND ect.compliance_status = $${paramIndex++}`;
      values.push(compliance_status);
    }

    query += ` ORDER BY ect.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error exporting compliance CSV:', error.message);
    throw error;
  }
};

/**
 * Export compliance data to JSON format
 */
const exportComplianceJSON = async (filters = {}) => {
  try {
    const data = await exportComplianceCSV(filters);

    return data.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      node_id: row.node_id,
      month: row.month,
      completeness_percentage: row.completeness_percentage,
      compliance_status: row.compliance_status,
      total_events_submitted: row.total_events_submitted,
      events_breakdown:
        typeof row.events_breakdown === 'string'
          ? JSON.parse(row.events_breakdown)
          : row.events_breakdown,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    logger.error('❌ Error exporting compliance JSON:', error.message);
    throw error;
  }
};

/**
 * Export validation data to CSV format
 */
const exportValidationsCSV = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      submission_id,
      validation_type,
      status,
      limit = 1000,
      offset = 0,
    } = filters;

    let query = `
      SELECT 
        sv.id,
        sv.submission_id,
        sv.category,
        sv.validation_type,
        sv.is_valid,
        sv.severity,
        sv.error_code,
        sv.error_message,
        sv.error_details,
        sv.validated_field,
        sv.expected_value,
        sv.actual_value,
        sv.validation_metadata,
        sv.validated_at,
        sv.validated_by,
        sv.validation_version,
        fs.tenant_id,
        fs.project_id
      FROM submission_validations sv
      LEFT JOIN form_submissions fs ON sv.submission_id = fs.id
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND fs.tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }

    if (project_id) {
      query += ` AND fs.project_id = $${paramIndex++}`;
      values.push(project_id);
    }

    if (submission_id) {
      query += ` AND sv.submission_id = $${paramIndex++}`;
      values.push(submission_id);
    }

    if (validation_type) {
      query += ` AND sv.validation_type = $${paramIndex++}`;
      values.push(validation_type);
    }

    if (status) {
      query += ` AND sv.validation_status = $${paramIndex++}`;
      values.push(status);
    }

    query += ` ORDER BY sv.validated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error exporting validations CSV:', error.message);
    throw error;
  }
};

/**
 * Export validation data to JSON format
 */
const exportValidationsJSON = async (filters = {}) => {
  try {
    const data = await exportValidationsCSV(filters);

    return data.map((row) => ({
      id: row.id,
      submission_id: row.submission_id,
      category: row.category,
      validation_type: row.validation_type,
      is_valid: row.is_valid,
      severity: row.severity,
      error_code: row.error_code,
      error_message: row.error_message,
      error_details:
        typeof row.error_details === 'string'
          ? JSON.parse(row.error_details)
          : row.error_details,
      validated_field: row.validated_field,
      expected_value: row.expected_value,
      actual_value: row.actual_value,
      validation_metadata:
        typeof row.validation_metadata === 'string'
          ? JSON.parse(row.validation_metadata)
          : row.validation_metadata,
      validated_at: row.validated_at,
      validated_by: row.validated_by,
      validation_version: row.validation_version,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
    }));
  } catch (error) {
    logger.error('❌ Error exporting validations JSON:', error.message);
    throw error;
  }
};

/**
 * Export notification data to CSV format
 */
const exportNotificationsCSV = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      notification_type,
      status,
      priority,
      limit = 1000,
      offset = 0,
    } = filters;

    let query = `
      SELECT 
        nq.id,
        nq.tenant_id,
        nq.project_id,
        nq.notification_type,
        nq.recipient_email,
        nq.subject,
        nq.message,
        nq.status,
        nq.priority,
        nq.scheduled_for,
        nq.sent_at,
        nq.retry_count,
        nq.created_at,
        nq.updated_at
      FROM notification_queue_perm nq
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND nq.tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }

    if (project_id) {
      query += ` AND nq.project_id = $${paramIndex++}`;
      values.push(project_id);
    }

    if (notification_type) {
      query += ` AND nq.notification_type = $${paramIndex++}`;
      values.push(notification_type);
    }

    if (status) {
      query += ` AND nq.status = $${paramIndex++}`;
      values.push(status);
    }

    if (priority) {
      query += ` AND nq.priority = $${paramIndex++}`;
      values.push(priority);
    }

    query += ` ORDER BY nq.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error exporting notifications CSV:', error.message);
    throw error;
  }
};

/**
 * Export notification data to JSON format
 */
const exportNotificationsJSON = async (filters = {}) => {
  try {
    const data = await exportNotificationsCSV(filters);

    return data.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      notification_type: row.notification_type,
      recipient_email: row.recipient_email,
      subject: row.subject,
      message: row.message,
      status: row.status,
      priority: row.priority,
      scheduled_for: row.scheduled_for,
      sent_at: row.sent_at,
      retry_count: row.retry_count,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  } catch (error) {
    logger.error('❌ Error exporting notifications JSON:', error.message);
    throw error;
  }
};

/**
 * Export activity log data to CSV format
 */
const exportActivityLogsCSV = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      user_id,
      action,
      status,
      limit = 1000,
      offset = 0,
    } = filters;

    let query = `
      SELECT 
        sal.id,
        sal.tenant_id,
        sal.project_id,
        sal.project_name,
        sal.project_category,
        sal.form_id,
        sal.user_id,
        sal.action,
        sal.status,
        sal.job_id,
        sal.message,
        sal.created_at
      FROM submission_activity_log sal
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      query += ` AND sal.tenant_id = $${paramIndex++}`;
      values.push(tenant_id);
    }

    if (project_id) {
      query += ` AND sal.project_id = $${paramIndex++}`;
      values.push(project_id);
    }

    if (user_id) {
      query += ` AND sal.user_id = $${paramIndex++}`;
      values.push(user_id);
    }

    if (action) {
      query += ` AND sal.action = $${paramIndex++}`;
      values.push(action);
    }

    if (status) {
      query += ` AND sal.status = $${paramIndex++}`;
      values.push(status);
    }

    query += ` ORDER BY sal.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error exporting activity logs CSV:', error.message);
    throw error;
  }
};

/**
 * Export activity log data to JSON format
 */
const exportActivityLogsJSON = async (filters = {}) => {
  try {
    const data = await exportActivityLogsCSV(filters);

    return data.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      project_id: row.project_id,
      project_name: row.project_name,
      project_category: row.project_category,
      form_id: row.form_id,
      user_id: row.user_id,
      action: row.action,
      status: row.status,
      job_id: row.job_id,
      message: row.message,
      created_at: row.created_at,
    }));
  } catch (error) {
    logger.error('❌ Error exporting activity logs JSON:', error.message);
    throw error;
  }
};

/**
 * Generate CSV content from data
 */
const generateCSV = (data, headers) => {
  if (!data || data.length === 0) {
    return headers.join(',') + '\n';
  }

  const csvRows = [headers.join(',')];

  data.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'object') {
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      }
      if (
        typeof value === 'string' &&
        (value.includes(',') || value.includes('"') || value.includes('\n'))
      ) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(','));
  });

  return csvRows.join('\n');
};

/**
 * Get export statistics
 */
const getExportStats = async (filters = {}) => {
  try {
    const { tenant_id, project_id, data_type } = filters;

    let tableName = 'form_submissions';
    let tenantColumn = 'tenant_id';
    let projectColumn = 'project_id';

    switch (data_type) {
      case 'compliance':
        tableName = 'event_compliance_tracking';
        break;
      case 'validations':
        tableName = 'submission_validations';
        tenantColumn = 'fs.tenant_id';
        projectColumn = 'fs.project_id';
        break;
      case 'notifications':
        tableName = 'notification_queue_perm';
        break;
      case 'activity_logs':
        tableName = 'submission_activity_log';
        break;
    }

    let query = `SELECT COUNT(*) as total FROM ${tableName}`;

    if (data_type === 'validations') {
      query = `
        SELECT COUNT(*) as total 
        FROM submission_validations sv
        LEFT JOIN form_submissions fs ON sv.submission_id = fs.id
      `;
    }

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (tenant_id) {
      conditions.push(`${tenantColumn} = $${paramIndex++}`);
      values.push(tenant_id);
    }

    if (project_id) {
      conditions.push(`${projectColumn} = $${paramIndex++}`);
      values.push(project_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = await postgresPool.query(query, values);
    return {
      total_records: parseInt(result.rows[0].total),
      export_timestamp: new Date().toISOString(),
      filters_applied: filters,
    };
  } catch (error) {
    logger.error('❌ Error getting export stats:', error.message);
    throw error;
  }
};

module.exports = {
  exportSubmissionsCSV,
  exportSubmissionsJSON,
  exportComplianceCSV,
  exportComplianceJSON,
  exportValidationsCSV,
  exportValidationsJSON,
  exportNotificationsCSV,
  exportNotificationsJSON,
  exportActivityLogsCSV,
  exportActivityLogsJSON,
  generateCSV,
  getExportStats,
};
