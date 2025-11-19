const Joi = require('joi');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const tenantConfigService = require('./tenantConfig.service');

const baseTypeMap = {
  text: Joi.string().allow('', null),
  textarea: Joi.string().allow('', null),
  number: Joi.number(),
  date: Joi.date(),
  boolean: Joi.boolean(),
  select: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean()
  ),
  'multi-select': Joi.array().items(
    Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean())
  ),
  attachment: Joi.object({
    url: Joi.string().uri().required(),
    name: Joi.string().allow('', null),
    size: Joi.number(),
    mimeType: Joi.string(),
  }),
};

const applyValidationRules = (schema, validation = {}, fieldType) => {
  if (!validation) {
    return schema;
  }

  if (validation.minLength && schema.min) {
    schema =
      fieldType === 'text' || fieldType === 'textarea'
        ? schema.min(validation.minLength)
        : schema;
  }

  if (validation.maxLength && schema.max) {
    schema =
      fieldType === 'text' || fieldType === 'textarea'
        ? schema.max(validation.maxLength)
        : schema;
  }

  if (validation.min && schema.min) {
    schema = schema.min(validation.min);
  }

  if (validation.max && schema.max) {
    schema = schema.max(validation.max);
  }

  if (validation.regex && schema.pattern) {
    schema = schema.pattern(new RegExp(validation.regex));
  }

  return schema;
};

const buildFieldSchema = (field) => {
  const typeKey = field.type || 'text';
  let schema = baseTypeMap[typeKey] || Joi.any();

  if (field.options && field.options.length) {
    const allowedValues = field.options.map((option) => option.value);
    if (typeKey === 'multi-select') {
      schema = Joi.array()
        .items(Joi.valid(...allowedValues))
        .single();
    } else {
      schema = schema.valid(...allowedValues);
    }
  }

  schema = applyValidationRules(schema, field.validation, typeKey);

  if (field.required) {
    schema = schema.required();
  } else {
    schema = schema.allow(null);
  }

  return schema;
};

const validateCustomFields = async ({
  tenantId,
  entityType,
  payload,
}) => {
  const config = await tenantConfigService.getTenantConfig(
    tenantId,
    entityType
  );

  const customFieldsPayload = payload || {};

  if (!config || !config.fields || config.fields.length === 0) {
    return {
      values:
        typeof customFieldsPayload === 'object'
          ? customFieldsPayload
          : {},
      version: config?.version ?? 0,
    };
  }

  const schemaShape = {};
  config.fields.forEach((field) => {
    schemaShape[field.id] = buildFieldSchema(field);
  });

  const schema = Joi.object(schemaShape).unknown(false);
  const { value, error } = schema.validate(customFieldsPayload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Custom field validation failed: ${error.message}`
    );
  }

  // Apply defaults when not provided
  config.fields.forEach((field) => {
    if (
      value[field.id] === undefined &&
      field.defaultValue !== undefined
    ) {
      value[field.id] = field.defaultValue;
    }
  });

  return {
    values: value,
    version: config.version ?? 0,
  };
};

module.exports = {
  validateCustomFields,
};

