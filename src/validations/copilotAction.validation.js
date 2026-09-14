/**
 * Per-action-type Joi validation for copilot payloads.
 *
 * Mirrors the REST validators (user.validation.js) so the copilot entry path is
 * held to the same data contracts as the normal API. Failures are returned as
 * structured feedback (field-level errors) that the agent can act on.
 */

const Joi = require('joi');
const { password, objectId } = require('./custom.validation');

const createUserPayload = Joi.object()
  .keys({
    email: Joi.string().trim().lowercase().required().email(),
    password: Joi.string().required().custom(password),
    firstname: Joi.string().trim().allow('', null).optional(),
    lastname: Joi.string().trim().allow('', null).optional(),
    phoneNumber: Joi.string().trim().allow('', null).optional(),
    roles: Joi.array()
      .items(Joi.string().custom(objectId).optional())
      .optional(),
    role: Joi.string().trim().optional().max(64),
    createdBy: Joi.string().custom(objectId).optional(),
    tenantId: Joi.string().trim().optional().max(64),
    isAdmin: Joi.boolean().optional(),
    isOwner: Joi.boolean().optional(),
    isSuper: Joi.boolean().optional(),
    isSaby: Joi.boolean().optional(),
  })
  .unknown(true);

const userIdPayload = Joi.object()
  .keys({
    userId: Joi.string().custom(objectId).required(),
  })
  .unknown(true);

const resetPasswordPayload = Joi.object()
  .keys({
    email: Joi.string().trim().lowercase().optional().email(),
    userEmail: Joi.string().trim().lowercase().optional().email(),
    newPassword: Joi.string().optional().custom(password),
    password: Joi.string().optional().custom(password),
  })
  .unknown(true);

const SCHEMAS = {
  create_user: createUserPayload,
  update_user: createUserPayload,
  deactivate_user: userIdPayload,
  reactivate_user: userIdPayload,
  delete_user: userIdPayload,
  reset_password: resetPasswordPayload,
};

const fieldHintOf = (detail) => {
  const path = String(detail.path.join('.') || 'payload').toLowerCase();
  if (path.includes('password')) {
    return 'Password must be at least 8 characters and contain at least one letter and one number.';
  }
  if (/mongo id|object id/i.test(detail.message)) {
    return 'This field must be a valid 24-character hexadecimal object identifier.';
  }
  if (
    /userid|roleid|projectid|formid|nodeid|createdby|_id|roles(\.|$)|nodes(\.|$)/i.test(
      path
    )
  ) {
    return 'This field must be a valid 24-character hexadecimal object identifier.';
  }
  return null;
};

function validateCopilotActionPayload(actionType, payload) {
  const schema = SCHEMAS[actionType];
  if (!schema) {
    return { ok: true, value: payload || {} };
  }
  const { error, value } = schema.validate(payload || {}, {
    abortEarly: false,
    stripUnknown: false,
  });
  if (error) {
    const fieldErrors = error.details.map((detail) => ({
      field: detail.path.length > 0 ? detail.path.join('.') : 'payload',
      message: detail.message,
      hint: fieldHintOf(detail),
    }));
    return {
      ok: false,
      value,
      feedback: {
        code: 'VALIDATION',
        retryable: true,
        message: error.details[0].message,
        fieldErrors,
      },
    };
  }
  return { ok: true, value };
}

module.exports = {
  validateCopilotActionPayload,
};
