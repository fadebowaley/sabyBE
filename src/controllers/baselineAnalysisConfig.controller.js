const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const baselineAnalysisConfigService = require('../services/baselineAnalysisConfig.service');

/**
 * Get analysis configuration for a tenant and entity type
 * GET /v1/baseline-analysis-config/:entityType
 */
const getAnalysisConfig = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params;

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  const config = await baselineAnalysisConfigService.getAnalysisConfig(tenantId, entityType);
  res.status(httpStatus.OK).json({
    success: true,
    data: config,
  });
});

/**
 * Update essential metrics configuration
 * PUT /v1/baseline-analysis-config/:entityType/essential-metrics
 */
const updateEssentialMetrics = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params;
  const essentialMetrics = req.body; // Note: body contains the essentialMetrics object directly

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  if (!essentialMetrics || typeof essentialMetrics !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'essentialMetrics is required');
  }

  // Validation is done in the service layer
  const config = await baselineAnalysisConfigService.updateEssentialMetrics(tenantId, entityType, essentialMetrics);
  res.status(httpStatus.OK).json({
    success: true,
    data: config,
    message: 'Essential metrics updated successfully',
  });
});

/**
 * Update custom field analysis configuration
 * PUT /v1/baseline-analysis-config/:entityType/custom-fields/:fieldId
 */
const updateCustomFieldAnalysis = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType, fieldId } = req.params;
  const analysis = req.body; // Note: body contains the analysis object directly

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  if (!fieldId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'fieldId is required');
  }

  if (!analysis || typeof analysis !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'analysis configuration is required');
  }

  // Validation is done in the service layer
  const config = await baselineAnalysisConfigService.updateCustomFieldAnalysis(
    tenantId,
    entityType,
    fieldId,
    analysis
  );
  res.status(httpStatus.OK).json({
    success: true,
    data: config,
    message: 'Custom field analysis updated successfully',
  });
});

/**
 * Update global settings
 * PUT /v1/baseline-analysis-config/:entityType/global-settings
 */
const updateGlobalSettings = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params;
  const globalSettings = req.body; // Note: body contains the globalSettings object directly

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  if (!globalSettings || typeof globalSettings !== 'object') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'globalSettings is required');
  }

  // Validation is done in the service layer
  const config = await baselineAnalysisConfigService.updateGlobalSettings(tenantId, entityType, globalSettings);
  res.status(httpStatus.OK).json({
    success: true,
    data: config,
    message: 'Global settings updated successfully',
  });
});

/**
 * Sync analysis config with tenant config
 * POST /v1/baseline-analysis-config/:entityType/sync
 */
const syncWithTenantConfig = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params;

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  const config = await baselineAnalysisConfigService.syncWithTenantConfig(tenantId, entityType);
  res.status(httpStatus.OK).json({
    success: true,
    data: config,
    message: 'Analysis config synced with tenant config successfully',
  });
});

module.exports = {
  getAnalysisConfig,
  updateEssentialMetrics,
  updateCustomFieldAnalysis,
  updateGlobalSettings,
  syncWithTenantConfig,
};

