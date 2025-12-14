const express = require('express');
const validate = require('../../middlewares/validate');
const apiKeyValidation = require('../../validations/apiKey.validation');
const apiKeyController = require('../../controllers/apiKey.controller');
const requireAccess = require('../../middlewares/requireAccess');

const router = express.Router();

// Get all API keys for tenant
router.get(
  '/',
  requireAccess({ permissions: ['get:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.getApiKeys),
  apiKeyController.getApiKeys
);

/**
 * @swagger
 * /api-keys:
 *   get:
 *     summary: Get all API keys for tenant
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of API keys
 *       - in: query
 *         name: environment
 *         schema:
 *           type: string
 *           enum: [production, staging]
 *         description: Filter by environment
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *         description: Filter by scope
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiKey'
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 totalResults:
 *                   type: integer
 *                   example: 1
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

// Create new API key
router.post(
  '/',
  requireAccess({ permissions: ['create:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.createApiKey),
  apiKeyController.createApiKey
);

/**
 * @swagger
 * /api-keys:
 *   post:
 *     summary: Create a new API key
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - label
 *               - environment
 *               - scope
 *             properties:
 *               label:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "Production API Key"
 *               environment:
 *                 type: string
 *                 enum: [production, development, staging]
 *                 example: "production"
 *               scope:
 *                 type: string
 *                 example: "api"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["read", "write"]
 *               rateLimit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10000
 *                 example: 1000
 *               expires:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-12-31T23:59:59Z"
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKey:
 *                   $ref: '#/components/schemas/ApiKey'
 *                 rawKey:
 *                   type: string
 *                   example: "sk_live_51H7K2eGqQX8vN9mK3jL4pQ2..."
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */

// Get API key by ID
router.get(
  '/:keyId',
  requireAccess({ permissions: ['get:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.getApiKey),
  apiKeyController.getApiKey
);

/**
 * @swagger
 * /api-keys/{keyId}:
 *   get:
 *     summary: Get an API key by ID
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

// Update API key
router.patch(
  '/:keyId',
  requireAccess({ permissions: ['update:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.updateApiKey),
  apiKeyController.updateApiKey
);

/**
 * @swagger
 * /api-keys/{keyId}:
 *   patch:
 *     summary: Update an API key
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               isActive:
 *                 type: boolean
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *               rateLimit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10000
 *               expires:
 *                 type: string
 *                 format: date-time
 *             example:
 *               label: "Updated API Key"
 *               isActive: true
 *               permissions: ["read", "write"]
 *               rateLimit: 2000
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiKey'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

// Delete API key
router.delete(
  '/:keyId',
  requireAccess({ permissions: ['delete:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.deleteApiKey),
  apiKeyController.deleteApiKey
);

/**
 * @swagger
 * /api-keys/{keyId}:
 *   delete:
 *     summary: Delete an API key
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       "204":
 *         description: No content
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

// Get API key usage analytics
router.get(
  '/:keyId/analytics',
  requireAccess({ permissions: ['analytics:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.getApiKeyAnalytics),
  apiKeyController.getApiKeyAnalytics
);

/**
 * @swagger
 * /api-keys/{keyId}/analytics:
 *   get:
 *     summary: Get API key usage analytics
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for analytics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for analytics
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *         description: Analytics granularity
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalRequests:
 *                   type: integer
 *                   example: 15420
 *                 successfulRequests:
 *                   type: integer
 *                   example: 15200
 *                 failedRequests:
 *                   type: integer
 *                   example: 220
 *                 averageResponseTime:
 *                   type: number
 *                   example: 145.5
 *                 requestsOverTime:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       count:
 *                         type: integer
 *                 topEndpoints:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       endpoint:
 *                         type: string
 *                       count:
 *                         type: integer
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

// Regenerate API key
router.post(
  '/:keyId/regenerate',
  requireAccess({ permissions: ['regenerate:apikeys'], jwtOnly: true }),
  validate(apiKeyValidation.regenerateApiKey),
  apiKeyController.regenerateApiKey
);

/**
 * @swagger
 * /api-keys/{keyId}/regenerate:
 *   post:
 *     summary: Regenerate an API key
 *     description: |
 *       **Note:** This endpoint requires JWT (user) authentication. API key authentication is not allowed.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKey:
 *                   $ref: '#/components/schemas/ApiKey'
 *                 rawKey:
 *                   type: string
 *                   example: "sk_live_51H7K2eGqQX8vN9mK3jL4pQ2..."
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

module.exports = router;
