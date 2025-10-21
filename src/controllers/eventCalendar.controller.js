/**
 * Event Calendar Controller
 *
 * Handles HTTP requests for PERM event calendar management
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { eventCalendarService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Generate event calendar for a month
 * @route POST /v1/event-calendar/generate
 * @access Private (Admin/Owner)
 */
const generateCalendar = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, event_types } = req.body;

  if (!tenant_id || !project_id || !month || !event_types) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month, event_types'
    );
  }

  const result = await eventCalendarService.generateCalendar(
    tenant_id,
    project_id,
    month,
    event_types
  );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: `Generated ${result.count} calendar entries for ${month}`,
    data: result,
  });
});

/**
 * Get all calendars for a project
 * @route GET /v1/event-calendar
 * @access Private
 */
const getCalendars = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  let calendars;

  if (month) {
    // Get calendar for specific month
    calendars = await eventCalendarService.getCalendar(
      tenant_id,
      project_id,
      month
    );
  } else {
    // Get all calendars for project
    calendars = await eventCalendarService.getCalendarByProjectMonth(
      tenant_id,
      project_id,
      null
    );
  }

  res.status(httpStatus.OK).send({
    success: true,
    count: calendars.length,
    data: calendars,
  });
});

/**
 * Get calendar for specific month
 * @route GET /v1/event-calendar/:month
 * @access Private
 */
const getCalendarByMonth = catchAsync(async (req, res) => {
  const { month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id || !project_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id'
    );
  }

  const calendar = await eventCalendarService.getCalendar(
    tenant_id,
    project_id,
    month
  );

  if (!calendar || calendar.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, `No calendar found for ${month}`);
  }

  res.status(httpStatus.OK).send({
    success: true,
    count: calendar.length,
    data: calendar,
  });
});

/**
 * Create calendar manually
 * @route POST /v1/event-calendar
 * @access Private (Admin/Owner)
 */
const createCalendar = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, event_type, event_date } = req.body;

  if (!tenant_id || !project_id || !month || !event_type || !event_date) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month, event_type, event_date'
    );
  }

  const result = await eventCalendarService.createCalendar(
    tenant_id,
    project_id,
    month,
    [{ name: event_type, date: event_date }]
  );

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Calendar entry created successfully',
    data: result,
  });
});

/**
 * Update calendar
 * @route PUT /v1/event-calendar/:id
 * @access Private (Admin/Owner)
 */
const updateCalendar = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { tenant_id, project_id, month, event_types } = req.body;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month'
    );
  }

  const result = await eventCalendarService.updateCalendar(
    tenant_id,
    project_id,
    month,
    event_types
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Calendar updated successfully',
    data: result,
  });
});

/**
 * Delete calendar
 * @route DELETE /v1/event-calendar/:id
 * @access Private (Admin/Owner)
 */
const deleteCalendar = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { tenant_id, project_id, month } = req.query;

  if (!tenant_id || !project_id || !month) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query params: tenant_id, project_id, month'
    );
  }

  await eventCalendarService.deleteCalendar(tenant_id, project_id, month);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Calendar deleted successfully',
  });
});

/**
 * Validate event date against calendar
 * @route POST /v1/event-calendar/validate
 * @access Private
 */
const validateEventDate = catchAsync(async (req, res) => {
  const { tenant_id, project_id, month, event_type, event_date } = req.body;

  if (!tenant_id || !project_id || !month || !event_type || !event_date) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenant_id, project_id, month, event_type, event_date'
    );
  }

  const calendar = await eventCalendarService.getCalendar(
    tenant_id,
    project_id,
    month
  );

  if (!calendar || calendar.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, `No calendar found for ${month}`);
  }

  const isValid = await eventCalendarService.validateEventDate(
    event_date,
    { name: event_type },
    calendar
  );

  res.status(httpStatus.OK).send({
    success: true,
    valid: isValid,
    message: isValid ? 'Event date is valid' : 'Event date is invalid',
  });
});

module.exports = {
  generateCalendar,
  getCalendars,
  getCalendarByMonth,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  validateEventDate,
};
