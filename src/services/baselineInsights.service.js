const logger = require('../config/logger');
const { BaselineIntelligence } = require('../models');
const { generateCustomFieldInsights } = require('./customFieldAnalytics.service');
const baselineAnalysisConfigService = require('./baselineAnalysisConfig.service');

/**
 * Baseline Insights Service
 * Generates rule-based insights from baseline intelligence data
 */

/**
 * Generate demographic insights
 * @param {Object} userMetrics
 * @param {string} context - 'node' or 'network'
 * @param {Object} analysisConfig - BaselineAnalysisConfig (optional)
 * @returns {Array} insights
 */
const generateDemographicInsights = (
  userMetrics,
  context = 'node',
  analysisConfig = null
) => {
  const insights = [];
  const { total, demographics, verification, hierarchy } = userMetrics;

  if (total === 0) {
    insights.push({
      type: 'demographic',
      category: 'population',
      text: `No users found in this ${context}.`,
      priority: 'medium',
      dataPoints: ['users.total'],
      recommendations: [
        'Consider adding users to this node',
        'Verify node configuration',
      ],
    });
    return insights;
  }

  // Age distribution insights
  const ageGroups = demographics.ageGroups;
  const totalWithAge =
    Object.values(ageGroups).reduce((sum, count) => sum + count, 0) -
    ageGroups.unknown;

  if (totalWithAge > 0) {
    const agePercentages = {
      under18: Math.round((ageGroups.under18 / totalWithAge) * 100),
      '19to30': Math.round((ageGroups['19to30'] / totalWithAge) * 100),
      '31to45': Math.round((ageGroups['31to45'] / totalWithAge) * 100),
      '46to60': Math.round((ageGroups['46to60'] / totalWithAge) * 100),
      over60: Math.round((ageGroups.over60 / totalWithAge) * 100),
    };

    // Find dominant age group
    const dominantAge = Object.entries(agePercentages).reduce(
      (max, [group, percentage]) =>
        percentage > max.percentage ? { group, percentage } : max,
      { group: 'unknown', percentage: 0 }
    );

    if (dominantAge.percentage >= 40) {
      const ageLabel = {
        under18: 'under 18',
        '19to30': '19-30',
        '31to45': '31-45',
        '46to60': '46-60',
        over60: 'over 60',
      }[dominantAge.group];

      insights.push({
        type: 'demographic',
        category: 'age',
        text: `Your ${context} workforce is predominantly aged ${ageLabel} (${dominantAge.percentage}% of members).`,
        priority: dominantAge.percentage >= 60 ? 'high' : 'medium',
        dataPoints: ['demographics.ageGroups', 'demographics.averageAge'],
        recommendations:
          dominantAge.percentage >= 60
            ? [
                'Consider programs to attract other age groups',
                'Plan for age diversity in leadership development',
              ]
            : ["Leverage this age group's strengths in planning"],
      });
    }

    // Average age insights
    if (demographics.averageAge > 0) {
      let ageInsight = '';
      let priority = 'low';
      let recommendations = [];

      if (demographics.averageAge < 25) {
        ageInsight = `Very young ${context} with average age of ${demographics.averageAge} years.`;
        priority = 'medium';
        recommendations = [
          'Focus on youth development programs',
          'Consider mentorship opportunities',
        ];
      } else if (demographics.averageAge > 50) {
        ageInsight = `Mature ${context} with average age of ${demographics.averageAge} years.`;
        priority = 'medium';
        recommendations = [
          'Plan for succession and knowledge transfer',
          'Consider attracting younger members',
        ];
      } else {
        ageInsight = `Balanced age distribution with average age of ${demographics.averageAge} years.`;
        recommendations = ['Maintain current age diversity strategies'];
      }

      insights.push({
        type: 'demographic',
        category: 'age',
        text: ageInsight,
        priority,
        dataPoints: ['demographics.averageAge'],
        recommendations,
      });
    }
  }

  // Gender distribution insights
  const gender = demographics.gender;
  const totalWithGender = gender.male + gender.female + gender.other;

  if (totalWithGender > 0) {
    const malePercentage = Math.round((gender.male / totalWithGender) * 100);
    const femalePercentage = Math.round(
      (gender.female / totalWithGender) * 100
    );

    if (Math.abs(malePercentage - femalePercentage) > 30) {
      const dominant = malePercentage > femalePercentage ? 'male' : 'female';
      const dominantPercentage = Math.max(malePercentage, femalePercentage);

      insights.push({
        type: 'demographic',
        category: 'gender',
        text: `Gender distribution shows ${dominantPercentage}% ${dominant} members - consider targeted outreach for balance.`,
        priority: dominantPercentage > 70 ? 'high' : 'medium',
        dataPoints: ['demographics.gender'],
        recommendations: [
          `Develop programs to attract more ${
            dominant === 'male' ? 'female' : 'male'
          } members`,
          'Review communication and outreach strategies',
        ],
      });
    } else {
      insights.push({
        type: 'demographic',
        category: 'gender',
        text: `Good gender balance with ${malePercentage}% male and ${femalePercentage}% female members.`,
        priority: 'low',
        dataPoints: ['demographics.gender'],
        recommendations: ['Maintain current inclusive practices'],
      });
    }
  }

  // Marital status insights
  const marital = demographics.maritalStatus;
  const totalWithMarital =
    Object.values(marital).reduce((sum, count) => sum + count, 0) -
    marital.unknown;

  if (totalWithMarital > 0) {
    const singlePercentage = Math.round(
      (marital.single / totalWithMarital) * 100
    );
    const marriedPercentage = Math.round(
      (marital.married / totalWithMarital) * 100
    );

    if (singlePercentage > 70) {
      insights.push({
        type: 'demographic',
        category: 'marital',
        text: `High unmarried population (${singlePercentage}%) suggests focus on young adult and singles programs.`,
        priority: 'medium',
        dataPoints: ['demographics.maritalStatus'],
        recommendations: [
          'Develop singles ministry programs',
          'Consider young adult engagement initiatives',
        ],
      });
    } else if (marriedPercentage > 70) {
      insights.push({
        type: 'demographic',
        category: 'marital',
        text: `Predominantly married membership (${marriedPercentage}%) - family-focused programs recommended.`,
        priority: 'medium',
        dataPoints: ['demographics.maritalStatus'],
        recommendations: [
          'Strengthen family ministry programs',
          'Consider couples and parenting support',
        ],
      });
    }
  }

  // Get thresholds from config (with defaults)
  const thresholds = analysisConfig?.globalSettings?.thresholds || {};
  const complianceRateThreshold = thresholds.complianceRate || {
    target: 80,
    warning: 70,
  };
  const leadershipRatioThreshold = thresholds.leadershipRatio || {
    optimal: { min: 15, max: 25 },
    warning: { min: 10, max: 30 },
  };

  // Verification insights (using config thresholds)
  const emailWarningThreshold = complianceRateThreshold.warning || 70;
  const emailTargetThreshold = complianceRateThreshold.target || 80;

  if (verification.emailRate < emailTargetThreshold) {
    const priority =
      verification.emailRate < emailWarningThreshold ? 'high' : 'medium';
    insights.push({
      type: 'demographic',
      category: 'verification',
      text: `Low email verification rate (${verification.emailRate}%) limits digital engagement capabilities. Target: ${emailTargetThreshold}%.`,
      priority,
      dataPoints: ['verification.emailRate'],
      recommendations: [
        'Launch email verification campaign',
        'Provide incentives for email verification',
        'Improve onboarding process',
      ],
    });
  }

  if (verification.phoneRate < emailTargetThreshold) {
    const priority =
      verification.phoneRate < emailWarningThreshold ? 'high' : 'medium';
    insights.push({
      type: 'demographic',
      category: 'verification',
      text: `Low phone verification rate (${verification.phoneRate}%) may impact communication effectiveness. Target: ${emailTargetThreshold}%.`,
      priority,
      dataPoints: ['verification.phoneRate'],
      recommendations: [
        'Encourage phone number verification',
        'Use SMS campaigns to drive verification',
      ],
    });
  }

  // Hierarchy insights (DISABLED - hierarchy computation was removed)
  // We no longer track system roles (owners, supers, ordinary, sabyUsers)
  // All hierarchy-related insights have been disabled since we only focus on Role model roles now
  // if (false && hierarchy && typeof hierarchy === 'object') {
  //   const totalHierarchy =
  //     (hierarchy.owners || 0) +
  //     (hierarchy.supers || 0) +
  //     (hierarchy.ordinary || 0) +
  //     (hierarchy.sabyUsers || 0);
  //   if (totalHierarchy > 0) {
  //     const leadershipPercentage = Math.round(
  //       ((hierarchy.owners + hierarchy.supers) / totalHierarchy) * 100
  //     );
  //     const optimalMin = leadershipRatioThreshold.optimal?.min || 15;
  //     const optimalMax = leadershipRatioThreshold.optimal?.max || 25;
  //     const warningMin = leadershipRatioThreshold.warning?.min || 10;
  //     const warningMax = leadershipRatioThreshold.warning?.max || 30;

  //     if (leadershipPercentage < warningMin) {
  //       insights.push({
  //         type: 'demographic',
  //         category: 'leadership',
  //         text: `Low leadership ratio (${leadershipPercentage}%) is below warning threshold (${warningMin}%). Optimal range: ${optimalMin}-${optimalMax}%.`,
  //         priority: 'high',
  //         dataPoints: ['hierarchy'],
  //         recommendations: [
  //           'Implement leadership development programs',
  //           'Identify and train potential leaders',
  //           'Review organizational structure',
  //         ],
  //       });
  //     } else if (leadershipPercentage > warningMax) {
  //       insights.push({
  //         type: 'demographic',
  //         category: 'leadership',
  //         text: `High leadership ratio (${leadershipPercentage}%) exceeds warning threshold (${warningMax}%). Optimal range: ${optimalMin}-${optimalMax}%.`,
  //         priority: 'medium',
  //         dataPoints: ['hierarchy'],
  //         recommendations: [
  //           'Review delegation and empowerment',
  //           'Ensure effective use of leadership capacity',
  //         ],
  //       });
  //     } else if (
  //       leadershipPercentage < optimalMin ||
  //       leadershipPercentage > optimalMax
  //     ) {
  //       insights.push({
  //         type: 'demographic',
  //         category: 'leadership',
  //         text: `Leadership ratio (${leadershipPercentage}%) is outside optimal range (${optimalMin}-${optimalMax}%).`,
  //         priority: 'low',
  //         dataPoints: ['hierarchy'],
  //         recommendations: [
  //           'Monitor leadership ratio trends',
  //           'Consider adjustments if needed',
  //         ],
  //       });
  //     } else {
  //       insights.push({
  //         type: 'demographic',
  //         category: 'leadership',
  //         text: `Leadership ratio (${leadershipPercentage}%) is within optimal range (${optimalMin}-${optimalMax}%).`,
  //         priority: 'low',
  //         dataPoints: ['hierarchy'],
  //         recommendations: [
  //           'Maintain current leadership structure',
  //           'Continue leadership development programs',
  //         ],
  //       });
  //     }
  //   }
  // }

  return insights;
};

/**
 * Generate geographic insights
 * @param {Array} geography
 * @param {string} context
 * @returns {Array} insights
 */
const generateGeographicInsights = (geography, context = 'node') => {
  const insights = [];

  if (!geography || geography.length === 0) {
    return insights;
  }

  const totalUsers = geography.reduce((sum, geo) => sum + geo.count, 0);

  // Sort by count to find dominant regions
  const sortedGeo = geography.sort((a, b) => b.count - a.count);

  // Check for geographic concentration
  const topRegions = sortedGeo.slice(0, 3);
  const topRegionUsers = topRegions.reduce((sum, geo) => sum + geo.count, 0);
  const concentrationPercentage = Math.round(
    (topRegionUsers / totalUsers) * 100
  );

  if (concentrationPercentage > 80 && geography.length > 3) {
    insights.push({
      type: 'geographic',
      category: 'concentration',
      text: `High geographic concentration: ${concentrationPercentage}% of members from top 3 regions (${topRegions
        .map((g) => g.state)
        .join(', ')}).`,
      priority: 'medium',
      dataPoints: ['geography'],
      recommendations: [
        'Consider expansion to underrepresented regions',
        'Develop regional outreach strategies',
        'Analyze barriers to geographic diversity',
      ],
    });
  }

  // Identify dominant state/region
  if (sortedGeo.length > 0) {
    const dominantRegion = sortedGeo[0];
    const dominantPercentage = Math.round(
      (dominantRegion.count / totalUsers) * 100
    );

    if (dominantPercentage > 50) {
      insights.push({
        type: 'geographic',
        category: 'dominance',
        text: `${dominantRegion.state} dominates with ${dominantPercentage}% of ${context} membership.`,
        priority: dominantPercentage > 70 ? 'high' : 'medium',
        dataPoints: ['geography'],
        recommendations: [
          'Strengthen presence in other states',
          'Analyze success factors in dominant region',
          'Consider regional leadership structure',
        ],
      });
    }
  }

  // Geographic diversity insights
  if (geography.length >= 5) {
    insights.push({
      type: 'geographic',
      category: 'diversity',
      text: `Good geographic diversity with presence in ${geography.length} states/regions.`,
      priority: 'low',
      dataPoints: ['geography'],
      recommendations: [
        'Maintain regional engagement strategies',
        'Consider regional coordination programs',
      ],
    });
  } else if (geography.length <= 2) {
    insights.push({
      type: 'geographic',
      category: 'diversity',
      text: `Limited geographic reach with presence in only ${geography.length} state(s).`,
      priority: 'medium',
      dataPoints: ['geography'],
      recommendations: [
        'Develop expansion strategy',
        'Identify target regions for growth',
        'Build partnerships in new areas',
      ],
    });
  }

  return insights;
};

/**
 * Generate facility insights
 * @param {Object} facility
 * @param {string} context
 * @returns {Array} insights
 */
const generateFacilityInsights = (facility, context = 'node') => {
  const insights = [];

  if (!facility) return insights;

  // Property ownership insights
  if (facility.propertyStatus) {
    const status = facility.propertyStatus.toLowerCase();

    if (status === 'rented') {
      insights.push({
        type: 'facility',
        category: 'property',
        text: 'Operating from rented facility - property acquisition opportunity exists.',
        priority: 'medium',
        dataPoints: ['facility.propertyStatus'],
        recommendations: [
          'Evaluate property purchase feasibility',
          'Develop property acquisition fund',
          'Negotiate favorable lease terms',
        ],
      });
    } else if (status === 'owned') {
      insights.push({
        type: 'facility',
        category: 'property',
        text: 'Strong foundation with owned property - asset security achieved.',
        priority: 'low',
        dataPoints: ['facility.propertyStatus'],
        recommendations: [
          'Consider property value appreciation',
          'Maintain property insurance coverage',
        ],
      });
    } else if (status === 'leased') {
      insights.push({
        type: 'facility',
        category: 'property',
        text: 'Long-term leased facility provides stability with flexibility.',
        priority: 'low',
        dataPoints: ['facility.propertyStatus'],
        recommendations: [
          'Monitor lease renewal terms',
          'Evaluate purchase option if available',
        ],
      });
    }
  }

  // Facility status insights
  if (facility.facilityStatus) {
    const status = facility.facilityStatus.toLowerCase();

    if (status === 'under construction') {
      insights.push({
        type: 'facility',
        category: 'status',
        text: 'Facility under construction - monitor completion timeline and budget.',
        priority: 'high',
        dataPoints: ['facility.facilityStatus'],
        recommendations: [
          'Track construction progress regularly',
          'Ensure adequate funding for completion',
          'Plan for operational transition',
        ],
      });
    } else if (status === 'inactive') {
      insights.push({
        type: 'facility',
        category: 'status',
        text: 'Inactive facility status may indicate operational challenges.',
        priority: 'high',
        dataPoints: ['facility.facilityStatus'],
        recommendations: [
          'Investigate reasons for inactivity',
          'Develop reactivation plan',
          'Consider alternative uses',
        ],
      });
    }
  }

  // Establishment age insights
  if (facility.establishmentAge !== undefined) {
    const age = facility.establishmentAge;

    if (age < 2) {
      insights.push({
        type: 'facility',
        category: 'maturity',
        text: `New establishment (${age} year${
          age !== 1 ? 's' : ''
        } old) - focus on growth and stability.`,
        priority: 'medium',
        dataPoints: ['facility.establishmentAge'],
        recommendations: [
          'Implement growth strategies',
          'Build community relationships',
          'Establish operational procedures',
        ],
      });
    } else if (age > 20) {
      insights.push({
        type: 'facility',
        category: 'maturity',
        text: `Mature establishment (${age} years old) - consider renewal and modernization.`,
        priority: 'medium',
        dataPoints: ['facility.establishmentAge'],
        recommendations: [
          'Evaluate facility modernization needs',
          'Plan for infrastructure updates',
          'Celebrate milestone achievements',
        ],
      });
    } else if (age >= 5 && age <= 15) {
      insights.push({
        type: 'facility',
        category: 'maturity',
        text: `Established ${context} (${age} years old) with good foundation for continued growth.`,
        priority: 'low',
        dataPoints: ['facility.establishmentAge'],
        recommendations: [
          'Leverage established reputation',
          'Plan strategic expansion',
        ],
      });
    }
  }

  // Hierarchy insights
  if (facility.hierarchy) {
    const { depth, parentCount } = facility.hierarchy;

    if (depth > 5) {
      insights.push({
        type: 'facility',
        category: 'hierarchy',
        text: `Deep organizational hierarchy (${depth} levels) may impact communication efficiency.`,
        priority: 'medium',
        dataPoints: ['facility.hierarchy.depth'],
        recommendations: [
          'Review organizational structure',
          'Consider flattening hierarchy',
          'Improve communication channels',
        ],
      });
    }

    if (parentCount === 0) {
      insights.push({
        type: 'facility',
        category: 'hierarchy',
        text: 'Top-level node with full autonomy and responsibility.',
        priority: 'low',
        dataPoints: ['facility.hierarchy.parentCount'],
        recommendations: [
          'Ensure strong governance structure',
          'Consider mentoring other nodes',
        ],
      });
    }
  }

  return insights;
};

/**
 * Generate network-level insights
 * @param {Object} networkMetrics
 * @returns {Array} insights
 */
const generateNetworkInsights = (networkMetrics) => {
  const insights = [];

  if (!networkMetrics) return insights;

  const {
    totalNodes,
    activeNodes,
    nodesByProperty,
    nodesByFacility,
    regionalDistribution,
    establishmentStats,
  } = networkMetrics;

  // Network size insights
  if (totalNodes < 5) {
    insights.push({
      type: 'operational',
      category: 'network-size',
      text: `Small network with ${totalNodes} nodes - significant growth potential exists.`,
      priority: 'medium',
      dataPoints: ['network.totalNodes'],
      recommendations: [
        'Develop network expansion strategy',
        'Identify target locations for new nodes',
        'Build partnerships for growth',
      ],
    });
  } else if (totalNodes > 50) {
    insights.push({
      type: 'operational',
      category: 'network-size',
      text: `Large network with ${totalNodes} nodes - focus on coordination and management efficiency.`,
      priority: 'medium',
      dataPoints: ['network.totalNodes'],
      recommendations: [
        'Implement regional management structure',
        'Develop standardized procedures',
        'Invest in communication systems',
      ],
    });
  }

  // Node activity insights
  if (totalNodes > 0) {
    const inactivePercentage = Math.round(
      ((totalNodes - activeNodes) / totalNodes) * 100
    );

    if (inactivePercentage > 20) {
      insights.push({
        type: 'operational',
        category: 'activity',
        text: `${inactivePercentage}% of nodes are inactive - operational efficiency concern.`,
        priority: 'high',
        dataPoints: ['network.activeNodes', 'network.totalNodes'],
        recommendations: [
          'Investigate reasons for node inactivity',
          'Develop node reactivation programs',
          'Consider resource reallocation',
        ],
      });
    }
  }

  // Property ownership insights
  const totalPropertyNodes = Object.values(nodesByProperty).reduce(
    (sum, count) => sum + count,
    0
  );
  if (totalPropertyNodes > 0) {
    const ownedPercentage = Math.round(
      (nodesByProperty.owned / totalPropertyNodes) * 100
    );
    const rentedPercentage = Math.round(
      (nodesByProperty.rented / totalPropertyNodes) * 100
    );

    if (rentedPercentage > 60) {
      insights.push({
        type: 'facility',
        category: 'property',
        text: `${rentedPercentage}% of facilities are rented - significant property acquisition opportunities exist.`,
        priority: 'medium',
        dataPoints: ['network.nodesByProperty'],
        recommendations: [
          'Develop network-wide property acquisition strategy',
          'Create property investment fund',
          'Prioritize high-value locations for purchase',
        ],
      });
    } else if (ownedPercentage > 80) {
      insights.push({
        type: 'facility',
        category: 'property',
        text: `Strong asset base with ${ownedPercentage}% of facilities owned.`,
        priority: 'low',
        dataPoints: ['network.nodesByProperty'],
        recommendations: [
          'Leverage property assets for expansion',
          'Consider property value optimization',
        ],
      });
    }
  }

  // Facility status insights
  const totalFacilityNodes = Object.values(nodesByFacility).reduce(
    (sum, count) => sum + count,
    0
  );
  if (totalFacilityNodes > 0 && nodesByFacility.underConstruction > 0) {
    const constructionPercentage = Math.round(
      (nodesByFacility.underConstruction / totalFacilityNodes) * 100
    );

    insights.push({
      type: 'facility',
      category: 'construction',
      text: `${nodesByFacility.underConstruction} facilities under construction (${constructionPercentage}% of network) - monitor completion progress.`,
      priority: 'high',
      dataPoints: ['network.nodesByFacility.underConstruction'],
      recommendations: [
        'Track construction timelines across network',
        'Ensure adequate funding for all projects',
        'Coordinate construction management',
      ],
    });
  }

  // Regional distribution insights
  if (regionalDistribution && regionalDistribution.length > 0) {
    const totalRegionalUsers = regionalDistribution.reduce(
      (sum, region) => sum + region.users,
      0
    );
    const sortedRegions = regionalDistribution.sort(
      (a, b) => b.users - a.users
    );

    if (sortedRegions.length >= 3) {
      const topThreeUsers = sortedRegions
        .slice(0, 3)
        .reduce((sum, region) => sum + region.users, 0);
      const concentrationPercentage = Math.round(
        (topThreeUsers / totalRegionalUsers) * 100
      );

      if (concentrationPercentage > 75) {
        insights.push({
          type: 'geographic',
          category: 'concentration',
          text: `High regional concentration: ${concentrationPercentage}% of network users in top 3 regions.`,
          priority: 'medium',
          dataPoints: ['network.regionalDistribution'],
          recommendations: [
            'Develop expansion strategy for underrepresented regions',
            'Analyze success factors in dominant regions',
            'Create regional balance initiatives',
          ],
        });
      }
    }
  }

  // Establishment maturity insights
  if (establishmentStats) {
    const { averageAge, oldestNode, newestNode } = establishmentStats;

    if (averageAge > 0) {
      if (averageAge < 3) {
        insights.push({
          type: 'operational',
          category: 'maturity',
          text: `Young network with average node age of ${averageAge} years - focus on stabilization and growth.`,
          priority: 'medium',
          dataPoints: ['network.establishmentStats.averageAge'],
          recommendations: [
            'Implement network-wide best practices',
            'Provide support for new nodes',
            'Build institutional knowledge',
          ],
        });
      } else if (averageAge > 15) {
        insights.push({
          type: 'operational',
          category: 'maturity',
          text: `Mature network with average node age of ${averageAge} years - consider modernization and renewal.`,
          priority: 'medium',
          dataPoints: ['network.establishmentStats.averageAge'],
          recommendations: [
            'Plan network-wide modernization',
            'Update systems and processes',
            'Prepare for leadership transitions',
          ],
        });
      }
    }

    if (oldestNode - newestNode > 20) {
      insights.push({
        type: 'operational',
        category: 'diversity',
        text: `Wide age range in network (${newestNode}-${oldestNode} years) - leverage experience diversity.`,
        priority: 'low',
        dataPoints: ['network.establishmentStats'],
        recommendations: [
          'Create mentorship programs between old and new nodes',
          'Share best practices across age groups',
          'Balance innovation with experience',
        ],
      });
    }
  }

  return insights;
};

/**
 * Generate all insights for baseline data
 * @param {Object} baseline - Baseline intelligence document
 * @param {string} tenantId - Tenant ID (optional, for fetching analysis config)
 * @returns {Promise<Array>} all generated insights
 */
const generateAllInsights = async (baseline, tenantId = null) => {
  const insights = [];

  if (!baseline || !baseline.metrics) {
    return insights;
  }

  const { type, metrics } = baseline;

  // Get analysis config if tenantId is provided
  let userAnalysisConfig = null;
  let nodeAnalysisConfig = null;
  if (tenantId) {
    try {
      userAnalysisConfig =
        await baselineAnalysisConfigService.getAnalysisConfig(tenantId, 'user');
      nodeAnalysisConfig =
        await baselineAnalysisConfigService.getAnalysisConfig(tenantId, 'node');
    } catch (error) {
      logger.error('Error fetching analysis config for insights:', error);
      // Continue without config (backward compatible)
    }
  }

  // Generate user demographic insights with config
  if (metrics.users) {
    insights.push(
      ...generateDemographicInsights(metrics.users, type, userAnalysisConfig)
    );

    if (metrics.users.geography) {
      insights.push(
        ...generateGeographicInsights(metrics.users.geography, type)
      );
    }
  }

  // Generate facility insights (for node-level baselines)
  if (type === 'node' && metrics.facility) {
    insights.push(...generateFacilityInsights(metrics.facility, type));
  }

  // Generate network insights (for network-level baselines)
  if (type === 'network' && metrics.network) {
    insights.push(...generateNetworkInsights(metrics.network));
  }

  // Generate custom field insights with analysis config
  if (metrics.customAnalytics) {
    if (metrics.customAnalytics.users) {
      insights.push(
        ...generateCustomFieldInsights(
          metrics.customAnalytics.users,
          userAnalysisConfig
        )
      );
    }
    if (metrics.customAnalytics.node) {
      insights.push(
        ...generateCustomFieldInsights(
          metrics.customAnalytics.node,
          nodeAnalysisConfig
        )
      );
    }
    if (metrics.customAnalytics.nodes) {
      insights.push(
        ...generateCustomFieldInsights(
          metrics.customAnalytics.nodes,
          nodeAnalysisConfig
        )
      );
    }
  }

  // Apply global insight rules from config
  if (userAnalysisConfig?.globalSettings?.insightRules) {
    const globalInsights = generateGlobalInsights(
      metrics,
      userAnalysisConfig.globalSettings.insightRules
    );
    insights.push(...globalInsights);
  }

  // Sort insights by priority
  const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  insights.sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]
  );

  return insights;
};;

/**
 * Generate insights from global insight rules
 * @param {Object} metrics - Baseline metrics
 * @param {Array} insightRules - Global insight rules from config
 * @returns {Array} generated insights
 */
const generateGlobalInsights = (metrics, insightRules) => {
  const insights = [];

  if (!insightRules || !Array.isArray(insightRules)) {
    return insights;
  }

  insightRules.forEach((rule) => {
    if (!rule.enabled) {
      return; // Skip disabled rules
    }

    try {
      // Get metric value from nested metrics object
      const metricValue = getNestedMetricValue(metrics, rule.metric);

      if (metricValue === null || metricValue === undefined) {
        return; // Metric not found, skip rule
      }

      // Evaluate condition
      const conditionMet = evaluateInsightCondition(
        metricValue,
        rule.condition
      );

      if (conditionMet) {
        insights.push({
          type: 'global-rule',
          category: 'custom',
          text: rule.message,
          priority: rule.priority || 'medium',
          dataPoints: [rule.metric],
          recommendations: rule.recommendations || [],
        });
      }
    } catch (error) {
      logger.error(`Error evaluating global insight rule "${rule.id}":`, error);
    }
  });

  return insights;
};

/**
 * Get nested metric value from metrics object
 * @param {Object} metrics - Metrics object
 * @param {string} metricPath - Dot-separated path (e.g., "users.hierarchy.owners")
 * @returns {*} Metric value or null
 */
const getNestedMetricValue = (metrics, metricPath) => {
  try {
    const parts = metricPath.split('.');
    let value = metrics;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value[part];
    }

    return value;
  } catch (error) {
    logger.error(
      `Error getting nested metric value for "${metricPath}":`,
      error
    );
    return null;
  }
};

/**
 * Evaluate insight condition (simple evaluator)
 * @param {*} value - Metric value
 * @param {string} condition - Condition string (e.g., "value < 50")
 * @returns {boolean} Whether condition is met
 */
const evaluateInsightCondition = (value, condition) => {
  try {
    // Replace "value" with actual value
    let evalString = condition.replace(/\bvalue\b/g, value);

    // Evaluate the condition (use Function constructor for safety)
    return new Function('return ' + evalString)();
  } catch (error) {
    logger.error(`Error evaluating condition "${condition}":`, error);
    return false;
  }
};

/**
 * Get insights for a baseline
 * @param {string} tenantId 
 * @param {string} nodeId - null for network insights
 * @param {Object} options - filtering options
 * @returns {Promise<Array>} insights
 */
const getInsights = async (tenantId, nodeId = null, options = {}) => {
  try {
    const { priority, type, limit = 50 } = options;
    
    const insights = await BaselineIntelligence.getInsights(tenantId, nodeId, priority, type);
    
    return insights.slice(0, limit);
  } catch (error) {
    logger.error('Error getting insights:', error);
    throw error;
  }
};

module.exports = {
  generateAllInsights,
  generateDemographicInsights,
  generateGeographicInsights,
  generateFacilityInsights,
  generateNetworkInsights,
  getInsights,
};
