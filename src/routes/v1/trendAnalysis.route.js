/**
 * Trend Analysis Routes
 *
 * Express routes for trend analysis and time-series functionality.
 * Provides endpoints for trend detection, seasonal patterns, and predictive insights.
 *
 * @module routes/v1/trendAnalysis
 */

const express = require('express');
const router = express.Router();
const trendAnalysisController = require('../../controllers/trendAnalysis.controller');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const trendAnalysisValidation = require('../../validations/trendAnalysis.validation');

// Apply authentication to all routes
router.use(auth());

/**
 * @swagger
 * /v1/trend-analysis/submissions/timeline:
 *   get:
 *     summary: Get submissions timeline trends
 *     description: Analyze submission trends over time with configurable grouping
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *       - in: query
 *         name: trend_type
 *         schema:
 *           type: string
 *           enum: [count, compliance, approval_rate]
 *           default: count
 *         description: Type of trend to analyze
 *     responses:
 *       200:
 *         description: Timeline trends retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         format: date-time
 *                       trend_value:
 *                         type: number
 *                       total_count:
 *                         type: integer
 *                       trend_direction:
 *                         type: string
 *                         enum: [increasing, decreasing, stable]
 *                       growth_rate:
 *                         type: number
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total_periods:
 *                       type: integer
 *                     trend_analysis:
 *                       type: object
 */
router.get(
  '/submissions/timeline',
  validate(trendAnalysisValidation.getSubmissionsTimeline),
  trendAnalysisController.getSubmissionsTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/compliance/timeline:
 *   get:
 *     summary: Get compliance timeline trends
 *     description: Analyze compliance trends over time
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *     responses:
 *       200:
 *         description: Compliance timeline trends retrieved successfully
 */
router.get(
  '/compliance/timeline',
  validate(trendAnalysisValidation.getComplianceTimeline),
  trendAnalysisController.getComplianceTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/validations/timeline:
 *   get:
 *     summary: Get validation timeline trends
 *     description: Analyze validation trends over time
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *     responses:
 *       200:
 *         description: Validation timeline trends retrieved successfully
 */
router.get(
  '/validations/timeline',
  validate(trendAnalysisValidation.getValidationTimeline),
  trendAnalysisController.getValidationTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/seasonal/patterns:
 *   get:
 *     summary: Get seasonal patterns analysis
 *     description: Analyze seasonal patterns and cyclical trends
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: years_back
 *         schema:
 *           type: integer
 *           default: 2
 *         description: Number of years to analyze for patterns
 *     responses:
 *       200:
 *         description: Seasonal patterns retrieved successfully
 */
router.get(
  '/seasonal/patterns',
  validate(trendAnalysisValidation.getSeasonalPatterns),
  trendAnalysisController.getSeasonalPatterns
);

/**
 * @swagger
 * /v1/trend-analysis/growth/metrics:
 *   get:
 *     summary: Get growth metrics analysis
 *     description: Analyze growth trends and expansion metrics
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: period_months
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of months to analyze for growth
 *     responses:
 *       200:
 *         description: Growth metrics retrieved successfully
 */
router.get(
  '/growth/metrics',
  validate(trendAnalysisValidation.getGrowthMetrics),
  trendAnalysisController.getGrowthMetrics
);

/**
 * @swagger
 * /v1/trend-analysis/predictive/insights:
 *   get:
 *     summary: Get predictive insights
 *     description: Generate predictive insights and forecasts
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: forecast_months
 *         schema:
 *           type: integer
 *           default: 3
 *         description: Number of months to forecast
 *     responses:
 *       200:
 *         description: Predictive insights retrieved successfully
 */
router.get(
  '/predictive/insights',
  validate(trendAnalysisValidation.getPredictiveInsights),
  trendAnalysisController.getPredictiveInsights
);

module.exports = router;

 *
 * Express routes for trend analysis and time-series functionality.
 * Provides endpoints for trend detection, seasonal patterns, and predictive insights.
 *
 * @module routes/v1/trendAnalysis
 */

const express = require('express');
const router = express.Router();
const trendAnalysisController = require('../../controllers/trendAnalysis.controller');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const trendAnalysisValidation = require('../../validations/trendAnalysis.validation');

// Apply authentication to all routes
router.use(auth());

/**
 * @swagger
 * /v1/trend-analysis/submissions/timeline:
 *   get:
 *     summary: Get submissions timeline trends
 *     description: Analyze submission trends over time with configurable grouping
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *       - in: query
 *         name: trend_type
 *         schema:
 *           type: string
 *           enum: [count, compliance, approval_rate]
 *           default: count
 *         description: Type of trend to analyze
 *     responses:
 *       200:
 *         description: Timeline trends retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         format: date-time
 *                       trend_value:
 *                         type: number
 *                       total_count:
 *                         type: integer
 *                       trend_direction:
 *                         type: string
 *                         enum: [increasing, decreasing, stable]
 *                       growth_rate:
 *                         type: number
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total_periods:
 *                       type: integer
 *                     trend_analysis:
 *                       type: object
 */
router.get(
  '/submissions/timeline',
  validate(trendAnalysisValidation.getSubmissionsTimeline),
  trendAnalysisController.getSubmissionsTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/compliance/timeline:
 *   get:
 *     summary: Get compliance timeline trends
 *     description: Analyze compliance trends over time
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *     responses:
 *       200:
 *         description: Compliance timeline trends retrieved successfully
 */
router.get(
  '/compliance/timeline',
  validate(trendAnalysisValidation.getComplianceTimeline),
  trendAnalysisController.getComplianceTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/validations/timeline:
 *   get:
 *     summary: Get validation timeline trends
 *     description: Analyze validation trends over time
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *     responses:
 *       200:
 *         description: Validation timeline trends retrieved successfully
 */
router.get(
  '/validations/timeline',
  validate(trendAnalysisValidation.getValidationTimeline),
  trendAnalysisController.getValidationTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/seasonal/patterns:
 *   get:
 *     summary: Get seasonal patterns analysis
 *     description: Analyze seasonal patterns and cyclical trends
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: years_back
 *         schema:
 *           type: integer
 *           default: 2
 *         description: Number of years to analyze for patterns
 *     responses:
 *       200:
 *         description: Seasonal patterns retrieved successfully
 */
router.get(
  '/seasonal/patterns',
  validate(trendAnalysisValidation.getSeasonalPatterns),
  trendAnalysisController.getSeasonalPatterns
);

/**
 * @swagger
 * /v1/trend-analysis/growth/metrics:
 *   get:
 *     summary: Get growth metrics analysis
 *     description: Analyze growth trends and expansion metrics
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: period_months
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of months to analyze for growth
 *     responses:
 *       200:
 *         description: Growth metrics retrieved successfully
 */
router.get(
  '/growth/metrics',
  validate(trendAnalysisValidation.getGrowthMetrics),
  trendAnalysisController.getGrowthMetrics
);

/**
 * @swagger
 * /v1/trend-analysis/predictive/insights:
 *   get:
 *     summary: Get predictive insights
 *     description: Generate predictive insights and forecasts
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: forecast_months
 *         schema:
 *           type: integer
 *           default: 3
 *         description: Number of months to forecast
 *     responses:
 *       200:
 *         description: Predictive insights retrieved successfully
 */
router.get(
  '/predictive/insights',
  validate(trendAnalysisValidation.getPredictiveInsights),
  trendAnalysisController.getPredictiveInsights
);

module.exports = router;

 *
 * Express routes for trend analysis and time-series functionality.
 * Provides endpoints for trend detection, seasonal patterns, and predictive insights.
 *
 * @module routes/v1/trendAnalysis
 */

const express = require('express');
const router = express.Router();
const trendAnalysisController = require('../../controllers/trendAnalysis.controller');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const trendAnalysisValidation = require('../../validations/trendAnalysis.validation');

// Apply authentication to all routes
router.use(auth());

/**
 * @swagger
 * /v1/trend-analysis/submissions/timeline:
 *   get:
 *     summary: Get submissions timeline trends
 *     description: Analyze submission trends over time with configurable grouping
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [hour, day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *       - in: query
 *         name: trend_type
 *         schema:
 *           type: string
 *           enum: [count, compliance, approval_rate]
 *           default: count
 *         description: Type of trend to analyze
 *     responses:
 *       200:
 *         description: Timeline trends retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       period:
 *                         type: string
 *                         format: date-time
 *                       trend_value:
 *                         type: number
 *                       total_count:
 *                         type: integer
 *                       trend_direction:
 *                         type: string
 *                         enum: [increasing, decreasing, stable]
 *                       growth_rate:
 *                         type: number
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total_periods:
 *                       type: integer
 *                     trend_analysis:
 *                       type: object
 */
router.get(
  '/submissions/timeline',
  validate(trendAnalysisValidation.getSubmissionsTimeline),
  trendAnalysisController.getSubmissionsTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/compliance/timeline:
 *   get:
 *     summary: Get compliance timeline trends
 *     description: Analyze compliance trends over time
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *     responses:
 *       200:
 *         description: Compliance timeline trends retrieved successfully
 */
router.get(
  '/compliance/timeline',
  validate(trendAnalysisValidation.getComplianceTimeline),
  trendAnalysisController.getComplianceTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/validations/timeline:
 *   get:
 *     summary: Get validation timeline trends
 *     description: Analyze validation trends over time
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis
 *       - in: query
 *         name: group_by
 *         schema:
 *           type: string
 *           enum: [day, week, month]
 *           default: day
 *         description: Time grouping for analysis
 *     responses:
 *       200:
 *         description: Validation timeline trends retrieved successfully
 */
router.get(
  '/validations/timeline',
  validate(trendAnalysisValidation.getValidationTimeline),
  trendAnalysisController.getValidationTimeline
);

/**
 * @swagger
 * /v1/trend-analysis/seasonal/patterns:
 *   get:
 *     summary: Get seasonal patterns analysis
 *     description: Analyze seasonal patterns and cyclical trends
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: years_back
 *         schema:
 *           type: integer
 *           default: 2
 *         description: Number of years to analyze for patterns
 *     responses:
 *       200:
 *         description: Seasonal patterns retrieved successfully
 */
router.get(
  '/seasonal/patterns',
  validate(trendAnalysisValidation.getSeasonalPatterns),
  trendAnalysisController.getSeasonalPatterns
);

/**
 * @swagger
 * /v1/trend-analysis/growth/metrics:
 *   get:
 *     summary: Get growth metrics analysis
 *     description: Analyze growth trends and expansion metrics
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: period_months
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of months to analyze for growth
 *     responses:
 *       200:
 *         description: Growth metrics retrieved successfully
 */
router.get(
  '/growth/metrics',
  validate(trendAnalysisValidation.getGrowthMetrics),
  trendAnalysisController.getGrowthMetrics
);

/**
 * @swagger
 * /v1/trend-analysis/predictive/insights:
 *   get:
 *     summary: Get predictive insights
 *     description: Generate predictive insights and forecasts
 *     tags: [Trend Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: string
 *         description: Tenant ID (optional, uses auth if not provided)
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Project ID filter
 *       - in: query
 *         name: forecast_months
 *         schema:
 *           type: integer
 *           default: 3
 *         description: Number of months to forecast
 *     responses:
 *       200:
 *         description: Predictive insights retrieved successfully
 */
router.get(
  '/predictive/insights',
  validate(trendAnalysisValidation.getPredictiveInsights),
  trendAnalysisController.getPredictiveInsights
);

module.exports = router;
