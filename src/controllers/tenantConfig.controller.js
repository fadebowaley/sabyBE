const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
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

module.exports = {
  getUserConfig,
  upsertUserConfig,
  getNodeConfig,
  upsertNodeConfig,
};

