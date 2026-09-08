const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const aiTokenService = require('../services/aiToken.service');

const getPacks = catchAsync(async (req, res) => {
  const packs = aiTokenService.getAiTokenPacks();
  res.status(httpStatus.OK).send({
    status: 'success',
    data: { packs },
  });
});

const getBalance = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const isSaby = Boolean(req.user?.isSaby || req.user?.isSuper);
  const balance = await aiTokenService.getTenantAiBalance({ tenantId, isSaby });

  res.status(httpStatus.OK).send({
    status: 'success',
    data: balance,
  });
});

const initializeCheckout = catchAsync(async (req, res) => {
  const { packId, currency, provider, returnUrl } = req.body;
  const result = await aiTokenService.initializeAiTokenCheckout({
    user: req.user,
    packId,
    currency,
    provider,
    returnUrl,
  });

  res.status(httpStatus.CREATED).send({
    status: 'success',
    data: result,
  });
});

const allocateTokens = catchAsync(async (req, res) => {
  const { targetTenantId, tokens, isUnlimited, reason } = req.body;
  const result = await aiTokenService.allocateTokensManually({
    actorUser: req.user,
    targetTenantId,
    tokens,
    isUnlimited,
    reason,
  });

  res.status(httpStatus.OK).send({
    status: 'success',
    message: 'Tokens successfully allocated.',
    data: result,
  });
});

const listQuotas = catchAsync(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await aiTokenService.listAllTenantQuotas({
    page,
    limit,
    search,
  });

  res.status(httpStatus.OK).send({
    status: 'success',
    data: result,
  });
});

module.exports = {
  getPacks,
  getBalance,
  initializeCheckout,
  allocateTokens,
  listQuotas,
};
