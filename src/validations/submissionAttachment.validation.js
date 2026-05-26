const Joi = require('joi');

const getAttachment = {
  params: Joi.object().keys({
    attachmentId: Joi.string().uuid().required(),
  }),
};

const listSubmissionAttachments = {
  params: Joi.object().keys({
    submissionId: Joi.string().uuid().required(),
  }),
};

const deleteAttachment = {
  params: Joi.object().keys({
    attachmentId: Joi.string().uuid().required(),
  }),
};

module.exports = {
  getAttachment,
  listSubmissionAttachments,
  deleteAttachment,
};
