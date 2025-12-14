/**
 * Baseline Jobs Routes
 *
 * Routes for job monitoring and management
 */

const express = require('express');
const requireAccess = require('../../middlewares/requireAccess');
const baselineJobsController = require('../../controllers/baselineJobs.controller');

const router = express.Router();

// Job statistics and monitoring
router.get(
  '/stats',
  requireAccess('view:baselinejobs'),
  baselineJobsController.getJobStats
);

router.get(
  '/metrics',
  requireAccess('view:baselinejobs'),
  baselineJobsController.getJobMetrics
);

router.get(
  '/history',
  requireAccess('view:baselinejobs'),
  baselineJobsController.getJobHistory
);

router.get(
  '/:queueType/:jobId',
  requireAccess('view:baselinejobs'),
  baselineJobsController.getJobDetails
);

// Job management (Owner/Super only)
router.post(
  '/clear',
  requireAccess('create:baselinejobs'),
  baselineJobsController.clearJobs
);

router.post(
  '/queue',
  requireAccess('create:baselinejobs'),
  baselineJobsController.queueManualJob
);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Baseline Jobs
 *   description: Job monitoring and management for baseline intelligence
 */

/**
 * @swagger
 * /baseline/jobs/stats:
 *   get:
 *     summary: Get queue statistics
 *     description: Get current status of all baseline computation queues
 *     tags: [Baseline Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: queueType
 *         schema:
 *           type: string
 *           enum: [node, network, batch, all]
 *         description: Type of queue to get stats for
 *     responses:
 *       200:
 *         description: Queue statistics retrieved
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
 *                     queues:
 *                       type: object
 *                       properties:
 *                         node:
 *                           type: object
 *                           properties:
 *                             waiting: { type: number }
 *                             active: { type: number }
 *                             completed: { type: number }
 *                             failed: { type: number }
 *                             delayed: { type: number }
 *                         network:
 *                           type: object
 *                         batch:
 *                           type: object
 *                     batches:
 *                       type: object
 */

/**
 * @swagger
 * /baseline/jobs/metrics:
 *   get:
 *     summary: Get job performance metrics
 *     description: Get performance metrics for baseline computations
 *     tags: [Baseline Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeRange
 *         schema:
 *           type: string
 *           enum: [1h, 24h, 7d]
 *           default: 1h
 *         description: Time range for metrics
 *     responses:
 *       200:
 *         description: Job metrics retrieved
 */

/**
 * @swagger
 * /baseline/jobs/queue:
 *   post:
 *     summary: Manually queue a baseline job
 *     description: Queue a baseline computation job for testing/debugging
 *     tags: [Baseline Jobs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - jobType
 *             properties:
 *               jobType:
 *                 type: string
 *                 enum: [node, network, full]
 *               nodeId:
 *                 type: string
 *                 description: Required if jobType is 'node'
 *               delay:
 *                 type: number
 *                 description: Delay in milliseconds (for network jobs)
 *     responses:
 *       200:
 *         description: Job queued successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Insufficient permissions
 */
