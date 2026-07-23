const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { paymentService, subscriptionService } = require('../services');

const CAPABILITY_KEY = 'paymentsCollection';

const resolveTenantId = (req) =>
  req?.user?.tenantId ||
  req?.tenantId ||
  req?.apiKey?.tenant?._id ||
  req?.apiKey?.tenant?.tenantId ||
  req?.query?.tenantId ||
  req?.body?.tenantId ||
  null;

const isPrivilegedActor = (req) => req?.user?.isSaby;

const resolvePurposeFromRequest = async (req) => {
  const bodyPurpose = String(req?.body?.purpose || '').trim().toLowerCase();
  if (bodyPurpose) {
    return bodyPurpose;
  }

  const queryPurpose = String(req?.query?.purpose || '').trim().toLowerCase();
  if (queryPurpose) {
    return queryPurpose;
  }

  const tenantId = resolveTenantId(req);
  if (req?.params?.paymentId) {
    const payment = await paymentService.getPaymentById(req.params.paymentId, tenantId);
    req.payment = payment;
    return String(payment?.purpose || '').trim().toLowerCase() || null;
  }

  if (req?.params?.reference) {
    const payment = await paymentService.getPaymentByReference(req.params.reference, tenantId);
    req.payment = payment;
    return String(payment?.purpose || '').trim().toLowerCase() || null;
  }

  return null;
};

const assertCollectionPaymentCapability = async (req) => {
  const tenantId = resolveTenantId(req);
  if (!tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Tenant subscription context is required for collection payments.'
    );
  }

  const subscription = await subscriptionService.getCurrentSubscription(tenantId, {
    refreshUsage: false,
  });
  const status = String(subscription?.status || '').trim().toLowerCase();

  if (status !== 'active') {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'An active workspace subscription is required for payment collection.'
    );
  }

  if (!subscription?.entitlements?.capabilities?.[CAPABILITY_KEY]) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Payment collection is not available on the current workspace subscription.'
    );
  }

  req.subscription = subscription;
};

const requirePaymentCollectionCapability = (options = {}) =>
  catchAsync(async (req, _res, next) => {
    if (isPrivilegedActor(req)) {
      return next();
    }

    const purpose = await resolvePurposeFromRequest(req);
    if (options.allowSubscription === true && purpose === 'subscription') {
      return next();
    }

    await assertCollectionPaymentCapability(req);
    return next();
  });

module.exports = requirePaymentCollectionCapability;
