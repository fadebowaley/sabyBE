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
}).unknown(false); // Don't allow extra fields like "required"

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
  ).allow(null),
  placeholder: Joi.string().allow('', null),
  description: Joi.string().allow('', null),
  options: Joi.when('type', {
    is: Joi.string().valid('select', 'multi-select'),
    then: Joi.array().items(optionSchema).min(1).required(),
    otherwise: Joi.array().items(optionSchema).allow(null).default([]),
  }),
  validation: Joi.object().unknown(true).allow(null),
  visibility: Joi.object({
    roles: Joi.array().items(Joi.string().trim()),
  }).allow(null),
  ui: Joi.object({
    section: Joi.string().allow('', null),
    order: Joi.number().integer().default(0),
  }).default({}).allow(null),
  // Analytics configuration (child property)
  analytics: Joi.object({
    enabled: Joi.boolean().default(false), // User toggle for analytics
    type: Joi.string().optional(), // Auto-mapped analytics type
    format: Joi.string().valid('currency', 'percentage').optional(),
    excludeFromAnalytics: Joi.boolean().default(false),
    includeTime: Joi.boolean().default(false),
    lastAnalyzed: Joi.date().allow(null).optional(),
    min: Joi.number().optional(),
    max: Joi.number().optional(),
    description: Joi.string().allow('', null).optional(),
  }).optional().allow(null),
}).unknown(false); // Don't allow extra fields

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

