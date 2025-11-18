const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const tenantConfigValidation = require('../../validations/tenantConfig.validation');
const tenantConfigController = require('../../controllers/tenantConfig.controller');

const router = express.Router();

router
  .route('/user')
  .get(auth('manage:user'), tenantConfigController.getUserConfig)
  .put(
    auth('manage:user'),
    validate(tenantConfigValidation.upsertTenantConfig),
    tenantConfigController.upsertUserConfig
  );

router
  .route('/node')
  .get(auth('manage:node'), tenantConfigController.getNodeConfig)
  .put(
    auth('manage:node'),
    validate(tenantConfigValidation.upsertTenantConfig),
    tenantConfigController.upsertNodeConfig
  );

module.exports = router;

