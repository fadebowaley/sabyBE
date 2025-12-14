/**
 * Baseline Jobs Controller
 *
 * Handles job monitoring and management for baseline intelligence system
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const {
  getQueueStats,
  getJob,
  clearCompletedJobs,
  queueNodeComputation,
  queueNetworkComputation,
  queueFullRecomputation,
} = require('../queues/baseline.queue');
const { getBatchStats } = require('../services/batchChangeProcessor.service');

/**
 * Get queue statistics
 * GET /v1/baseline/jobs/stats
 */
const getJobStats = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { queueType } = req.query;

  logger.info(`Getting job stats for tenant ${tenantId}`);

  const stats = await getQueueStats(queueType || 'all');

  // Add batch stats
  const batchStats = getBatchStats();

  res.send({
    success: true,
    data: {
      queues: stats,
      batches: batchStats,
      timestamp: new Date(),
    },
    message: 'Job statistics retrieved successfully',
  });
});

/**
 * Get specific job details
 * GET /v1/baseline/jobs/:queueType/:jobId
 */
const getJobDetails = catchAsync(async (req, res) => {
  const { queueType, jobId } = req.params;
  const { tenantId } = req.user;

  logger.info(`Getting job details: ${jobId} (${queueType})`);

  const job = await getJob(jobId, queueType);

  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Job not found');
  }

  // Security: Check if job belongs to user's tenant
  if (job.data?.tenantId && job.data.tenantId !== tenantId) {
    if (!req.user.isSaby) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Access denied - job belongs to different tenant'
      );
    }
  }

  res.send({
    success: true,
    data: job,
    message: 'Job details retrieved successfully',
  });
});

/**
 * Clear completed jobs
 * POST /v1/baseline/jobs/clear
 */
const clearJobs = catchAsync(async (req, res) => {
  const { queueType } = req.body;

  // Only owners/supers/saby can clear jobs
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to clear jobs'
    );
  }

  logger.info(`Clearing completed jobs for queue: ${queueType || 'all'}`);

  const summary = await clearCompletedJobs(queueType || 'all');

  res.send({
    success: true,
    data: summary,
    message: 'Completed jobs cleared successfully',
  });
});

/**
 * Manual queue job (for testing/debugging)
 * POST /v1/baseline/jobs/queue
 */
const queueManualJob = catchAsync(async (req, res) => {
  const { jobType, nodeId, delay } = req.body;
  const { tenantId } = req.user;

  // Only owners/supers/saby can manually queue jobs
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to queue jobs manually'
    );
  }

  logger.info(`Manual job queue requested: ${jobType} for tenant ${tenantId}`);

  let result;

  switch (jobType) {
    case 'node':
      if (!nodeId) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'nodeId is required for node job type'
        );
      }
      result = await queueNodeComputation({
        nodeId,
        tenantId,
        triggeredBy: 'manual',
      });
      break;

    case 'network':
      result = await queueNetworkComputation({
        tenantId,
        triggeredBy: 'manual',
        delay: delay || 0,
      });
      break;

    case 'full':
      result = await queueFullRecomputation(tenantId);
      break;

    default:
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Invalid job type: ${jobType}. Must be 'node', 'network', or 'full'`
      );
  }

  res.send({
    success: true,
    data: result,
    message: `${jobType} job queued successfully`,
  });
});

/**
 * Get job performance metrics
 * GET /v1/baseline/jobs/metrics
 */
const getJobMetrics = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { timeRange = '1h' } = req.query;

  logger.info(
    `Getting job metrics for tenant ${tenantId} (range: ${timeRange})`
  );

  // Calculate time window
  const now = Date.now();
  let since;

  switch (timeRange) {
    case '1h':
      since = now - 3600000;
      break;
    case '24h':
      since = now - 86400000;
      break;
    case '7d':
      since = now - 604800000;
      break;
    default:
      since = now - 3600000;
  }

  // Get baseline computations from database
  const { BaselineIntelligence } = require('../models');

  const recentComputations = await BaselineIntelligence.find({
    tenantId,
    lastComputed: { $gte: new Date(since) },
  })
    .select('type nodeId lastComputed computationDuration')
    .lean();

  // Calculate metrics
  const nodeComputations = recentComputations.filter((c) => c.type === 'node');
  const networkComputations = recentComputations.filter(
    (c) => c.type === 'network'
  );

  const metrics = {
    timeRange,
    since: new Date(since),
    totalComputations: recentComputations.length,

    node: {
      count: nodeComputations.length,
      avgDuration:
        nodeComputations.length > 0
          ? Math.round(
              nodeComputations.reduce(
                (sum, c) => sum + (c.computationDuration || 0),
                0
              ) / nodeComputations.length
            )
          : 0,
      maxDuration:
        nodeComputations.length > 0
          ? Math.max(...nodeComputations.map((c) => c.computationDuration || 0))
          : 0,
    },

    network: {
      count: networkComputations.length,
      avgDuration:
        networkComputations.length > 0
          ? Math.round(
              networkComputations.reduce(
                (sum, c) => sum + (c.computationDuration || 0),
                0
              ) / networkComputations.length
            )
          : 0,
      maxDuration:
        networkComputations.length > 0
          ? Math.max(
              ...networkComputations.map((c) => c.computationDuration || 0)
            )
          : 0,
    },
  };

  // Get current queue stats
  const queueStats = await getQueueStats('all');

  res.send({
    success: true,
    data: {
      metrics,
      queues: queueStats,
    },
    message: 'Job metrics retrieved successfully',
  });
});

/**
 * Get job history for tenant
 * GET /v1/baseline/jobs/history
 */
const getJobHistory = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { limit = 50, type } = req.query;

  logger.info(`Getting job history for tenant ${tenantId}`);

  const { BaselineIntelligence } = require('../models');

  const filter = { tenantId };
  if (type) {
    filter.type = type;
  }

  const history = await BaselineIntelligence.find(filter)
    .select('type nodeId lastComputed computationDuration computedBy version')
    .sort({ lastComputed: -1 })
    .limit(parseInt(limit, 10))
    .lean();

  res.send({
    success: true,
    data: history,
    count: history.length,
    message: 'Job history retrieved successfully',
  });
});

module.exports = {
  getJobStats,
  getJobDetails,
  clearJobs,
  queueManualJob,
  getJobMetrics,
  getJobHistory,
};
