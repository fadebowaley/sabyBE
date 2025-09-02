const Joi = require('joi');
const { objectId } = require('./custom.validation');

const authenticate = {
  body: Joi.object().keys({
    phoneNumber: Joi.string().required().messages({
      'string.empty': 'Phone number is required',
      'any.required': 'Phone number is required',
    }),
    chatId: Joi.string().optional(),
  }),
};

const getForm = {
  params: Joi.object().keys({
    projectId: Joi.string().required().messages({
      'string.empty': 'Project ID is required',
      'any.required': 'Project ID is required',
    }),
  }),
};

const submit = {
  body: Joi.object().keys({
    projectId: Joi.string().required().messages({
      'string.empty': 'Project ID is required',
      'any.required': 'Project ID is required',
    }),
    formId: Joi.string().custom(objectId).required().messages({
      'string.empty': 'Form ID is required',
      'any.required': 'Form ID is required',
    }),
    answers: Joi.object().required().messages({
      'object.base': 'Answers must be an object',
      'any.required': 'Answers are required',
    }),
  }),
};

module.exports = {
  authenticate,
  getForm,
  submit,
};
