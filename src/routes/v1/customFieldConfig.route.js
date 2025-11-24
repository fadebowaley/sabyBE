const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const customFieldConfigController = require('../../controllers/customFieldConfig.controller');
const Joi = require('joi');

const router = express.Router();

// Validation schemas
const getAnalyticsConfig = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
};

const updateAnalyticsConfig = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
  body: Joi.object().keys({
    fields: Joi.array().items(
      Joi.object().keys({
        fieldName: Joi.string().required(),
        displayName: Joi.string().required(),
        type: Joi.string().valid(
          'number', 'currency', 'percentage', 
          'select', 'radio', 'text', 
          'date', 'datetime', 
          'checkbox', 'boolean',
          'multi-select'
        ).required(),
        analyticsEnabled: Joi.boolean().default(true),
        // Options: Allow array of any type (strings or objects) - will be normalized in controller
        options: Joi.array().items(Joi.any()).optional().allow(null).default([]),
        required: Joi.boolean().optional().allow(null), // Allow required field from frontend
        min: Joi.number().optional().allow(null),
        max: Joi.number().optional().allow(null),
        format: Joi.string().optional().allow(null),
        description: Joi.string().optional().allow(null),
      }).unknown(false) // Don't allow extra fields beyond what's defined
    ).required(),
  }),
};

const getSampleData = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
};

// Routes
router.get(
  '/:entityType',
  auth(),
  validate(getAnalyticsConfig),
  customFieldConfigController.getAnalyticsConfig
);

router.put(
  '/:entityType',
  auth(),
  validate(updateAnalyticsConfig),
  customFieldConfigController.updateAnalyticsConfig
);

router.get(
  '/:entityType/sample',
  auth(),
  validate(getSampleData),
  customFieldConfigController.getSampleData
);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Custom Field Analytics
 *   description: Configuration for custom field analytics in baseline intelligence
 */

/**
 * @swagger
 * /custom-field-config/{entityType}:
 *   get:
 *     summary: Get custom field analytics configuration
 *     description: Retrieve the configuration for custom fields that will be analyzed in baseline intelligence
 *     tags: [Custom Field Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, node]
 *         description: Entity type (user or node)
 *     responses:
 *       200:
 *         description: Custom field configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     entityType:
 *                       type: string
 *                     fields:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/CustomFieldConfig'
 *                     count:
 *                       type: number
 *   put:
 *     summary: Update custom field analytics configuration
 *     description: Update the configuration for custom fields that will be analyzed
 *     tags: [Custom Field Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, node]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fields:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/CustomFieldConfig'
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 */

/**
 * @swagger
 * /custom-field-config/{entityType}/sample:
 *   get:
 *     summary: Get sample custom field configurations
 *     description: Retrieve sample configurations for common custom fields
 *     tags: [Custom Field Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [user, node]
 *     responses:
 *       200:
 *         description: Sample configurations retrieved successfully
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CustomFieldConfig:
 *       type: object
 *       properties:
 *         fieldName:
 *           type: string
 *           description: Internal field name in customFields object
 *         displayName:
 *           type: string
 *           description: Human-readable field name
 *         type:
 *           type: string
 *           enum: [number, currency, percentage, select, radio, text, date, datetime, checkbox, boolean]
 *           description: Field data type
 *         analyticsEnabled:
 *           type: boolean
 *           description: Whether to include in analytics
 *         options:
 *           type: array
 *           items:
 *             type: string
 *           description: Options for select/radio fields
 *         min:
 *           type: number
 *           description: Minimum value for numeric fields
 *         max:
 *           type: number
 *           description: Maximum value for numeric fields
 *         description:
 *           type: string
 *           description: Field description
 */
