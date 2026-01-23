const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const baselineAnalysisConfigValidation = require('../../validations/baselineAnalysisConfig.validation');
const baselineAnalysisConfigController = require('../../controllers/baselineAnalysisConfig.controller');

const router = express.Router();

/**
 * Get analysis configuration
 * GET /v1/baseline-analysis-config/:entityType
 */
router
  .route('/:entityType')
  .get(
    auth(),
    validate(baselineAnalysisConfigValidation.getAnalysisConfig),
    baselineAnalysisConfigController.getAnalysisConfig
  );

/**
 * Update essential metrics
 * PUT /v1/baseline-analysis-config/:entityType/essential-metrics
 */
router
  .route('/:entityType/essential-metrics')
  .put(
    auth(),
    validate(baselineAnalysisConfigValidation.updateEssentialMetrics),
    baselineAnalysisConfigController.updateEssentialMetrics
  );

/**
 * Update custom field analysis
 * PUT /v1/baseline-analysis-config/:entityType/custom-fields/:fieldId
 */
router
  .route('/:entityType/custom-fields/:fieldId')
  .put(
    auth(),
    validate(baselineAnalysisConfigValidation.updateCustomFieldAnalysis),
    baselineAnalysisConfigController.updateCustomFieldAnalysis
  );

/**
 * Update global settings
 * PUT /v1/baseline-analysis-config/:entityType/global-settings
 */
router
  .route('/:entityType/global-settings')
  .put(
    auth(),
    validate(baselineAnalysisConfigValidation.updateGlobalSettings),
    baselineAnalysisConfigController.updateGlobalSettings
  );

/**
 * Sync with tenant config
 * POST /v1/baseline-analysis-config/:entityType/sync
 */
router
  .route('/:entityType/sync')
  .post(
    auth(),
    validate(baselineAnalysisConfigValidation.syncWithTenantConfig),
    baselineAnalysisConfigController.syncWithTenantConfig
  );

module.exports = router;

