const logger = require('../config/logger');

/**
 * Custom Field Analytics Service
 * Provides flexible analysis for tenant-specific custom fields
 */

/**
 * Analyze numeric custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration
 * @returns {Object} numeric analytics
 */
const analyzeNumericField = (records, fieldConfig) => {
  const { fieldName, displayName, fieldType = 'number' } = fieldConfig;
  
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

  // Calculate statistics
  const total = values.reduce((sum, val) => sum + val, 0);
  const average = total / values.length;
  const sortedValues = [...values].sort((a, b) => a - b);
  const median = sortedValues.length % 2 === 0
    ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
    : sortedValues[Math.floor(sortedValues.length / 2)];
  
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);

  // Create distribution ranges
  const distribution = createNumericDistribution(values, min, max);

  return {
    fieldName,
    displayName,
    fieldType,
    statistics: {
      total: Math.round(total * 100) / 100,
      average: Math.round(average * 100) / 100,
      median: Math.round(median * 100) / 100,
      min,
      max,
      count: values.length,
      standardDeviation: Math.round(standardDeviation * 100) / 100
    },
    distribution
  };
};

/**
 * Create numeric distribution ranges
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
 * Analyze categorical custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration
 * @returns {Object} categorical analytics
 */
const analyzeCategoricalField = (records, fieldConfig) => {
  const { fieldName, displayName } = fieldConfig;
  
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

  // Create value distribution
  const valueDistribution = Object.entries(valueCounts)
    .map(([value, count]) => ({
      value,
      count,
      percentage: Math.round((count / values.length) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  const mostCommon = valueDistribution.length > 0 ? valueDistribution[0].value : null;
  const diversity = Object.keys(valueCounts).length;

  return {
    fieldName,
    displayName,
    values: valueDistribution,
    mostCommon,
    diversity
  };
};

/**
 * Analyze date/temporal custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration
 * @returns {Object} temporal analytics
 */
const analyzeTemporalField = (records, fieldConfig) => {
  const { fieldName, displayName } = fieldConfig;
  
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
  const earliest = sortedDates[0];
  const latest = sortedDates[sortedDates.length - 1];
  const now = new Date();
  
  // Calculate average age in days
  const totalAge = dates.reduce((sum, date) => sum + (now - date), 0);
  const averageAge = Math.round(totalAge / (dates.length * 24 * 60 * 60 * 1000)); // Convert to days

  return {
    fieldName,
    displayName,
    statistics: {
      earliest,
      latest,
      averageAge,
      count: dates.length
    },
    patterns: [] // Could be enhanced with trend analysis
  };
};

/**
 * Analyze boolean custom fields
 * @param {Array} records - Array of records with custom fields
 * @param {Object} fieldConfig - Field configuration
 * @returns {Object} boolean analytics
 */
const analyzeBooleanField = (records, fieldConfig) => {
  const { fieldName, displayName } = fieldConfig;
  
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

  return {
    fieldName,
    displayName,
    trueCount,
    falseCount,
    truePercentage,
    nullCount
  };
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
 * @param {string} tenantId - Tenant identifier
 * @param {string} entityType - 'user' or 'node'
 * @returns {Promise<Array>} field configurations
 */
const getCustomFieldConfig = async (tenantId, entityType) => {
  try {
    // This would typically come from a tenant configuration service
    // For now, we'll return a sample configuration
    const { TenantConfig } = require('../models');
    
    const config = await TenantConfig.findOne({ 
      tenantId, 
      entityType 
    });

    return config?.fields || [];
  } catch (error) {
    logger.error('Error getting custom field config:', error);
    return [];
  }
};

/**
 * Generate insights from custom field analytics
 * @param {Object} customAnalytics - Custom field analytics
 * @returns {Array} generated insights
 */
const generateCustomFieldInsights = (customAnalytics) => {
  const insights = [];

  // Numeric field insights
  customAnalytics.numeric?.forEach(field => {
    const { displayName, statistics } = field;
    
    if (statistics.count > 0) {
      // High variation insight
      if (statistics.standardDeviation > statistics.average * 0.5) {
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

module.exports = {
  analyzeCustomFields,
  getCustomFieldConfig,
  generateCustomFieldInsights,
  analyzeNumericField,
  analyzeCategoricalField,
  analyzeTemporalField,
  analyzeBooleanField,
};
