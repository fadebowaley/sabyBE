const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { 
  baselineIntelligenceService, 
  baselineInsightsService 
} = require('../services');
const logger = require('../config/logger');

/**
 * Get baseline intelligence for a specific node
 */
const getNodeBaseline = catchAsync(async (req, res) => {
  const { nodeId } = req.params;
  const { tenantId } = req.user;

  logger.info(`Getting node baseline for node ${nodeId} in tenant ${tenantId}`);

  const baseline = await baselineIntelligenceService.getBaseline(tenantId, nodeId);

  if (!baseline) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Baseline not found for this node');
  }

  res.send({
    success: true,
    data: baseline,
    message: 'Node baseline retrieved successfully',
  });
});

/**
 * Get network-level baseline intelligence
 */
const getNetworkBaseline = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  logger.info(`Getting network baseline for tenant ${tenantId}`);

  const baseline = await baselineIntelligenceService.getBaseline(tenantId, null);

  if (!baseline) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Network baseline not found');
  }

  res.send({
    success: true,
    data: baseline,
    message: 'Network baseline retrieved successfully',
  });
});

/**
 * Manually recompute baseline for a specific node
 */
const recomputeNodeBaseline = catchAsync(async (req, res) => {
  const { nodeId } = req.params;
  const { tenantId, _id: userId } = req.user;

  logger.info(`Manual recompute requested for node ${nodeId} by user ${userId}`);

  // Check if user has permission (owners and supers only)
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Insufficient permissions to recompute baselines');
  }

  const baselineData = await baselineIntelligenceService.computeNodeBaseline(nodeId, tenantId);
  
  // Generate insights
  const insights = baselineInsightsService.generateAllInsights({
    type: 'node',
    metrics: baselineData.metrics,
  });

  const baseline = await baselineIntelligenceService.saveBaseline(baselineData, insights);

  res.send({
    success: true,
    data: baseline,
    message: 'Node baseline recomputed successfully',
    computationTime: baselineData.computationDuration,
  });
});

/**
 * Manually recompute network baseline
 */
const recomputeNetworkBaseline = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;

  logger.info(`Manual network recompute requested for tenant ${tenantId} by user ${userId}`);

  // Check if user has permission (owners and supers only)
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Insufficient permissions to recompute baselines');
  }

  const baselineData = await baselineIntelligenceService.computeNetworkBaseline(tenantId);
  
  // Generate insights
  const insights = baselineInsightsService.generateAllInsights({
    type: 'network',
    metrics: baselineData.metrics,
  });

  const baseline = await baselineIntelligenceService.saveBaseline(baselineData, insights);

  res.send({
    success: true,
    data: baseline,
    message: 'Network baseline recomputed successfully',
    computationTime: baselineData.computationDuration,
  });
});

/**
 * Recompute all baselines for the tenant
 */
const recomputeAllBaselines = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;

  logger.info(`Full baseline recompute requested for tenant ${tenantId} by user ${userId}`);

  // Check if user has permission (owners and supers only)
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Insufficient permissions to recompute baselines');
  }

  const results = await baselineIntelligenceService.computeAllBaselinesForTenant(tenantId);

  res.send({
    success: true,
    data: results,
    message: `Baseline recomputation completed. Processed ${results.nodesProcessed} nodes in ${results.duration}ms`,
  });
});

/**
 * Get insights for a specific node
 */
const getNodeInsights = catchAsync(async (req, res) => {
  const { nodeId } = req.params;
  const { tenantId } = req.user;
  const options = pick(req.query, ['priority', 'type', 'limit']);

  logger.info(`Getting insights for node ${nodeId} in tenant ${tenantId}`);

  const insights = await baselineInsightsService.getInsights(tenantId, nodeId, options);

  res.send({
    success: true,
    data: insights,
    count: insights.length,
    message: 'Node insights retrieved successfully',
  });
});

/**
 * Get network-level insights
 */
const getNetworkInsights = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const options = pick(req.query, ['priority', 'type', 'limit']);

  logger.info(`Getting network insights for tenant ${tenantId}`);

  const insights = await baselineInsightsService.getInsights(tenantId, null, options);

  res.send({
    success: true,
    data: insights,
    count: insights.length,
    message: 'Network insights retrieved successfully',
  });
});

/**
 * Get baseline summary (both node and network data)
 */
const getBaselineSummary = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { nodeId } = req.query;

  logger.info(`Getting baseline summary for tenant ${tenantId}, nodeId: ${nodeId || 'all'}`);

  const summary = {
    network: null,
    node: null,
    insights: {
      network: [],
      node: [],
    },
  };

  // Get network baseline
  try {
    summary.network = await baselineIntelligenceService.getBaseline(tenantId, null);
    summary.insights.network = await baselineInsightsService.getInsights(tenantId, null, { limit: 5 });
  } catch (error) {
    logger.warn('Network baseline not available:', error.message);
  }

  // Get node baseline if nodeId provided
  if (nodeId) {
    try {
      summary.node = await baselineIntelligenceService.getBaseline(tenantId, nodeId);
      summary.insights.node = await baselineInsightsService.getInsights(tenantId, nodeId, { limit: 5 });
    } catch (error) {
      logger.warn(`Node baseline not available for ${nodeId}:`, error.message);
    }
  }

  res.send({
    success: true,
    data: summary,
    message: 'Baseline summary retrieved successfully',
  });
});

/**
 * Get baseline statistics
 */
const getBaselineStats = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  logger.info(`Getting baseline statistics for tenant ${tenantId}`);

  const { BaselineIntelligence } = require('../models');

  // Get baseline statistics
  const stats = await BaselineIntelligence.aggregate([
    { $match: { tenantId } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        lastComputed: { $max: '$lastComputed' },
        avgComputationTime: { $avg: '$computationDuration' },
        totalInsights: { $sum: { $size: '$insights' } },
      }
    },
  ]);

  // Get insights by priority
  const insightStats = await BaselineIntelligence.aggregate([
    { $match: { tenantId } },
    { $unwind: '$insights' },
    {
      $group: {
        _id: '$insights.priority',
        count: { $sum: 1 },
      }
    },
  ]);

  const formattedStats = {
    baselines: stats.reduce((acc, stat) => {
      acc[stat._id] = {
        count: stat.count,
        lastComputed: stat.lastComputed,
        avgComputationTime: Math.round(stat.avgComputationTime || 0),
        totalInsights: stat.totalInsights,
      };
      return acc;
    }, {}),
    insights: insightStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {}),
  };

  res.send({
    success: true,
    data: formattedStats,
    message: 'Baseline statistics retrieved successfully',
  });
});

/**
 * Health check for baseline intelligence system
 */
const healthCheck = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  const health = {
    status: 'healthy',
    timestamp: new Date(),
    checks: {
      database: 'unknown',
      cache: 'unknown',
      computation: 'unknown',
    },
    details: {},
  };

  try {
    // Check database connectivity
    const { BaselineIntelligence } = require('../models');
    const sampleBaseline = await BaselineIntelligence.findOne({ tenantId }).limit(1);
    health.checks.database = 'healthy';
    health.details.database = sampleBaseline ? 'Data available' : 'No data found';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.details.database = error.message;
    health.status = 'degraded';
  }

  try {
    // Check cache connectivity
    const { redisClient } = require('../config/redis');
    if (redisClient) {
      await redisClient.ping();
      health.checks.cache = 'healthy';
      health.details.cache = 'Redis connection active';
    } else {
      health.checks.cache = 'unavailable';
      health.details.cache = 'Redis client not initialized';
    }
  } catch (error) {
    health.checks.cache = 'unhealthy';
    health.details.cache = error.message;
    health.status = 'degraded';
  }

  try {
    // Test computation capability
    const testMetrics = await baselineIntelligenceService.computeUserMetrics([]);
    health.checks.computation = 'healthy';
    health.details.computation = 'Computation functions operational';
  } catch (error) {
    health.checks.computation = 'unhealthy';
    health.details.computation = error.message;
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? httpStatus.OK : 
                    health.status === 'degraded' ? httpStatus.PARTIAL_CONTENT : 
                    httpStatus.SERVICE_UNAVAILABLE;

  res.status(statusCode).send({
    success: health.status !== 'unhealthy',
    data: health,
    message: `Baseline Intelligence system is ${health.status}`,
  });
});

module.exports = {
  getNodeBaseline,
  getNetworkBaseline,
  recomputeNodeBaseline,
  recomputeNetworkBaseline,
  recomputeAllBaselines,
  getNodeInsights,
  getNetworkInsights,
  getBaselineSummary,
  getBaselineStats,
  healthCheck,
};
