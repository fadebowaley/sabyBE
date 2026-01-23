const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const eventValidation = require('../../validations/event.validation');
const eventController = require('../../controllers/event.controller');

const router = express.Router();

// Route for creating a new event
router
  .route('/')
  .post(auth('event:create'), validate(eventValidation.createEvent), eventController.createEvent)
  .get(auth('event:read'), validate(eventValidation.queryEvents), eventController.queryEvents);

// Routes for fetching, updating, and deleting an event by ID
router
  .route('/:eventId')
  .get(auth('event:read'), validate(eventValidation.getEventById), eventController.getEventById)
  .patch(auth('event:update'), validate(eventValidation.updateEventById), eventController.updateEventById)
  .delete(auth('event:delete'), validate(eventValidation.deleteEventById), eventController.deleteEventById);

// Route for bulk importing events
router
  .route('/import')
  .post(auth('import:event'), validate(eventValidation.bulkImportEvents), eventController.bulkImportEvents);

// Route for deleting all events for a tenant
router
  .route('/deleteAll')
  .delete(auth('event:delete'), validate(eventValidation.deleteAllEvents), eventController.deleteAllEvents);

// Route for getting events by a date range
router
  .route('/dateRange')
  .get(auth('event:read'), validate(eventValidation.getEventsByDateRange), eventController.getEventsByDateRange);

// Route for getting events by program
router
  .route('/program/:programId')
  .get(auth('event:read'), validate(eventValidation.getEventsByProgram), eventController.getEventsByProgram);

module.exports = router;
