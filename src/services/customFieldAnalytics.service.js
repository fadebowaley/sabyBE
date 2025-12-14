const logger = require('../config/logger');
const baselineAnalysisConfigService = require('./baselineAnalysisConfig.service');

/**
 * Custom Field Analytics Service
 * Provides flexible analysis for tenant-specific custom fields
 * Now integrates with BaselineAnalysisConfig for tenant-specific analysis settings
 */

/**
 * Analyze numeric custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration with analysis settings
 * @returns {Object} numeric analytics
 */
const analyzeNumericField = (records, fieldConfig) => {
  const { fieldName, displayName, fieldType = 'number', analysisConfig } = fieldConfig;
  const numericConfig = analysisConfig?.numeric || {};
  const statisticsConfig = numericConfig.statistics || { enabled: true, include: {} };
  
  // Extract values, filtering out null/undefined
  const values = records
    .map(record => record.customFields?.[fieldName])
    .filter(value => value !== null && value !== undefined && !isNaN(value))
    .map(value => Number(value));

  if (values.length === 0) {
    return {
      fieldName,
      displayName,
      fieldType,
      statistics: {
        total: 0,
        average: 0,
        median: 0,
        min: 0,
        max: 0,
        count: 0,
        standardDeviation: 0
      },
      distribution: []
    };
  }

  // Calculate statistics (only if enabled)
  const stats = {};
  if (statisticsConfig.enabled !== false) {
    if (statisticsConfig.include?.total !== false) {
      stats.total = values.reduce((sum, val) => sum + val, 0);
    }
    
    if (statisticsConfig.include?.average !== false || statisticsConfig.include?.total !== false) {
      stats.average = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    if (statisticsConfig.include?.median !== false) {
      const sortedValues = [...values].sort((a, b) => a - b);
      stats.median = sortedValues.length % 2 === 0
        ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
        : sortedValues[Math.floor(sortedValues.length / 2)];
    }
    
    if (statisticsConfig.include?.min !== false) {
      stats.min = Math.min(...values);
    }
    
    if (statisticsConfig.include?.max !== false) {
      stats.max = Math.max(...values);
    }
    
    if (statisticsConfig.include?.standardDeviation !== false) {
      const avg = stats.average || (values.reduce((sum, val) => sum + val, 0) / values.length);
      const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
      stats.standardDeviation = Math.sqrt(variance);
    }
    
    stats.count = values.length;
  }

  // Round numeric values
  Object.keys(stats).forEach(key => {
    if (typeof stats[key] === 'number' && key !== 'count') {
      stats[key] = Math.round(stats[key] * 100) / 100;
    }
  });

  // Create distribution (only if enabled)
  let distribution = [];
  if (numericConfig.distribution?.enabled !== false) {
    const min = stats.min || Math.min(...values);
    const max = stats.max || Math.max(...values);
    
    if (numericConfig.distribution?.ranges === 'custom' && numericConfig.distribution?.customRanges) {
      // Use custom ranges
      distribution = createCustomNumericDistribution(values, numericConfig.distribution.customRanges);
    } else {
      // Use auto ranges
      distribution = createNumericDistribution(values, min, max);
    }
  }

  return {
    fieldName,
    displayName,
    fieldType,
    format: numericConfig.format || 'number',
    statistics: stats,
    distribution,
    thresholds: numericConfig.thresholds || null
  };
};

/**
 * Create numeric distribution ranges (auto)
 * @param {Array} values - Numeric values
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {Array} distribution ranges
 */
const createNumericDistribution = (values, min, max) => {
  if (values.length === 0 || min === max) return [];

  const numRanges = Math.min(10, Math.ceil(Math.sqrt(values.length))); // Optimal number of ranges
  const rangeSize = (max - min) / numRanges;
  const distribution = [];

  for (let i = 0; i < numRanges; i++) {
    const rangeMin = min + (i * rangeSize);
    const rangeMax = i === numRanges - 1 ? max : min + ((i + 1) * rangeSize);
    
    const count = values.filter(val => 
      val >= rangeMin && (i === numRanges - 1 ? val <= rangeMax : val < rangeMax)
    ).length;

    if (count > 0) {
      distribution.push({
        range: `${Math.round(rangeMin)}-${Math.round(rangeMax)}`,
        count,
        percentage: Math.round((count / values.length) * 100)
      });
    }
  }

  return distribution;
};

/**
 * Create numeric distribution using custom ranges
 * @param {Array} values - Numeric values
 * @param {Array} customRanges - Custom range definitions [{name, min, max}]
 * @returns {Array} distribution ranges
 */
const createCustomNumericDistribution = (values, customRanges) => {
  if (values.length === 0 || !customRanges || customRanges.length === 0) return [];

  const distribution = [];

  customRanges.forEach(range => {
    const count = values.filter(val => val >= range.min && val <= range.max).length;
    
    if (count > 0) {
      distribution.push({
        range: range.name || `${range.min}-${range.max}`,
        count,
        percentage: Math.round((count / values.length) * 100)
      });
    }
  });

  return distribution;
};

/**
 * Analyze categorical custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration with analysis settings
 * @returns {Object} categorical analytics
 */
const analyzeCategoricalField = (records, fieldConfig) => {
  const { fieldName, displayName, analysisConfig } = fieldConfig;
  const categoricalConfig = analysisConfig?.categorical || {};
  const distributionConfig = categoricalConfig.distribution || { enabled: true, topN: 10 };
  const diversityConfig = categoricalConfig.diversity || { enabled: true };
  
  // Extract values, filtering out null/undefined
  const values = records
    .map(record => record.customFields?.[fieldName])
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(value => String(value));

  if (values.length === 0) {
    return {
      fieldName,
      displayName,
      values: [],
      mostCommon: null,
      diversity: 0
    };
  }

  // Count occurrences
  const valueCounts = {};
  values.forEach(value => {
    valueCounts[value] = (valueCounts[value] || 0) + 1;
  });

  // Create value distribution (only if enabled)
  let valueDistribution = [];
  if (distributionConfig.enabled !== false) {
    valueDistribution = Object.entries(valueCounts)
      .map(([value, count]) => ({
        value,
        count,
        percentage: Math.round((count / values.length) * 100)
      }))
      .sort((a, b) => b.count - a.count);
    
    // Limit to topN if configured
    if (distributionConfig.topN && distributionConfig.topN > 0) {
      valueDistribution = valueDistribution.slice(0, distributionConfig.topN);
    }
  }

  const mostCommon = valueDistribution.length > 0 ? valueDistribution[0].value : null;
  const diversity = diversityConfig.enabled !== false ? Object.keys(valueCounts).length : null;

  return {
    fieldName,
    displayName,
    values: valueDistribution,
    mostCommon,
    diversity,
    maxUniqueValues: diversityConfig.maxUniqueValues || null
  };
};

/**
 * Analyze date/temporal custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration with analysis settings
 * @returns {Object} temporal analytics
 */
const analyzeTemporalField = (records, fieldConfig) => {
  const { fieldName, displayName, analysisConfig } = fieldConfig;
  const temporalConfig = analysisConfig?.temporal || {};
  const analysisSettings = temporalConfig.analysis || {};
  
  // Extract and parse dates
  const dates = records
    .map(record => {
      const value = record.customFields?.[fieldName];
      if (!value) return null;
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    })
    .filter(date => date !== null);

  if (dates.length === 0) {
    return {
      fieldName,
      displayName,
      statistics: {
        earliest: null,
        latest: null,
        averageAge: 0,
        count: 0
      },
      patterns: []
    };
  }

  const sortedDates = dates.sort((a, b) => a - b);
  const stats = {
    count: dates.length
  };

  // Calculate statistics based on config
  if (analysisSettings.earliest !== false) {
    stats.earliest = sortedDates[0];
  }
  
  if (analysisSettings.latest !== false) {
    stats.latest = sortedDates[sortedDates.length - 1];
  }
  
  if (analysisSettings.averageAge !== false) {
    const now = new Date();
    const totalAge = dates.reduce((sum, date) => sum + (now - date), 0);
    stats.averageAge = Math.round(totalAge / (dates.length * 24 * 60 * 60 * 1000)); // Convert to days
  }

  return {
    fieldName,
    displayName,
    statistics: stats,
    patterns: analysisSettings.trends ? [] : null // Could be enhanced with trend analysis
  };
};

/**
 * Analyze boolean custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration with analysis settings
 * @returns {Object} boolean analytics
 */
const analyzeBooleanField = (records, fieldConfig) => {
  const { fieldName, displayName, analysisConfig } = fieldConfig;
  const booleanConfig = analysisConfig?.boolean || {};
  const analysisSettings = booleanConfig.analysis || {};
  
  let trueCount = 0;
  let falseCount = 0;
  let nullCount = 0;

  records.forEach(record => {
    const value = record.customFields?.[fieldName];
    if (value === true || value === 'true' || value === 1) {
      trueCount++;
    } else if (value === false || value === 'false' || value === 0) {
      falseCount++;
    } else {
      nullCount++;
    }
  });

  const totalDefined = trueCount + falseCount;
  const truePercentage = totalDefined > 0 ? Math.round((trueCount / totalDefined) * 100) : 0;

  const result = {
    fieldName,
    displayName
  };

  // Only include statistics if enabled
  if (analysisSettings.trueCount !== false) {
    result.trueCount = trueCount;
  }
  
  if (analysisSettings.falseCount !== false) {
    result.falseCount = falseCount;
  }
  
  if (analysisSettings.percentage !== false) {
    result.truePercentage = truePercentage;
  }
  
  result.nullCount = nullCount; // Always include null count for data quality

  return result;
};

/**
 * Analyze all custom fields for a set of records
 * @param {Array} records - Array of user or node records
 * @param {Array} fieldConfigs - Array of field configurations
 * @returns {Object} complete custom field analytics
 */
const analyzeCustomFields = (records, fieldConfigs) => {
  const analytics = {
    numeric: [],
    categorical: [],
    temporal: [],
    boolean: []
  };

  if (!fieldConfigs || fieldConfigs.length === 0) {
    return analytics;
  }

  fieldConfigs.forEach(config => {
    try {
      switch (config.type) {
        case 'number':
        case 'currency':
        case 'percentage':
          analytics.numeric.push(analyzeNumericField(records, config));
          break;
          
        case 'select':
        case 'radio':
        case 'text':
          analytics.categorical.push(analyzeCategoricalField(records, config));
          break;
          
        case 'multi-select':
          // Handle multi-select fields: extract all values from arrays
          const multiSelectRecords = records.map(record => {
            const value = record.customFields?.[config.fieldName];
            if (Array.isArray(value) && value.length > 0) {
              // Create a record for each value in the array
              return value.map(v => ({
                ...record,
                customFields: {
                  ...record.customFields,
                  [config.fieldName]: String(v)
                }
              }));
            }
            // If not an array or empty, treat as single value
            return [{
              ...record,
              customFields: {
                ...record.customFields,
                [config.fieldName]: value ? String(value) : null
              }
            }];
          }).flat();
          
          // Analyze flattened records as categorical
          analytics.categorical.push(analyzeCategoricalField(multiSelectRecords, config));
          break;
          
        case 'date':
        case 'datetime':
          analytics.temporal.push(analyzeTemporalField(records, config));
          break;
          
        case 'checkbox':
        case 'boolean':
          analytics.boolean.push(analyzeBooleanField(records, config));
          break;
          
        default:
          // Default to categorical for unknown types
          analytics.categorical.push(analyzeCategoricalField(records, config));
      }
    } catch (error) {
      logger.error(`Error analyzing custom field ${config.fieldName}:`, error);
    }
  });

  return analytics;
};

/**
 * Get custom field configuration for a tenant
 * Merges TenantConfig field definitions with BaselineAnalysisConfig analysis settings
 * @param {string} tenantId - Tenant identifier
 * @param {string} entityType - 'user' or 'node'
 * @returns {Promise<Array>} enriched field configurations with analysis settings
 */
const getCustomFieldConfig = async (tenantId, entityType) => {
  try {
    const { TenantConfig } = require('../models');
    
    // Get field definitions from TenantConfig
    const tenantConfig = await TenantConfig.findOne({ 
      tenantId, 
      entityType 
    });

    if (!tenantConfig || !tenantConfig.fields || tenantConfig.fields.length === 0) {
      return [];
    }

    // Get analysis config from BaselineAnalysisConfig
    const analysisConfig = await baselineAnalysisConfigService.getAnalysisConfig(tenantId, entityType);

    // Merge field definitions with analysis settings
    const enrichedFields = tenantConfig.fields
      .filter(field => field.analytics?.enabled === true) // Only include fields with analytics enabled
      .map(field => {
        // Find corresponding analysis config for this field
        const fieldAnalysisConfig = analysisConfig?.customFields?.find(
          cf => cf.fieldId === field.id
        );

        // Determine analysis type
        let analysisType = fieldAnalysisConfig?.analysis?.type;
        if (!analysisType) {
          // Auto-map from field type
          analysisType = mapFieldTypeToAnalysisType(field.type, field.analytics);
        }

        // Build enriched config
        const enrichedConfig = {
          fieldName: field.id,
          displayName: fieldAnalysisConfig?.analysis?.display?.label || field.label,
          type: analysisType,
          fieldType: field.type,
          description: fieldAnalysisConfig?.analysis?.display?.description || field.description,
          unit: fieldAnalysisConfig?.analysis?.display?.unit || '',
          order: fieldAnalysisConfig?.analysis?.display?.order || field.ui?.order || 0,
          category: fieldAnalysisConfig?.analysis?.display?.category || '',
          chartType: fieldAnalysisConfig?.analysis?.display?.chartType || 'bar',
        };

        // Add type-specific analysis settings
        if (fieldAnalysisConfig?.analysis) {
          enrichedConfig.analysisConfig = fieldAnalysisConfig.analysis;
          
          // Add numeric-specific settings
          if (analysisType === 'numeric' && fieldAnalysisConfig.analysis.numeric) {
            enrichedConfig.format = fieldAnalysisConfig.analysis.numeric.format || 'number';
            enrichedConfig.statistics = fieldAnalysisConfig.analysis.numeric.statistics;
            enrichedConfig.distribution = fieldAnalysisConfig.analysis.numeric.distribution;
            enrichedConfig.thresholds = fieldAnalysisConfig.analysis.numeric.thresholds;
          }
          
          // Add categorical-specific settings
          if (analysisType === 'categorical' && fieldAnalysisConfig.analysis.categorical) {
            enrichedConfig.distribution = fieldAnalysisConfig.analysis.categorical.distribution;
            enrichedConfig.diversity = fieldAnalysisConfig.analysis.categorical.diversity;
          }
          
          // Add temporal-specific settings
          if (analysisType === 'temporal' && fieldAnalysisConfig.analysis.temporal) {
            enrichedConfig.includeTime = fieldAnalysisConfig.analysis.temporal.includeTime;
            enrichedConfig.temporalAnalysis = fieldAnalysisConfig.analysis.temporal.analysis;
          }
          
          // Add boolean-specific settings
          if (analysisType === 'boolean' && fieldAnalysisConfig.analysis.boolean) {
            enrichedConfig.booleanAnalysis = fieldAnalysisConfig.analysis.boolean.analysis;
          }
          
          // Add insight rules
          if (fieldAnalysisConfig.analysis.insights) {
            enrichedConfig.insights = fieldAnalysisConfig.analysis.insights;
          }
        }

        return enrichedConfig;
      })
      .sort((a, b) => a.order - b.order); // Sort by display order

    return enrichedFields;
  } catch (error) {
    logger.error('Error getting custom field config:', error);
    return [];
  }
};

/**
 * Map TenantConfig field type to analysis type
 * @param {string} fieldType - Field type from TenantConfig
 * @param {Object} analytics - Analytics metadata from field
 * @returns {string} Analysis type
 */
const mapFieldTypeToAnalysisType = (fieldType, analytics = {}) => {
  const mapping = {
    text: 'categorical',
    textarea: 'categorical',
    number: 'numeric',
    date: analytics?.includeTime ? 'temporal' : 'temporal',
    boolean: 'boolean',
    select: 'categorical',
    'multi-select': 'categorical',
    attachment: 'categorical',
  };

  return mapping[fieldType] || 'categorical';
};

/**
 * Generate insights from custom field analytics
 * Uses insight rules from BaselineAnalysisConfig if available
 * @param {Object} customAnalytics - Custom field analytics
 * @param {Object} analysisConfig - BaselineAnalysisConfig (optional)
 * @returns {Array} generated insights
 */
const generateCustomFieldInsights = (customAnalytics, analysisConfig = null) => {
  const insights = [];

  // Numeric field insights
  customAnalytics.numeric?.forEach(field => {
    const { displayName, statistics, fieldName, thresholds } = field;
    
    if (statistics.count > 0) {
      // Use custom insight rules if available
      const fieldAnalysisConfig = analysisConfig?.customFields?.find(cf => cf.fieldId === fieldName);
      const insightRules = fieldAnalysisConfig?.analysis?.insights?.rules || [];

      if (insightRules.length > 0 && fieldAnalysisConfig.analysis.insights.enabled !== false) {
        // Evaluate custom rules
        insightRules.forEach(rule => {
          try {
            // Simple condition evaluation (can be enhanced with a proper expression evaluator)
            const conditionMet = evaluateInsightCondition(statistics, rule.condition);
            if (conditionMet) {
              insights.push({
                type: 'custom',
                category: 'custom-rule',
                text: rule.message || `Custom insight for ${displayName}`,
                priority: rule.priority || 'medium',
                dataPoints: [`customFields.${fieldName}`],
                recommendations: rule.recommendations || []
              });
            }
          } catch (error) {
            logger.error(`Error evaluating insight rule for ${fieldName}:`, error);
          }
        });
      } else {
        // Fallback to default insights
        // High variation insight
        if (statistics.standardDeviation && statistics.average && 
            statistics.standardDeviation > statistics.average * 0.5) {
          insights.push({
            type: 'custom',
            category: 'variation',
            text: `High variation in ${displayName} (std dev: ${statistics.standardDeviation}) suggests diverse performance levels.`,
            priority: 'medium',
            dataPoints: [`customFields.${field.fieldName}`],
            recommendations: [
              `Investigate factors causing ${displayName} variation`,
              'Consider targeted interventions for outliers'
            ]
          });
        }

        // Threshold-based insights
        if (thresholds) {
          if (thresholds.warning && statistics.average < thresholds.warning.min) {
            insights.push({
              type: 'custom',
              category: 'threshold',
              text: `${displayName} average (${statistics.average}) is below warning threshold (${thresholds.warning.min}).`,
              priority: 'high',
              dataPoints: [`customFields.${fieldName}`],
              recommendations: [`Take action to improve ${displayName}`]
            });
          }
          
          if (thresholds.warning && statistics.average > thresholds.warning.max) {
            insights.push({
              type: 'custom',
              category: 'threshold',
              text: `${displayName} average (${statistics.average}) exceeds warning threshold (${thresholds.warning.max}).`,
              priority: 'high',
              dataPoints: [`customFields.${fieldName}`],
              recommendations: [`Review ${displayName} values`]
            });
          }
        }

        // Performance insights
        if (field.fieldType === 'percentage' && statistics.average < 50) {
          insights.push({
            type: 'custom',
            category: 'performance',
            text: `Low average ${displayName} (${statistics.average}%) indicates improvement opportunities.`,
            priority: 'high',
            dataPoints: [`customFields.${field.fieldName}`],
            recommendations: [
              `Develop strategies to improve ${displayName}`,
              'Analyze top performers for best practices'
            ]
          });
        }
      }
    }
  });

  // Categorical field insights
  customAnalytics.categorical?.forEach(field => {
    const { displayName, values, diversity } = field;
    
    if (values.length > 0) {
      const topValue = values[0];
      
      // Dominance insight
      if (topValue.percentage > 70) {
        insights.push({
          type: 'custom',
          category: 'distribution',
          text: `${displayName} is dominated by "${topValue.value}" (${topValue.percentage}%) - consider diversification.`,
          priority: 'medium',
          dataPoints: [`customFields.${field.fieldName}`],
          recommendations: [
            `Analyze reasons for ${topValue.value} dominance`,
            'Explore opportunities for more balanced distribution'
          ]
        });
      }

      // Diversity insight
      if (diversity > 10) {
        insights.push({
          type: 'custom',
          category: 'diversity',
          text: `High diversity in ${displayName} (${diversity} unique values) may indicate need for standardization.`,
          priority: 'low',
          dataPoints: [`customFields.${field.fieldName}`],
          recommendations: [
            'Consider standardizing categories',
            'Review data entry processes'
          ]
        });
      }
    }
  });

  // Boolean field insights
  customAnalytics.boolean?.forEach(field => {
    const { displayName, truePercentage, nullCount } = field;
    
    if (truePercentage < 20) {
      insights.push({
        type: 'custom',
        category: 'adoption',
        text: `Low ${displayName} adoption rate (${truePercentage}%) suggests barriers or lack of awareness.`,
        priority: 'medium',
        dataPoints: [`customFields.${field.fieldName}`],
        recommendations: [
          `Investigate barriers to ${displayName} adoption`,
          'Consider incentives or awareness campaigns'
        ]
      });
    }

    if (nullCount > 0) {
      insights.push({
        type: 'custom',
        category: 'data-quality',
        text: `${nullCount} records missing ${displayName} data - data collection improvement needed.`,
        priority: 'low',
        dataPoints: [`customFields.${field.fieldName}`],
        recommendations: [
          'Improve data collection processes',
          'Make field required if critical'
        ]
      });
    }
  });

  return insights;
};

/**
 * Evaluate insight condition (simple evaluator)
 * @param {Object} statistics - Field statistics
 * @param {string} condition - Condition string (e.g., "average < 50")
 * @returns {boolean} Whether condition is met
 */
const evaluateInsightCondition = (statistics, condition) => {
  try {
    // Simple condition evaluation - replace variable names with actual values
    let evalString = condition
      .replace(/\baverage\b/g, statistics.average || 0)
      .replace(/\bmedian\b/g, statistics.median || 0)
      .replace(/\bmin\b/g, statistics.min || 0)
      .replace(/\bmax\b/g, statistics.max || 0)
      .replace(/\btotal\b/g, statistics.total || 0)
      .replace(/\bcount\b/g, statistics.count || 0)
      .replace(/\bstandardDeviation\b/g, statistics.standardDeviation || 0);
    
    // Evaluate the condition (use Function constructor for safety)
    return new Function('return ' + evalString)();
  } catch (error) {
    logger.error(`Error evaluating condition "${condition}":`, error);
    return false;
  }
};

module.exports = {
  analyzeCustomFields,
  getCustomFieldConfig,
  generateCustomFieldInsights,
  analyzeNumericField,
  analyzeCategoricalField,
  analyzeTemporalField,
  analyzeBooleanField,
  mapFieldTypeToAnalysisType,
};
