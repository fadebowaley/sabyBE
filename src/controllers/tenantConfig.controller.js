const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const tenantConfigService = require('../services/tenantConfig.service');

const sendConfigResponse = (res, config, tenantId, entityType) => {
  res
    .status(httpStatus.OK)
    .send(
      config || tenantConfigService.buildFallbackConfig(tenantId, entityType)
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

  // Debug logging (safe - avoid circular reference issues)
  const enabledValue = typeof enabled === 'object' ? '[Object]' : enabled;
  // eslint-disable-next-line no-console
  console.log(
    '🔍 [toggleFieldAnalytics] enabled type:',
    typeof enabled,
    'value:',
    enabledValue
  );

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Entity type must be "user" or "node"'
    );
  }

  // Normalize enabled to boolean
  // Handle edge cases: circular references, objects, etc.
  if (enabled === undefined || enabled === null) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'enabled is required');
  }

  // If it's already a boolean, use it directly
  if (typeof enabled === 'boolean') {
    // Already correct
  } else if (typeof enabled === 'string') {
    // Handle string booleans, including edge cases
    const lower = String(enabled).toLowerCase().trim();
    if (
      lower === 'true' ||
      lower === '1' ||
      lower === 'yes' ||
      lower === 'on'
    ) {
      enabled = true;
    } else if (
      lower === 'false' ||
      lower === '0' ||
      lower === 'no' ||
      lower === 'off'
    ) {
      enabled = false;
    } else if (lower.includes('circular')) {
      // "[Circular Reference]" string - happens when Switch sends checked state
      // Default to true since Switch sends true when checked/ON
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️ [toggleFieldAnalytics] Circular reference detected, defaulting to true (Switch ON state)`
      );
      enabled = true;
    } else {
      // Unknown string value - default to true (Switch sends true when checked/ON)
      // eslint-disable-next-line no-console
      console.warn(
        `⚠️ [toggleFieldAnalytics] Unknown string value: "${enabled}", defaulting to true (Switch ON state)`
      );
      enabled = true;
    }
  } else if (typeof enabled === 'number') {
    enabled = enabled !== 0;
  } else {
    // For objects, arrays, or other types, default to true (Switch sends true when checked/ON)
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️ [toggleFieldAnalytics] Unexpected type: ${typeof enabled}, defaulting to true (Switch ON state)`
    );
    enabled = true;
  }

  // eslint-disable-next-line no-console
  console.log(
    '✅ [toggleFieldAnalytics] Normalized enabled to:',
    enabled,
    '(boolean)'
  );

  const field = await tenantConfigService.toggleFieldAnalytics(
    tenantId,
    entityType,
    fieldId,
    enabled
  );

  res.status(httpStatus.OK).send({
    success: true,
    data: field,
    message: `Analytics ${
      enabled ? 'enabled' : 'disabled'
    } for field ${fieldId}`,
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
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Entity type must be "user" or "node"'
    );
  }

  const summary = await tenantConfigService.getAnalyticsSummary(
    tenantId,
    entityType
  );

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
