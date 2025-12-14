const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const captureValidation = require('../../validations/capture.validation');
const captureController = require('../../controllers/capture.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('captures:create'), validate(captureValidation.createCapture), captureController.createCapture)
  .get(auth('captures:read'), validate(captureValidation.queryCaptures), captureController.queryCaptures);

router
  .route('/bulk-create')
  .post(auth('captures:create'), validate(captureValidation.bulkInsertCaptures), captureController.bulkInsertCaptures);

router
  .route('/:captureId')
  .get(auth('captures:read'), validate(captureValidation.getCaptureById), captureController.getCaptureById)
  .patch(auth('captures:update'), validate(captureValidation.updateCaptureById), captureController.updateCaptureById)
  .delete(auth('captures:delete'), validate(captureValidation.deleteCaptureById), captureController.deleteCaptureById);

router
  .route('/datapoint/:datapointId')
  .get(auth('captures:read'), validate(captureValidation.getCapturesByDatapoint), captureController.getCapturesByDatapoint);

router
  .route('/tenant/:tenantId')
  .delete(
    auth('captures:delete'),
    validate(captureValidation.deleteAllCapturesByTenant),
    captureController.deleteAllCapturesByTenant
  );

router
  .route('/export/datapoint/:datapointId')
  .get(
    auth('captures:read'),
    validate(captureValidation.exportCapturesByDatapoint),
    captureController.exportCapturesByDatapoint
  );

module.exports = router;
