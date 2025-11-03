/**
 * Event Calendar Service
 *
 * Manages event calendars for PERM (Per Event Reporting Model) compliance tracking.
 * Handles calendar generation, event scheduling, and calendar queries.
 */

const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Get calendar for a specific tenant, project, and month
 */
const getCalendar = async (tenant_id, project_id, month, year = null) => {
  try {
    // 🔧 FIX: Normalize month format from "YYYY-MM" to "YYYY-MM-01"
    if (
      month &&
      typeof month === 'string' &&
      month.length === 7 &&
      /^\d{4}-\d{2}$/.test(month)
    ) {
      logger.info(`[Calendar] Normalizing month: ${month} → ${month}-01`);
      month = `${month}-01`;
    }

    let query = `
      SELECT * FROM event_calendar
      WHERE tenant_id = $1
        AND project_id = $2
    `;

    const params = [tenant_id, project_id];

    if (month) {
      if (year) {
        query += ` AND month = $3 AND year = $4`;
        params.push(month, year);
      } else {
        query += ` AND month = $3`;
        params.push(month);
      }
    }

    query += ` ORDER BY year DESC, month DESC`;

    const result = await postgresPool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching calendar:', error);
    throw error;
  }
};

/**
 * Get calendar by ID
 */
const getCalendarById = async (id) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT * FROM event_calendar
      WHERE id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error fetching calendar by ID:', error);
    throw error;
  }
};

/**
 * Generate calendar for a month
 */
const generateCalendar = async (
  tenant_id,
  project_id,
  form_id,
  month,
  year,
  events
) => {
  try {
    const createdEvents = [];

    for (const event of events) {
      const result = await postgresPool.query(
        `
        INSERT INTO event_calendar 
        (tenant_id, project_id, form_id, event_name, month, year, is_required, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (tenant_id, project_id, form_id, month, year, event_name) 
        DO UPDATE SET
          is_required = EXCLUDED.is_required,
          updated_at = NOW()
        RETURNING *
      `,
        [
          tenant_id,
          project_id,
          form_id,
          event.name || event.event_name,
          month,
          year,
          event.required !== undefined
            ? event.required
            : event.is_required !== undefined
            ? event.is_required
            : true,
          event.created_by || 'system',
        ]
      );

      createdEvents.push(result.rows[0]);
    }

    logger.info(
      `Generated ${createdEvents.length} calendar events for ${month}/${year}`
    );
    return createdEvents;
  } catch (error) {
    logger.error('Error generating calendar:', error);
    throw error;
  }
};

/**
 * Create calendar entry
 */
const createCalendar = async (tenant_id, project_id, month, events) => {
  try {
    const year = new Date().getFullYear();
    return await generateCalendar(
      tenant_id,
      project_id,
      project_id,
      month,
      year,
      events
    );
  } catch (error) {
    logger.error('Error creating calendar:', error);
    throw error;
  }
};

/**
 * Get all calendars for a tenant
 */
const getAllCalendars = async (tenant_id, project_id = null, limit = 100) => {
  try {
    let query = `
      SELECT * FROM event_calendar
      WHERE tenant_id = $1
    `;

    const params = [tenant_id];

    if (project_id) {
      query += ` AND project_id = $2`;
      params.push(project_id);
    }

    query += ` ORDER BY year DESC, month DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await postgresPool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching all calendars:', error);
    throw error;
  }
};

/**
 * Update calendar entry
 */
const updateCalendar = async (id, updateData) => {
  try {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.event_name) {
      fields.push(`event_name = $${paramIndex++}`);
      values.push(updateData.event_name);
    }

    if (updateData.is_required !== undefined) {
      fields.push(`is_required = $${paramIndex++}`);
      values.push(updateData.is_required);
    }

    if (updateData.event_dates) {
      fields.push(`event_dates = $${paramIndex++}`);
      values.push(JSON.stringify(updateData.event_dates));
    }

    if (fields.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No fields to update');
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE event_calendar
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await postgresPool.query(query, values);

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Calendar entry not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error updating calendar:', error);
    throw error;
  }
};

/**
 * Delete calendar entry
 */
const deleteCalendar = async (id) => {
  try {
    const result = await postgresPool.query(
      `
      DELETE FROM event_calendar
      WHERE id = $1
      RETURNING *
    `,
      [id]
    );

    if (result.rows.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Calendar entry not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('Error deleting calendar:', error);
    throw error;
  }
};

/**
 * Get events for a specific month/year
 */
const getEventsByMonth = async (tenant_id, project_id, month, year) => {
  try {
    const result = await postgresPool.query(
      `
      SELECT * FROM event_calendar
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = $3
        AND year = $4
      ORDER BY month, year
    `,
      [tenant_id, project_id, month, year]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching events by month:', error);
    throw error;
  }
};

/**
 * ✨ NEW: Generate calendar based on tracking mode from form configuration
 * Master function that routes to appropriate generator based on trackingMode
 */
const generateCalendarFromForm = async (form, month, year) => {
  const { permSettings } = form;

  if (!permSettings?.enabled) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'PERM is not enabled for this form');
  }

  const trackingMode = permSettings.trackingMode || 'none';

  switch (trackingMode) {
    case 'none':
      return generateMonthOnlyCalendar(form, month, year);

    case 'daily':
      return generateDailyCalendar(form, month, year);

    case 'weekly':
      return generateWeeklyCalendar(form, month, year);

    default:
      throw new ApiError(httpStatus.BAD_REQUEST, `Unknown tracking mode: ${trackingMode}`);
  }
};

/**
 * Mode 1: Month Only Calendar (No Day Tracking)
 * Users can submit anytime during the month
 */
const generateMonthOnlyCalendar = async (form, month, year) => {
  try {
    const tenant_id = form.tenantId;
    const project_id = form.projectId;
    const form_id = form.formId || form._id?.toString();

    const result = await postgresPool.query(
      `
      INSERT INTO event_calendar 
      (tenant_id, project_id, form_id, month, year, tracking_mode, total_events, is_required)
      VALUES ($1, $2, $3, $4, $5, 'none', 1, true)
      ON CONFLICT (tenant_id, project_id, COALESCE(form_id, ''), month) 
      DO UPDATE SET
        tracking_mode = 'none',
        total_events = 1,
        updated_at = NOW()
      RETURNING *
    `,
      [tenant_id, project_id, form_id, month, year]
    );

    logger.info(`Generated month-only calendar for ${tenant_id}/${project_id}/${month}`);

    return {
      mode: 'none',
      total_events: 1,
      message: 'Month-only tracking enabled. Users can submit anytime.',
      calendar: result.rows[0],
    };
  } catch (error) {
    logger.error('Error generating month-only calendar:', error);
    throw error;
  }
};

/**
 * Mode 2: Daily Calendar
 * Users submit on configured days with specified frequency
 */
const generateDailyCalendar = async (form, month, year) => {
  try {
    const { tenantId, projectId, formId, permSettings } = form;
    const { dailyConfig } = permSettings;

    if (!dailyConfig?.activeDays || dailyConfig.activeDays.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Daily tracking requires at least one active day'
      );
    }

    // Parse month string (format: 'YYYY-MM-01')
    const monthMatch = month.match(/^(\d{4})-(\d{2})/);
    if (!monthMatch) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid month format: ${month}`);
    }

    const yearNum = parseInt(monthMatch[1]);
    const monthNum = parseInt(monthMatch[2]);

    // Get all dates in month
    const monthStart = new Date(yearNum, monthNum - 1, 1);
    const monthEnd = new Date(yearNum, monthNum, 0);
    const allDates = [];

    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();

      // Check if this day is active
      if (dailyConfig.activeDays.includes(dayOfWeek)) {
        // Skip holidays if configured (basic implementation - could be enhanced)
        if (dailyConfig.skipHolidays && isHoliday(d)) {
          continue;
        }

        allDates.push(d.toISOString().split('T')[0]);
      }
    }

    const totalDays = allDates.length;
    const frequencyPerDay = dailyConfig.frequencyPerDay || 1;
    const totalExpected = totalDays * frequencyPerDay;

    const dailyConfigJson = {
      active_days: dailyConfig.activeDays,
      frequency_per_day: frequencyPerDay,
      skip_holidays: dailyConfig.skipHolidays || false,
      dates: allDates,
      total_days: totalDays,
      total_expected: totalExpected,
    };

    const result = await postgresPool.query(
      `
      INSERT INTO event_calendar 
      (tenant_id, project_id, form_id, month, year, tracking_mode, daily_config, total_events, is_required)
      VALUES ($1, $2, $3, $4, $5, 'daily', $6, $7, true)
      ON CONFLICT (tenant_id, project_id, COALESCE(form_id, ''), month) 
      DO UPDATE SET
        tracking_mode = 'daily',
        daily_config = $6,
        total_events = $7,
        updated_at = NOW()
      RETURNING *
    `,
      [
        tenantId,
        projectId,
        formId || form._id?.toString(),
        month,
        yearNum,
        JSON.stringify(dailyConfigJson),
        totalExpected,
      ]
    );

    logger.info(
      `Generated daily calendar: ${totalExpected} submissions expected for ${month}`
    );

    return {
      mode: 'daily',
      total_days: totalDays,
      frequency_per_day: frequencyPerDay,
      total_events: totalExpected,
      message: `Daily tracking enabled. ${totalExpected} submissions expected.`,
      calendar: result.rows[0],
    };
  } catch (error) {
    logger.error('Error generating daily calendar:', error);
    throw error;
  }
};

/**
 * Mode 3: Weekly Calendar
 * Users submit on specific weekdays with custom frequencies
 */
const generateWeeklyCalendar = async (form, month, year) => {
  try {
    const { tenantId, projectId, formId, permSettings } = form;
    const { weeklyConfig } = permSettings;

    if (!weeklyConfig?.days || weeklyConfig.days.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Weekly tracking requires at least one day configuration'
      );
    }

    // Parse month string
    const monthMatch = month.match(/^(\d{4})-(\d{2})/);
    if (!monthMatch) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid month format: ${month}`);
    }

    const yearNum = parseInt(monthMatch[1]);
    const monthNum = parseInt(monthMatch[2]);

    const monthStart = new Date(yearNum, monthNum - 1, 1);
    const monthEnd = new Date(yearNum, monthNum, 0);

    const weeklyConfigJson = {
      days: [],
      total_events: 0,
    };

    // Process each configured day
    for (const dayConfig of weeklyConfig.days) {
      if (!dayConfig.enabled) continue;

      const dates = [];
      let currentDate = new Date(monthStart);

      // Find all occurrences of this day in the month
      while (currentDate <= monthEnd) {
        if (currentDate.getDay() === dayConfig.day) {
          dates.push(currentDate.toISOString().split('T')[0]);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Apply frequency filter
      let finalDates = dates;
      if (dayConfig.frequency === 'biweekly') {
        // Take every other occurrence
        finalDates = dates.filter((_, idx) => idx % 2 === 0);
      } else if (dayConfig.frequency === 'monthly') {
        // Take only specified occurrences
        finalDates = dates.slice(0, dayConfig.occurrences || 1);
      }

      weeklyConfigJson.days.push({
        day: dayConfig.day,
        name: dayConfig.name,
        frequency: dayConfig.frequency,
        dates: finalDates,
        count: finalDates.length,
      });

      weeklyConfigJson.total_events += finalDates.length;
    }

    const result = await postgresPool.query(
      `
      INSERT INTO event_calendar 
      (tenant_id, project_id, form_id, month, year, tracking_mode, weekly_config, total_events, is_required)
      VALUES ($1, $2, $3, $4, $5, 'weekly', $6, $7, true)
      ON CONFLICT (tenant_id, project_id, COALESCE(form_id, ''), month) 
      DO UPDATE SET
        tracking_mode = 'weekly',
        weekly_config = $6,
        total_events = $7,
        updated_at = NOW()
      RETURNING *
    `,
      [
        tenantId,
        projectId,
        formId || form._id?.toString(),
        month,
        yearNum,
        JSON.stringify(weeklyConfigJson),
        weeklyConfigJson.total_events,
      ]
    );

    logger.info(
      `Generated weekly calendar: ${weeklyConfigJson.total_events} events for ${month}`
    );

    return {
      mode: 'weekly',
      days_configured: weeklyConfigJson.days.length,
      total_events: weeklyConfigJson.total_events,
      breakdown: weeklyConfigJson.days,
      message: `Weekly tracking enabled. ${weeklyConfigJson.total_events} submissions expected.`,
      calendar: result.rows[0],
    };
  } catch (error) {
    logger.error('Error generating weekly calendar:', error);
    throw error;
  }
};

/**
 * Helper: Check if date is a holiday (basic implementation)
 * TODO: Enhance with holiday calendar or external API
 */
const isHoliday = (date) => {
  // Basic implementation - could be enhanced with holiday database
  // For now, return false (no holidays by default)
  return false;
};

module.exports = {
  getCalendar,
  getCalendarById,
  generateCalendar,
  createCalendar,
  getAllCalendars,
  updateCalendar,
  deleteCalendar,
  getEventsByMonth,
  // ✨ NEW: Flexible tracking mode functions
  generateCalendarFromForm,
  generateMonthOnlyCalendar,
  generateDailyCalendar,
  generateWeeklyCalendar,
};
