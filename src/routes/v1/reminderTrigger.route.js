const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const validation = require('../../validations/reminderTrigger.validation');
const controller = require('../../controllers/reminderTrigger.controller');

const router = express.Router();

router
  .route('/')
  .get(
    auth('calendar:read'),
    validate(validation.queryReminderTriggers),
    controller.queryReminderTriggers
  )
  .post(
    auth('calendar:manage'),
    validate(validation.createReminderTrigger),
    controller.createReminderTrigger
  );

router.delete(
  '/:reminderTriggerId',
  auth('calendar:manage'),
  validate(validation.deleteReminderTrigger),
  controller.deleteReminderTrigger
);

module.exports = router;
