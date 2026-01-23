/**
 * Event Calendar Routes
 *
 * Defines routes for PERM event calendar management
 * Author: Saby Backend Team
 * Date: 2025-10-19
 * Updated: 2025-10-29 - Added flexible tracking mode endpoints
 */

const express = require('express');
const auth = require('../../middlewares/auth');
const eventCalendarController = require('../../controllers/eventCalendar.controller');

const router = express.Router();

// ✨ NEW: Preview calendar (doesn't save to DB)
router.post(
  '/preview',
  auth('calendar:read'),
  eventCalendarController.previewCalendar
);

// ✨ NEW: Regenerate existing calendar
router.post(
  '/regenerate/:id',
  auth('calendar:manage'),
  eventCalendarController.regenerateCalendar
);

// ✨ NEW: Get calendar statistics
router.get(
  '/stats/:month',
  auth('calendar:read'),
  eventCalendarController.getCalendarStats
);

// Generate calendar for a month
router.post(
  '/generate',
  auth('calendar:manage'),
  eventCalendarController.generateCalendar
);

// Validate event date
router.post(
  '/validate',
  auth('calendar:read'),
  eventCalendarController.validateEventDate
);

// Get all calendars or by month
router.get('/', auth('calendar:read'), eventCalendarController.getCalendars);

// Get calendar by specific month
router.get(
  '/:month',
  auth('calendar:read'),
  eventCalendarController.getCalendarByMonth
);

// Create calendar entry
router.post(
  '/',
  auth('calendar:manage'),
  eventCalendarController.createCalendar
);

// Update calendar
router.put(
  '/:id',
  auth('calendar:manage'),
  eventCalendarController.updateCalendar
);

router.patch(
  '/:id/dates',
  auth('calendar:manage'),
  eventCalendarController.patchCalendarDates
);

// Delete calendar
router.delete(
  '/:id',
  auth('calendar:manage'),
  eventCalendarController.deleteCalendar
);

module.exports = router;