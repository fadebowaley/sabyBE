const { User } = require('../models');
const mfaService = require('./mfa.service');
const sessionService = require('./session.service');

const getSecurityOverview = async ({ userId, currentRefreshToken }) => {
  const user = await User.findById(userId);
  const sessions = await sessionService.listUserSessions({
    userId,
    currentRefreshToken,
  });
  const trustedDevices = await sessionService.listUserTrustedDevices({
    userId,
    currentRefreshToken,
  });

  return {
    mfa: user ? mfaService.getMfaOverview(user) : null,
    sessions,
    trustedDevices,
  };
};

module.exports = {
  getSecurityOverview,
};
