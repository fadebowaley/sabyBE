/**
 * Event Calendar Controller
 *
 * Handles HTTP requests for PERM event calendar management
 * Author: Saby Backend Team
 * Date: 2025-10-19
 * Updated: 2025-10-29 - Added flexible tracking mode support
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { eventCalendarService } = require('../services');
const ApiError = require('../utils/ApiError');
const ProjectForm = require('../models/projectForm.model');

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

const patchCalendarDates = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updatedCalendar = await eventCalendarService.patchDailyCalendarDates(
    id,
    req.body || {}
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Calendar dates updated successfully',
    data: updatedCalendar,
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

/**
 * ✨ NEW: Preview calendar before generation
 * Shows expected submissions based on form configuration
 * @route POST /v1/event-calendar/preview
 * @access Private
 */
const previewCalendar = catchAsync(async (req, res) => {
  const { formId, month, year } = req.body;

  if (!formId || !month || !year) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: formId, month, year'
    );
  }

  // Fetch form
  const form = await ProjectForm.findOne({ formId }).select(
    'capabilities.experience.compliance projectId tenantId formId identity'
  );

  if (!form) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  if (!form.capabilities?.experience?.compliance?.enabled) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'PERM is not enabled for this module'
    );
  }

  // Generate preview (doesn't save to database)
  const preview = await eventCalendarService.generateCalendarFromForm(
    form,
    month,
    year
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Calendar preview generated',
    preview: {
      tracking_mode: preview.mode,
      total_events: preview.total_events,
      breakdown: preview.breakdown || null,
      days_configured: preview.days_configured || null,
      frequency_per_day: preview.frequency_per_day || null,
      total_days: preview.total_days || null,
      month,
      year,
    },
    form: {
      formId: form.formId,
      projectId: form.projectId,
      name: form.identity?.name,
    },
  });
});

/**
 * ✨ NEW: Regenerate calendar for a specific month
 * Useful when form settings change and calendar needs to be recreated
 * @route POST /v1/event-calendar/regenerate/:id
 * @access Private (Admin/Owner)
 */
const regenerateCalendar = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { month, year } = req.body;

  if (!month || !year) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: month, year'
    );
  }

  // Get existing calendar
  const existingCalendar = await eventCalendarService.getCalendarById(id);

  if (!existingCalendar) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Calendar not found');
  }

  // Fetch form
  const form = await ProjectForm.findOne({
    projectId: existingCalendar.project_id,
  }).select('capabilities.experience.compliance projectId tenantId formId');

  if (!form) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  }

  // Regenerate calendar
  const result = await eventCalendarService.generateCalendarFromForm(
    form,
    month,
    year
  );

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Calendar regenerated successfully',
    data: result,
  });
});

/**
 * ✨ NEW: Get calendar statistics for a month
 * Shows overall calendar stats across all forms
 * @route GET /v1/event-calendar/stats/:month
 * @access Private
 */
const getCalendarStats = catchAsync(async (req, res) => {
  const { month } = req.params;
  const { tenant_id, project_id } = req.query;

  if (!tenant_id) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required query param: tenant_id'
    );
  }

  // Get all calendars for the month
  const calendars = await eventCalendarService.getCalendar(
    tenant_id,
    project_id || null,
    month
  );

  if (!calendars || calendars.length === 0) {
    return res.status(httpStatus.OK).send({
      success: true,
      message: 'No calendars found for this month',
      stats: {
        total_calendars: 0,
        by_tracking_mode: {},
        total_expected_submissions: 0,
      },
    });
  }

  // Calculate statistics
  const stats = {
    total_calendars: calendars.length,
    by_tracking_mode: {
      none: 0,
      daily: 0,
      weekly: 0,
    },
    total_expected_submissions: 0,
    calendars_by_mode: {
      none: [],
      daily: [],
      weekly: [],
    },
  };

  calendars.forEach((calendar) => {
    const mode = calendar.tracking_mode || 'weekly';
    stats.by_tracking_mode[mode] = (stats.by_tracking_mode[mode] || 0) + 1;
    stats.total_expected_submissions += calendar.total_events || 0;
    stats.calendars_by_mode[mode].push({
      id: calendar.id,
      project_id: calendar.project_id,
      form_id: calendar.form_id,
      total_events: calendar.total_events,
    });
  });

  res.status(httpStatus.OK).send({
    success: true,
    month,
    stats,
  });
});

module.exports = {
  generateCalendar,
  getCalendars,
  getCalendarByMonth,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  patchCalendarDates,
  validateEventDate,
  // ✨ NEW: Flexible tracking mode endpoints
  previewCalendar,
  regenerateCalendar,
  getCalendarStats,
};
