const httpStatus = require('http-status');
const { Token } = require('../models');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');

const sanitizeSession = (tokenDoc, currentRefreshToken) => {
  const token = tokenDoc.toObject ? tokenDoc.toObject() : tokenDoc;
  const device = token.device || {};
  return {
    id: String(token._id || token.id),
    current: Boolean(currentRefreshToken && token.token === currentRefreshToken),
    deviceId: device.deviceId || null,
    deviceKey: device.deviceKey || null,
    deviceType: device.deviceType || null,
    deviceName: device.name || 'Unknown device',
    browser: device.browser || null,
    platform: device.platform || null,
    ip: device.ip || null,
    createdAt: token.createdAt || null,
    lastUsedAt: token.lastUsedAt || token.updatedAt || token.createdAt || null,
    expires: token.expires || null,
  };
};

const fallbackDeviceKey = (session) =>
  [
    session.browser || 'Unknown browser',
    session.platform || 'Unknown platform',
    session.deviceType || 'desktop',
    session.deviceName || 'Unknown device',
  ]
    .map((part) => String(part).trim().toLowerCase())
    .join('|');

const listUserTrustedDevices = async ({ userId, currentRefreshToken } = {}) => {
  const sessions = await listUserSessions({ userId, currentRefreshToken });
  const grouped = new Map();

  sessions.forEach((session) => {
    const key = session.deviceKey || fallbackDeviceKey(session);
    const existing = grouped.get(key);
    const lastUsedAt = session.lastUsedAt || session.createdAt || null;
    const createdAt = session.createdAt || null;

    if (!existing) {
      grouped.set(key, {
        id: key,
        deviceKey: key,
        current: Boolean(session.current),
        deviceName: session.deviceName,
        browser: session.browser,
        platform: session.platform,
        deviceType: session.deviceType,
        ip: session.ip,
        firstSeenAt: createdAt,
        lastUsedAt,
        expires: session.expires,
        sessionCount: 1,
      });
      return;
    }

    existing.current = existing.current || Boolean(session.current);
    existing.sessionCount += 1;
    if (createdAt && (!existing.firstSeenAt || new Date(createdAt) < new Date(existing.firstSeenAt))) {
      existing.firstSeenAt = createdAt;
    }
    if (lastUsedAt && (!existing.lastUsedAt || new Date(lastUsedAt) > new Date(existing.lastUsedAt))) {
      existing.lastUsedAt = lastUsedAt;
      existing.ip = session.ip || existing.ip;
      existing.expires = session.expires || existing.expires;
    }
  });

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
  );
};

const listUserSessions = async ({ userId, currentRefreshToken } = {}) => {
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User context is required');
  }

  const tokens = await Token.find({
    user: userId,
    type: tokenTypes.REFRESH,
    blacklisted: false,
    expires: { $gt: new Date() },
  }).sort({ updatedAt: -1, createdAt: -1 });

  return tokens.map((token) => sanitizeSession(token, currentRefreshToken));
};

const revokeCurrentSession = async ({ refreshToken } = {}) => {
  if (!refreshToken) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Refresh token is required');
  }

  const result = await Token.deleteOne({
    token: refreshToken,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });

  return { revokedCount: result.deletedCount || 0 };
};

const revokeAllUserSessions = async ({ userId } = {}) => {
  if (!userId) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'User context is required');
  }

  const result = await Token.deleteMany({
    user: userId,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });

  return { revokedCount: result.deletedCount || 0 };
};

module.exports = {
  listUserSessions,
  listUserTrustedDevices,
  revokeCurrentSession,
  revokeAllUserSessions,
};
