const Joi = require('joi');

const bulkApprovalIdsSchema = Joi.array()
  .items(Joi.string().trim().required())
  .min(1)
  .max(100)
  .required();

module.exports = {
  getApprovalQueue: {
    query: Joi.object().keys({
      role: Joi.string().trim().optional(),
      limit: Joi.number().integer().min(1).max(200).optional(),
    }),
  },
  getSubmissionApproval: {
    params: Joi.object().keys({
      id: Joi.string().trim().required(),
    }),
  },
  approveApproval: {
    params: Joi.object().keys({
      approvalId: Joi.string().trim().required(),
    }),
    body: Joi.object()
      .keys({
        comments: Joi.string().trim().allow('', null).optional(),
        notes: Joi.string().trim().allow('', null).optional(),
      })
      .unknown(false),
  },
  rejectApproval: {
    params: Joi.object().keys({
      approvalId: Joi.string().trim().required(),
    }),
    body: Joi.object()
      .keys({
        reason: Joi.string().trim().allow('', null).optional(),
        comments: Joi.string().trim().allow('', null).optional(),
      })
      .unknown(false),
  },
  requestChangesApproval: {
    params: Joi.object().keys({
      approvalId: Joi.string().trim().required(),
    }),
    body: Joi.object()
      .keys({
        comments: Joi.string().trim().allow('', null).optional(),
        reason: Joi.string().trim().allow('', null).optional(),
      })
      .unknown(false),
  },
  escalateApproval: {
    params: Joi.object().keys({
      approvalId: Joi.string().trim().required(),
    }),
    body: Joi.object()
      .keys({
        comments: Joi.string().trim().allow('', null).optional(),
        reason: Joi.string().trim().allow('', null).optional(),
      })
      .unknown(false),
  },
  bulkApproveApprovals: {
    body: Joi.object()
      .keys({
        approvalIds: bulkApprovalIdsSchema,
        comments: Joi.string().trim().allow('', null).optional(),
        notes: Joi.string().trim().allow('', null).optional(),
      })
      .unknown(false),
  },
  bulkRejectApprovals: {
    body: Joi.object()
      .keys({
        approvalIds: bulkApprovalIdsSchema,
        reason: Joi.string().trim().allow('', null).optional(),
        comments: Joi.string().trim().allow('', null).optional(),
      })
      .unknown(false),
  },
};
