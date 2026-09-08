const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const reminderTriggerService = require('../services/reminderTrigger.service');

const createReminderTrigger = catchAsync(async (req, res) => {
  const trigger = await reminderTriggerService.createReminderTrigger(
    req.body,
    req.user
  );
  res.status(httpStatus.CREATED).send(trigger);
});

const queryReminderTriggers = catchAsync(async (req, res) => {
  const results = await reminderTriggerService.queryReminderTriggers(
    req.query,
    req.user
  );
  res.send({ results });
});

const deleteReminderTrigger = catchAsync(async (req, res) => {
  await reminderTriggerService.deleteReminderTrigger(
    req.params.reminderTriggerId,
    req.user
  );
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createReminderTrigger,
  queryReminderTriggers,
  deleteReminderTrigger,
};
