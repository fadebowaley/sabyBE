const Joi = require('joi');
const { objectId } = require('./custom.validation');

const sendMessage = {
  body: Joi.object().keys({
    phoneNumber: Joi.string()
      .required()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/),
    message: Joi.string().required().max(4096),
    type: Joi.string().valid('text', 'button', 'list').default('text'),
    buttons: Joi.when('type', {
      is: 'button',
      then: Joi.array()
        .items(
          Joi.object({
            text: Joi.string().required().max(20),
          })
        )
        .min(1)
        .max(3)
        .required(),
      otherwise: Joi.forbidden(),
    }),
    buttonText: Joi.when('type', {
      is: 'list',
      then: Joi.string().required().max(20),
      otherwise: Joi.forbidden(),
    }),
    items: Joi.when('type', {
      is: 'list',
      then: Joi.array()
        .items(
          Joi.object({
            id: Joi.string().required(),
            title: Joi.string().required().max(24),
            description: Joi.string().max(72),
          })
        )
        .min(1)
        .max(10)
        .required(),
      otherwise: Joi.forbidden(),
    }),
  }),
};

const getSessions = {
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(100).default(50),
    page: Joi.number().integer().min(1).default(1),
  }),
};

const deleteSession = {
  params: Joi.object().keys({
    phoneNumber: Joi.string()
      .required()
      .pattern(/^[\+]?[1-9][\d]{0,15}$/),
  }),
};

module.exports = {
  sendMessage,
  getSessions,
  deleteSession,
};
