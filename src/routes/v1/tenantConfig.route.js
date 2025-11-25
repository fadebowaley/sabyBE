const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const tenantConfigValidation = require('../../validations/tenantConfig.validation');
const tenantConfigController = require('../../controllers/tenantConfig.controller');
const Joi = require('joi');

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

// Analytics endpoints
router
  .route('/:entityType/fields/:fieldId/analytics')
  .patch(
    auth(),
    validate({
      params: Joi.object().keys({
        entityType: Joi.string().valid('user', 'node').required(),
        fieldId: Joi.string().required(),
      }),
      body: Joi.object().keys({
        // Accept any value - conversion handled in controller
        enabled: Joi.any().required(),
      }),
    }),
    tenantConfigController.toggleFieldAnalytics
  );

router.route('/:entityType/analytics/summary').get(
  auth(),
  validate({
    params: Joi.object().keys({
      entityType: Joi.string().valid('user', 'node').required(),
    }),
  }),
  tenantConfigController.getAnalyticsSummary
);

module.exports = router;

