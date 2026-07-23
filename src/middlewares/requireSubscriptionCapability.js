const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { subscriptionService } = require('../services');

const CAPABILITY_LABELS = {
  apiAccess: 'API access',
  advancedExports: 'Advanced exports',
  workflowsApprovals: 'Workflow approvals',
  paymentsCollection: 'Payment collection',
  settlement: 'Settlement',
};

const resolveTenantId = (req) =>
  req?.user?.tenantId ||
  req?.tenantId ||
  req?.apiKey?.tenant?._id ||
  req?.apiKey?.tenant?.tenantId ||
  null;

const requireSubscriptionCapability = (capabilityKey, options = {}) =>
  catchAsync(async (req, _res, next) => {
    if (req?.user?.isSaby) {
      return next();
    }

    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Tenant subscription context is required for this action.'
      );
    }

    const subscription = await subscriptionService.getCurrentSubscription(tenantId, {
      refreshUsage: false,
    });
    const status = String(subscription?.status || '').trim().toLowerCase();

    if (status !== 'active') {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        options.inactiveMessage ||
          'An active workspace subscription is required for this action.'
      );
    }

    if (!subscription?.entitlements?.capabilities?.[capabilityKey]) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        options.message ||
          `${CAPABILITY_LABELS[capabilityKey] || 'This capability'} is not available on the current workspace subscription.`
      );
    }

    req.subscription = subscription;
    return next();
  });


  
module.exports = requireSubscriptionCapability;
