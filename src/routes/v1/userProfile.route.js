const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const userProfileValidation = require('../../validations/userProfile.validation');
const userProfileController = require('../../controllers/userProfile.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: UserProfile
 *   description: User profile management
 */

// Get user profile by userId
router.get(
  '/:userId',
  auth('read:user-profile'),
  validate(userProfileValidation.getUserProfile),
  userProfileController.getUserProfile
);

/**
 * @swagger
 * /user-profiles/{userId}:
 *   get:
 *     summary: Get user profile by userId
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       "200":
 *         description: OK
 *       "404":
 *         description: Not Found
 */

// Create or update user profile
router.put(
  '/:userId',
  auth('update:user-profile'),
  validate(userProfileValidation.upsertUserProfile),
  userProfileController.upsertUserProfile
);

/**
 * @swagger
 * /user-profiles/{userId}:
 *   put:
 *     summary: Create or update user profile
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       "200":
 *         description: OK
 *       "400":
 *         description: Bad Request
 */

// Delete user profile
router.delete(
  '/:userId',
  auth('delete:user-profile'),
  validate(userProfileValidation.deleteUserProfile),
  userProfileController.deleteUserProfile
);

/**
 * @swagger
 * /user-profiles/{userId}:
 *   delete:
 *     summary: Delete user profile
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       "204":
 *         description: No Content
 *       "404":
 *         description: Not Found
 */

module.exports = router;
