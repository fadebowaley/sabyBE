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
  auth('view:calendar'),
  eventCalendarController.previewCalendar
);

// ✨ NEW: Regenerate existing calendar
router.post(
  '/regenerate/:id',
  auth('manage:calendar'),
  eventCalendarController.regenerateCalendar
);

// ✨ NEW: Get calendar statistics
router.get(
  '/stats/:month',
  auth('view:calendar'),
  eventCalendarController.getCalendarStats
);

// Generate calendar for a month
router.post(
  '/generate',
  auth('manage:calendar'),
  eventCalendarController.generateCalendar
);

// Validate event date
router.post(
  '/validate',
  auth('view:calendar'),
  eventCalendarController.validateEventDate
);

// Get all calendars or by month
router.get('/', auth('view:calendar'), eventCalendarController.getCalendars);

// Get calendar by specific month
router.get(
  '/:month',
  auth('view:calendar'),
  eventCalendarController.getCalendarByMonth
);

// Create calendar entry
router.post(
  '/',
  auth('manage:calendar'),
  eventCalendarController.createCalendar
);

// Update calendar
router.put(
  '/:id',
  auth('manage:calendar'),
  eventCalendarController.updateCalendar
);

router.patch(
  '/:id/dates',
  auth('manage:calendar'),
  eventCalendarController.patchCalendarDates
);

// Delete calendar
router.delete(
  '/:id',
  auth('manage:calendar'),
  eventCalendarController.deleteCalendar
);

module.exports = router;