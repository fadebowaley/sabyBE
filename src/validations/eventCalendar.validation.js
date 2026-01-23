/**
 * Event Calendar Validation Schemas
 *
 * Joi validation schemas for PERM event calendar endpoints
 * Author: Saby Backend Team
 * Date: 2025-10-29
 */

const Joi = require('joi');

/**
 * Validation for calendar preview endpoint
 */
const previewCalendar = {
  body: Joi.object().keys({
    formId: Joi.string().required().description('Form identifier'),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .description('Month in YYYY-MM-DD format (first day of month)'),
    year: Joi.number()
      .integer()
      .min(2000)
      .max(2100)
      .required()
      .description('Year (2000-2100)'),
  }),
};

/**
 * Validation for regenerate calendar endpoint
 */
const regenerateCalendar = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required().description('Calendar ID'),
  }),
  body: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required()
      .description('Month in YYYY-MM-DD format'),
    year: Joi.number()
      .integer()
      .min(2000)
      .max(2100)
      .required()
      .description('Year'),
  }),
};

/**
 * Validation for calendar stats endpoint
 */
const getCalendarStats = {
  params: Joi.object().keys({
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}(-\d{2})?$/)
      .required()
      .description('Month in YYYY-MM or YYYY-MM-DD format'),
  }),
  query: Joi.object().keys({
    tenant_id: Joi.string().required().description('Tenant ID'),
    project_id: Joi.string().optional().description('Filter by project'),
  }),
};

/**
 * Validation for generate calendar endpoint
 */
const generateCalendar = {
  body: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required(),
    event_types: Joi.array()
      .items(
        Joi.object().keys({
          type: Joi.string().required(),
          name: Joi.string().required(),
          day_of_week: Joi.number().integer().min(0).max(6),
          frequency: Joi.string()
            .valid('daily', 'weekly', 'biweekly', 'monthly')
            .default('weekly'),
        })
      )
      .required(),
  }),
};

/**
 * Validation for get calendars endpoint
 */
const getCalendars = {
  query: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
};

/**
 * Validation for create calendar endpoint
 */
const createCalendar = {
  body: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required(),
    year: Joi.number().integer().min(2000).max(2100).required(),
    event_type: Joi.string().required(),
    event_name: Joi.string().optional(),
    event_dates: Joi.array()
      .items(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/))
      .required(),
    total_events: Joi.number().integer().min(1).required(),
    is_required: Joi.boolean().default(true),
    description: Joi.string().optional(),
  }),
};

/**
 * Validation for update calendar endpoint
 */
const updateCalendar = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object().keys({
    event_name: Joi.string().optional(),
    event_dates: Joi.array().items(Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/)),
    total_events: Joi.number().integer().min(1),
    is_required: Joi.boolean(),
    is_active: Joi.boolean(),
    description: Joi.string(),
  }),
};

/**
 * Validation for delete calendar endpoint
 */
const deleteCalendar = {
  params: Joi.object().keys({
    id: Joi.string().uuid().required(),
  }),
};

/**
 * Validation for validate event date endpoint
 */
const validateEventDate = {
  body: Joi.object().keys({
    tenant_id: Joi.string().required(),
    project_id: Joi.string().required(),
    month: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required(),
    event_type: Joi.string().required(),
    event_date: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .required(),
  }),
};

module.exports = {
  previewCalendar,
  regenerateCalendar,
  getCalendarStats,
  generateCalendar,
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  validateEventDate,
};


