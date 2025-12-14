const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { BaselineIntelligence } = require('../models');
const logger = require('../config/logger');

/**
 * Calculate overall health score
 * Formula: Weighted combination of 6 indicators
 * - Profile Completion Rate (25%)
 * - Data Quality Score (20%)
 * - Growth Rate (20%)
 * - Financial Health (15%)
 * - Engagement Rate (10%)
 * - Infrastructure Health (10%)
 * 
 * @param {string} tenantId
 * @returns {Promise<Object>} Health score with indicators and insights
 */
const calculateOverallHealthScore = async (tenantId) => {
  try {
    const baseline = await BaselineIntelligence.getNetworkBaseline(tenantId);
    
    if (!baseline || !baseline.metrics) {
      return {
        overallScore: 0,
        indicators: {
          profileCompletion: 0,
          dataQuality: 0,
          growthRate: 0,
          financialHealth: 0,
          engagementRate: 0,
          infrastructureHealth: 0,
        },
        insights: [],
        trend: 'stable',
        trendValue: '0%',
      };
    }

    const userMetrics = baseline.metrics.users || {};
    const networkMetrics = baseline.metrics.network || {};

    // 1. Profile Completion Rate (25% weight)
    const totalUsers = userMetrics.total || 0;
    const activeUsers = userMetrics.active || 0;
    const profileCompletion = totalUsers > 0 
      ? Math.round((activeUsers / totalUsers) * 100)
      : 0;

    // 2. Data Quality Score (20% weight)
    // Based on verification rates and profile completeness
    const emailVerified = userMetrics.verification?.email || 0;
    const phoneVerified = userMetrics.verification?.phone || 0;
    const verificationScore = totalUsers > 0 
      ? Math.round(((emailVerified + phoneVerified) / (totalUsers * 2)) * 100)
      : 0;
    
    // Profile data completeness (check if users have profile data)
    const usersWithProfile = userMetrics.total || 0; // TODO: Calculate actual users with complete profiles
    const profileCompleteness = totalUsers > 0 
      ? Math.round((usersWithProfile / totalUsers) * 100)
      : 0;
    
    const dataQuality = Math.round((verificationScore * 0.6) + (profileCompleteness * 0.4));

    // 3. Growth Rate (20% weight)
    // TODO: Calculate from historical data
    // For now, use a placeholder calculation based on node/user growth
    const totalNodes = networkMetrics.totalNodes || 0;
    const growthRate = 5.2; // Placeholder - should be calculated from historical baseline data

    // 4. Financial Health (15% weight)
    // Based on income metrics and property ownership
    const income = networkMetrics.income || {};
    const averageIncome = income.average || 0;
    const propertyOwnership = networkMetrics.nodesByProperty || {};
    const ownedNodes = propertyOwnership.owned || 0;
    const totalPropertyNodes = ownedNodes + (propertyOwnership.rented || 0) + (propertyOwnership.leased || 0) + (propertyOwnership.other || 0);
    const ownershipRate = totalPropertyNodes > 0 
      ? Math.round((ownedNodes / totalPropertyNodes) * 100)
      : 0;
    
    // Financial health combines income and ownership
    const incomeScore = averageIncome > 0 ? Math.min(100, Math.round((averageIncome / 1000000) * 10)) : 0; // Scale based on income
    const financialHealth = Math.round((incomeScore * 0.5) + (ownershipRate * 0.5));

    // 5. Engagement Rate (10% weight)
    // Based on attendance metrics
    const attendance = networkMetrics.attendance || {};
    const averageAttendance = attendance.average || 0;
    const totalAttendance = attendance.total || 0;
    // Calculate engagement as a percentage of potential (placeholder logic)
    const engagementRate = averageAttendance > 0 ? Math.min(100, Math.round((averageAttendance / 1000) * 10)) : 0;

    // 6. Infrastructure Health (10% weight)
    // Based on facility status
    const facilityStatus = networkMetrics.nodesByFacility || {};
    const activeFacilities = facilityStatus.active || 0;
    const totalFacilities = activeFacilities + (facilityStatus.inactive || 0) + (facilityStatus.underConstruction || 0);
    const infrastructureHealth = totalFacilities > 0 
      ? Math.round((activeFacilities / totalFacilities) * 100)
      : 0;

    // Calculate overall score (weighted)
    const overallScore = Math.round(
      (profileCompletion * 0.25) +
      (dataQuality * 0.20) +
      (growthRate * 0.20) +
      (financialHealth * 0.15) +
      (engagementRate * 0.10) +
      (infrastructureHealth * 0.10)
    );

    // Generate insights based on scores
    const insights = generateHealthInsights({
      overallScore,
      profileCompletion,
      dataQuality,
      growthRate,
      financialHealth,
      engagementRate,
      infrastructureHealth,
    });

    // Calculate trend (placeholder - should compare with previous period)
    const trend = 'stable'; // TODO: Calculate from historical data
    const trendValue = '0%'; // TODO: Calculate from historical data

    return {
      overallScore,
      indicators: {
        profileCompletion,
        dataQuality,
        growthRate,
        financialHealth,
        engagementRate,
        infrastructureHealth,
      },
      insights,
      trend,
      trendValue,
    };
  } catch (error) {
    logger.error('Error calculating health score:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to calculate health score');
  }
};

/**
 * Generate health insights based on scores
 * @param {Object} scores - Health indicator scores
 * @returns {Array} Array of insights
 */
const generateHealthInsights = (scores) => {
  const insights = [];

  // Overall score insights
  if (scores.overallScore < 60) {
    insights.push({
      priority: 'critical',
      message: 'Overall health score is below optimal. Immediate action required.',
      recommendations: [
        'Review profile completion rates',
        'Improve data quality and verification',
        'Address infrastructure issues',
        'Focus on financial sustainability',
      ],
    });
  } else if (scores.overallScore < 80) {
    insights.push({
      priority: 'high',
      message: 'Health score is fair but can be improved.',
      recommendations: [
        'Continue improving profile completion',
        'Enhance data quality initiatives',
        'Monitor financial health',
      ],
    });
  }

  // Profile completion insights
  if (scores.profileCompletion < 70) {
    insights.push({
      priority: 'high',
      message: `Profile completion rate is ${scores.profileCompletion}%, below target of 80%.`,
      recommendations: [
        'Launch profile completion campaign',
        'Send reminders to users with incomplete profiles',
        'Provide incentives for profile completion',
      ],
    });
  }

  // Data quality insights
  if (scores.dataQuality < 75) {
    insights.push({
      priority: 'high',
      message: `Data quality score is ${scores.dataQuality}%, indicating verification gaps.`,
      recommendations: [
        'Improve email and phone verification rates',
        'Implement data validation rules',
        'Regular data quality audits',
      ],
    });
  }

  // Financial health insights
  if (scores.financialHealth < 60) {
    insights.push({
      priority: 'high',
      message: `Financial health is ${scores.financialHealth}%, below optimal.`,
      recommendations: [
        'Review income generation strategies',
        'Consider property acquisition opportunities',
        'Optimize financial resource allocation',
      ],
    });
  }

  // Infrastructure health insights
  if (scores.infrastructureHealth < 80) {
    insights.push({
      priority: 'medium',
      message: `Infrastructure health is ${scores.infrastructureHealth}%.`,
      recommendations: [
        'Review facility status and maintenance needs',
        'Plan for facility improvements',
        'Address inactive or under-construction facilities',
      ],
    });
  }

  return insights;
};

/**
 * Calculate health indicators (sub-scores)
 * @param {string} tenantId
 * @returns {Promise<Object>} Health indicators
 */
const calculateHealthIndicators = async (tenantId) => {
  try {
    const healthScore = await calculateOverallHealthScore(tenantId);
    return healthScore.indicators;
  } catch (error) {
    logger.error('Error calculating health indicators:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to calculate health indicators');
  }
};

module.exports = {
  calculateOverallHealthScore,
  calculateHealthIndicators,
  generateHealthInsights,
};

