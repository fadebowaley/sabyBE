const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const submissionAttachmentValidation = require('../../validations/submissionAttachment.validation');
const submissionAttachmentController = require('../../controllers/submissionAttachment.controller');

const router = express.Router();

router.get(
  '/:attachmentId',
  auth('view:storage:file'),
  validate(submissionAttachmentValidation.getAttachment),
  submissionAttachmentController.getSubmissionAttachment
);

router.get(
  '/:attachmentId/download',
  auth('view:storage:file'),
  validate(submissionAttachmentValidation.getAttachment),
  submissionAttachmentController.downloadSubmissionAttachment
);

router.delete(
  '/:attachmentId',
  auth('delete:storage:file'),
  validate(submissionAttachmentValidation.deleteAttachment),
  submissionAttachmentController.deleteSubmissionAttachment
);

router.get(
  '/submission/:submissionId',
  auth('view:storage:file'),
  validate(submissionAttachmentValidation.listSubmissionAttachments),
  submissionAttachmentController.listSubmissionAttachments
);

module.exports = router;
