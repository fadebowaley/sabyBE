const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const tenantConfigService = require('../services/tenantConfig.service');

const sendConfigResponse = (res, config, tenantId, entityType) => {
  res
    .status(httpStatus.OK)
    .send(
      config ||
        tenantConfigService.buildFallbackConfig(tenantId, entityType)
    );
};

const getUserConfig = catchAsync(async (req, res) => {
  const config = await tenantConfigService.getTenantConfig(
    req.user.tenantId,
    'user'
  );
  sendConfigResponse(res, config, req.user.tenantId, 'user');
});

const getNodeConfig = catchAsync(async (req, res) => {
  const config = await tenantConfigService.getTenantConfig(
    req.user.tenantId,
    'node'
  );
  sendConfigResponse(res, config, req.user.tenantId, 'node');
});

const upsertUserConfig = catchAsync(async (req, res) => {
  const config = await tenantConfigService.upsertTenantConfig(
    req.user.tenantId,
    'user',
    req.body,
    req.user.id
  );
  res.status(httpStatus.OK).send(config);
});

const upsertNodeConfig = catchAsync(async (req, res) => {
  const config = await tenantConfigService.upsertTenantConfig(
    req.user.tenantId,
    'node',
    req.body,
    req.user.id
  );
  res.status(httpStatus.OK).send(config);
});

/**
 * Toggle analytics for a specific field
 * PATCH /tenant-config/:entityType/fields/:fieldId/analytics
 */
const toggleFieldAnalytics = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType, fieldId } = req.params;
  let { enabled } = req.body;

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  // Normalize enabled to boolean (handle string booleans, etc.)
  if (typeof enabled === 'string') {
    enabled = enabled.toLowerCase() === 'true' || enabled === '1';
  } else if (typeof enabled !== 'boolean') {
    enabled = Boolean(enabled);
  }

  const field = await tenantConfigService.toggleFieldAnalytics(
    tenantId,
    entityType,
    fieldId,
    enabled
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: field,
    message: `Analytics ${enabled ? 'enabled' : 'disabled'} for field ${fieldId}`,
  });
});

/**
 * Get analytics summary
 * GET /tenant-config/:entityType/analytics/summary
 */
const getAnalyticsSummary = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params;

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  const summary = await tenantConfigService.getAnalyticsSummary(tenantId, entityType);

  res.status(httpStatus.OK).send({
    success: true,
    data: summary,
    message: `Analytics summary retrieved for ${entityType}`,
  });
});

module.exports = {
  getUserConfig,
  upsertUserConfig,
  getNodeConfig,
  upsertNodeConfig,
  toggleFieldAnalytics,
  getAnalyticsSummary,
};

