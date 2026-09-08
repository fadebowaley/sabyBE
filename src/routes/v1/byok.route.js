const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const byokValidation = require('../../validations/byok.validation');
const byokController = require('../../controllers/byok.controller');

const router = express.Router();

router
  .route('/')
  .get(auth(), byokController.getTenantKeys)
  .post(auth(), validate(byokValidation.saveKey), byokController.saveTenantKey);

router
  .route('/test')
  .post(auth(), validate(byokValidation.testKey), byokController.testKey);

router
  .route('/:provider')
  .delete(
    auth(),
    validate(byokValidation.deleteKey),
    byokController.deleteTenantKey
  );

module.exports = router;
