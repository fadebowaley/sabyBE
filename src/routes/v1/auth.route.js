// Import required dependencies
const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');
const auth = require('../../middlewares/auth');
const { loginLimiter } = require('../../middlewares/rateLimiter');

// Create Express router instance
const router = express.Router();

// Register a new user
router.post(
  '/register',
  validate(authValidation.register),
  authController.register
);

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstname
 *               - lastname
 *               - email
 *               - password
 *               - isOwner
 *             properties:
 *               firstname:
 *                 type: string
 *                 example: John
 *               lastname:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Password123
 *               isOwner:
 *                 type: boolean
 *                 example: true
 *               isAgreed:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       "201":
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   $ref: '#/components/schemas/AuthTokens'
 *       "400":
 *         $ref: '#/components/responses/DuplicateEmail'
 */

// Login user
// All registered users can login without API key requirement
router.post(
  '/login',
  loginLimiter, // User-based rate limiter (email-based)
  validate(authValidation.login),
  authController.login
);

router.post(
  '/phone-login/request-otp',
  loginLimiter,
  validate(authValidation.phoneLoginRequestOtp),
  authController.requestPhoneLoginOtp
);

router.post(
  '/phone-login/verify-otp',
  loginLimiter,
  validate(authValidation.phoneLoginVerifyOtp),
  authController.verifyPhoneLoginOtp
);

router.post(
  '/social-login',
  validate(authValidation.socialLogin),
  authController.socialLogin
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password123
 *     responses:
 *       "200":
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 tokens:
 *                   $ref: '#/components/schemas/AuthTokens'
 *       "401":
 *         description: Invalid email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               code: 401
 *               message: Invalid email or password
 */

// Logout user
router.post('/logout', validate(authValidation.logout), authController.logout);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       "204":
 *         description: Logout successful
 *       "401":
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Refresh access tokens
router.post(
  '/refresh-tokens',
  validate(authValidation.refreshTokens),
  authController.refreshTokens
);

/**
 * @swagger
 * /auth/refresh-tokens:
 *   post:
 *     summary: Refresh access tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       "200":
 *         description: New tokens generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       "401":
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Request password reset
router.post(
  '/forgot-password',
  validate(authValidation.forgotPassword),
  authController.forgotPassword
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *     responses:
 *       "204":
 *         description: Password reset email sent successfully
 *       "404":
 *         description: Email not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Reset password
router.post(
  '/reset-password',
  validate(authValidation.resetPassword),
  authController.resetPassword
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token
 *         example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewPassword123
 *     responses:
 *       "204":
 *         description: Password reset successful
 *       "400":
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Send verification email
router.post(
  '/send-verification-email',
  auth(),
  authController.sendVerificationEmail
);

/**
 * @swagger
 * /auth/send-verification-email:
 *   post:
 *     summary: Send email verification
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "204":
 *         description: Verification email sent successfully
 *       "401":
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Verify email
router.post(
  '/verify-email',
  validate(authValidation.verifyEmail),
  authController.verifyEmail
);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verify email
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token
 *         example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       "204":
 *         description: Email verified successfully
 *       "400":
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Verify OTP for user
router.post(
  '/verify-otp',
  validate(authValidation.verifyOtp),
  authController.verifyOtp
);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify OTP for user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       "204":
 *         description: OTP verified successfully
 *       "400":
 *         description: Invalid OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Resend OTP for user
router.post(
  '/resend-otp',
  validate(authValidation.resendOtp),
  authController.resendOtp
);

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Resend OTP for user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *     responses:
 *       "204":
 *         description: OTP resent successfully
 *       "400":
 *         description: Email not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Change password for unverified users (requires OTP)
router.post(
  '/change-password',
  validate(authValidation.changePassword),
  authController.changePassword
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change password for unverified user (requires OTP)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPassword
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewPassword123
 *               otp:
 *                 type: string
 *                 length: 6
 *                 example: "123456"
 *     responses:
 *       "200":
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password updated successfully. You can now login.
 *       "400":
 *         description: Invalid or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Verify password for authenticated users
router.post(
  '/verify-password',
  auth(),
  validate(authValidation.verifyPassword),
  authController.verifyPassword
);

/**
 * @swagger
 * /auth/verify-password:
 *   post:
 *     summary: Verify current password for authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 example: currentPassword123
 *     responses:
 *       "200":
 *         description: Password verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password verified successfully
 *       "401":
 *         description: Invalid password or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Change password for authenticated users
router.post(
  '/change-password-authenticated',
  auth(),
  validate(authValidation.changePasswordAuthenticated),
  authController.changePasswordAuthenticated
);

/**
 * @swagger
 * /auth/change-password-authenticated:
 *   post:
 *     summary: Change password for authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: oldPassword123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: newSecurePassword456
 *     responses:
 *       "200":
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password changed successfully
 *       "400":
 *         description: Invalid request (same password, weak password, etc.)
 *       "401":
 *         description: Invalid current password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Request OTP for email change
router.post(
  '/request-email-change-otp',
  auth(),
  validate(authValidation.requestEmailChangeOtp),
  authController.requestEmailChangeOtp
);

/**
 * @swagger
 * /auth/request-email-change-otp:
 *   post:
 *     summary: Request OTP for email change
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentValue
 *             properties:
 *               currentValue:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *     responses:
 *       "200":
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP sent to your email address
 *       "400":
 *         description: Invalid email or email mismatch
 *       "429":
 *         description: Too many requests (rate limited)
 */

// Request OTP for phone change
router.post(
  '/request-phone-change-otp',
  auth(),
  validate(authValidation.requestPhoneChangeOtp),
  authController.requestPhoneChangeOtp
);

router.post(
  '/onboarding/phone-otp/send',
  auth(),
  validate(authValidation.onboardingPhoneOtpSend),
  authController.sendOnboardingPhoneOtp
);

router.post(
  '/onboarding/phone-otp/verify',
  auth(),
  validate(authValidation.onboardingPhoneOtpVerify),
  authController.verifyOnboardingPhoneOtp
);

/**
 * @swagger
 * /auth/request-phone-change-otp:
 *   post:
 *     summary: Request OTP for phone change
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentValue
 *             properties:
 *               currentValue:
 *                 type: string
 *                 example: "+1234567890"
 *     responses:
 *       "200":
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: OTP sent to your phone number
 *       "400":
 *         description: Invalid phone or phone mismatch
 *       "429":
 *         description: Too many requests (rate limited)
 */

// Check API key expiration status (notification only)
router.get(
  '/check-api-key-status',
  auth(),
  authController.checkApiKeyStatus
);

router.get('/onboarding/profile', auth(), authController.getOnboardingProfile);

router.post(
  '/onboarding/profile',
  auth(),
  validate(authValidation.onboardingProfileUpsert),
  authController.upsertOnboardingProfile
);

router.patch(
  '/onboarding/profile/draft',
  auth(),
  validate(authValidation.onboardingDraftUpsert),
  authController.upsertOnboardingDraft
);

/**
 * @swagger
 * /auth/check-api-key-status:
 *   get:
 *     summary: Check API key expiration status
 *     description: Returns API key expiration status (notification only, does not affect authentication)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: API key status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasApiKey:
 *                   type: boolean
 *                   example: true
 *                 isExpired:
 *                   type: boolean
 *                   nullable: true
 *                   example: false
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   example: "2024-12-31T23:59:59Z"
 *                 daysUntilExpiry:
 *                   type: number
 *                   nullable: true
 *                   example: 30
 *                 message:
 *                   type: string
 *                   example: "API key expires in 30 days"
 *       "401":
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

module.exports = router;
