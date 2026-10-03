const Joi = require('joi');
const { SUPPORTED_PROVIDERS } = require('../services/byok.service');

const saveKey = {
  body: Joi.object()
    .keys({
      provider: Joi.string()
        .valid(...SUPPORTED_PROVIDERS)
        .required(),
      apiKey: Joi.string().trim().min(8).max(512).optional(),
      defaultModel: Joi.string().allow(null, '').optional(),
      enabled: Joi.boolean().optional(),
    })
    .or('apiKey', 'enabled'),
};

const deleteKey = {
  params: Joi.object().keys({
    provider: Joi.string()
      .valid(...SUPPORTED_PROVIDERS)
      .required(),
  }),
};

const testKey = {
  body: Joi.object().keys({
    provider: Joi.string()
      .valid(...SUPPORTED_PROVIDERS)
      .required(),
    apiKey: Joi.string().trim().min(8).max(512).required(),
    model: Joi.string().allow(null, '').optional(),
  }),
};

module.exports = {
  saveKey,
  deleteKey,
  testKey,
};
