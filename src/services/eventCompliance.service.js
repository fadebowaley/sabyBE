/**
 * Event Compliance Service
 *
 * Manages PERM event compliance tracking and calculations.
 * Calculates completeness, tracks compliance status, manages compliance records.
 */

const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Get compliance tracking records
 */
const getComplianceTracking = async (tenant_id, filters = {}) => {
  try {
    const {
      project_id,
      node_id,
      month,
      year,
      status,
      page = 1,
      limit = 50,
    } = filters;

    let query = `
      SELECT * FROM event_compliance_tracking
      WHERE tenant_id = $1
    `;

    const params = [tenant_id];
    let paramIndex = 2;

    if (project_id) {
      query += ` AND project_id = $${paramIndex++}`;
      params.push(project_id);
    }

    if (node_id) {
      query += ` AND node_id = $${paramIndex++}`;
      params.push(node_id);
    }

    if (month) {
      query += ` AND month = $${paramIndex++}`;
      params.push(month);
    }

    if (year) {
      query += ` AND year = $${paramIndex++}`;
      params.push(year);
    }

    if (status) {
      query += ` AND compliance_status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY year DESC, month DESC, completeness_percentage ASC`;

    const offset = (page - 1) * limit;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await postgresPool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching compliance tracking:', error);
    throw error;
  }
};

/**
 * Get compliance by ID
 */
const getComplianceById = async (id, tenant_id) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT * FROM event_compliance_tracking
      WHERE id = $1 AND tenant_id = $2
    `,
      [id, tenant_id]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error fetching compliance by ID:', error);
    throw error;
  }
};

/**
 * Get compliance trends
 */
const getComplianceTrends = async (tenant_id, project_id, months = 6) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT 
        month,
        year,
        AVG(completeness_percentage) as avg_completeness,
        COUNT(*) as total_nodes,
        COUNT(CASE WHEN compliance_status = 'complete' THEN 1 END) as complete_count,
        COUNT(CASE WHEN compliance_status = 'partial' THEN 1 END) as partial_count,
        COUNT(CASE WHEN compliance_status = 'incomplete' THEN 1 END) as incomplete_count
      FROM event_compliance_tracking
      WHERE tenant_id = $1
        AND project_id = $2
        AND created_at >= NOW() - INTERVAL '${months} months'
      GROUP BY month, year
      ORDER BY year DESC, month DESC
    `,
      [tenant_id, project_id]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching compliance trends:', error);
    throw error;
  }
};

/**
 * Get compliance history for a node
 */
const getComplianceHistory = async (tenant_id, node_id, limit = 12) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT * FROM event_compliance_tracking
      WHERE tenant_id = $1 AND node_id = $2
      ORDER BY year DESC, month DESC
      LIMIT $3
    `,
      [tenant_id, node_id, limit]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching compliance history:', error);
    throw error;
  }
};

/**
 * Get compliance summary
 */
const getComplianceSummary = async (tenant_id, project_id = null) => {
  try {
    let query = `
      SELECT 
        COUNT(*) as total_records,
        AVG(completeness_percentage) as avg_completeness,
        COUNT(CASE WHEN compliance_status = 'complete' THEN 1 END) as complete,
        COUNT(CASE WHEN compliance_status = 'partial' THEN 1 END) as partial,
        COUNT(CASE WHEN compliance_status = 'incomplete' THEN 1 END) as incomplete,
        COUNT(DISTINCT node_id) as unique_nodes,
        MIN(completeness_percentage) as min_completeness,
        MAX(completeness_percentage) as max_completeness
      FROM event_compliance_tracking
      WHERE tenant_id = $1
    `;

    const params = [tenant_id];

    if (project_id) {
      query += ` AND project_id = $2`;
      params.push(project_id);
    }

    const result = await postgresPool.query(query, params);
    return result.rows[0];
  } catch (error) {
    logger.error('Error fetching compliance summary:', error);
    throw error;
  }
};

/**
 * Get weekly progress
 */
const getWeeklyProgress = async (tenant_id, node_id, month, year) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT weekly_progress FROM event_compliance_tracking
      WHERE tenant_id = $1 
        AND node_id = $2
        AND month = $3
        AND year = $4
    `,
      [tenant_id, node_id, month, year]
    );

    return result.rows[0]?.weekly_progress || [];
  } catch (error) {
    logger.error('Error fetching weekly progress:', error);
    throw error;
  }
};

/**
 * Get nodes by compliance status
 */
const getNodesByComplianceStatus = async (
  tenant_id,
  project_id,
  status,
  month,
  year
) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT * FROM event_compliance_tracking
      WHERE tenant_id = $1
        AND project_id = $2
        AND compliance_status = $3
        AND month = $4
        AND year = $5
      ORDER BY completeness_percentage ASC
    `,
      [tenant_id, project_id, status, month, year]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching nodes by status:', error);
    throw error;
  }
};

/**
 * Override compliance percentage
 */
const overrideCompliance = async (id, percentage, user_id, reason) => {
  try {
    const query = `
      UPDATE event_compliance_tracking
      SET
        completeness_percentage = $1,
        compliance_status = CASE
          WHEN $1 >= 100 THEN 'complete'
          WHEN $1 > 0 THEN 'partial'
          ELSE 'incomplete'
        END,
        events_breakdown = jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(events_breakdown, '{}'),
              '{override_by}',
              $2::jsonb
            ),
            '{override_reason}',
            $3::jsonb
          ),
          '{override_at}',
          $4::jsonb
        ),
        updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;

    const result = await postgresPool.query(query, [
      percentage,
      JSON.stringify(user_id),
      JSON.stringify(reason),
      JSON.stringify(new Date().toISOString()),
      id,
    ]);

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Compliance record not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error overriding compliance:', error);
    throw error;
  }
};

/**
 * Mark event as submitted
 */
const markEventSubmitted = async (id, event_name) => {
  try {
    const query = `
      UPDATE event_compliance_tracking
      SET
        total_events_submitted = total_events_submitted + 1,
        completeness_percentage = CASE
          WHEN total_events_required > 0 
          THEN ((total_events_submitted + 1)::DECIMAL / total_events_required * 100)
          ELSE 0
        END,
        compliance_status = CASE
          WHEN total_events_required > 0 AND (total_events_submitted + 1) >= total_events_required THEN 'complete'
          WHEN total_events_submitted + 1 > 0 THEN 'partial'
          ELSE 'incomplete'
        END,
        events_breakdown = jsonb_set(
          COALESCE(events_breakdown, '{}'),
          ARRAY[$2],
          jsonb_build_object(
            'submitted', true,
            'submitted_at', NOW()
          )
        ),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await postgresPool.query(query, [id, event_name]);

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Compliance record not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error marking event submitted:', error);
    throw error;
  }
};

/**
 * Reset compliance for a period
 */
const resetCompliance = async (id) => {
  try {
    const query = `
      UPDATE event_compliance_tracking
      SET
        total_events_submitted = 0,
        completeness_percentage = 0,
        compliance_status = 'incomplete',
        events_breakdown = '{}',
        weekly_progress = '[]',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await postgresPool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Compliance record not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error resetting compliance:', error);
    throw error;
  }
};

/**
 * Delete compliance tracking record
 */
const deleteComplianceTracking = async (id, tenant_id) => {
  try {
    const result = await postgresPool.query(
      `
      DELETE FROM event_compliance_tracking
      WHERE id = $1 AND tenant_id = $2
      RETURNING *
    `,
      [id, tenant_id]
    );

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Compliance record not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error deleting compliance tracking:', error);
    throw error;
  }
};

module.exports = {
  getComplianceTracking,
  getComplianceById,
  getComplianceTrends,
  getComplianceHistory,
  getComplianceSummary,
  getWeeklyProgress,
  getNodesByComplianceStatus,
  overrideCompliance,
  markEventSubmitted,
  resetCompliance,
  deleteComplianceTracking,
};
