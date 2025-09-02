const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const userFormSettingsValidation = require('../../validations/userFormSettings.validation');
const userFormSettingsController = require('../../controllers/userFormSettings.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: UserFormSettings
 *   description: User form settings management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserFormSettings:
 *       type: object
 *       required:
 *         - user
 *         - defaultFormSettings
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated ID of the form settings
 *         user:
 *           type: string
 *           description: The user ID reference
 *         tenantId:
 *           type: string
 *           description: The tenant ID
 *         defaultFormSettings:
 *           type: object
 *           properties:
 *             selectedStyle:
 *               type: string
 *               default: default
 *             wizardMode:
 *               type: boolean
 *               default: false
 *             columnSpans:
 *               type: object
 *               default: {}
 *             elements:
 *               type: array
 *               default: []
 *             theme:
 *               type: object
 *               properties:
 *                 primaryColor:
 *                   type: string
 *                 backgroundColor:
 *                   type: string
 *                 fontFamily:
 *                   type: string
 *                 fontSize:
 *                   type: string
 *             formLayout:
 *               type: object
 *               properties:
 *                 spacing:
 *                   type: string
 *                   enum: [compact, normal, comfortable]
 *                   default: normal
 *                 labelPosition:
 *                   type: string
 *                   enum: [top, left, floating]
 *                   default: top
 *                 buttonAlignment:
 *                   type: string
 *                   enum: [left, center, right]
 *                   default: left
 *             validation:
 *               type: object
 *               properties:
 *                 showRequiredAsterisk:
 *                   type: boolean
 *                   default: true
 *                 validateOnSubmit:
 *                   type: boolean
 *                   default: true
 *                 validateOnBlur:
 *                   type: boolean
 *                   default: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// Create new user form settings
router.post(
  '/',
  auth('create:user-form-settings'),
  validate(userFormSettingsValidation.createUserFormSettings),
  userFormSettingsController.createUserFormSettings
);

/**
 * @swagger
 * /user-form-settings:
 *   post:
 *     summary: Create user form settings
 *     tags: [UserFormSettings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserFormSettings'
 *     responses:
 *       "201":
 *         description: Created
 *       "400":
 *         description: Bad Request
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 */

// Get all user form settings
router.get(
  '/',
  auth('view:user-form-settings'),
  validate(userFormSettingsValidation.getUserFormSettings),
  userFormSettingsController.getUserFormSettings
);

/**
 * @swagger
 * /user-form-settings:
 *   get:
 *     summary: Get all user form settings
 *     tags: [UserFormSettings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *         description: User ID to filter by
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Tenant ID to filter by
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Sort field
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum number of results
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 */

// Get user form settings by settings ID
router.get(
  '/:settingsId',
  auth('view:user-form-settings'),
  validate(userFormSettingsValidation.getUserFormSettingsById),
  userFormSettingsController.getUserFormSettingsById
);

/**
 * @swagger
 * /user-form-settings/{settingsId}:
 *   get:
 *     summary: Get user form settings by ID
 *     tags: [UserFormSettings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: settingsId
 *         required: true
 *         schema:
 *           type: string
 *         description: Settings ID
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Not Found
 */

// Get user form settings by user ID
router.get(
  '/user/:userId',
  auth('view:user-form-settings::userId'),
  validate(userFormSettingsValidation.getUserFormSettingsByUserId),
  userFormSettingsController.getUserFormSettingsByUserId
);

/**
 * @swagger
 * /user-form-settings/user/{userId}:
 *   get:
 *     summary: Get user form settings by user ID
 *     tags: [UserFormSettings]
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
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Not Found
 */

// Update user form settings by settings ID
router.patch(
  '/:settingsId',
  auth('update:user-form-settings'),
  validate(userFormSettingsValidation.updateUserFormSettings),
  userFormSettingsController.updateUserFormSettings
);

/**
 * @swagger
 * /user-form-settings/{settingsId}:
 *   patch:
 *     summary: Update user form settings
 *     tags: [UserFormSettings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: settingsId
 *         required: true
 *         schema:
 *           type: string
 *         description: Settings ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               defaultFormSettings:
 *                 type: object
 *               tenantId:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *       "400":
 *         description: Bad Request
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Not Found
 */

// Update user form settings by user ID
router.patch(
  '/user/:userId',
  auth('update:user-form-settings::userId'),
  validate(userFormSettingsValidation.updateUserFormSettingsByUserId),
  userFormSettingsController.updateUserFormSettingsByUserId
);

/**
 * @swagger
 * /user-form-settings/user/{userId}:
 *   patch:
 *     summary: Update user form settings by user ID
 *     tags: [UserFormSettings]
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
 *             properties:
 *               defaultFormSettings:
 *                 type: object
 *               tenantId:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *       "400":
 *         description: Bad Request
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Not Found
 */

// Upsert user form settings by user ID
router.put(
  '/user/:userId',
  auth('update:user-form-settings::userId'),
  validate(userFormSettingsValidation.upsertUserFormSettings),
  userFormSettingsController.upsertUserFormSettings
);

/**
 * @swagger
 * /user-form-settings/user/{userId}:
 *   put:
 *     summary: Create or update user form settings by user ID
 *     tags: [UserFormSettings]
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
 *             required:
 *               - defaultFormSettings
 *             properties:
 *               defaultFormSettings:
 *                 type: object
 *               tenantId:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *       "400":
 *         description: Bad Request
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 */

// Delete user form settings by settings ID
router.delete(
  '/:settingsId',
  auth('delete:user-form-settings'),
  validate(userFormSettingsValidation.deleteUserFormSettings),
  userFormSettingsController.deleteUserFormSettings
);

/**
 * @swagger
 * /user-form-settings/{settingsId}:
 *   delete:
 *     summary: Delete user form settings
 *     tags: [UserFormSettings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: settingsId
 *         required: true
 *         schema:
 *           type: string
 *         description: Settings ID
 *     responses:
 *       "204":
 *         description: No Content
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Not Found
 */

// Delete user form settings by user ID
router.delete(
  '/user/:userId',
  auth('delete:user-form-settings::userId'),
  validate(userFormSettingsValidation.deleteUserFormSettingsByUserId),
  userFormSettingsController.deleteUserFormSettingsByUserId
);

/**
 * @swagger
 * /user-form-settings/user/{userId}:
 *   delete:
 *     summary: Delete user form settings by user ID
 *     tags: [UserFormSettings]
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
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 *       "404":
 *         description: Not Found
 */

module.exports = router;
