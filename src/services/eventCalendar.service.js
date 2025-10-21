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

    query += ` ORDER BY year, month, event_date`;

    const result = await postgresPool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching calendar:', error);
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
        (tenant_id, project_id, form_id, event_name, event_date, month, year, is_required, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, project_id, form_id, month, year, event_name) 
        DO UPDATE SET
          event_date = EXCLUDED.event_date,
          is_required = EXCLUDED.is_required,
          updated_at = NOW()
        RETURNING *
      `,
        [
          tenant_id,
          project_id,
          form_id,
          event.name || event.event_name,
          event.date || event.event_date,
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

    query += ` ORDER BY year DESC, month DESC, event_date DESC LIMIT $${
      params.length + 1
    }`;
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

    if (updateData.event_date) {
      fields.push(`event_date = $${paramIndex++}`);
      values.push(updateData.event_date);
    }

    if (updateData.is_required !== undefined) {
      fields.push(`is_required = $${paramIndex++}`);
      values.push(updateData.is_required);
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
      ORDER BY event_date
    `,
      [tenant_id, project_id, month, year]
    );

    return result.rows;
  } catch (error) {
    logger.error('Error fetching events by month:', error);
    throw error;
  }
};

module.exports = {
  getCalendar,
  generateCalendar,
  createCalendar,
  getAllCalendars,
  updateCalendar,
  deleteCalendar,
  getEventsByMonth,
};
