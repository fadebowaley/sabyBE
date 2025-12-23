const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const moment = require('moment');
const {
  authService,
  userService,
  tokenService,
  emailService,
  apiKeyService,
} = require('../services');
const { Role, User } = require('../models');
const logger = require('../config/logger');

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
    const tokens = await tokenService.generateAuthTokens(user);

    // Populate role permissions for isAdmin and Regular users
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

      if (user.isAdmin) {
        logger.info(
          `[AuthController.login] isAdmin user permissions from roles: ${JSON.stringify(
            permissions
          )} (${permissions.length} permissions)`
        );
        if (permissions.length === 0) {
          logger.warn(
            `[AuthController.login] WARNING: isAdmin user has NO permissions! User roles: ${JSON.stringify(
              user.roles
            )}`
          );
        }
      }
    }

    // Send comprehensive user data for frontend
    const userResponse = {
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
      status: user.status,
      createdAt: user.createdAt,
      roles: user.roles,
      permissions: permissions.length > 0 ? permissions : undefined, // Only include if populated
    };

    res.send({ user: userResponse, tokens });
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
  const smsService = require('../services/sms.service');
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

module.exports = {
  register,
  login,
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
  requestEmailChangeOtp,
  requestPhoneChangeOtp,
  checkApiKeyStatus,
};
