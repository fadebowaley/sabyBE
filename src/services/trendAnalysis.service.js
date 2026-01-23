/**
 * Trend Analysis Service
 *
 * Service layer for trend analysis and time-series functionality.
 * Provides trend detection, seasonal patterns, growth metrics, and predictive insights.
 *
 * @module services/trendAnalysis
 */

const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');

/**
 * Get submissions timeline trends
 */
const getSubmissionsTimeline = async (filters = {}) => {
  try {
    const {
      tenant_id,
      project_id,
      start_date,
      end_date,
      group_by = 'day',
      trend_type = 'count',
    } = filters;

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

    let groupByClause = '';
    switch (group_by) {
      case 'hour':
        groupByClause = "DATE_TRUNC('hour', fs.created_at)";
        break;
      case 'day':
        groupByClause = "DATE_TRUNC('day', fs.created_at)";
        break;
      case 'week':
        groupByClause = "DATE_TRUNC('week', fs.created_at)";
        break;
      case 'month':
        groupByClause = "DATE_TRUNC('month', fs.created_at)";
        break;
      default:
        groupByClause = "DATE_TRUNC('day', fs.created_at)";
    }

    let trendMetric = '';
    switch (trend_type) {
      case 'count':
        trendMetric = 'COUNT(*)';
        break;
      case 'compliance':
        trendMetric = 'AVG(fs.event_compliance_percentage)';
        break;
      case 'approval_rate':
        trendMetric =
          "ROUND(COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) * 100.0 / COUNT(*), 2)";
        break;
      default:
        trendMetric = 'COUNT(*)';
    }

    const query = `
      SELECT 
        ${groupByClause} as period,
        ${trendMetric} as trend_value,
        COUNT(*) as total_count,
        COUNT(CASE WHEN fs.status = 'submitted' THEN 1 END) as submitted_count,
        COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) as approved_count,
        AVG(fs.event_compliance_percentage) as avg_compliance,
        COUNT(DISTINCT fs.node_id) as unique_nodes
      FROM form_submissions fs
      WHERE fs.tenant_id = $${paramIndex++}
        ${project_id ? `AND fs.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY ${groupByClause}
      ORDER BY period ASC
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);

    // Calculate trend direction and growth rate
    const trends = result.rows.map((row, index) => {
      const prevRow = index > 0 ? result.rows[index - 1] : null;
      let trend_direction = 'stable';
      let growth_rate = 0;

      if (prevRow && prevRow.trend_value !== null && row.trend_value !== null) {
        const change = row.trend_value - prevRow.trend_value;
        const prevValue = prevRow.trend_value;

        if (prevValue !== 0) {
          growth_rate = Math.round((change / prevValue) * 100 * 100) / 100;
        }

        if (change > 0) {
          trend_direction = 'increasing';
        } else if (change < 0) {
          trend_direction = 'decreasing';
        }
      }

      return {
        ...row,
        trend_direction,
        growth_rate,
      };
    });

    return trends;
  } catch (error) {
    logger.error('❌ Error getting submissions timeline:', error.message);
    throw error;
  }
};

/**
 * Get compliance timeline trends
 */
const getComplianceTimeline = async (filters = {}) => {
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
      dateFilter += ` AND ect.created_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND ect.created_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    let groupByClause = '';
    switch (group_by) {
      case 'day':
        groupByClause = "DATE_TRUNC('day', ect.created_at)";
        break;
      case 'week':
        groupByClause = "DATE_TRUNC('week', ect.created_at)";
        break;
      case 'month':
        groupByClause = "DATE_TRUNC('month', ect.created_at)";
        break;
      default:
        groupByClause = "DATE_TRUNC('day', ect.created_at)";
    }

    const query = `
      SELECT 
        ${groupByClause} as period,
        COUNT(*) as total_records,
        AVG(ect.completeness_percentage) as avg_completeness,
        COUNT(CASE WHEN ect.compliance_status = 'complete' THEN 1 END) as complete_count,
        COUNT(CASE WHEN ect.compliance_status = 'partial' THEN 1 END) as partial_count,
        COUNT(CASE WHEN ect.compliance_status = 'incomplete' THEN 1 END) as incomplete_count,
        ROUND(
          COUNT(CASE WHEN ect.compliance_status = 'complete' THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as completion_rate,
        COUNT(DISTINCT ect.node_id) as unique_nodes
      FROM event_compliance_tracking ect
      WHERE ect.tenant_id = $${paramIndex++}
        ${project_id ? `AND ect.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY ${groupByClause}
      ORDER BY period ASC
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);

    // Calculate trend direction and growth rate
    const trends = result.rows.map((row, index) => {
      const prevRow = index > 0 ? result.rows[index - 1] : null;
      let trend_direction = 'stable';
      let growth_rate = 0;

      if (
        prevRow &&
        prevRow.avg_completeness !== null &&
        row.avg_completeness !== null
      ) {
        const change = row.avg_completeness - prevRow.avg_completeness;
        const prevValue = prevRow.avg_completeness;

        if (prevValue !== 0) {
          growth_rate = Math.round((change / prevValue) * 100 * 100) / 100;
        }

        if (change > 0) {
          trend_direction = 'improving';
        } else if (change < 0) {
          trend_direction = 'declining';
        }
      }

      return {
        ...row,
        trend_direction,
        growth_rate,
      };
    });

    return trends;
  } catch (error) {
    logger.error('❌ Error getting compliance timeline:', error.message);
    throw error;
  }
};

/**
 * Get validation timeline trends
 */
const getValidationTimeline = async (filters = {}) => {
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
      dateFilter += ` AND sv.validated_at >= $${paramIndex++}`;
      values.push(start_date);
    }

    if (end_date) {
      dateFilter += ` AND sv.validated_at <= $${paramIndex++}`;
      values.push(end_date);
    }

    let groupByClause = '';
    switch (group_by) {
      case 'day':
        groupByClause = "DATE_TRUNC('day', sv.validated_at)";
        break;
      case 'week':
        groupByClause = "DATE_TRUNC('week', sv.validated_at)";
        break;
      case 'month':
        groupByClause = "DATE_TRUNC('month', sv.validated_at)";
        break;
      default:
        groupByClause = "DATE_TRUNC('day', sv.validated_at)";
    }

    const query = `
      SELECT 
        ${groupByClause} as period,
        COUNT(*) as total_validations,
        COUNT(CASE WHEN sv.is_valid = true THEN 1 END) as passed_validations,
        COUNT(CASE WHEN sv.is_valid = false THEN 1 END) as failed_validations,
        ROUND(
          COUNT(CASE WHEN sv.is_valid = true THEN 1 END) * 100.0 / COUNT(*), 
          2
        ) as success_rate,
        COUNT(DISTINCT sv.validation_type) as unique_validation_types,
        COUNT(DISTINCT sv.category) as unique_categories
      FROM submission_validations sv
      LEFT JOIN form_submissions fs ON sv.submission_id = fs.id
      WHERE fs.tenant_id = $${paramIndex++}
        ${project_id ? `AND fs.project_id = $${paramIndex++}` : ''}
        ${dateFilter}
      GROUP BY ${groupByClause}
      ORDER BY period ASC
    `;

    if (project_id) {
      values.push(project_id);
    }
    values.push(tenant_id);

    const result = await postgresPool.query(query, values);

    // Calculate trend direction and growth rate
    const trends = result.rows.map((row, index) => {
      const prevRow = index > 0 ? result.rows[index - 1] : null;
      let trend_direction = 'stable';
      let growth_rate = 0;

      if (
        prevRow &&
        prevRow.success_rate !== null &&
        row.success_rate !== null
      ) {
        const change = row.success_rate - prevRow.success_rate;
        const prevValue = prevRow.success_rate;

        if (prevValue !== 0) {
          growth_rate = Math.round((change / prevValue) * 100 * 100) / 100;
        }

        if (change > 0) {
          trend_direction = 'improving';
        } else if (change < 0) {
          trend_direction = 'declining';
        }
      }

      return {
        ...row,
        trend_direction,
        growth_rate,
      };
    });

    return trends;
  } catch (error) {
    logger.error('❌ Error getting validation timeline:', error.message);
    throw error;
  }
};

/**
 * Get seasonal patterns analysis
 */
const getSeasonalPatterns = async (filters = {}) => {
  try {
    const { tenant_id, project_id, years_back = 2 } = filters;

    const query = `
      WITH monthly_data AS (
        SELECT 
          EXTRACT(MONTH FROM fs.created_at) as month,
          TO_CHAR(fs.created_at, 'Month') as month_name,
          COUNT(*) as submission_count,
          AVG(fs.event_compliance_percentage) as avg_compliance,
          COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) as approved_count,
          ROUND(
            COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) * 100.0 / COUNT(*), 
            2
          ) as approval_rate
        FROM form_submissions fs
        WHERE fs.tenant_id = $1
          ${project_id ? 'AND fs.project_id = $2' : ''}
          AND fs.created_at >= NOW() - INTERVAL '${years_back} years'
        GROUP BY EXTRACT(MONTH FROM fs.created_at), TO_CHAR(fs.created_at, 'Month')
      ),
      seasonal_stats AS (
        SELECT 
          month,
          month_name,
          AVG(submission_count) as avg_submissions,
          AVG(avg_compliance) as avg_compliance,
          AVG(approval_rate) as avg_approval_rate,
          STDDEV(submission_count) as submission_volatility,
          STDDEV(avg_compliance) as compliance_volatility
        FROM monthly_data
        GROUP BY month, month_name
        ORDER BY month
      )
      SELECT 
        *,
        CASE 
          WHEN avg_submissions > (SELECT AVG(avg_submissions) FROM seasonal_stats) * 1.2 
          THEN 'high_activity'
          WHEN avg_submissions < (SELECT AVG(avg_submissions) FROM seasonal_stats) * 0.8 
          THEN 'low_activity'
          ELSE 'normal_activity'
        END as activity_level,
        CASE 
          WHEN avg_compliance > (SELECT AVG(avg_compliance) FROM seasonal_stats) * 1.1 
          THEN 'high_performance'
          WHEN avg_compliance < (SELECT AVG(avg_compliance) FROM seasonal_stats) * 0.9 
          THEN 'low_performance'
          ELSE 'normal_performance'
        END as performance_level
      FROM seasonal_stats
    `;

    const values = project_id ? [tenant_id, project_id] : [tenant_id];
    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting seasonal patterns:', error.message);
    throw error;
  }
};

/**
 * Get growth metrics analysis
 */
const getGrowthMetrics = async (filters = {}) => {
  try {
    const { tenant_id, project_id, period_months = 12 } = filters;

    const query = `
      WITH monthly_growth AS (
        SELECT 
          DATE_TRUNC('month', fs.created_at) as month,
          COUNT(*) as submissions,
          COUNT(DISTINCT fs.node_id) as unique_nodes,
          COUNT(DISTINCT fs.user_id) as unique_users,
          AVG(fs.event_compliance_percentage) as avg_compliance,
          COUNT(CASE WHEN fs.status = 'approved' THEN 1 END) as approved_submissions
        FROM form_submissions fs
        WHERE fs.tenant_id = $1
          ${project_id ? 'AND fs.project_id = $2' : ''}
          AND fs.created_at >= NOW() - INTERVAL '${period_months} months'
        GROUP BY DATE_TRUNC('month', fs.created_at)
        ORDER BY month
      ),
      growth_calculations AS (
        SELECT 
          *,
          LAG(submissions) OVER (ORDER BY month) as prev_submissions,
          LAG(unique_nodes) OVER (ORDER BY month) as prev_nodes,
          LAG(avg_compliance) OVER (ORDER BY month) as prev_compliance,
          ROW_NUMBER() OVER (ORDER BY month) as month_rank
        FROM monthly_growth
      )
      SELECT 
        month,
        submissions,
        unique_nodes,
        unique_users,
        avg_compliance,
        approved_submissions,
        CASE 
          WHEN prev_submissions IS NOT NULL AND prev_submissions > 0
          THEN ROUND(((submissions - prev_submissions) / prev_submissions) * 100, 2)
          ELSE NULL
        END as submission_growth_rate,
        CASE 
          WHEN prev_nodes IS NOT NULL AND prev_nodes > 0
          THEN ROUND(((unique_nodes - prev_nodes) / prev_nodes) * 100, 2)
          ELSE NULL
        END as node_growth_rate,
        CASE 
          WHEN prev_compliance IS NOT NULL AND prev_compliance > 0
          THEN ROUND(((avg_compliance - prev_compliance) / prev_compliance) * 100, 2)
          ELSE NULL
        END as compliance_growth_rate,
        CASE 
          WHEN month_rank <= 3 THEN 'early_period'
          WHEN month_rank > (SELECT COUNT(*) FROM growth_calculations) - 3 THEN 'recent_period'
          ELSE 'middle_period'
        END as period_category
      FROM growth_calculations
      ORDER BY month
    `;

    const values = project_id ? [tenant_id, project_id] : [tenant_id];
    const result = await postgresPool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting growth metrics:', error.message);
    throw error;
  }
};

/**
 * Get predictive insights
 */
const getPredictiveInsights = async (filters = {}) => {
  try {
    const { tenant_id, project_id, forecast_months = 3 } = filters;

    const query = `
      WITH recent_trends AS (
        SELECT 
          AVG(daily_submissions) as avg_daily_submissions,
          AVG(daily_compliance) as avg_daily_compliance,
          STDDEV(daily_submissions) as submission_volatility,
          STDDEV(daily_compliance) as compliance_volatility,
          COUNT(*) as trend_periods
        FROM (
          SELECT 
            DATE_TRUNC('day', fs.created_at) as day,
            COUNT(*) as daily_submissions,
            AVG(fs.event_compliance_percentage) as daily_compliance
          FROM form_submissions fs
          WHERE fs.tenant_id = $1
            ${project_id ? 'AND fs.project_id = $2' : ''}
            AND fs.created_at >= NOW() - INTERVAL '90 days'
          GROUP BY DATE_TRUNC('day', fs.created_at)
        ) daily_data
      ),
      forecast_data AS (
        SELECT 
          avg_daily_submissions,
          avg_daily_compliance,
          submission_volatility,
          compliance_volatility,
          -- Simple linear trend projection
          avg_daily_submissions * 30 as projected_monthly_submissions,
          avg_daily_submissions * 30 * ${forecast_months} as projected_quarterly_submissions,
          -- Confidence intervals (basic)
          avg_daily_submissions * 30 * (1 - (submission_volatility / NULLIF(avg_daily_submissions, 0))) as conservative_estimate,
          avg_daily_submissions * 30 * (1 + (submission_volatility / NULLIF(avg_daily_submissions, 0))) as optimistic_estimate
        FROM recent_trends
      )
      SELECT 
        *,
        CASE 
          WHEN avg_daily_submissions > 0 AND submission_volatility / avg_daily_submissions < 0.2 
          THEN 'high_confidence'
          WHEN avg_daily_submissions > 0 AND submission_volatility / avg_daily_submissions < 0.5 
          THEN 'medium_confidence'
          ELSE 'low_confidence'
        END as forecast_confidence,
        CASE 
          WHEN avg_daily_compliance > 80 THEN 'excellent'
          WHEN avg_daily_compliance > 60 THEN 'good'
          WHEN avg_daily_compliance > 40 THEN 'fair'
          ELSE 'needs_improvement'
        END as performance_category
      FROM forecast_data
    `;

    const values = project_id ? [tenant_id, project_id] : [tenant_id];
    const result = await postgresPool.query(query, values);
    return result.rows[0] || {};
  } catch (error) {
    logger.error('❌ Error getting predictive insights:', error.message);
    throw error;
  }
};

module.exports = {
  getSubmissionsTimeline,
  getComplianceTimeline,
  getValidationTimeline,
  getSeasonalPatterns,
  getGrowthMetrics,
  getPredictiveInsights,
};
