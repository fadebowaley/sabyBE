const Joi = require('joi');

const chat = {
  body: Joi.object().keys({
    message: Joi.string().trim().min(1).max(4000).required(),
    threadId: Joi.string().trim().max(64).allow(null).optional(),
    model: Joi.string().trim().max(128).allow(null).optional(),
    title: Joi.string().trim().max(512).allow(null).optional(),
  }),
};

const createThread = {
  body: Joi.object().keys({
    title: Joi.string().trim().max(512).default('New conversation'),
    model: Joi.string().trim().max(128).allow(null).optional(),
  }),
};

const listThreads = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

const getThread = {
  params: Joi.object().keys({
    threadId: Joi.string().trim().max(64).required(),
  }),
  query: Joi.object().keys({
    limit: Joi.number().integer().min(1).max(200).optional(),
  }),
};

const listUsage = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};

module.exports = {
  chat,
  createThread,
  listThreads,
  getThread,
  listUsage,
};