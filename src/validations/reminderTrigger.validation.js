const Joi = require('joi');
const { objectId } = require('./custom.validation');

const recipient = Joi.object({
  kind: Joi.string()
    .valid('user', 'contact', 'all', 'role', 'form_submissions')
    .required(),
  userId: Joi.when('kind', {
    is: 'user',
    then: Joi.string().custom(objectId).required(),
    otherwise: Joi.any().strip(),
  }),
  roleId: Joi.when('kind', {
    is: 'role',
    then: Joi.string().custom(objectId).required(),
    otherwise: Joi.any().strip(),
  }),
  projectId: Joi.when('kind', {
    is: 'form_submissions',
    then: Joi.string().trim().required(),
    otherwise: Joi.any().strip(),
  }),
  formId: Joi.when('kind', {
    is: 'form_submissions',
    then: Joi.string().trim().allow('', null),
    otherwise: Joi.any().strip(),
  }),
  name: Joi.when('kind', {
    is: 'contact',
    then: Joi.string().trim().max(120).required(),
    otherwise: Joi.string().trim().max(120).default('@all'),
  }),
  email: Joi.when('kind', {
    is: 'contact',
    then: Joi.string().trim().email().allow(''),
    otherwise: Joi.any().strip(),
  }),
  phone: Joi.when('kind', {
    is: 'contact',
    then: Joi.string().trim().max(32).allow(''),
    otherwise: Joi.any().strip(),
  }),
}).custom((value, helpers) => {
  if (value.kind === 'contact' && !value.email && !value.phone) {
    return helpers.message(
      '"email" or "phone" is required for a contact recipient'
    );
  }
  return value;
});

const recurrence = Joi.object({
  frequency: Joi.string().valid('none', 'yearly').default('none'),
  dstBehavior: Joi.string().valid('next-valid-time').default('next-valid-time'),
});

module.exports = {
  createReminderTrigger: {
    body: Joi.object({
      entityType: Joi.string().trim().max(64).required(),
      entityId: Joi.string().custom(objectId).required(),
      triggerType: Joi.string().valid('scheduled').default('scheduled'),
      scheduledAt: Joi.date().greater('now').required(),
      timezone: Joi.string().trim().max(64).default('UTC'),
      recurrence: recurrence.default({ frequency: 'none' }),
      channels: Joi.array()
        .items(Joi.string().valid('email', 'whatsapp'))
        .min(1)
        .default(['email']),
      recipients: Joi.array().items(recipient).min(1).max(50).required(),
    }),
  },
  queryReminderTriggers: {
    query: Joi.object({
      entityType: Joi.string().trim().max(64),
      entityId: Joi.string().custom(objectId),
    }),
  },
  deleteReminderTrigger: {
    params: Joi.object({
      reminderTriggerId: Joi.string().custom(objectId).required(),
    }),
  },
};
