const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const eventConfigValidation = require('../../validations/eventConfig.validation');
const eventConfigController = require('../../controllers/eventConfig.controller');

const router = express.Router();

// Route for creating a new event configuration
router
  .route('/')
  .post(
    auth('eventConfig:create'),
    validate(eventConfigValidation.createEventConfig),
    eventConfigController.createEventConfig
  )
  .get(auth('eventConfig:read'), validate(eventConfigValidation.queryEventConfigs), eventConfigController.queryEventConfigs);

// Routes for fetching, updating, and deleting an event config by ID
router
  .route('/:eventConfigId')
  .get(
    auth('eventConfig:read'),
    validate(eventConfigValidation.getEventConfigById),
    eventConfigController.getEventConfigById
  )
  .patch(
    auth('eventConfig:update'),
    validate(eventConfigValidation.updateEventConfigById),
    eventConfigController.updateEventConfigById
  )
  .delete(
    auth('eventConfig:delete'),
    validate(eventConfigValidation.deleteEventConfigById),
    eventConfigController.deleteEventConfigById
  );

// Route for deleting all event configurations for a tenant
router
  .route('/deleteAll')
  .delete(
    auth('eventConfig:delete'),
    validate(eventConfigValidation.deleteAllConfigs),
    eventConfigController.deleteAllConfigs
  );

// Route for getting event configuration by event ID
router
  .route('/event/:eventId')
  .get(auth('eventConfig:read'), validate(eventConfigValidation.getConfigByEvent), eventConfigController.getConfigByEvent);

module.exports = router;
