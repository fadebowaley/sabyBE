const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const byokService = require('../services/byok.service');

const getTenantKeys = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const keys = await byokService.getTenantByokKeys(tenantId);
  res.status(httpStatus.OK).send({
    status: 'success',
    data: keys,
  });
});

const saveTenantKey = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { provider, apiKey, defaultModel, enabled } = req.body;
  const result = await byokService.saveTenantByokKey({
    tenantId,
    provider,
    apiKey,
    defaultModel,
    enabled,
  });
  res.status(httpStatus.OK).send({
    status: 'success',
    data: result,
  });
});

const deleteTenantKey = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const { provider } = req.params;
  const result = await byokService.deleteTenantByokKey({
    tenantId,
    provider,
  });
  res.status(httpStatus.OK).send({
    status: 'success',
    data: result,
  });
});

const testKey = catchAsync(async (req, res) => {
  const { provider, apiKey, model } = req.body;
  const result = await byokService.testProviderKey({
    provider,
    apiKey,
    model,
  });
  res.status(httpStatus.OK).send({
    status: 'success',
    data: result,
  });
});

module.exports = {
  getTenantKeys,
  saveTenantKey,
  deleteTenantKey,
  testKey,
};
