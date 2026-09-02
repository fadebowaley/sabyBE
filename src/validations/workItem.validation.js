const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { normalizePhoneToE164 } = require('../utils/phoneNumber');

const contactPhone = Joi.string()
  .trim()
  .allow('')
  .custom((value, helpers) => {
    if (!value) return '';
    const normalized = normalizePhoneToE164(value, { allowEmpty: false });
    return normalized || helpers.error('string.pattern.base');
  })
  .messages({
    'string.pattern.base':
      '"phone" must be a valid local or international phone number',
  });

const assignee = Joi.object({
  kind: Joi.string().valid('user', 'contact').default('user'),
  userId: Joi.when('kind', {
    is: 'user',
    then: Joi.string().required(),
    otherwise: Joi.any().strip(),
  }),
  name: Joi.when('kind', {
    is: 'contact',
    then: Joi.string().trim().max(120).required(),
    otherwise: Joi.any().strip(),
  }),
  email: Joi.when('kind', {
    is: 'contact',
    then: Joi.string().trim().email().allow(''),
    otherwise: Joi.any().strip(),
  }),
  phone: Joi.when('kind', {
    is: 'contact',
    then: contactPhone,
    otherwise: Joi.any().strip(),
  }),
}).custom((value, helpers) => {
  if (value.kind === 'contact' && !value.email && !value.phone) {
    return helpers.message(
      '"email" or "phone" is required for a notification contact'
    );
  }
  return value;
});

const fields = {
  type: Joi.string().valid('event', 'task'),
  title: Joi.string().trim().max(200),
  description: Joi.string().allow('').max(5000),
  startAt: Joi.date(),
  endAt: Joi.date(),
  allDay: Joi.boolean(),
  status: Joi.string().valid(
    'scheduled',
    'in-progress',
    'completed',
    'cancelled'
  ),
  priority: Joi.string().valid('low', 'medium', 'high'),
  assignees: Joi.array().items(assignee),
};

const notificationContact = Joi.object({
  name: Joi.string().trim().max(120).required(),
  email: Joi.string().trim().email().allow(''),
  phone: contactPhone,
}).or('email', 'phone');

const importWorkItem = Joi.object({
  type: fields.type.required(),
  title: fields.title.required(),
  description: fields.description.default(''),
  startAt: fields.startAt.required(),
  endAt: fields.endAt.required(),
  allDay: fields.allDay.default(false),
  status: fields.status.default('scheduled'),
  priority: Joi.when('type', {
    is: 'task',
    then: fields.priority.default('medium'),
    otherwise: Joi.any().strip(),
  }),
  assigneeEmails: Joi.array().items(Joi.string().trim().email()).max(25),
  notificationContacts: Joi.array().items(notificationContact).max(25),
}).custom((value, helpers) => {
  if (value.endAt <= value.startAt) {
    return helpers.message('"endAt" must be after "startAt"');
  }
  return value;
});

module.exports = {
  createWorkItem: {
    body: Joi.object({
      ...fields,
      type: fields.type.required(),
      title: fields.title.required(),
      startAt: fields.startAt.required(),
      endAt: fields.endAt.required(),
    }),
  },
  queryWorkItems: {
    query: Joi.object({
      from: Joi.date(),
      to: Joi.date(),
      type: fields.type,
      status: fields.status,
    }),
  },
  getWorkItem: {
    params: Joi.object({
      workItemId: Joi.string().custom(objectId).required(),
    }),
  },
  updateWorkItem: {
    params: Joi.object({
      workItemId: Joi.string().custom(objectId).required(),
    }),
    body: Joi.object(fields).min(1),
  },
  importWorkItems: {
    body: Joi.object({
      items: Joi.array().items(importWorkItem).min(1).max(250).required(),
    }),
  },
};
