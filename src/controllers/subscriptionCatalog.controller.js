const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const {
  loadSubscriptionCatalog,
  upsertSubscriptionCatalog,
} = require('../services/subscriptionCatalog.service');

const getSubscriptionCatalog = catchAsync(async (_req, res) => {
  const catalog = await loadSubscriptionCatalog();
  res.send({ catalog });
});

const updateSubscriptionCatalog = catchAsync(async (req, res) => {
  const catalog = await upsertSubscriptionCatalog(req.body || {}, {
    userId: req.user?._id || req.user?.id || req.user?.userId || null,
  });
  res.status(httpStatus.OK).send({ catalog });
});

module.exports = {
  getSubscriptionCatalog,
  updateSubscriptionCatalog,
};
