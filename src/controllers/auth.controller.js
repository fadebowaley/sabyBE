const httpStatus = require('http-status');
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const moment = require('moment');
const config = require('../config/config');
const smsService = require('../services/sms.service');
const {
  authService,
  userService,
  tokenService,
  emailService,
  apiKeyService,
  tenantOnboardingService,
  sessionService,
  mfaService,
  userSecurityService,
} = require('../services');
const { Role, User } = require('../models');
const logger = require('../config/logger');

const ONBOARDING_PHONE_OTP_TTL_MINUTES = 10;
const ONBOARDING_PHONE_OTP_MAX_ATTEMPTS = 5;
const ONBOARDING_CHANNEL_TIMEOUT_MS = 12000;

const maskPhoneForDisplay = (phoneNumber = '') => {
  const value = String(phoneNumber || '');
  if (value.length <= 4) return value;
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
};

const maskEmailForDisplay = (email = '') => {
  const value = String(email || '').trim().toLowerCase();
  const [local, domain] = value.split('@');
  if (!local || !domain) return value;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
};

const normalizeNamePart = (value = '', fallback = 'User') => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9' -]/g, '')
    .replace(/\s+/g, ' ');
  if (!cleaned) return fallback;
  return cleaned.slice(0, 64);
};

const deriveNamePartsFromEmail = (email = '') => {
  const localPart = String(email || '').split('@')[0] || '';
  const chunks = localPart
    .split(/[._-]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, '').trim())
    .filter(Boolean);
  const first = normalizeNamePart(chunks[0] || 'Google', 'Google');
  const last = normalizeNamePart(chunks.slice(1).join(' ') || 'User', 'User');
  return { first, last };
};

const deriveSocialNameParts = ({ firstname, lastname, name, email }) => {
  const first = normalizeNamePart(firstname || '', '');
  const last = normalizeNamePart(lastname || '', '');
  if (first && last) {
    return { firstname: first, lastname: last };
  }

  const fromName = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (fromName.length >= 2) {
    return {
      firstname: normalizeNamePart(fromName[0], 'Google'),
      lastname: normalizeNamePart(fromName.slice(1).join(' '), 'User'),
    };
  }

  const fromEmail = deriveNamePartsFromEmail(email);
  return {
    firstname: first || fromEmail.first,
    lastname: last || fromEmail.last,
  };
};

const generateSocialPassword = () =>
  `Saby${crypto.randomBytes(12).toString('hex')}A1`;

const resolveClientIp = (req) =>
  String(
    req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.ip ||
      req.socket?.remoteAddress ||
      ''
  )
    .split(',')[0]
    .trim();

const normalizeDeviceId = (value) => {
  const normalized = String(value || '').trim();
  return /^[a-zA-Z0-9:_-]{16,160}$/.test(normalized) ? normalized : null;
};

const resolveTrustedDeviceId = (req) =>
  normalizeDeviceId(
    req.headers['x-saby-device-id'] ||
      req.body?.deviceId ||
      req.cookies?.saby_trusted_device_id
  );

const hashDeviceKey = (value) =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex');

const parseDeviceFromRequest = (req) => {
  const userAgent = String(req.headers['user-agent'] || '').trim();
  const browser = /Edg\//.test(userAgent)
    ? 'Microsoft Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : userAgent
            ? 'Browser'
            : 'Unknown browser';
  const platform = /Macintosh|Mac OS X/.test(userAgent)
    ? 'macOS'
    : /Windows/.test(userAgent)
      ? 'Windows'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  const deviceType = /iPhone|Android.*Mobile/.test(userAgent)
    ? 'mobile'
    : /iPad|Tablet|Android/.test(userAgent)
      ? 'tablet'
      : 'desktop';
  const deviceId = resolveTrustedDeviceId(req);
  const fallbackIdentity = [browser, platform || 'unknown-platform', deviceType, userAgent]
    .filter(Boolean)
    .join('|');
  const deviceKey = hashDeviceKey(deviceId ? `trusted:${deviceId}` : `ua:${fallbackIdentity}`);

  return {
    deviceId,
    deviceKey,
    deviceType,
    name: platform ? `${browser} on ${platform}` : browser,
    browser,
    platform,
    ip: resolveClientIp(req),
    userAgent,
  };
};

const upsertSocialAuthAudit = async ({
  user,
  provider,
  avatar = '',
  isNewUser = false,
}) => {
  if (!user || !provider) return;
  const now = new Date();
  const current =
    user.socialAuth && typeof user.socialAuth === 'object'
      ? user.socialAuth
      : {};
  const currentProviders = Array.isArray(current.providers)
    ? current.providers
    : [];
  const providers = currentProviders.includes(provider)
    ? currentProviders
    : [...currentProviders, provider];
  const currentMeta =
    current.providerMeta && typeof current.providerMeta === 'object'
      ? current.providerMeta
      : {};
  const existingMeta =
    currentMeta[provider] && typeof currentMeta[provider] === 'object'
      ? currentMeta[provider]
      : {};

  user.socialAuth = {
    ...current,
    signupProvider:
      current.signupProvider || (isNewUser ? provider : null) || provider,
    lastProvider: provider,
    providers,
    lastLoginAt: now,
    providerMeta: {
      ...currentMeta,
      [provider]: {
        ...existingMeta,
        linkedAt: existingMeta.linkedAt || now,
        lastLoginAt: now,
        avatar: String(avatar || existingMeta.avatar || '').trim() || null,
      },
    },
  };
  user.markModified('socialAuth');
  await user.save();
};

const hashOnboardingPhoneOtp = ({ userId, phoneNumber, otp }) =>
  crypto
    .createHmac('sha256', String(config.jwt.secret || 'saby'))
    .update(`${String(userId)}:${String(phoneNumber)}:${String(otp)}`)
    .digest('hex');

const getOnboardingPhoneOtpState = (user) => {
  const customFields = user?.customFields || {};
  return customFields?.onboarding?.phoneOtp || null;
};

const setOnboardingPhoneOtpState = (user, state) => {
  const customFields = { ...(user?.customFields || {}) };
  const onboarding = { ...(customFields.onboarding || {}) };
  onboarding.phoneOtp = state;
  customFields.onboarding = onboarding;
  user.customFields = customFields;
};

const shouldExposeOnboardingDebugOtp =
  config.env !== 'production' || Boolean(config.onboarding?.debugOtp);

const withTimeout = (promise, timeoutMs, timeoutMessage) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const buildAuthUserResponse = async (user) => {
  let permissions = [];
  if (
    (user.isAdmin || (!user.isOwner && !user.isSuper && !user.isSaby)) &&
    user.roles &&
    user.roles.length > 0
  ) {
    const userRoles = await Role.find({ _id: { $in: user.roles } }).populate(
      'permissions'
    );

    const allPermissions = new Set();
    userRoles.forEach((role) => {
      if (role.permissions && Array.isArray(role.permissions)) {
        role.permissions.forEach((perm) => {
          const permName =
            typeof perm === 'string'
              ? perm
              : perm.name || perm._id?.toString();
          if (permName) {
            allPermissions.add(permName);
          }
        });
      }
    });

    permissions = Array.from(allPermissions);
  }

  let onboardingStatus = user?.onboardingStatus;
  let onboardingComplete =
    typeof user?.onboardingComplete === 'boolean'
      ? user.onboardingComplete
      : undefined;
  let requiresOnboarding =
    typeof user?.requiresOnboarding === 'boolean'
      ? user.requiresOnboarding
      : undefined;

  if (user?.isOwner || user?.isSuper || user?.isSaby) {
    const hasOnboardingProjection =
      typeof onboardingComplete === 'boolean' &&
      typeof requiresOnboarding === 'boolean' &&
      typeof onboardingStatus === 'string' &&
      onboardingStatus.length > 0;

    if (!hasOnboardingProjection) {
      try {
        const onboarding = await tenantOnboardingService.getOnboardingStatus({
          userId: user.id || user._id,
        });
        onboardingComplete = Boolean(onboarding?.completed);
        requiresOnboarding = Boolean(
          onboarding?.requiresOnboarding && !onboarding?.completed
        );
        onboardingStatus = onboardingComplete
          ? 'complete'
          : requiresOnboarding
            ? 'required'
            : 'none';

        await User.updateOne(
          { _id: user._id || user.id },
          {
            $set: {
              onboardingStatus,
              onboardingComplete,
              requiresOnboarding,
              onboardingCompletedAt: onboardingComplete ? new Date() : null,
            },
          }
        );
      } catch (error) {
        logger.warn('[Auth] Failed to resolve onboarding status for auth payload', {
          userId: String(user?._id || user?.id || ''),
          tenantId: String(user?.tenantId || ''),
          error: error?.message || String(error),
        });
      }
    }
  }

  return {
    id: user.id,
    userId: user.userId,
    haloId: user.haloId,
    tenantId: user.tenantId,
    firstname: user.firstname,
    lastname: user.lastname,
    name: `${user.firstname} ${user.lastname}`.trim(),
    email: user.email,
    phoneNumber: user.phoneNumber,
    avatar: user.avatar,
    isOwner: user.isOwner,
    isSuper: user.isSuper,
    isSaby: user.isSaby,
    isAdmin: user.isAdmin,
    isAgreed: user.isAgreed,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    onboardingStatus,
    onboardingComplete,
    requiresOnboarding,
    status: user.status,
    createdAt: user.createdAt,
    roles: user.roles,
    permissions: permissions.length > 0 ? permissions : undefined,
  };
};

const buildAuthLoginPayload = async (user, req) => {
  const tokens = await tokenService.generateAuthTokens(user, {
    device: req ? parseDeviceFromRequest(req) : undefined,
  });
  const userResponse = await buildAuthUserResponse(user);
  return { user: userResponse, tokens };
};

/**
 * Register a new user
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email
 * @param {string} req.body.password - User's password
 * @param {string} req.body.name - User's name
 * @returns {Object} {user, tokens}
 * @example
 * POST /auth/register
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "name": "John Doe"
 * }
 */

const register = catchAsync(async (req, res) => {
  // Create user with otpVerified = false
  const user = await userService.createUser({
    ...req.body,
    otpVerified: false,
  });
  // Generate and send OTP
  await authService.sendUserOtp(user);
  // Do not send tokens yet — user must verify OTP first
  res.status(httpStatus.CREATED).send({
    message: 'Registration successful. Please check your email for the OTP.',
    user: {
      email: user.email,
      name: user.name,
      otpVerified: user.otpVerified,
    },
  });
});

/**
 * Login with email and password
 * @param {Object} req.body
 * @param {string} req.body.email - User's email
 * @param {string} req.body.password - User's password
 * @returns {Object} {user, tokens}
 * @example
 * POST /auth/login
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  try {
    // Login user - all registered users can login without API key requirement
    const user = await authService.loginUserWithEmailAndPassword(
      email,
      password,
      'web'
    );
    const mfaChallenge = await mfaService.createLoginChallenge(user);
    if (mfaChallenge.required) {
      return res.status(httpStatus.OK).send({
        mfaRequired: true,
        message: 'Multi-factor authentication is required',
        email: user.email,
        ...mfaChallenge,
      });
    }
    const payload = await buildAuthLoginPayload(user, req);
    res.send(payload);
  } catch (error) {
    // If user exists but is unverified, return phone number for OTP flow
    if (error.name === 'OtpNotVerified') {
      const user = await userService.getUserByEmail(email);
      if (user) {
        return res.status(httpStatus.UNAUTHORIZED).send({
          code: httpStatus.UNAUTHORIZED,
          message: error.message,
          email: user.email,
          phoneNumber: user.phoneNumber,
        });
      }
    }

    // Explicitly handle login authentication errors to ensure correct error message
    if (error.statusCode === httpStatus.UNAUTHORIZED && error.message) {
      // Check if this is a login authentication error (incorrect email/password)
      if (
        error.message.includes('Incorrect email or password') ||
        error.message.includes('email or password')
      ) {
        return res.status(httpStatus.UNAUTHORIZED).send({
          code: httpStatus.UNAUTHORIZED,
          message: 'Incorrect email or password',
        });
      }
    }

    // Re-throw other errors to be handled by error middleware
    throw error;
  }
});

const requestPhoneLoginOtp = catchAsync(async (req, res) => {
  const rawPhone = String(req.body?.phoneNumber || '').trim();
  if (!rawPhone) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number is required.');
  }

  const user = await userService.getUserByPhone(rawPhone);
  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No account found for this phone number. Please create an account to continue.'
    );
  }

  const delivery = await authService.sendUserOtp(user);
  const emailSent = Boolean(delivery?.channelStatus?.email?.sent);
  const smsSent = Boolean(delivery?.channelStatus?.sms?.sent);
  let message = 'OTP sent successfully.';
  if (smsSent && emailSent) {
    message = 'OTP sent via SMS and email fallback.';
  } else if (smsSent && !emailSent) {
    message = 'OTP sent via SMS. Email fallback failed.';
  } else if (!smsSent && emailSent) {
    message = 'OTP sent via email fallback. SMS delivery failed.';
  }

  res.status(httpStatus.OK).send({
    success: true,
    message,
    data: {
      destination: user.phoneNumber ? maskPhoneForDisplay(user.phoneNumber) : null,
      email: user.email ? maskEmailForDisplay(user.email) : null,
      channels: Array.isArray(delivery?.channels) ? delivery.channels : [],
      channelStatus: delivery?.channelStatus || null,
    },
  });
});

const verifyPhoneLoginOtp = catchAsync(async (req, res) => {
  const rawPhone = String(req.body?.phoneNumber || '').trim();
  const rawOtp = String(req.body?.otp || '')
    .replace(/\D/g, '')
    .slice(0, 6);
  if (!rawPhone || rawOtp.length !== 6) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number and 6-digit OTP are required.');
  }

  const user = await userService.getUserByPhone(rawPhone);
  if (!user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP code.');
  }

  const { success } = await authService.verifyOtp(user.email, rawOtp, false);
  if (!success) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP code.');
  }

  if (!user.isPhoneVerified) {
    user.isPhoneVerified = true;
    await user.save();
  }

  const refreshedUser = await userService.getUserById(user.id);
  await authService.assertMainAppAccess(refreshedUser);
  const payload = await buildAuthLoginPayload(refreshedUser, req);
  res.status(httpStatus.OK).send(payload);
});

const socialLogin = catchAsync(async (req, res) => {
  const configuredSecret = String(config.socialAuth?.sharedSecret || '').trim();
  if (!configuredSecret) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Social authentication is not configured.'
    );
  }

  const providedSecret = String(req.headers['x-social-auth-secret'] || '').trim();
  if (!providedSecret || providedSecret !== configuredSecret) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Unauthorized social login request.');
  }

  const provider = String(req.body?.provider || '').toLowerCase();
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const providerFirstname = String(req.body?.firstname || '').trim();
  const providerLastname = String(req.body?.lastname || '').trim();
  const providerName = String(req.body?.name || '').trim();
  const providerAvatar = String(req.body?.avatar || '').trim();
  const providerEmailVerified = req.body?.emailVerified;

  if (!['google', 'apple'].includes(provider)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unsupported social provider.');
  }
  if (!email) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is required for social login.');
  }
  if (provider === 'google' && providerEmailVerified !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Google account email must be verified before continuing.'
    );
  }

  let user = await userService.getUserByEmail(email);
  const isNewUser = !user;

  if (!user) {
    const nameParts = deriveSocialNameParts({
      firstname: providerFirstname,
      lastname: providerLastname,
      name: providerName,
      email,
    });

    user = await userService.createUser({
      firstname: nameParts.firstname,
      lastname: nameParts.lastname,
      email,
      password: generateSocialPassword(),
      isOwner: true,
      isAgreed: true,
      otpVerified: true,
      isEmailVerified: true,
      status: true,
      ...(providerAvatar ? { avatar: providerAvatar } : {}),
    });
  } else {
    if (user.deletedAt) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'This account has been deactivated. Contact support.'
      );
    }

    const nameParts = deriveSocialNameParts({
      firstname: providerFirstname,
      lastname: providerLastname,
      name: providerName,
      email,
    });
    const updates = {
      otpVerified: true,
      isEmailVerified: true,
      status: true,
    };

    if (!String(user.firstname || '').trim()) {
      updates.firstname = nameParts.firstname;
    }
    if (!String(user.lastname || '').trim()) {
      updates.lastname = nameParts.lastname;
    }
    if (providerAvatar && !String(user.avatar || '').trim()) {
      updates.avatar = providerAvatar;
    }

    await userService.updateUserById(user.id, updates);
  }

  await upsertSocialAuthAudit({
    user,
    provider,
    avatar: providerAvatar,
    isNewUser,
  });
  const refreshedUser = await userService.getUserById(user.id);
  await authService.assertMainAppAccess(refreshedUser);
  const payload = await buildAuthLoginPayload(refreshedUser, req);
  res.status(httpStatus.OK).send({
    ...payload,
    auth: {
      provider,
      mode: isNewUser ? 'signup' : 'login',
    },
  });
});

/**
 * Logout user by invalidating refresh token
 * @param {Object} req.body
 * @param {string} req.body.refreshToken - Refresh token to invalidate
 * @example
 * POST /auth/logout
 * {
 *   "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * }
 */
const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Refresh auth tokens
 * @param {Object} req.body
 * @param {string} req.body.refreshToken - Refresh token
 * @returns {Object} {access, refresh} New token pair
 * @example
 * POST /auth/refresh-tokens
 * {
 *   "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * }
 */
const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

/**
 * Send reset password email
 * @param {Object} req.body
 * @param {string} req.body.email - Email address to send reset link
 * @example
 * POST /auth/forgot-password
 * {
 *   "email": "user@example.com"
 * }
 */
const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(
    req.body.email
  );
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Reset password
 * @param {string} req.query.token - Reset password token
 * @param {Object} req.body
 * @param {string} req.body.password - New password
 * @example
 * POST /auth/reset-password?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 * {
 *   "password": "newpassword123"
 * }
 */
const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Send verification email
 * @param {Object} req.user - Authenticated user object
 * @example
 * POST /auth/send-verification-email
 * Authorization: Bearer <access_token>
 */
const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(
    req.user
  );
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Verify email
 * @param {string} req.query.token - Email verification token
 * @example
 * POST /auth/verify-email?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 */
const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Verify OTP controller
 */

const verifyOtp = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  // Don't clear OTP yet - keep it for password change step (clearOtp = false)
  const { success, user } = await authService.verifyOtp(email, otp, false);
  if (success) {
    // Auto-generate web API keys only for isOwner users (tenant-scoped keys)
    // Non-owner users skip auto-generation (registration still succeeds)
    try {
      if (user.tenantId && user._id && user.isOwner === true) {
        const keys = await apiKeyService.autoGenerateWebApiKeys(
          user.tenantId,
          user._id
        );
        logger.info(
          `Auto-generated web API keys for owner user: ${user.email}`,
          {
            staging: keys.staging.keyDoc._id,
            production: keys.production.keyDoc._id,
          }
        );
      } else if (user.tenantId && user._id) {
        // Log that auto-generation was skipped for non-owner users
        logger.info(
          `Skipped API key auto-generation for non-owner user: ${user.email} (isOwner=${user.isOwner})`
        );
      }
    } catch (error) {
      logger.error('Failed to auto-generate web API keys:', error);
      // Don't fail registration if API key generation fails
    }

    return res.status(httpStatus.OK).send({
      message: 'OTP verified successfully',
    });
  }
  console.log('OTP verification failed');
  return res.status(httpStatus.BAD_REQUEST).send({
    message: 'OTP verification failed',
  });
});

/**
 * Resend OTP controller
 * Supports both unverified users (registration) and verified users (password reset)
 */
const resendOtp = catchAsync(async (req, res) => {
  const { email, purpose } = req.body; // purpose: 'registration' | 'password-reset'
  const user = await userService.getUserByEmail(email);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // For registration flow, only allow unverified users
  // For password reset flow, allow verified users
  if (!purpose || purpose === 'registration') {
    if (user.otpVerified) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'User is already verified');
    }
  }

  // For password reset, allow sending OTP even if user is verified
  // This allows verified users to reset their password via OTP
  const result = await authService.sendUserOtp(user);
  console.log(result);
  res.status(httpStatus.OK).send({ message: 'OTP resent successfully' });
});

/**
 * Change password for unverified user (requires OTP)
 * @param {Object} req.body
 * @param {string} req.body.email - User's email
 * @param {string} req.body.newPassword - New password
 * @param {string} req.body.otp - OTP code for verification
 * @returns {Object} Success message
 * @example
 * POST /auth/change-password
 * {
 *   "email": "user@example.com",
 *   "newPassword": "newPassword123",
 *   "otp": "123456"
 * }
 */
const changePassword = catchAsync(async (req, res) => {
  const { email, newPassword, otp } = req.body;

  // Verify OTP (don't clear it yet - we'll clear it after password is set)
  const { success, user } = await authService.verifyOtp(email, otp, false);

  if (!success) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid or expired OTP. Please request a new OTP code.'
    );
  }

  // Update password
  await authService.updateUserPassword(user._id, newPassword);

  // Now clear OTP and mark as fully verified
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otp: null,
        otpExpires: null,
        otpVerified: true,
        status: true,
        isEmailVerified: true,
        isPhoneVerified: true,
      },
    }
  );

  res.status(httpStatus.OK).send({
    message: 'Password updated successfully. You can now login.',
  });
});

/**
 * Verify current password for authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @param {string} req.body.password - Current password to verify
 * @returns {Object} {success: true, message: string}
 * @example
 * POST /auth/verify-password
 * {
 *   "password": "currentPassword123"
 * }
 */
const verifyPassword = catchAsync(async (req, res) => {
  const { password } = req.body;
  const user = await User.findById(req.user._id);

  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid password');
  }

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Password verified successfully',
  });
});

/**
 * Change password for authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @param {string} req.body.currentPassword - Current password
 * @param {string} req.body.newPassword - New password
 * @returns {Object} {success: true, message: string}
 * @example
 * POST /auth/change-password-authenticated
 * {
 *   "currentPassword": "oldPassword123",
 *   "newPassword": "newSecurePassword456"
 * }
 */
const changePasswordAuthenticated = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Verify current password
  if (!(await user.isPasswordMatch(currentPassword))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid current password');
  }

  // Check if new password is different from current
  if (await user.isPasswordMatch(newPassword)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'New password must be different from current password'
    );
  }

  // Update password
  await authService.updateUserPassword(user._id, newPassword);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Password changed successfully',
  });
});

const getSecurityOverview = catchAsync(async (req, res) => {
  const result = await userSecurityService.getSecurityOverview({
    userId: req.user._id || req.user.id,
    currentRefreshToken: req.body?.refreshToken || req.query?.refreshToken,
  });
  res.status(httpStatus.OK).send(result);
});

const getSessions = catchAsync(async (req, res) => {
  const result = await sessionService.listUserSessions({
    userId: req.user._id || req.user.id,
    currentRefreshToken: req.query?.refreshToken,
  });
  res.status(httpStatus.OK).send({ results: result });
});

const logoutAllSessions = catchAsync(async (req, res) => {
  const result = await sessionService.revokeAllUserSessions({
    userId: req.user._id || req.user.id,
  });
  res.status(httpStatus.OK).send({
    success: true,
    message: 'All sessions revoked successfully',
    ...result,
  });
});

const setupAuthenticatorMfa = catchAsync(async (req, res) => {
  const result = await mfaService.setupAuthenticator(req.user._id || req.user.id);
  res.status(httpStatus.OK).send(result);
});

const verifyAuthenticatorMfa = catchAsync(async (req, res) => {
  const result = await mfaService.verifyAuthenticator({
    userId: req.user._id || req.user.id,
    code: req.body.code,
  });
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Authenticator verified successfully',
    ...result,
  });
});

const toggleAuthenticatorMfa = catchAsync(async (req, res) => {
  const result = await mfaService.setAuthenticatorEnabled({
    userId: req.user._id || req.user.id,
    enabled: req.body.enabled,
  });
  res.status(httpStatus.OK).send(result);
});

const generatePasskeyRegistrationOptions = catchAsync(async (req, res) => {
  const result = await mfaService.generatePasskeyRegistrationOptions(req.user._id || req.user.id);
  res.status(httpStatus.OK).send(result);
});

const verifyPasskeyRegistration = catchAsync(async (req, res) => {
  const result = await mfaService.verifyPasskeyRegistration({
    userId: req.user._id || req.user.id,
    credential: req.body,
  });
  res.status(httpStatus.OK).send(result);
});

const generatePasskeyAssertionOptions = catchAsync(async (req, res) => {
  const result = await mfaService.generatePasskeyAssertionOptions({
    mfaToken: req.body.mfaToken,
  });
  res.status(httpStatus.OK).send(result);
});

const verifyPasskeyAssertion = catchAsync(async (req, res) => {
  const user = await mfaService.verifyPasskeyAssertion({
    mfaToken: req.body.mfaToken,
    credential: req.body.credential,
  });
  const payload = await buildAuthLoginPayload(user, req);
  res.status(httpStatus.OK).send(payload);
});

const verifyAuthenticatorLoginMfa = catchAsync(async (req, res) => {
  const user = await mfaService.verifyAuthenticatorLogin({
    mfaToken: req.body.mfaToken,
    code: req.body.code,
  });
  const payload = await buildAuthLoginPayload(user, req);
  res.status(httpStatus.OK).send(payload);
});

/**
 * Request OTP for email change
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @param {string} req.body.currentValue - Current email address
 * @returns {Object} {success: true, message: string}
 * @example
 * POST /auth/request-email-change-otp
 * {
 *   "currentValue": "user@example.com"
 * }
 */
const requestEmailChangeOtp = catchAsync(async (req, res) => {
  const { currentValue } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Verify current email matches
  if (user.email !== currentValue) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Current email does not match your account email'
    );
  }

  // Generate and send OTP
  await authService.sendUserOtp(user);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP sent to your email address',
  });
});

/**
 * Request OTP for phone change
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @param {string} req.body.currentValue - Current phone number
 * @returns {Object} {success: true, message: string}
 * @example
 * POST /auth/request-phone-change-otp
 * {
 *   "currentValue": "+1234567890"
 * }
 */
const requestPhoneChangeOtp = catchAsync(async (req, res) => {
  const { currentValue } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Verify current phone matches
  if (user.phoneNumber !== currentValue) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Current phone number does not match your account phone number'
    );
  }

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const moment = require('moment');
  const otpExpires = moment().add(10, 'minutes').toDate();

  // Store OTP
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otp,
        otpExpires,
      },
    }
  );

  // Send OTP via SMS
  await smsService.sendOtpSms({
    phoneNumber: user.phoneNumber,
    otp,
  });

  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP sent to your phone number',
  });
});

/**
 * Check API key expiration status (notification only)
 * Does not affect authentication - purely informational
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from auth middleware)
 * @returns {Object} {hasApiKey, isExpired, expiresAt, daysUntilExpiry, message}
 * @example
 * GET /auth/check-api-key-status
 */
const checkApiKeyStatus = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  // Get active web API keys for tenant (including inactive ones for status check)
  const result = await apiKeyService.getApiKeysByTenant(
    tenantId,
    { category: 'web' },
    { limit: 1, sortBy: 'createdAt:desc' }
  );

  const apiKey =
    result.results && result.results.length > 0 ? result.results[0] : null;

  if (!apiKey) {
    return res.status(httpStatus.OK).send({
      hasApiKey: false,
      isExpired: null,
      expiresAt: null,
      daysUntilExpiry: null,
      approvalStatus: null,
      isActive: false,
      needsApproval: false,
      needsRegeneration: false,
      message: 'No API key found',
    });
  }

  // Check approval status
  const approvalStatus = apiKey.approvalStatus || 'pending';
  const needsApproval = approvalStatus === 'pending';
  const isRejected = approvalStatus === 'rejected';
  const needsRegeneration = isRejected || !apiKey.isActive;

  // Check expiration
  let isExpired = false;
  let expiresAt = null;
  let daysUntilExpiry = null;
  let expirationMessage = null;

  if (apiKey.expires) {
    expiresAt = moment(apiKey.expires);
    const now = moment();
    isExpired = expiresAt.isBefore(now);
    daysUntilExpiry = Math.floor(expiresAt.diff(now, 'days', true));

    expirationMessage = isExpired
      ? `API key expired ${Math.abs(Math.round(daysUntilExpiry))} days ago`
      : daysUntilExpiry <= 0
      ? 'API key expires today'
      : daysUntilExpiry <= 7
      ? `API key expires in ${Math.round(daysUntilExpiry)} days`
      : `API key expires in ${Math.round(daysUntilExpiry)} days`;
  } else {
    expirationMessage = 'API key has no expiration date';
  }

  // Build comprehensive message
  let message = '';
  if (needsApproval) {
    message = 'API key is pending approval. Please wait for SabyUser approval.';
  } else if (isRejected) {
    message = `API key was rejected${
      apiKey.rejectionReason ? `: ${apiKey.rejectionReason}` : ''
    }. Please regenerate your API key.`;
  } else if (isExpired) {
    message = `${expirationMessage}. Please regenerate your API key.`;
  } else if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
    message = `${expirationMessage}. Consider regenerating your API key soon.`;
  } else if (!apiKey.isActive) {
    message = 'API key is inactive. Please regenerate your API key.';
  } else {
    message = expirationMessage || 'API key is active and valid.';
  }

  res.status(httpStatus.OK).send({
    hasApiKey: true,
    isExpired,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    daysUntilExpiry:
      daysUntilExpiry !== null ? Math.round(daysUntilExpiry) : null,
    approvalStatus,
    isActive: apiKey.isActive,
    needsApproval,
    needsRegeneration,
    environment: apiKey.environment,
    label: apiKey.label,
    message,
  });
});

const sendOnboardingPhoneOtp = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (!(user.isOwner || user.isSuper || user.isSaby)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only tenant owner accounts can request onboarding phone OTP.'
    );
  }

  const rawPhone = String(req.body?.phoneNumber || '').trim();
  if (!rawPhone) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number is required.');
  }

  const normalizedPhone = smsService.formatPhoneNumber(rawPhone);
  if (!/^\d{10,15}$/.test(normalizedPhone)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid phone number format.');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = moment().add(ONBOARDING_PHONE_OTP_TTL_MINUTES, 'minutes').toDate();

  const otpState = {
    provider: 'termii',
    phoneNumber: normalizedPhone,
    otpHash: hashOnboardingPhoneOtp({
      userId: user._id,
      phoneNumber: normalizedPhone,
      otp,
    }),
    expiresAt: expiresAt.toISOString(),
    attempts: 0,
    maxAttempts: ONBOARDING_PHONE_OTP_MAX_ATTEMPTS,
    verified: false,
    sentAt: new Date().toISOString(),
    verifiedAt: null,
  };
  setOnboardingPhoneOtpState(user, otpState);
  await user.save();

  let smsDelivery = {
    sent: false,
    pending: false,
    response: null,
    error: smsService.hasSmsConfig
      ? null
      : 'SMS provider is not configured. Set SMS_BASE_URL and SMS_API_KEY.',
  };
  let emailDelivery = {
    sent: false,
    pending: Boolean(user.email),
    error: user.email ? null : 'Owner account has no email address.',
  };

  const emailPromise = user.email
    ? (async () => {
        try {
          await withTimeout(
            emailService.sendOtpEmail(user.email, otp),
            ONBOARDING_CHANNEL_TIMEOUT_MS,
            'Email delivery timed out'
          );
          emailDelivery = {
            sent: true,
            pending: false,
            error: null,
          };
        } catch (error) {
          emailDelivery = {
            sent: false,
            pending: false,
            error: error?.message || 'Email send failed',
          };
        }
        return emailDelivery;
      })()
    : Promise.resolve(emailDelivery);

  if (smsService.hasSmsConfig) {
    try {
      const response = await withTimeout(
        smsService.sendOtpSms({
          phoneNumber: normalizedPhone,
          otp,
        }),
        ONBOARDING_CHANNEL_TIMEOUT_MS,
        'SMS delivery timed out'
      );
      smsDelivery = {
        sent: true,
        pending: false,
        response,
        error: null,
      };
    } catch (error) {
      smsDelivery = {
        sent: false,
        pending: false,
        response: null,
        error: error?.response?.data || error?.message || 'SMS send failed',
      };
    }
  }

  if (smsDelivery.sent) {
    void emailPromise.then((finalEmail) => {
      if (finalEmail?.sent) {
        logger.info('[Auth] onboarding_phone_otp_email_fallback_sent', {
          userId: String(user._id),
          tenantId: user.tenantId,
          email: user.email,
        });
      } else if (finalEmail && finalEmail.error) {
        logger.warn('[Auth] onboarding_phone_otp_email_fallback_failed', {
          userId: String(user._id),
          tenantId: user.tenantId,
          email: user.email,
          error: finalEmail.error,
        });
      }
    });

    return res.status(httpStatus.OK).send({
      success: true,
      message: emailDelivery.pending
        ? 'OTP sent via SMS. Email fallback is being processed.'
        : emailDelivery.sent
          ? 'OTP sent via SMS and email.'
          : 'OTP sent via SMS. Email fallback failed.',
      data: {
        provider: 'termii',
        providerConfigured: smsService.hasSmsConfig,
        destination: maskPhoneForDisplay(normalizedPhone),
        email: user.email ? maskEmailForDisplay(user.email) : null,
        expiresInMinutes: ONBOARDING_PHONE_OTP_TTL_MINUTES,
        ...(shouldExposeOnboardingDebugOtp ? { debugOtp: otp } : {}),
        channels: {
          sms: {
            sent: smsDelivery.sent,
            pending: false,
            error: smsDelivery.error,
            providerResponse: smsDelivery.response,
          },
          email: {
            sent: emailDelivery.sent,
            pending: emailDelivery.pending,
            error: emailDelivery.error,
          },
        },
      },
    });
  }

  const finalEmailDelivery = await emailPromise;

  if (!smsDelivery.sent && !finalEmailDelivery.sent) {
    logger.error('[Auth] onboarding_phone_otp_all_delivery_failed', {
      userId: String(user._id),
      tenantId: user.tenantId,
      phoneNumber: normalizedPhone,
      email: user.email,
      smsError: smsDelivery.error,
      emailError: finalEmailDelivery.error,
    });
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Failed to send OTP via SMS and email channels. Please retry shortly.'
    );
  }

  res.status(httpStatus.OK).send({
    success: true,
    message:
      smsDelivery.sent && finalEmailDelivery.sent
        ? 'OTP sent via SMS and email.'
        : smsDelivery.sent
          ? 'OTP sent via SMS. Email fallback failed.'
          : 'OTP sent via email. SMS delivery failed.',
    data: {
      provider: 'termii',
      providerConfigured: smsService.hasSmsConfig,
      destination: maskPhoneForDisplay(normalizedPhone),
      email: user.email ? maskEmailForDisplay(user.email) : null,
      expiresInMinutes: ONBOARDING_PHONE_OTP_TTL_MINUTES,
      ...(shouldExposeOnboardingDebugOtp ? { debugOtp: otp } : {}),
      channels: {
        sms: {
          sent: smsDelivery.sent,
          pending: false,
          error: smsDelivery.error,
          providerResponse: smsDelivery.response,
        },
        email: {
          sent: finalEmailDelivery.sent,
          pending: false,
          error: finalEmailDelivery.error,
        },
      },
    },
  });
});

const verifyOnboardingPhoneOtp = catchAsync(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (!(user.isOwner || user.isSuper || user.isSaby)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only tenant owner accounts can verify onboarding phone OTP.'
    );
  }

  const rawPhone = String(req.body?.phoneNumber || '').trim();
  const rawOtp = String(req.body?.otp || '')
    .replace(/\D/g, '')
    .slice(0, 6);
  if (!rawPhone || rawOtp.length !== 6) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number and 6-digit OTP are required.');
  }

  const normalizedPhone = smsService.formatPhoneNumber(rawPhone);
  const otpState = getOnboardingPhoneOtpState(user);
  if (!otpState) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No OTP request found. Request a new code.');
  }

  if (otpState.phoneNumber !== normalizedPhone) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Phone number does not match the last OTP request.'
    );
  }

  if (otpState.verified) {
    return res.status(httpStatus.OK).send({
      success: true,
      message: 'Phone number already verified.',
      data: {
        destination: maskPhoneForDisplay(normalizedPhone),
      },
    });
  }

  const now = Date.now();
  const expiresAtMs = new Date(otpState.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || now > expiresAtMs) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'OTP has expired. Request a new code to continue.'
    );
  }

  const maxAttempts = Number(otpState.maxAttempts || ONBOARDING_PHONE_OTP_MAX_ATTEMPTS);
  const attempts = Number(otpState.attempts || 0);
  if (attempts >= maxAttempts) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'Too many invalid attempts. Request a new OTP code.'
    );
  }

  const expectedHash = hashOnboardingPhoneOtp({
    userId: user._id,
    phoneNumber: normalizedPhone,
    otp: rawOtp,
  });
  if (expectedHash !== otpState.otpHash) {
    setOnboardingPhoneOtpState(user, {
      ...otpState,
      attempts: attempts + 1,
    });
    await user.save();
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid OTP code.');
  }

  setOnboardingPhoneOtpState(user, {
    ...otpState,
    attempts,
    verified: true,
    verifiedAt: new Date().toISOString(),
  });
  user.phoneNumber = normalizedPhone;
  user.isPhoneVerified = true;
  await user.save();

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Phone verification successful.',
    data: {
      destination: maskPhoneForDisplay(normalizedPhone),
      verifiedAt: new Date().toISOString(),
    },
  });
});

const getOnboardingProfile = catchAsync(async (req, res) => {
  const result = await tenantOnboardingService.getOnboardingStatus({
    userId: req.user.id,
  });
  res.status(httpStatus.OK).send(result);
});

const upsertOnboardingProfile = catchAsync(async (req, res) => {
  const result = await tenantOnboardingService.completeOnboarding({
    userId: req.user.id,
    payload: req.body,
  });
  res.status(httpStatus.OK).send(result);
});

const upsertOnboardingDraft = catchAsync(async (req, res) => {
  const result = await tenantOnboardingService.saveOnboardingDraft({
    userId: req.user.id,
    payload: req.body,
  });
  res.status(httpStatus.OK).send(result);
});

const updateOnboardingReceivingAccounts = catchAsync(async (req, res) => {
  const result = await tenantOnboardingService.updateReceivingAccountsOnly({
    userId: req.user.id,
    receivingAccounts: req.body.receivingAccounts,
  });
  res.status(httpStatus.OK).send(result);
});

module.exports = {
  register,
  login,
  requestPhoneLoginOtp,
  verifyPhoneLoginOtp,
  socialLogin,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  verifyOtp,
  resendOtp,
  changePassword,
  verifyPassword,
  changePasswordAuthenticated,
  getSecurityOverview,
  getSessions,
  logoutAllSessions,
  setupAuthenticatorMfa,
  verifyAuthenticatorMfa,
  toggleAuthenticatorMfa,
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAssertionOptions,
  verifyPasskeyAssertion,
  verifyAuthenticatorLoginMfa,
  requestEmailChangeOtp,
  requestPhoneChangeOtp,
  sendOnboardingPhoneOtp,
  verifyOnboardingPhoneOtp,
  checkApiKeyStatus,
  getOnboardingProfile,
  upsertOnboardingProfile,
  upsertOnboardingDraft,
  updateOnboardingReceivingAccounts,
};
