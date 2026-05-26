const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const submissionAttachmentService = require('../services/submissionAttachment.service');
const { StorageProviderFactory } = require('../services/providers/storageProvider');

const listSubmissionAttachments = catchAsync(async (req, res) => {
  const attachments = await submissionAttachmentService.listBySubmission(
    req.params.submissionId,
    req.user.tenantId
  );
  res.send(attachments);
});

const getSubmissionAttachment = catchAsync(async (req, res) => {
  const attachment = await submissionAttachmentService.getById(
    req.params.attachmentId,
    req.user.tenantId
  );
  if (!attachment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission attachment not found');
  }
  res.send(attachment);
});

const downloadSubmissionAttachment = catchAsync(async (req, res) => {
  const attachment = await submissionAttachmentService.getById(
    req.params.attachmentId,
    req.user.tenantId
  );
  if (!attachment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission attachment not found');
  }

  const provider = StorageProviderFactory.create(attachment.storage_provider || 'aws-s3');
  const downloadUrl = await provider.generatePresignedUrl(
    attachment.storage_path,
    300
  );

  res.send({
    downloadUrl,
    fileName: attachment.original_name,
  });
});

const deleteSubmissionAttachment = catchAsync(async (req, res) => {
  const attachment = await submissionAttachmentService.softDelete(
    req.params.attachmentId,
    req.user.tenantId
  );
  if (!attachment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission attachment not found');
  }
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  listSubmissionAttachments,
  getSubmissionAttachment,
  downloadSubmissionAttachment,
  deleteSubmissionAttachment,
};
