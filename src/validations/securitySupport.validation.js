const Joi = require('joi');

const listSecuritySupportUsers = {
  query: Joi.object().keys({
    search: Joi.string().allow('', null),
    tenantId: Joi.string().allow('', null),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
  }),
};

const performSecuritySupportAction = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    action: Joi.string()
      .valid(
        'disable-authenticator',
        'revoke-passkey',
        'revoke-all-passkeys',
        'reset-mfa',
        'clear-pending-challenge'
      )
      .required(),
    passkeyId: Joi.string().allow('', null),
    reason: Joi.string().min(8).max(500).required(),
  }),
};

module.exports = {
  listSecuritySupportUsers,
  performSecuritySupportAction,
};
