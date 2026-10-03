const Joi = require('joi');

const chat = {
  body: Joi.object().keys({
    message: Joi.string().trim().min(1).max(4000).required(),
    threadId: Joi.string().trim().max(64).allow(null).optional(),
    model: Joi.string().trim().max(128).allow(null).optional(),
    title: Joi.string().trim().max(512).allow(null).optional(),
  }).unknown(true),
};

const createThread = {
  body: Joi.object().keys({
    threadId: Joi.string().trim().max(64).allow(null).optional(),
    title: Joi.string().trim().max(512).default('New conversation'),
    preview: Joi.string().max(1000).allow('', null).optional(),
    turns: Joi.array().optional(),
    metadata: Joi.object().optional(),
    model: Joi.string().trim().max(128).allow(null).optional(),
  }).unknown(true),
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
    userId: Joi.string().trim().allow('', null).optional(),
  }),
};

module.exports = {
  chat,
  createThread,
  listThreads,
  getThread,
  listUsage,
};