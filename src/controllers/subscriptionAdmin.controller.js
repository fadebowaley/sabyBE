const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');

const actorFromRequest = (req) => ({
  userId: req.user?._id || req.user?.id || req.user?.userId || null,
});

const listAdminSubscriptions = catchAsync(async (req, res) => {
  const result = await subscriptionService.listAdminSubscriptions(req.query, req.query);
  res.send(result);
});

const createAdminSubscription = catchAsync(async (req, res) => {
  const result = await subscriptionService.createAdminPaymentOrSubscription(
    req.body,
    actorFromRequest(req)
  );
  res.status(201).send(result);
});

const updateAdminSubscription = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.updateAdminSubscription(
    req.params.subscriptionId,
    req.body,
    actorFromRequest(req)
  );
  res.send({ subscription });
});

const updateAdminSubscriptionStatus = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.updateAdminSubscriptionStatus(
    req.params.subscriptionId,
    req.body,
    actorFromRequest(req)
  );
  res.send({ subscription });
});

const startOrExtendTrial = catchAsync(async (req, res) => {
  const subscription = await subscriptionService.startOrExtendTrial(
    req.params.subscriptionId,
    req.body,
    actorFromRequest(req)
  );
  res.send({ subscription });
});

module.exports = {
  listAdminSubscriptions,
  createAdminSubscription,
  updateAdminSubscription,
  updateAdminSubscriptionStatus,
  startOrExtendTrial,
};
