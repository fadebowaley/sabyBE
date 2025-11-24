const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const baselineIntelligenceValidation = require('../../validations/baselineIntelligence.validation');
const baselineIntelligenceController = require('../../controllers/baselineIntelligence.controller');

const router = express.Router();

// Health check endpoint
router.get('/health', auth(), baselineIntelligenceController.healthCheck);

// Statistics endpoint
router.get('/stats', auth(), baselineIntelligenceController.getBaselineStats);

// Summary endpoint (combined node and network data)
router.get(
  '/summary',
  auth(),
  validate(baselineIntelligenceValidation.getBaselineSummary),
  baselineIntelligenceController.getBaselineSummary
);

// Network-level endpoints
router.get('/network', auth(), baselineIntelligenceController.getNetworkBaseline);

router.get(
  '/network/insights',
  auth(),
  validate(baselineIntelligenceValidation.getNetworkInsights),
  baselineIntelligenceController.getNetworkInsights
);

router.post('/network/recompute', auth(), baselineIntelligenceController.recomputeNetworkBaseline);

// Node-level endpoints
router.get(
  '/node/:nodeId',
  auth(),
  validate(baselineIntelligenceValidation.getNodeBaseline),
  baselineIntelligenceController.getNodeBaseline
);

router.get(
  '/node/:nodeId/insights',
  auth(),
  validate(baselineIntelligenceValidation.getNodeInsights),
  baselineIntelligenceController.getNodeInsights
);

router.post(
  '/node/:nodeId/recompute',
  auth(),
  validate(baselineIntelligenceValidation.recomputeNodeBaseline),
  baselineIntelligenceController.recomputeNodeBaseline
);

// Bulk operations
router.post('/recompute/all', auth(), baselineIntelligenceController.recomputeAllBaselines);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Baseline Intelligence
 *   description: Structural analytics and insights for nodes and networks
 */

/**
 * @swagger
 * /baseline/health:
 *   get:
 *     summary: Health check for baseline intelligence system
 *     description: Check the health status of baseline intelligence components
 *     tags: [Baseline Intelligence]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System is healthy
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
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded, unhealthy]
 *                     checks:
 *                       type: object
 *                     details:
 *                       type: object
 *       206:
 *         description: System is degraded
 *       503:
 *         description: System is unhealthy
 */

/**
 * @swagger
 * /baseline/network:
 *   get:
 *     summary: Get network baseline intelligence
 *     description: Retrieve aggregated baseline metrics for the entire network
 *     tags: [Baseline Intelligence]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Network baseline retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BaselineIntelligence'
 *       404:
 *         description: Network baseline not found
 */

/**
 * @swagger
 * /baseline/node/{nodeId}:
 *   get:
 *     summary: Get node baseline intelligence
 *     description: Retrieve baseline metrics for a specific node
 *     tags: [Baseline Intelligence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nodeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Node ID
 *     responses:
 *       200:
 *         description: Node baseline retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BaselineIntelligence'
 *       404:
 *         description: Node baseline not found
 */

/**
 * @swagger
 * /baseline/node/{nodeId}/insights:
 *   get:
 *     summary: Get insights for a node
 *     description: Retrieve generated insights and recommendations for a specific node
 *     tags: [Baseline Intelligence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nodeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Node ID
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by insight priority
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [demographic, geographic, facility, operational, custom]
 *         description: Filter by insight type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of insights to return
 *     responses:
 *       200:
 *         description: Node insights retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Insight'
 *                 count:
 *                   type: integer
 */

/**
 * @swagger
 * /baseline/node/{nodeId}/recompute:
 *   post:
 *     summary: Recompute node baseline
 *     description: Manually trigger recomputation of baseline metrics for a specific node
 *     tags: [Baseline Intelligence]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nodeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Node ID
 *     responses:
 *       200:
 *         description: Node baseline recomputed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BaselineIntelligence'
 *                 computationTime:
 *                   type: number
 *       403:
 *         description: Insufficient permissions
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     BaselineIntelligence:
 *       type: object
 *       properties:
 *         tenantId:
 *           type: string
 *         nodeId:
 *           type: string
 *           nullable: true
 *         type:
 *           type: string
 *           enum: [node, network]
 *         metrics:
 *           type: object
 *         insights:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Insight'
 *         lastComputed:
 *           type: string
 *           format: date-time
 *         version:
 *           type: number
 *     
 *     Insight:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [demographic, geographic, facility, operational, custom]
 *         category:
 *           type: string
 *         text:
 *           type: string
 *         priority:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         dataPoints:
 *           type: array
 *           items:
 *             type: string
 *         recommendations:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */
