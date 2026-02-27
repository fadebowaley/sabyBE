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

/**
 * ✨ NEW: Calculate compliance based on tracking mode
 * Master function that routes to appropriate calculator
 */
const calculateCompliance = async (submissionData, calendar) => {
  const trackingMode = calendar.tracking_mode;

  switch (trackingMode) {
    case 'none':
      return calculateMonthOnlyCompliance(submissionData, calendar);

    case 'daily':
      return calculateDailyCompliance(submissionData, calendar);

    case 'weekly':
      return calculateWeeklyCompliance(submissionData, calendar);

    default:
      throw new Error(`Unknown tracking mode: ${trackingMode}`);
  }
};

/**
 * Mode 1: Month Only Compliance
 * Simple binary: Did they submit for the month? (0% or 100%)
 */
const calculateMonthOnlyCompliance = (submissionData, calendar) => {
  const submitted = submissionData ? 1 : 0;
  const required = 1;
  const percentage = (submitted / required) * 100;

  return {
    total_events_required: required,
    total_events_submitted: submitted,
    completeness_percentage: percentage,
    compliance_status: percentage === 100 ? 'complete' : 'incomplete',
    events_breakdown: {
      month_submission: {
        required: 1,
        submitted: submitted,
        percentage: percentage,
      },
    },
  };
};

/**
 * Mode 2: Daily Compliance
 * Calculate based on daily_config (days × frequency)
 */
const calculateDailyCompliance = (submissionData, calendar) => {
  const config = calendar.daily_config;
  const totalExpected = config.total_expected;

  // Count submissions from submissionData
  const submittedCount = countDailySubmissions(submissionData, config);
  const percentage = (submittedCount / totalExpected) * 100;

  return {
    total_events_required: totalExpected,
    total_events_submitted: submittedCount,
    completeness_percentage: percentage,
    compliance_status: getComplianceStatus(percentage),
    events_breakdown: {
      daily_tracking: {
        total_days: config.total_days,
        frequency_per_day: config.frequency_per_day,
        required: totalExpected,
        submitted: submittedCount,
        percentage: percentage,
      },
    },
  };
};

/**
 * Mode 3: Weekly Compliance
 * Calculate per-day breakdown based on weekly_config
 */
const calculateWeeklyCompliance = (submissionData, calendar) => {
  const config = calendar.weekly_config;
  const breakdown = {};
  let totalSubmitted = 0;

  // Count submissions for each configured day
  for (const dayConfig of config.days) {
    const submitted = countWeeklySubmissions(submissionData, dayConfig);
    const required = dayConfig.count;
    const percentage = (submitted / required) * 100;

    breakdown[dayConfig.name] = {
      required: required,
      submitted: submitted,
      missing: required - submitted,
      percentage: percentage,
    };

    totalSubmitted += submitted;
  }

  const percentage = (totalSubmitted / config.total_events) * 100;

  return {
    total_events_required: config.total_events,
    total_events_submitted: totalSubmitted,
    completeness_percentage: percentage,
    compliance_status: getComplianceStatus(percentage),
    events_breakdown: breakdown,
  };
};

/**
 * Helper: Count daily submissions
 * Matches submission dates against config.dates
 */
const countDailySubmissions = (submissionData, config) => {
  if (!submissionData || !Array.isArray(submissionData)) {
    return 0;
  }

  const configDates = config.dates || [];
  let count = 0;

  // Count submissions that match the configured dates
  for (const submission of submissionData) {
    const submissionDate = submission.date || submission.created_at;
    if (submissionDate) {
      // 🔧 FIX: Convert Date object to string if needed
      const dateString =
        submissionDate instanceof Date
          ? submissionDate.toISOString()
          : submissionDate;
      const dateStr = dateString.split('T')[0]; // Get YYYY-MM-DD part
      if (configDates.includes(dateStr)) {
        count++;
      }
    }
  }

  return count;
};

/**
 * Helper: Count weekly submissions for a specific day
 * Matches submission dates against dayConfig.dates
 */
const countWeeklySubmissions = (submissionData, dayConfig) => {
  if (!submissionData || !Array.isArray(submissionData)) {
    return 0;
  }

  const expectedDates = dayConfig.dates || [];
  let count = 0;

  // Count submissions that match this day's expected dates
  for (const submission of submissionData) {
    const submissionDate = submission.date || submission.created_at;
    if (submissionDate) {
      // 🔧 FIX: Convert Date object to string if needed
      const dateString =
        submissionDate instanceof Date
          ? submissionDate.toISOString()
          : submissionDate;
      const dateStr = dateString.split('T')[0];
      if (expectedDates.includes(dateStr)) {
        count++;
      }
    }
  }

  return count;
};

/**
 * Helper: Get compliance status based on percentage
 */
const getComplianceStatus = (percentage) => {
  if (percentage === 100) return 'complete';
  if (percentage > 0) return 'partial';
  return 'incomplete';
};

/**
 * Return the full set of scheduled months for a project, enriched with
 * lock status per node.
 *
 * Source of truth (two tables, joined in memory):
 *
 *  1. `event_calendar` (tenant_id, project_id)
 *     — The definitive list of months for which this project has calendar
 *       entries.  Seeded when the module is published (full current year).
 *     — If this table has no rows for the project yet (module never published,
 *       or calendar generation failed), we fall back to generating the 12
 *       months of the current calendar year so the UI is never empty.
 *
 *  2. `event_compliance_tracking` (tenant_id, project_id, node_id)
 *     — Tracks compliance per node. `is_locked = true` means the period is
 *       closed for that specific node.
 *     — A month in the calendar that has no compliance row for this node is
 *       considered UNLOCKED (the node hasn't submitted yet).
 *
 * @param {string} tenantId
 * @param {string} projectId
 * @param {string} nodeId
 * @returns {{
 *   allowedDates:      string[],  // "YYYY-MM" — open for submission
 *   lockedDates:       string[],  // "YYYY-MM" — locked for this node
 *   allDates:          string[],  // "YYYY-MM" — every scheduled month
 *   hasComplianceData: boolean,
 *   fallback:          boolean    // true when event_calendar had no rows
 * }}
 */
const getAllowedMonths = async (tenantId, projectId, nodeId) => {
  // ── Step 1: calendar months ────────────────────────────────────────────
  const calResult = await postgresPool.query(
    `SELECT DISTINCT TO_CHAR(month, 'YYYY-MM') AS month_key
     FROM event_calendar
     WHERE tenant_id = $1 AND project_id = $2
     ORDER BY month_key ASC`,
    [tenantId, projectId]
  );

  let allDates = calResult.rows.map((r) => r.month_key);
  let fallback  = false;

  if (allDates.length === 0) {
    // Fallback: build 12 months for the current calendar year
    fallback = true;
    const year = new Date().getFullYear();
    allDates = Array.from({ length: 12 }, (_, i) =>
      `${year}-${String(i + 1).padStart(2, '0')}`
    );
  }

  // ── Step 2: lock status for this node ─────────────────────────────────
  const lockResult = await postgresPool.query(
    `SELECT TO_CHAR(month, 'YYYY-MM') AS month_key, is_locked
     FROM event_compliance_tracking
     WHERE tenant_id = $1 AND project_id = $2 AND node_id = $3`,
    [tenantId, projectId, nodeId]
  );

  // month_key → is_locked (only rows that exist)
  const lockMap = new Map(
    lockResult.rows.map((r) => [r.month_key, r.is_locked === true])
  );

  // ── Step 3: categorise ────────────────────────────────────────────────
  const allowedDates = [];
  const lockedDates  = [];

  for (const m of allDates) {
    if (lockMap.get(m) === true) {
      lockedDates.push(m);
    } else {
      allowedDates.push(m);
    }
  }

  return {
    allowedDates,
    lockedDates,
    allDates,
    hasComplianceData: !fallback,
    fallback,
  };
};

/**
 * Check whether a specific month is locked for submission.
 *
 * Returns null when no compliance tracking row exists (not locked).
 * Returns true  when the row exists and is_locked = true.
 * Returns false when the row exists and is_locked = false.
 *
 * @param {string} tenantId
 * @param {string} projectId
 * @param {string} nodeId
 * @param {string} month  "YYYY-MM"
 */
const isMonthLocked = async (tenantId, projectId, nodeId, month) => {
  // Accept both "YYYY-MM" and "YYYY-MM-DD"
  const monthDate =
    typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)
      ? `${month}-01`
      : month;
  const result = await postgresPool.query(
    `SELECT is_locked FROM event_compliance_tracking
     WHERE tenant_id = $1 AND project_id = $2 AND node_id = $3 AND month = $4`,
    [tenantId, projectId, nodeId, monthDate]
  );

  if (!result.rows.length) return null;
  return result.rows[0].is_locked === true;
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
  calculateCompliance,
  calculateMonthOnlyCompliance,
  calculateDailyCompliance,
  calculateWeeklyCompliance,
  getAllowedMonths,
  isMonthLocked,
};
