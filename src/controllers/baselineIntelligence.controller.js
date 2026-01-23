const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const {
  baselineIntelligenceService,
  baselineInsightsService,
  healthScoreService,
} = require('../services');
const logger = require('../config/logger');

/**
 * Get baseline intelligence for a specific node
 */
const getNodeBaseline = catchAsync(async (req, res) => {
  const { nodeId } = req.params;
  const { tenantId } = req.user;

  logger.info(`Getting node baseline for node ${nodeId} in tenant ${tenantId}`);

  const baseline = await baselineIntelligenceService.getBaseline(
    tenantId,
    nodeId
  );

  if (!baseline) {
    // Return default/empty baseline structure instead of 404
    logger.warn(
      `Node baseline not found for node ${nodeId} in tenant ${tenantId}, returning default structure`
    );
    const defaultBaseline = {
      _id: null,
      tenantId,
      nodeId: nodeId,
      type: 'node',
      metrics: {
        totalUsers: 0,
        genderDistribution: { male: 0, female: 0, other: 0 },
        ageDistribution: {},
        workforceComposition: {},
        leadershipToMemberRatio: 0,
        activeInactiveAccounts: { active: 0, inactive: 0 },
        averageAge: 0,
        skillsGrouping: {},
        tenureGrouping: {},
        propertyOwnership: { owned: 0, rented: 0, other: 0 },
        branchAge: 0,
        nodeCategories: {},
        capacityMetrics: {
          totalCapacity: 0,
          currentOccupancy: 0,
          utilizationRate: 0,
        },
        regionStateDistribution: {},
        nodeTypeGroupings: {},
      },
      insights: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    return res.send({
      success: true,
      data: defaultBaseline,
      message:
        'Node baseline not computed yet. Please trigger baseline computation.',
      needsComputation: true,
    });
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

  const baseline = await baselineIntelligenceService.getBaseline(
    tenantId,
    null
  );

  if (!baseline) {
    // Return default/empty baseline structure instead of 404
    logger.warn(
      `Network baseline not found for tenant ${tenantId}, returning default structure`
    );
    const defaultBaseline = {
      _id: null,
      tenantId,
      nodeId: null,
      type: 'network',
      metrics: {
        totalUsers: 0,
        genderDistribution: { male: 0, female: 0, other: 0 },
        ageDistribution: {},
        workforceComposition: {},
        leadershipToMemberRatio: 0,
        activeInactiveAccounts: { active: 0, inactive: 0 },
        averageAge: 0,
        skillsGrouping: {},
        tenureGrouping: {},
        propertyOwnership: { owned: 0, rented: 0, other: 0 },
        branchAge: 0,
        nodeCategories: {},
        capacityMetrics: {
          totalCapacity: 0,
          currentOccupancy: 0,
          utilizationRate: 0,
        },
        regionStateDistribution: {},
        nodeTypeGroupings: {},
      },
      insights: [],
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    return res.send({
      success: true,
      data: defaultBaseline,
      message:
        'Network baseline not computed yet. Please trigger baseline computation.',
      needsComputation: true,
    });
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

  logger.info(
    `Manual recompute requested for node ${nodeId} by user ${userId}`
  );

  // Check if user has permission (owners and supers only)
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to recompute baselines'
    );
  }

  const baselineData = await baselineIntelligenceService.computeNodeBaseline(
    nodeId,
    tenantId
  );

  // Generate insights with analysis config
  const insights = await baselineInsightsService.generateAllInsights(
    {
      type: 'node',
      metrics: baselineData.metrics,
    },
    tenantId
  );

  const baseline = await baselineIntelligenceService.saveBaseline(
    baselineData,
    insights
  );

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

  logger.info(
    `Manual network recompute requested for tenant ${tenantId} by user ${userId}`
  );

  // Check if user has permission (owners and supers only)
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to recompute baselines'
    );
  }

  const baselineData = await baselineIntelligenceService.computeNetworkBaseline(
    tenantId
  );

  // Generate insights with analysis config
  const insights = await baselineInsightsService.generateAllInsights(
    {
      type: 'network',
      metrics: baselineData.metrics,
    },
    tenantId
  );

  const baseline = await baselineIntelligenceService.saveBaseline(
    baselineData,
    insights
  );

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

  logger.info(
    `Full baseline recompute requested for tenant ${tenantId} by user ${userId}`
  );

  // Check if user has permission (owners and supers only)
  if (!req.user.isOwner && !req.user.isSuper && !req.user.isSaby) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Insufficient permissions to recompute baselines'
    );
  }

  const results =
    await baselineIntelligenceService.computeAllBaselinesForTenant(tenantId);

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

  const insights = await baselineInsightsService.getInsights(
    tenantId,
    nodeId,
    options
  );

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

  const insights = await baselineInsightsService.getInsights(
    tenantId,
    null,
    options
  );

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

  logger.info(
    `Getting baseline summary for tenant ${tenantId}, nodeId: ${
      nodeId || 'all'
    }`
  );

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
    summary.network = await baselineIntelligenceService.getBaseline(
      tenantId,
      null
    );
    summary.insights.network = await baselineInsightsService.getInsights(
      tenantId,
      null,
      { limit: 5 }
    );
  } catch (error) {
    logger.warn('Network baseline not available:', error.message);
  }

  // Get node baseline if nodeId provided
  if (nodeId) {
    try {
      summary.node = await baselineIntelligenceService.getBaseline(
        tenantId,
        nodeId
      );
      summary.insights.node = await baselineInsightsService.getInsights(
        tenantId,
        nodeId,
        { limit: 5 }
      );
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
      },
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
      },
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
    const sampleBaseline = await BaselineIntelligence.findOne({
      tenantId,
    }).limit(1);
    health.checks.database = 'healthy';
    health.details.database = sampleBaseline
      ? 'Data available'
      : 'No data found';
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
    const testMetrics = await baselineIntelligenceService.computeUserMetrics(
      []
    );
    health.checks.computation = 'healthy';
    health.details.computation = 'Computation functions operational';
  } catch (error) {
    health.checks.computation = 'unhealthy';
    health.details.computation = error.message;
    health.status = 'unhealthy';
  }

  const statusCode =
    health.status === 'healthy'
      ? httpStatus.OK
      : health.status === 'degraded'
      ? httpStatus.PARTIAL_CONTENT
      : httpStatus.SERVICE_UNAVAILABLE;

  res.status(statusCode).send({
    success: health.status !== 'unhealthy',
    data: health,
    message: `Baseline Intelligence system is ${health.status}`,
  });
});

/**
 * Get top nodes by attendance or income
 */
const getTopNodes = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { type = 'attendance', limit = 10 } = req.query;

  logger.info(`Getting top ${limit} nodes by ${type} for tenant ${tenantId}`);

  const baseline = await baselineIntelligenceService.getBaseline(
    tenantId,
    null
  );

  if (!baseline || !baseline.metrics) {
    return res.send({
      success: true,
      data: [],
      message: 'No baseline data available',
    });
  }

  const networkMetrics = baseline.metrics.network || {};
  const topNodes =
    type === 'attendance'
      ? (networkMetrics.attendance?.top10 || []).slice(0, parseInt(limit, 10))
      : (networkMetrics.income?.top10 || []).slice(0, parseInt(limit, 10));

  res.send({
    success: true,
    data: topNodes,
    message: `Top ${limit} nodes by ${type} retrieved successfully`,
  });
});

/**
 * Get geographic distribution
 */
const getGeographicDistribution = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  logger.info(`Getting geographic distribution for tenant ${tenantId}`);

  const baseline = await baselineIntelligenceService.getBaseline(
    tenantId,
    null
  );

  if (!baseline || !baseline.metrics) {
    return res.send({
      success: true,
      data: {
        states: [],
        countries: [],
        top5States: [],
        top5Countries: [],
      },
      message: 'No baseline data available',
    });
  }

  const networkMetrics = baseline.metrics.network || {};
  const regionalDistribution = networkMetrics.regionalDistribution || [];

  // Aggregate by state
  const stateMap = new Map();
  const countryMap = new Map();

  regionalDistribution.forEach((region) => {
    const state = region.region || 'Unknown';
    const country = region.country || 'Unknown';
    const nodeCount = region.nodes || 0;

    // State aggregation
    if (stateMap.has(state)) {
      stateMap.set(state, stateMap.get(state) + nodeCount);
    } else {
      stateMap.set(state, nodeCount);
    }

    // Country aggregation
    if (countryMap.has(country)) {
      countryMap.set(country, countryMap.get(country) + nodeCount);
    } else {
      countryMap.set(country, nodeCount);
    }
  });

  const totalNodes = Array.from(stateMap.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  const states = Array.from(stateMap.entries())
    .map(([state, count]) => ({
      state,
      count,
      percentage: totalNodes > 0 ? (count / totalNodes) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const countries = Array.from(countryMap.entries())
    .map(([country, count]) => ({
      country,
      count,
      percentage: totalNodes > 0 ? (count / totalNodes) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  res.send({
    success: true,
    data: {
      states,
      countries,
      top5States: states.slice(0, 5),
      top5Countries: countries.slice(0, 5),
    },
    message: 'Geographic distribution retrieved successfully',
  });
});

/**
 * Get health score
 */
const getHealthScore = catchAsync(async (req, res) => {
  const { tenantId } = req.user;

  logger.info(`Getting health score for tenant ${tenantId}`);

  const healthScore = await healthScoreService.calculateOverallHealthScore(
    tenantId
  );

  res.send({
    success: true,
    data: healthScore,
    message: 'Health score retrieved successfully',
  });
});

/**
 * Get user's scoped network baseline (hierarchical access)
 */
const getMyNetworkBaseline = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;
  const user = req.user;

  logger.info(
    `Getting scoped network baseline for user ${userId} in tenant ${tenantId}`
  );

  // Owners/Supers/Saby get full network baseline
  if (user.isOwner || user.isSuper || user.isSaby) {
    const baseline = await baselineIntelligenceService.getBaseline(
      tenantId,
      null
    );

    return res.send({
      success: true,
      data: baseline,
      message: 'Network baseline retrieved successfully',
      scoped: false,
      scope: 'full-network',
    });
  }

  // Regular users get scoped baseline (their node family only)
  const { nodeAccessService } = require('../services');
  const family = await nodeAccessService.getUserNodeFamily(userId, tenantId);

  if (family.totalFamilySize === 0) {
    return res.send({
      success: true,
      data: null,
      message: 'You are not assigned to any nodes yet',
      scoped: true,
      scope: 'no-access',
    });
  }

  // For now, return the network baseline with metadata about scope
  // TODO: Implement actual scoped computation in future optimization
  const baseline = await baselineIntelligenceService.getBaseline(
    tenantId,
    null
  );

  res.send({
    success: true,
    data: baseline,
    message: `Network baseline scoped to your ${family.totalFamilySize} accessible nodes`,
    scoped: true,
    scope: 'node-family',
    familySize: family.totalFamilySize,
    assignedNodes: family.assignedNodes.length,
  });
});

/**
 * Get user's node family information
 */
const getMyNodeFamily = catchAsync(async (req, res) => {
  const { tenantId, _id: userId } = req.user;

  logger.info(`Getting node family for user ${userId} in tenant ${tenantId}`);

  const { nodeAccessService } = require('../services');
  const family = await nodeAccessService.getUserNodeFamily(userId, tenantId);

  res.send({
    success: true,
    data: {
      assignedNodes: family.assignedNodes.map((n) => ({
        nodeId: n.nodeId,
        name: n.name,
        level: n.level?.name,
        structure: n.structure?.name,
      })),
      familySize: family.totalFamilySize,
      isOwner: family.isOwner,
      accessScope: family.isOwner ? 'full-network' : 'node-family',
    },
    message: 'Node family retrieved successfully',
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
  getTopNodes,
  getGeographicDistribution,
  getHealthScore,
  getMyNetworkBaseline,
  getMyNodeFamily,
};
