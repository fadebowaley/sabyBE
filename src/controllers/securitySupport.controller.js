const catchAsync = require('../utils/catchAsync');
const { securitySupportService } = require('../services');

const actorFromRequest = (req) => ({
  userId: req.user?._id || req.user?.id || req.user?.userId || null,
  email: req.user?.email || null,
});

const listSecuritySupportUsers = catchAsync(async (req, res) => {
  const result = await securitySupportService.listSecuritySupportUsers(req.query);
  res.send(result);
});

const performSecuritySupportAction = catchAsync(async (req, res) => {
  const user = await securitySupportService.performSecuritySupportAction({
    userId: req.params.userId,
    action: req.body.action,
    passkeyId: req.body.passkeyId,
    reason: req.body.reason,
    actor: actorFromRequest(req),
  });
  res.send({ user });
});

module.exports = {
  listSecuritySupportUsers,
  performSecuritySupportAction,
};
