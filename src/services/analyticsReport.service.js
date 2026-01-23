/**
 * Analytics Report Service
 *
 * Service layer for analytics and aggregation functionality.
 * Provides data insights, metrics, and statistical analysis for all reporting data.
 *
 * @module services/analyticsReport
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

/**
 * Get submission analytics summary
 */
const getSubmissionSummary = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      start_date,
      end_date,
      group_by = 'month',
    } = filters;

    if (!tenant_id) {
      throw new Error('tenant_id is required for submission summary');
    }

    let groupByClause;
    switch (group_by) {
      case 'day':
        groupByClause = 'DATE(fsev.created_at)';
        break;
      case 'week':
        groupByClause = "DATE_TRUNC('week', fsev.created_at)";
        break;
      case 'year':
        groupByClause = "DATE_TRUNC('year', fsev.created_at)";
        break;
      case 'month':
      default:
        groupByClause = "DATE_TRUNC('month', fsev.created_at)";
        break;
    }

    const conditions = ['fsev.tenant_id = $1'];
    const values = [tenant_id];
    let paramIndex = 2;

    if (project_id) {
      conditions.push(`fsev.project_id = $${paramIndex}`);
      values.push(project_id);
      paramIndex += 1;
    }

    if (start_date) {
      conditions.push(`fsev.created_at >= $${paramIndex}`);
      values.push(start_date);
      paramIndex += 1;
    }

    if (end_date) {
      conditions.push(`fsev.created_at <= $${paramIndex}`);
      values.push(end_date);
      paramIndex += 1;
    }

    const query = `
      SELECT
        ${groupByClause} AS period,
        COUNT(*) AS total_submissions,
        COUNT(CASE WHEN fsev.status = 'submitted' THEN 1 END) AS submitted_count,
        COUNT(CASE WHEN fsev.status = 'approved' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN fsev.status = 'rejected' THEN 1 END) AS rejected_count,
        COUNT(CASE WHEN fsev.status = 'pending' THEN 1 END) AS pending_count,
        COUNT(CASE WHEN fsev.perm_enabled = true THEN 1 END) AS perm_submissions,
        AVG(fsev.event_compliance_percentage) AS avg_compliance,
        COUNT(DISTINCT fsev.node_id) AS unique_nodes,
        COUNT(DISTINCT fsev.user_id) AS unique_users,
        SUM(fsev.numeric_total) AS numeric_total_sum,
        AVG(fsev.numeric_total) AS numeric_total_avg,
        SUM(fsev.boolean_true_count) AS boolean_true_total,
        SUM(fsev.boolean_false_count) AS boolean_false_total,
        SUM(fsev.fields_count) AS total_field_entries
      FROM form_submission_enriched_view fsev
      WHERE ${conditions.join(' AND ')}
      GROUP BY ${groupByClause}
      ORDER BY period DESC
    `;

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting submission summary:', error.message);
    throw error;
  }
};

/**
 * Get submissions by status breakdown
 */
const getSubmissionsByStatus = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date } = filters;

    if (!tenant_id) {
      throw new Error('tenant_id is required for status breakdown');
    }

    const conditions = ['fsev.tenant_id = $1'];
    const values = [tenant_id];
    let paramIndex = 2;

    if (project_id) {
      conditions.push(`fsev.project_id = $${paramIndex}`);
      values.push(project_id);
      paramIndex += 1;
    }

    if (start_date) {
      conditions.push(`fsev.created_at >= $${paramIndex}`);
      values.push(start_date);
      paramIndex += 1;
    }

    if (end_date) {
      conditions.push(`fsev.created_at <= $${paramIndex}`);
      values.push(end_date);
      paramIndex += 1;
    }

    const query = `
      SELECT 
        fsev.status,
        COUNT(*) AS count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS percentage,
        AVG(fsev.event_compliance_percentage) AS avg_compliance,
        MIN(fsev.created_at) AS first_submission,
        MAX(fsev.created_at) AS last_submission,
        SUM(fsev.numeric_total) AS numeric_total_sum,
        AVG(fsev.numeric_total) AS numeric_total_avg,
        SUM(fsev.boolean_true_count) AS boolean_true_total,
        SUM(fsev.boolean_false_count) AS boolean_false_total
      FROM form_submission_enriched_view fsev
      WHERE ${conditions.join(' AND ')}
      GROUP BY fsev.status
      ORDER BY count DESC
    `;

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting submissions by status:', error.message);
    throw error;
  }
};

/**
 * Get submissions by month breakdown
 */
const getSubmissionsByMonth = async (filters = {}) => {
  try {
    const { tenant_id, project_id, year = new Date().getFullYear() } = filters;

    if (!tenant_id) {
      throw new Error('tenant_id is required for monthly breakdown');
    }

    const values = [tenant_id, year];
    let projectClause = '';
    if (project_id) {
      projectClause = 'AND fsev.project_id = $3';
      values.push(project_id);
    }

    const query = `
      SELECT 
        EXTRACT(MONTH FROM fsev.created_at) AS month,
        TO_CHAR(fsev.created_at, 'Month') AS month_name,
        COUNT(*) AS total_submissions,
        COUNT(CASE WHEN fsev.status = 'submitted' THEN 1 END) AS submitted_count,
        COUNT(CASE WHEN fsev.status = 'approved' THEN 1 END) AS approved_count,
        AVG(fsev.event_compliance_percentage) AS avg_compliance,
        COUNT(DISTINCT fsev.node_id) AS unique_nodes,
        SUM(fsev.numeric_total) AS numeric_total_sum,
        AVG(fsev.numeric_total) AS numeric_total_avg,
        SUM(fsev.boolean_true_count) AS boolean_true_total,
        SUM(fsev.boolean_false_count) AS boolean_false_total
      FROM form_submission_enriched_view fsev
      WHERE fsev.tenant_id = $1
        ${projectClause}
        AND EXTRACT(YEAR FROM fsev.created_at) = $2
      GROUP BY EXTRACT(MONTH FROM fsev.created_at), TO_CHAR(fsev.created_at, 'Month')
      ORDER BY month
    `;

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting submissions by month:', error.message);
    throw error;
  }
};

/**
 * Get compliance rates analytics
 */
const getComplianceRates = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND ect.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND ect.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    const query = `
      SELECT 
        ect.project_id,
        COUNT(*) as total_records,
        AVG(ect.completeness_percentage) as avg_completeness,
        COUNT(CASE WHEN ect.compliance_status = 'complete' THEN 1 END) as complete_count,
        COUNT(CASE WHEN ect.compliance_status = 'partial' THEN 1 END) as partial_count,
        COUNT(CASE WHEN ect.compliance_status = 'incomplete' THEN 1 END) as incomplete_count,
        ROUND(
          COUNT(CASE WHEN ect.compliance_status = 'complete' THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as completion_rate,
        ROUND(
          COUNT(CASE WHEN ect.completeness_percentage >= 80 THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as high_performance_rate
      FROM event_compliance_tracking ect
      WHERE ect.tenant_id = $${paramIndex++}
        ${project_id ? `AND ect.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY ect.project_id
      ORDER BY completion_rate DESC
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting compliance rates:', error.message);
    throw error;
  }
};

/**
 * Get compliance by node analytics
 */
const getComplianceByNode = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date, limit = 50 } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND ect.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND ect.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    const query = `
      SELECT 
        ect.node_id,
        ect.project_id,
        COUNT(*) as total_submissions,
        AVG(ect.completeness_percentage) as avg_completeness,
        COUNT(CASE WHEN ect.compliance_status = 'complete' THEN 1 END) as complete_count,
        COUNT(CASE WHEN ect.compliance_status = 'partial' THEN 1 END) as partial_count,
        COUNT(CASE WHEN ect.compliance_status = 'incomplete' THEN 1 END) as incomplete_count,
        ROUND(
          COUNT(CASE WHEN ect.compliance_status = 'complete' THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as completion_rate,
        MAX(ect.created_at) as last_submission
      FROM event_compliance_tracking ect
      WHERE ect.tenant_id = $${paramIndex++}
        ${project_id ? `AND ect.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY ect.node_id, ect.project_id
      ORDER BY completion_rate DESC, total_submissions DESC
      LIMIT $${paramIndex++}
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id, limit);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting compliance by node:', error.message);
    throw error;
  }
};

/**
 * Get validation failures analytics
 */
const getValidationFailures = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date, limit = 50 } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND sv.validated_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND sv.validated_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    const query = `
      SELECT 
        sv.validation_type,
        sv.category,
        sv.severity,
        sv.error_code,
        COUNT(*) as failure_count,
        COUNT(DISTINCT sv.submission_id) as affected_submissions,
        COUNT(DISTINCT fs.node_id) as affected_nodes,
        AVG(CASE 
          WHEN sv.error_details->>'difference' IS NOT NULL 
          THEN (sv.error_details->>'difference')::numeric 
          ELSE 0 
        END) as avg_difference
      FROM submission_validations sv
      LEFT JOIN form_submissions fs ON sv.submission_id = fs.id
      WHERE sv.is_valid = false
        AND fs.tenant_id = $${paramIndex++}
        ${project_id ? `AND fs.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY sv.validation_type, sv.category, sv.severity, sv.error_code
      ORDER BY failure_count DESC
      LIMIT $${paramIndex++}
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id, limit);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting validation failures:', error.message);
    throw error;
  }
};

/**
 * Get notification delivery analytics
 */
const getNotificationDelivery = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND nq.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND nq.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    const query = `
      SELECT 
        nq.notification_type,
        nq.status,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage,
        AVG(CASE 
          WHEN nq.sent_at IS NOT NULL AND nq.created_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (nq.sent_at - nq.created_at)) / 60 
          ELSE NULL 
        END) as avg_delivery_time_minutes,
        COUNT(CASE WHEN nq.retry_count > 0 THEN 1 END) as retry_count,
        MAX(nq.created_at) as last_notification
      FROM notification_queue_perm nq
      WHERE nq.tenant_id = $${paramIndex++}
        ${project_id ? `AND nq.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY nq.notification_type, nq.status
      ORDER BY count DESC
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting notification delivery:', error.message);
    throw error;
  }
};

/**
 * Get activity trends analytics
 */
const getActivityTrends = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      start_date,
      end_date,
      group_by = 'day',
    } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND sal.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND sal.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    let groupByClause = '';
    switch (group_by) {
      case 'hour':
        groupByClause = "DATE_TRUNC('hour', sal.created_at)";
        break;
      case 'day':
        groupByClause = "DATE_TRUNC('day', sal.created_at)";
        break;
      case 'week':
        groupByClause = "DATE_TRUNC('week', sal.created_at)";
        break;
      case 'month':
        groupByClause = "DATE_TRUNC('month', sal.created_at)";
        break;
      default:
        groupByClause = "DATE_TRUNC('day', sal.created_at)";
    }

    const query = `
      SELECT 
        ${groupByClause} as period,
        sal.action,
        sal.status,
        COUNT(*) as activity_count,
        COUNT(DISTINCT sal.user_id) as unique_users,
        COUNT(DISTINCT sal.project_id) as unique_projects
      FROM submission_activity_log sal
      WHERE sal.tenant_id = $${paramIndex++}
        ${project_id ? `AND sal.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY ${groupByClause}, sal.action, sal.status
      ORDER BY period DESC, activity_count DESC
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting activity trends:', error.message);
    throw error;
  }
};

/**
 * Get top performing nodes
 */
const getTopPerformingNodes = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date, limit = 20 } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND fs.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND fs.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    const query = `
      SELECT 
        fs.node_id,
        fs.project_id,
        COUNT(*) as total_submissions,
        COUNT(CASE WHEN fs.status = 'submitted' THEN 1 END) as submitted_count,
        COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) as approved_count,
        AVG(fs.event_compliance_percentage) as avg_compliance,
        ROUND(
          COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as approval_rate,
        MAX(fs.created_at) as last_submission,
        MIN(fs.created_at) as first_submission
      FROM form_submissions fs
      WHERE fs.tenant_id = $${paramIndex++}
        ${project_id ? `AND fs.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY fs.node_id, fs.project_id
      HAVING COUNT(*) >= 3
      ORDER BY approval_rate DESC, avg_compliance DESC, total_submissions DESC
      LIMIT $${paramIndex++}
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id, limit);

    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting top performing nodes:', error.message);
    throw error;
  }
};

/**
 * Get data quality metrics
 */
const getDataQualityMetrics = async (filters = {}) => {
  try {
    const { tenant_id, project_id, start_date, end_date } = filters;

    let dateFilter = '';
    const values = [];
    let paramIndex = 1;

    if (start_date) {
      dateFilter += ` AND fs.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND fs.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    const query = `
      WITH quality_metrics AS (
        SELECT 
          COUNT(*) as total_submissions,
          COUNT(CASE WHEN fs.data IS NOT NULL AND fs.data != '{}' THEN 1 END) as submissions_with_data,
          COUNT(CASE WHEN fs.meta IS NOT NULL AND fs.meta != '{}' THEN 1 END) as submissions_with_meta,
          COUNT(CASE WHEN fs.event_compliance_percentage IS NOT NULL THEN 1 END) as submissions_with_compliance,
          COUNT(CASE WHEN fs.validation_status IS NOT NULL THEN 1 END) as submissions_with_validation,
          AVG(fs.event_compliance_percentage) as avg_compliance,
          COUNT(CASE WHEN fs.event_compliance_percentage >= 80 THEN 1 END) as high_compliance_count
        FROM form_submissions fs
        WHERE fs.tenant_id = $${paramIndex++}
          ${project_id ? `AND fs.project_id = $${paramIndex++}` : ''}
          ${dateFilter}
      ),
      validation_metrics AS (
        SELECT 
          COUNT(*) as total_validations,
          COUNT(CASE WHEN sv.is_valid = true THEN 1 END) as passed_validations,
          COUNT(CASE WHEN sv.is_valid = false THEN 1 END) as failed_validations
        FROM submission_validations sv
        LEFT JOIN form_submissions fs ON sv.submission_id = fs.id
        WHERE fs.tenant_id = $${paramIndex++}
          ${project_id ? `AND fs.project_id = $${paramIndex++}` : ''}
          ${dateFilter}
      )
      SELECT 
        qm.*,
        vm.total_validations,
        vm.passed_validations,
        vm.failed_validations,
        ROUND(qm.submissions_with_data * 100.0 / NULLIF(qm.total_submissions, 0), 2) as data_completeness_rate,
        ROUND(qm.submissions_with_meta * 100.0 / NULLIF(qm.total_submissions, 0), 2) as metadata_completeness_rate,
        ROUND(qm.submissions_with_compliance * 100.0 / NULLIF(qm.total_submissions, 0), 2) as compliance_data_rate,
        ROUND(vm.passed_validations * 100.0 / NULLIF(vm.total_validations, 0), 2) as validation_success_rate,
        ROUND(qm.high_compliance_count * 100.0 / NULLIF(qm.total_submissions, 0), 2) as high_performance_rate
      FROM quality_metrics qm, validation_metrics vm
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);
    return result.rows[0] || {};
  } catch (error) {
    logger.error('❌ Error getting data quality metrics:', error.message);
    throw error;
  }
};

module.exports = {
  getSubmissionSummary,
  getSubmissionsByStatus,
  getSubmissionsByMonth,
  getComplianceRates,
  getComplianceByNode,
  getValidationFailures,
  getNotificationDelivery,
  getActivityTrends,
  getTopPerformingNodes,
  getDataQualityMetrics,
};
