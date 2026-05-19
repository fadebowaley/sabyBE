const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const parseSchema = (schema) => {
  if (!schema) return null;
  if (typeof schema === 'string') {
    try {
      return JSON.parse(schema);
    } catch (error) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Tool schema is not valid JSON'
      );
    }
  }
  return schema;
};

const typeOf = (value) => {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
};

const validateValue = ({ schema, value, path, errors }) => {
  if (!schema || typeof schema !== 'object') return;
  const expectedType = schema.type;
  if (expectedType) {
    const actualType = typeOf(value);
    if (expectedType === 'integer') {
      if (!Number.isInteger(value)) {
        errors.push(`${path} must be an integer`);
        return;
      }
    } else if (expectedType !== actualType) {
      errors.push(`${path} must be a ${expectedType}`);
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
    return;
  }

  if (schema.type === 'object') {
    const objectValue = value || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    required.forEach((field) => {
      if (objectValue[field] === undefined || objectValue[field] === null) {
        errors.push(`${path}.${field} is required`);
      }
    });

    const properties = schema.properties || {};
    Object.keys(properties).forEach((field) => {
      if (objectValue[field] !== undefined) {
        validateValue({
          schema: properties[field],
          value: objectValue[field],
          path: `${path}.${field}`,
          errors,
        });
      }
    });
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      validateValue({
        schema: schema.items,
        value: item,
        path: `${path}[${index}]`,
        errors,
      });
    });
  }
};

const validateToolPayload = ({ toolName, schema, payload }) => {
  const parsedSchema = parseSchema(schema);
  if (!parsedSchema || Object.keys(parsedSchema).length === 0) {
    return { valid: true, errors: [] };
  }

  const errors = [];
  validateValue({
    schema: parsedSchema,
    value: payload || {},
    path: 'payload',
    errors,
  });

  if (errors.length > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid payload for tool ${toolName}: ${errors.join('; ')}`
    );
  }

  return { valid: true, errors: [] };
};

module.exports = {
  validateToolPayload,
};
