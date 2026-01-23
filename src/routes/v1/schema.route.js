const express = require('express');
const auth = require('../../middlewares/auth');
const schemaController = require('../../controllers/schema.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Schema
 *   description: Schema information for User and Node entities
 */

/**
 * @swagger
 * /schema/user:
 *   get:
 *     summary: Get User schema with all available fields
 *     description: Returns complete schema information for User entity including standard fields and tenant-specific custom fields
 *     tags: [Schema]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Tenant ID (optional if authenticated user has tenantId)
 *     responses:
 *       "200":
 *         description: OK
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
 *                       example: "user"
 *                     tenantId:
 *                       type: string
 *                     standardFields:
 *                       type: object
 *                     customFields:
 *                       type: array
 *                     version:
 *                       type: number
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       "400":
 *         description: Bad Request - Missing tenant ID
 *       "401":
 *         description: Unauthorized
 */
router.get('/user', auth('user:read'), schemaController.getUserSchema);

/**
 * @swagger
 * /schema/node:
 *   get:
 *     summary: Get Node schema with all available fields
 *     description: Returns complete schema information for Node entity including standard fields and tenant-specific custom fields
 *     tags: [Schema]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *         description: Tenant ID (optional if authenticated user has tenantId)
 *     responses:
 *       "200":
 *         description: OK
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
 *                       example: "node"
 *                     tenantId:
 *                       type: string
 *                     standardFields:
 *                       type: object
 *                     customFields:
 *                       type: array
 *                     version:
 *                       type: number
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       "400":
 *         description: Bad Request - Missing tenant ID
 *       "401":
 *         description: Unauthorized
 */
router.get('/node', auth('node:read'), schemaController.getNodeSchema);

module.exports = router;
