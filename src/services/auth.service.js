const moment = require('moment');
const httpStatus = require('http-status');
const tokenService = require('./token.service');
const userService = require('./user.service');
const Token = require('../models/token.model');
const ApiError = require('../utils/ApiError');
const { tokenTypes } = require('../config/tokens');
const { sendOtpEmail } = require('./email.service');
const { User } = require('../models');
const logger = require('../config/logger');

const loginUserWithEmailAndPassword = async (
  email,
  password,
  channel = 'web'
) => {
  const user = await User.findOne({ email });
  if (!user || !(await user.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect email or password');
  }
  if (!user.otpVerified) {
    const error = new ApiError(
      httpStatus.UNAUTHORIZED,
      'Please verify your account using the OTP sent to your email'
    );
    error.name = 'OtpNotVerified';
    throw error;
  }

  // Channel-aware access control
  if (channel === 'web' && user.isOrdinaryUser && user.isOrdinaryUser()) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Access denied. This account cannot access the web portal. Please use the designated access channel.'
    );
  }

  return user;
};

const logout = async (refreshToken) => {
  const refreshTokenDoc = await Token.findOne({
    token: refreshToken,
    type: tokenTypes.REFRESH,
    blacklisted: false,
  });
  if (!refreshTokenDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  }
  await refreshTokenDoc.remove();
};

/**
 * Refresh authentication tokens using refresh token
 * Example:
 * const tokens = await refreshAuth('myRefreshToken123')
 * // Returns { access: newAccessToken, refresh: newRefreshToken }
 * // Throws error if refresh token is invalid
 */

const refreshAuth = async (refreshToken) => {
  try {
    const refreshTokenDoc = await tokenService.verifyToken(
      refreshToken,
      tokenTypes.REFRESH
    );
    const user = await userService.getUserById(refreshTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await refreshTokenDoc.remove();
    return tokenService.generateAuthTokens(user);
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate');
  }
};

/**
 * Reset user's password using reset token
 * Example:
 * await resetPassword('resetToken123', 'newPassword123')
 * // Updates user's password and removes all reset tokens
 * // Throws error if reset token is invalid
 */

const resetPassword = async (resetPasswordToken, newPassword) => {
  try {
    console.log('Verifying reset password token...');
    const resetPasswordTokenDoc = await tokenService.verifyToken(
      resetPasswordToken,
      tokenTypes.RESET_PASSWORD
    );

    const userId = resetPasswordTokenDoc.user;
    console.log(`Resetting password for user ID: ${userId}`);
    // Call the static method on the User model
    await User.resetPassword(userId, newPassword);

    console.log('Deleting reset password tokens for the user...');
    await Token.deleteMany({ user: userId, type: tokenTypes.RESET_PASSWORD });

    console.log('Password reset successfully.');
  } catch (error) {
    console.error('Error during password reset:', error);
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Password reset failed');
  }
};

/**
 * Verify user's email using verification token
 * Example:
 * await verifyEmail('verifyEmailToken123')
 * // Marks user's email as verified and removes verification tokens
 * // Throws error if verification token is invalid
 */
const verifyEmail = async (verifyEmailToken) => {
  try {
    const verifyEmailTokenDoc = await tokenService.verifyToken(
      verifyEmailToken,
      tokenTypes.VERIFY_EMAIL
    );
    const user = await userService.getUserById(verifyEmailTokenDoc.user);
    if (!user) {
      throw new Error();
    }
    await Token.deleteMany({ user: user.id, type: tokenTypes.VERIFY_EMAIL });
    await userService.updateUserById(user.id, { isEmailVerified: true });
  } catch (error) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Email verification failed');
  }
};

/**
 * Generate a 6-digit OTP
 * @returns {string}
 */
const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

/**
 * Send OTP to user via email and update user model
 * @param {Object} user - The user instance
 * @returns {Promise<void>}
 */

const sendUserOtp = async (user) => {
  const otp = generateOtp();
  console.log('🔐 OTP for user', user.email, ':', otp);
  const update = {
    otp,
    otpExpires: moment().add(10, 'minutes').toDate(),
    otpVerified: false,
  };

  await User.updateOne({ _id: user._id }, update); // No validation issues

  // Skip email sending in development/staging mode or if SMTP is not configured
  const isProduction = process.env.NODE_ENV === 'production';
  const smtpConfigured =
    process.env.SMTP_HOST && process.env.SMTP_USERNAME;

  if (!isProduction || !smtpConfigured) {
    console.log(
      `📧 Email sending skipped (env: ${process.env.NODE_ENV}, smtp configured: ${!!smtpConfigured}). OTP logged above.`
    );
  } else {
    // Production mode with SMTP configured
    try {
      await sendOtpEmail(user.email, otp);
      console.log(`📧 OTP email sent successfully to ${user.email}`);
    } catch (error) {
      console.error('⚠️ Failed to send OTP email:', error.message);
      console.log('📧 OTP email failed, but OTP is still valid:', otp);
      // Don't throw - user can still use the OTP from logs
    }
  }

  return { email: user.email, otp };
};

/**
 * Verify user's OTP
 * @param {string} email - The user’s email
 * @param {string} otp - The OTP to verify
 * @returns {Promise<void>}
 */

const verifyOtp = async (email, otp) => {
  const user = await userService.getUserByEmail(email);
  if (!user) {
    return { success: false, user: null };
  }

  const isOtpExpired = moment().isAfter(user.otpExpires);
  const isOtpInvalid = user.otp !== otp;

  if (isOtpInvalid || isOtpExpired) {
    console.log('OTP is either invalid or expired');
    return { success: false, user };
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otpVerified: true,
        otp: null,
        otpExpires: null,
        status: true,
      },
    }
  );
  return { success: true, user };
};

module.exports = {
  loginUserWithEmailAndPassword,
  logout,
  refreshAuth,
  resetPassword,
  verifyEmail,
  verifyOtp,
  sendUserOtp,
};
