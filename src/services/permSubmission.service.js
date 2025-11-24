/**
 * PERM Submission Service
 *
 * Purpose: Business logic for PERM (Per Event Reporting Model) submissions
 * Author: Saby Backend Team
 * Date: 2025-10-21
 *
 * Features:
 * - Submit/upsert PERM data with merge
 * - Retrieve PERM submissions
 * - Lock/unlock submissions
 * - Validate submission data
 * - Calculate compliance metrics
 */

const httpStatus = require('http-status');
const { v4: uuidv4 } = require('uuid');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
// Direct imports to avoid circular dependency
const eventCalendarService = require('./eventCalendar.service');
const eventComplianceService = require('./eventCompliance.service');
const calendarEnforcementService = require('./calendarEnforcement.service');

/**
 * Calculate compliance metrics based on event data
 * @param {Object} data - Submission data
 * @returns {Object} Compliance metrics
 */
const calculateComplianceMetrics = (data) => {
  // Extract event-related data from the submission
  const events = data.events || [];
  const requiredEvents = data.required_events || [];

  const totalEventsRequired = requiredEvents.length || 0;
  const totalEventsSubmitted = events.length || 0;

  let compliancePercentage = 0;
  if (totalEventsRequired > 0) {
    compliancePercentage = (totalEventsSubmitted / totalEventsRequired) * 100;
  }

  let completenessStatus = 'incomplete';
  if (compliancePercentage >= 100) {
    completenessStatus = 'complete';
  } else if (compliancePercentage >= 40) {
    completenessStatus = 'partial';
  }

  return {
    event_compliance_percentage: Math.round(compliancePercentage * 100) / 100,
    completeness_status: completenessStatus,
    total_events_required: totalEventsRequired,
    total_events_submitted: totalEventsSubmitted,
  };
};

/**
 * Validate PERM submission data
 * @param {Object} submissionData - Submission data to validate
 * @returns {Object} Validation result
 */
const validatePERMSubmission = async (submissionData) => {
  const { tenant_id, project_id, month, data } = submissionData;

  const errors = [];
  const warnings = [];

  // Required field validation
  if (!tenant_id)
    errors.push({ field: 'tenant_id', message: 'Tenant ID is required' });
  if (!project_id)
    errors.push({ field: 'project_id', message: 'Project ID is required' });
  if (!month) errors.push({ field: 'month', message: 'Month is required' });
  if (!data) errors.push({ field: 'data', message: 'Data is required' });

  // Validate month format
  if (month && !/^\d{4}-\d{2}-\d{2}/.test(month)) {
    errors.push({
      field: 'month',
      message: 'Month must be in YYYY-MM-DD format',
    });
  }

  // Validate data structure
  if (data && typeof data !== 'object') {
    errors.push({ field: 'data', message: 'Data must be an object' });
  }

  // Calculate compliance metrics
  if (data && typeof data === 'object') {
    const metrics = calculateComplianceMetrics(data);

    if (metrics.event_compliance_percentage < 40) {
      warnings.push({
        field: 'compliance',
        message: `Low compliance: ${metrics.event_compliance_percentage}% (${metrics.total_events_submitted}/${metrics.total_events_required} events)`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Submit PERM data (upsert with merge)
 * @param {Object} payload - Submission payload
 * @returns {Promise<Object>} Submission result with action (created/updated)
 */
const submitPERMData = async (payload) => {
  // 🔧 FIX: Normalize month format BEFORE destructuring
  // PostgreSQL date columns require full date format
  logger.info(`[PERM DEBUG] Raw payload.month: "${payload.month}"`);

  if (
    payload.month &&
    typeof payload.month === 'string' &&
    payload.month.length === 7 &&
    /^\d{4}-\d{2}$/.test(payload.month)
  ) {
    const originalMonth = payload.month;
    payload.month = `${payload.month}-01`;
    logger.info(
      `[PERM] ✅ Normalized month: ${originalMonth} → ${payload.month}`
    );
  }

  let {
    tenant_id,
    project_id,
    node_id,
    month,
    year,
    data,
    user_id,
    submitted_by,
    form_id,
    project_name,
    project_category,
    source = 'api',
    submission_date: submission_date_raw,
  } = payload;

// CamelCase aliases for downstream consumers
const tenantId = tenant_id;
const projectId = project_id;
const nodeId = node_id;

  logger.info(`[PERM DEBUG] After destructure, month = "${month}"`);

  try {
    // ✨ NEW: Fetch calendar to determine tracking mode and calculate compliance
    let calendar = null;
    let complianceMetrics = null;

    try {
      // Fetch calendar for this month
      const calendars = await eventCalendarService.getCalendar(
        tenant_id,
        project_id,
        month
      );

      if (calendars && calendars.length > 0) {
        calendar = calendars[0]; // Take first matching calendar

        // Get all submissions for this node/month for compliance calculation
        const existingSubmissionsQuery = `
          SELECT created_at, data, month FROM form_submissions
          WHERE tenant_id = $1
            AND project_id = $2
            AND node_id = $3
            AND month = $4
            AND perm_enabled = true
          ORDER BY created_at
        `;

        const existingSubmissions = await postgresPool.query(
          existingSubmissionsQuery,
          [tenant_id, project_id, node_id, month]
        );

        // Add current submission to the list for calculation
        const allSubmissions = [
          ...existingSubmissions.rows,
          { created_at: new Date(), data, month },
        ];

        // ✨ NEW: Use flexible compliance calculator based on tracking_mode
        complianceMetrics = await eventComplianceService.calculateCompliance(
          allSubmissions,
          calendar
        );

        logger.info(
          `[PERM] Calculated ${calendar.tracking_mode} compliance: ${complianceMetrics.completeness_percentage}%`
        );
      } else {
        // No calendar found - fall back to old method
        logger.warn(
          `[PERM] No calendar found for ${tenant_id}/${project_id}/${month} - using legacy calculation`
        );
        complianceMetrics = calculateComplianceMetrics(data);
      }
    } catch (calError) {
      // Calendar fetch failed - fall back to legacy calculation
      logger.warn(
        `[PERM] Calendar fetch failed: ${calError.message} - using legacy calculation`
      );
      complianceMetrics = calculateComplianceMetrics(data);
    }

    // Validate submission
    const validation = await validatePERMSubmission({
      tenant_id,
      project_id,
      month,
      data,
    });

    // Prevent new submissions if compliance tracking is locked for this node/month
    const lockCheck = await postgresPool.query(
      `
        SELECT 1
        FROM event_compliance_tracking
        WHERE tenant_id = $1
          AND project_id = $2
          AND node_id IS NOT DISTINCT FROM $3
          AND month = $4
          AND is_locked = true
        LIMIT 1
      `,
      [tenant_id, project_id, node_id || null, month]
    );

    if (lockCheck.rows.length > 0) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Submissions for this node/month are locked'
      );
    }

    const submission_date =
      submission_date_raw ||
      payload.date ||
      payload.payload?.date ||
      new Date().toISOString().split('T')[0];

    // Validate backdating and calendar existence BEFORE transaction
    // (quota check will be done inside transaction with locking)
    if (calendar) {
      const submissionDateObj = new Date(submission_date);
      const today = new Date();
      const allowBackdating = calendar.permSettings?.allowBackdating || false;

      if (!allowBackdating && submissionDateObj < today.setHours(0, 0, 0, 0)) {
        throw new ApiError(
          httpStatus.UNPROCESSABLE_ENTITY,
          'Backdated submissions are not allowed for this form'
        );
      }
    }

    const compliancePercentage =
      complianceMetrics.event_compliance_percentage ??
      complianceMetrics.completeness_percentage ??
      0;
    const complianceStatus =
      complianceMetrics.completeness_status ??
      complianceMetrics.compliance_status ??
      'incomplete';
    const totalRequired = complianceMetrics.total_events_required ?? 0;
    const totalSubmitted = complianceMetrics.total_events_submitted ?? 0;

    if (!year && month) {
      const monthDate = new Date(month);
      if (!Number.isNaN(monthDate.valueOf())) {
        year = monthDate.getUTCFullYear();
      }
    }

    // Use transaction with row-level locking to prevent race conditions
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');

      // Re-check quota with row-level lock to prevent race conditions
      // Lock rows first, then count to prevent concurrent modifications
      const lockQuery = `
        SELECT id
        FROM form_submissions
        WHERE tenant_id = $1
          AND project_id = $2
          AND node_id IS NOT DISTINCT FROM $3
          AND submission_date = $4
          AND status != 'deleted'
        FOR UPDATE
      `;
      await client.query(lockQuery, [
        tenant_id,
        project_id,
        node_id || null,
        submission_date,
      ]);
      
      // Now count the locked rows
      const quotaCheckQuery = `
        SELECT COUNT(*) AS count
        FROM form_submissions
        WHERE tenant_id = $1
          AND project_id = $2
          AND node_id IS NOT DISTINCT FROM $3
          AND submission_date = $4
          AND status != 'deleted'
      `;
      const quotaResult = await client.query(quotaCheckQuery, [
        tenant_id,
        project_id,
        node_id || null,
        submission_date,
      ]);
      const usedSlots = Number(quotaResult.rows[0]?.count || 0);

      // Get calendar slot to check quota limit
      const calendarRows = await eventCalendarService.getCalendar(
        tenant_id,
        project_id,
        month
      );
      if (!calendarRows || calendarRows.length === 0) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          'Calendar not found for this month'
        );
      }

      const slot = calendarRows[0];
      const config = slot.daily_config || slot.weekly_config || {};
      const dates = config.dates || [];
      const submissionDateStr = submission_date;
      let totalSlots = 1;

      if (dates.includes(submissionDateStr)) {
        totalSlots = config.frequency_per_day || config.count || 1;
      }

      if (usedSlots >= totalSlots) {
        await client.query('ROLLBACK');
        throw new ApiError(
          httpStatus.TOO_MANY_REQUESTS,
          'Daily submission quota reached for this date'
        );
      }

      // Insert submission within transaction
      const insertQuery = `
        INSERT INTO form_submissions (
          id, tenant_id, project_id, node_id, form_id,
          project_name, project_category, user_id,
          data, source, status,
          month, year, perm_enabled,
          event_compliance_percentage, completeness_status,
          total_events_required, total_events_submitted,
          validation_status, validation_errors, validation_warnings,
          submitted_by, submitted_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, NOW(), NOW()
        )
        RETURNING *
      `;

      const submissionId = uuidv4();

      const insertResult = await client.query(insertQuery, [
      submissionId,
      tenant_id,
      project_id,
      node_id,
      form_id || project_id,
      project_name || 'PERM Project',
      project_category || 'perm',
      user_id || submitted_by,
      JSON.stringify(data),
      source,
      'completed',
      month,
      year,
      true,
      compliancePercentage,
      complianceStatus,
      totalRequired,
      totalSubmitted,
      validation.isValid ? 'valid' : 'invalid',
      JSON.stringify(validation.errors),
      JSON.stringify(validation.warnings),
      submitted_by,
      new Date(submission_date),
    ]);

      await client.query('COMMIT');
      const submission = insertResult.rows[0];
      logger.info(`✅ PERM submission created: ${submission.id}`);

      return {
        submission,
        action: 'created',
        existed: false,
        compliance: complianceMetrics,
        validation,
        tracking_mode: calendar?.tracking_mode || 'legacy',
        calendar_id: calendar?.id || null,
      };
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('❌ Error submitting PERM data:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to submit PERM data: ${error.message}`
    );
  }
};

/**
 * Get PERM submission by node and month
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} node_id - Node ID
 * @param {string} month - Month (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Submission or null
 */
const getPERMSubmission = async (tenant_id, project_id, node_id, month) => {
  try {
    const query = `
      SELECT * FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id = $3
        AND month = $4
        AND perm_enabled = true
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await postgresPool.query(query, [
      tenant_id,
      project_id,
      node_id,
      month,
    ]);

    return result.rows[0] || null;
  } catch (error) {
    logger.error('❌ Error getting PERM submission:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get PERM submission: ${error.message}`
    );
  }
};

/**
 * Get all PERM submissions for a month
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-DD)
 * @returns {Promise<Array>} Submissions
 */
const getPERMSubmissions = async (tenant_id, project_id, month) => {
  try {
    const query = `
      SELECT * FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = $3
        AND perm_enabled = true
      ORDER BY node_id, created_at DESC
    `;

    const result = await postgresPool.query(query, [
      tenant_id,
      project_id,
      month,
    ]);
    return result.rows;
  } catch (error) {
    logger.error('❌ Error getting PERM submissions:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get PERM submissions: ${error.message}`
    );
  }
};

/**
 * Lock PERM submission
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID
 * @param {string} reason - Lock reason
 * @returns {Promise<Object>} Locked submission
 */
const lockPERMSubmission = async (id, user_id, reason = 'manual_lock') => {
  try {
    const query = `
      UPDATE form_submissions
      SET
        is_locked = true,
        locked_at = NOW(),
        locked_by = $1,
        lock_reason = $2,
        updated_at = NOW()
      WHERE id = $3
        AND perm_enabled = true
        AND is_locked = false
      RETURNING *
    `;

    const result = await postgresPool.query(query, [user_id, reason, id]);

    if (result.rows.length === 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Submission not found or already locked'
      );
    }

    logger.info(`✅ PERM submission locked: ${id}`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('❌ Error locking PERM submission:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to lock PERM submission: ${error.message}`
    );
  }
};

/**
 * Unlock PERM submission
 * @param {string} id - Submission ID
 * @param {string} user_id - User ID
 * @returns {Promise<Object>} Unlocked submission
 */
const unlockPERMSubmission = async (id, user_id) => {
  try {
    const query = `
      UPDATE form_submissions
      SET
        is_locked = false,
        locked_at = NULL,
        locked_by = NULL,
        lock_reason = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND perm_enabled = true
        AND is_locked = true
      RETURNING *
    `;

    const result = await postgresPool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Submission not found or already unlocked'
      );
    }

    logger.info(`✅ PERM submission unlocked: ${id} by ${user_id}`);
    return result.rows[0];
  } catch (error) {
    if (error instanceof ApiError) throw error;
    logger.error('❌ Error unlocking PERM submission:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to unlock PERM submission: ${error.message}`
    );
  }
};

/**
 * Get compliance summary for a project/month
 * @param {string} tenant_id - Tenant ID
 * @param {string} project_id - Project ID
 * @param {string} month - Month (YYYY-MM-DD)
 * @returns {Promise<Object>} Compliance summary
 */
const getComplianceSummary = async (tenant_id, project_id, month) => {
  try {
    const query = `
      SELECT
        COUNT(*) as total_submissions,
        COUNT(*) FILTER (WHERE completeness_status = 'complete') as complete_submissions,
        COUNT(*) FILTER (WHERE completeness_status = 'partial') as partial_submissions,
        COUNT(*) FILTER (WHERE completeness_status = 'incomplete') as incomplete_submissions,
        COUNT(*) FILTER (WHERE is_locked = true) as locked_submissions,
        AVG(event_compliance_percentage) as avg_compliance_percentage,
        SUM(total_events_required) as total_events_required,
        SUM(total_events_submitted) as total_events_submitted
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = $3
        AND perm_enabled = true
    `;

    const result = await postgresPool.query(query, [
      tenant_id,
      project_id,
      month,
    ]);

    const summary = result.rows[0];

    // Calculate overall compliance percentage
    const overallCompliance =
      summary.total_events_required > 0
        ? (parseInt(summary.total_events_submitted) /
            parseInt(summary.total_events_required)) *
          100
        : 0;

    return {
      ...summary,
      overall_compliance_percentage: Math.round(overallCompliance * 100) / 100,
      avg_compliance_percentage:
        Math.round(parseFloat(summary.avg_compliance_percentage || 0) * 100) /
        100,
    };
  } catch (error) {
    logger.error('❌ Error getting compliance summary:', error.message);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to get compliance summary: ${error.message}`
    );
  }
};

module.exports = {
  submitPERMData,
  getPERMSubmission,
  getPERMSubmissions,
  lockPERMSubmission,
  unlockPERMSubmission,
  validatePERMSubmission,
  getComplianceSummary,
  calculateComplianceMetrics,
};
