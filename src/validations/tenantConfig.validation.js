const Joi = require('joi');

const optionSchema = Joi.object({
  label: Joi.string().trim().required(),
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.object(),
    Joi.array(),
    Joi.allow(null)
  ),
});

const fieldSchema = Joi.object({
  id: Joi.string().trim().required(),
  label: Joi.string().trim().required(),
  type: Joi.string()
    .valid(
      'text',
      'textarea',
      'number',
      'date',
      'boolean',
      'select',
      'multi-select',
      'attachment'
    )
    .default('text'),
  required: Joi.boolean().default(false),
  defaultValue: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.object(),
    Joi.array(),
    Joi.allow(null)
  ),
  placeholder: Joi.string().allow('', null),
  description: Joi.string().allow('', null),
  options: Joi.array().items(optionSchema).default([]),
  validation: Joi.object().unknown(true),
  visibility: Joi.object({
    roles: Joi.array().items(Joi.string().trim()),
  }),
  ui: Joi.object({
    section: Joi.string().allow('', null),
    order: Joi.number().integer().default(0),
  }).default({}),
});

const sectionSchema = Joi.object({
  id: Joi.string().trim().required(),
  title: Joi.string().trim().required(),
  description: Joi.string().allow('', null),
  order: Joi.number().integer().default(0),
});

const upsertTenantConfig = {
  body: Joi.object({
    fields: Joi.array().items(fieldSchema).default([]),
    ui: Joi.object({
      sections: Joi.array().items(sectionSchema).default([]),
    }).default({ sections: [] }),
    version: Joi.number().integer().min(1),
  }).min(1),
};

module.exports = {
  upsertTenantConfig,
};

