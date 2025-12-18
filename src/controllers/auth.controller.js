const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
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

  // Check if API key was successfully validated by middleware
  // req.apiKey is set by apiKeyAuth.optional() middleware if validation succeeded
  const hasApiKey = !!req.apiKey;

  try {
    // Pass API key context to login service for channel restrictions
    const user = await authService.loginUserWithEmailAndPassword(
      email,
      password,
      'web',
      { hasApiKey }
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
    // Auto-generate web API keys for new user
    try {
      if (user.tenantId && user._id) {
        const keys = await apiKeyService.autoGenerateWebApiKeys(
          user.tenantId,
          user._id
        );
        logger.info(`Auto-generated web API keys for user: ${user.email}`, {
          staging: keys.staging.keyDoc._id,
          production: keys.production.keyDoc._id,
        });
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
 */
const resendOtp = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await userService.getUserByEmail(email);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (user.otpVerified) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User is already verified');
  }
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
};
