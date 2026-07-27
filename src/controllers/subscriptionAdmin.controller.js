const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');
const tenantDeletionService = require('../services/tenantDeletion.service');

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

const previewTenantDeletion = catchAsync(async (req, res) => {
  const preview = await tenantDeletionService.previewTenantDeletion(
    req.params.tenantId
  );
  res.send({ preview });
});

const deleteTenant = catchAsync(async (req, res) => {
  const result = await tenantDeletionService.deleteTenant({
    tenantId: req.params.tenantId,
    securityKey: req.body?.securityKey,
    confirmation: req.body?.confirmation,
    actor: {
      ...actorFromRequest(req),
      email: req.user?.email || null,
    },
  });
  res.send(result);
});

module.exports = {
  listAdminSubscriptions,
  createAdminSubscription,
  updateAdminSubscription,
  updateAdminSubscriptionStatus,
  startOrExtendTrial,
  previewTenantDeletion,
  deleteTenant,
};
