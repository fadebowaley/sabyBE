const logger = require('../config/logger');
const { validateFormula } = require('./customCalculations.service');

/**
 * Baseline Analysis Config Validation Service
 * Comprehensive validation for config schema, formulas, and rules
 */

/**
 * Validate insight rule condition
 * @param {string} condition - Condition string (e.g., "value < 50", "average > 100")
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateInsightCondition = (condition) => {
  const errors = [];

  if (!condition || typeof condition !== 'string') {
    errors.push('Condition must be a non-empty string');
    return { valid: false, errors };
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /eval\s*\(/i,
    /Function\s*\(/i,
    /require\s*\(/i,
    /import\s+/i,
    /process\./i,
    /global\./i,
    /__/,
    /while\s*\(/i,
    /for\s*\(/i,
    /\.exec\s*\(/i,
    /\.spawn\s*\(/i,
  ];

  dangerousPatterns.forEach((pattern) => {
    if (pattern.test(condition)) {
      errors.push(`Condition contains potentially dangerous pattern: ${pattern}`);
    }
  });

  // Check for balanced parentheses
  const openParens = (condition.match(/\(/g) || []).length;
  const closeParens = (condition.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push('Condition has unbalanced parentheses');
  }

  // Check for balanced brackets
  const openBrackets = (condition.match(/\[/g) || []).length;
  const closeBrackets = (condition.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push('Condition has unbalanced brackets');
  }

  // Validate condition syntax (should contain comparison operators)
  const comparisonOperators = ['<', '>', '<=', '>=', '==', '===', '!=', '!=='];
  const hasOperator = comparisonOperators.some((op) => condition.includes(op));
  if (!hasOperator && !condition.match(/\b(value|average|median|min|max|total|count|standardDeviation)\b/)) {
    errors.push('Condition should contain a comparison operator (<, >, <=, >=, ==, !=) or reference a metric');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate threshold configuration
 * @param {Object} thresholds - Thresholds configuration
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateThresholds = (thresholds) => {
  const errors = [];

  if (!thresholds || typeof thresholds !== 'object') {
    return { valid: true, errors: [] }; // Thresholds are optional
  }

  // Validate leadershipRatio
  if (thresholds.leadershipRatio) {
    const { optimal, warning } = thresholds.leadershipRatio;

    if (optimal) {
      if (typeof optimal.min !== 'number' || typeof optimal.max !== 'number') {
        errors.push('Leadership ratio optimal range must have numeric min and max');
      } else if (optimal.min < 0 || optimal.min > 100) {
        errors.push('Leadership ratio optimal min must be between 0 and 100');
      } else if (optimal.max < 0 || optimal.max > 100) {
        errors.push('Leadership ratio optimal max must be between 0 and 100');
      } else if (optimal.min >= optimal.max) {
        errors.push('Leadership ratio optimal min must be less than max');
      }
    }

    if (warning) {
      if (typeof warning.min !== 'number' || typeof warning.max !== 'number') {
        errors.push('Leadership ratio warning range must have numeric min and max');
      } else if (warning.min < 0 || warning.min > 100) {
        errors.push('Leadership ratio warning min must be between 0 and 100');
      } else if (warning.max < 0 || warning.max > 100) {
        errors.push('Leadership ratio warning max must be between 0 and 100');
      } else if (warning.min >= warning.max) {
        errors.push('Leadership ratio warning min must be less than max');
      }

      if (optimal && warning) {
        // Warning range should be outside optimal range
        if (warning.min >= optimal.min && warning.max <= optimal.max) {
          errors.push('Leadership ratio warning range should be outside optimal range');
        }
      }
    }
  }

  // Validate complianceRate
  if (thresholds.complianceRate) {
    const { target, warning } = thresholds.complianceRate;

    if (typeof target !== 'number') {
      errors.push('Compliance rate target must be a number');
    } else if (target < 0 || target > 100) {
      errors.push('Compliance rate target must be between 0 and 100');
    }

    if (warning !== undefined) {
      if (typeof warning !== 'number') {
        errors.push('Compliance rate warning must be a number');
      } else if (warning < 0 || warning > 100) {
        errors.push('Compliance rate warning must be between 0 and 100');
      } else if (target && warning >= target) {
        errors.push('Compliance rate warning must be less than target');
      }
    }
  }

  // Validate capacityUtilization
  if (thresholds.capacityUtilization) {
    const { optimal, warning } = thresholds.capacityUtilization;

    if (optimal) {
      if (typeof optimal.min !== 'number' || typeof optimal.max !== 'number') {
        errors.push('Capacity utilization optimal range must have numeric min and max');
      } else if (optimal.min < 0 || optimal.min > 100) {
        errors.push('Capacity utilization optimal min must be between 0 and 100');
      } else if (optimal.max < 0 || optimal.max > 100) {
        errors.push('Capacity utilization optimal max must be between 0 and 100');
      } else if (optimal.min >= optimal.max) {
        errors.push('Capacity utilization optimal min must be less than max');
      }
    }

    if (warning) {
      if (typeof warning.min !== 'number' || typeof warning.max !== 'number') {
        errors.push('Capacity utilization warning range must have numeric min and max');
      } else if (warning.min < 0 || warning.min > 100) {
        errors.push('Capacity utilization warning min must be between 0 and 100');
      } else if (warning.max < 0 || warning.max > 100) {
        errors.push('Capacity utilization warning max must be between 0 and 100');
      } else if (warning.min >= warning.max) {
        errors.push('Capacity utilization warning min must be less than max');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate custom calculation
 * @param {Object} calculation - Custom calculation configuration
 * @param {number} index - Index in array (for error messages)
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateCustomCalculation = (calculation, index = 0) => {
  const errors = [];

  if (!calculation || typeof calculation !== 'object') {
    errors.push(`Custom calculation at index ${index} must be an object`);
    return { valid: false, errors };
  }

  // Required fields
  if (!calculation.id || typeof calculation.id !== 'string') {
    errors.push(`Custom calculation at index ${index} must have a valid id (string)`);
  }

  if (!calculation.name || typeof calculation.name !== 'string') {
    errors.push(`Custom calculation at index ${index} must have a valid name (string)`);
  }

  if (!calculation.formula || typeof calculation.formula !== 'string') {
    errors.push(`Custom calculation at index ${index} must have a valid formula (string)`);
  } else {
    // Validate formula syntax
    const formulaValidation = validateFormula(calculation.formula, calculation.dependencies || []);
    if (!formulaValidation.valid) {
      errors.push(...formulaValidation.errors.map((err) => `Formula validation: ${err}`));
    }
  }

  // Optional but validated fields
  if (calculation.displayName && typeof calculation.displayName !== 'string') {
    errors.push(`Custom calculation at index ${index} displayName must be a string`);
  }

  if (calculation.unit && typeof calculation.unit !== 'string') {
    errors.push(`Custom calculation at index ${index} unit must be a string`);
  }

  if (calculation.dependencies) {
    if (!Array.isArray(calculation.dependencies)) {
      errors.push(`Custom calculation at index ${index} dependencies must be an array`);
    } else {
      calculation.dependencies.forEach((dep, depIndex) => {
        if (typeof dep !== 'string') {
          errors.push(`Custom calculation at index ${index} dependency at ${depIndex} must be a string`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate insight rule
 * @param {Object} rule - Insight rule configuration
 * @param {number} index - Index in array (for error messages)
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateInsightRule = (rule, index = 0) => {
  const errors = [];

  if (!rule || typeof rule !== 'object') {
    errors.push(`Insight rule at index ${index} must be an object`);
    return { valid: false, errors };
  }

  // Required fields
  if (!rule.id || typeof rule.id !== 'string') {
    errors.push(`Insight rule at index ${index} must have a valid id (string)`);
  }

  if (!rule.metric || typeof rule.metric !== 'string') {
    errors.push(`Insight rule at index ${index} must have a valid metric (string)`);
  }

  if (!rule.condition || typeof rule.condition !== 'string') {
    errors.push(`Insight rule at index ${index} must have a valid condition (string)`);
  } else {
    // Validate condition syntax
    const conditionValidation = validateInsightCondition(rule.condition);
    if (!conditionValidation.valid) {
      errors.push(...conditionValidation.errors.map((err) => `Condition validation: ${err}`));
    }
  }

  if (!rule.message || typeof rule.message !== 'string') {
    errors.push(`Insight rule at index ${index} must have a valid message (string)`);
  }

  // Validate priority
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (rule.priority && !validPriorities.includes(rule.priority)) {
    errors.push(`Insight rule at index ${index} priority must be one of: ${validPriorities.join(', ')}`);
  }

  // Validate recommendations
  if (rule.recommendations) {
    if (!Array.isArray(rule.recommendations)) {
      errors.push(`Insight rule at index ${index} recommendations must be an array`);
    } else {
      rule.recommendations.forEach((rec, recIndex) => {
        if (typeof rec !== 'string') {
          errors.push(`Insight rule at index ${index} recommendation at ${recIndex} must be a string`);
        }
      });
    }
  }

  // Validate enabled flag
  if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
    errors.push(`Insight rule at index ${index} enabled must be a boolean`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate field group
 * @param {Object} fieldGroup - Field group configuration
 * @param {number} index - Index in array (for error messages)
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateFieldGroup = (fieldGroup, index = 0) => {
  const errors = [];

  if (!fieldGroup || typeof fieldGroup !== 'object') {
    errors.push(`Field group at index ${index} must be an object`);
    return { valid: false, errors };
  }

  // Required fields
  if (!fieldGroup.id || typeof fieldGroup.id !== 'string') {
    errors.push(`Field group at index ${index} must have a valid id (string)`);
  }

  if (!fieldGroup.name || typeof fieldGroup.name !== 'string') {
    errors.push(`Field group at index ${index} must have a valid name (string)`);
  }

  if (!fieldGroup.fields || !Array.isArray(fieldGroup.fields)) {
    errors.push(`Field group at index ${index} must have a fields array`);
  } else if (fieldGroup.fields.length === 0) {
    errors.push(`Field group at index ${index} must have at least one field`);
  } else {
    fieldGroup.fields.forEach((fieldId, fieldIndex) => {
      if (typeof fieldId !== 'string' || !fieldId.trim()) {
        errors.push(`Field group at index ${index} field at ${fieldIndex} must be a non-empty string`);
      }
    });
  }

  // Validate analysisType
  const validAnalysisTypes = ['aggregate', 'compare', 'trend'];
  if (fieldGroup.analysisType && !validAnalysisTypes.includes(fieldGroup.analysisType)) {
    errors.push(`Field group at index ${index} analysisType must be one of: ${validAnalysisTypes.join(', ')}`);
  }

  // Validate displayOrder
  if (fieldGroup.displayOrder !== undefined) {
    if (typeof fieldGroup.displayOrder !== 'number' || !Number.isInteger(fieldGroup.displayOrder)) {
      errors.push(`Field group at index ${index} displayOrder must be an integer`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate custom field analysis configuration
 * @param {Object} fieldAnalysis - Custom field analysis configuration
 * @param {string} fieldId - Field ID (for error messages)
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateCustomFieldAnalysis = (fieldAnalysis, fieldId = 'unknown') => {
  const errors = [];

  if (!fieldAnalysis || typeof fieldAnalysis !== 'object') {
    errors.push(`Custom field analysis for ${fieldId} must be an object`);
    return { valid: false, errors };
  }

  // Validate analysis type
  const validAnalysisTypes = ['numeric', 'categorical', 'temporal', 'boolean'];
  if (fieldAnalysis.type && !validAnalysisTypes.includes(fieldAnalysis.type)) {
    errors.push(`Custom field analysis for ${fieldId} type must be one of: ${validAnalysisTypes.join(', ')}`);
  }

  // Validate numeric-specific settings
  if (fieldAnalysis.type === 'numeric' && fieldAnalysis.numeric) {
    if (fieldAnalysis.numeric.format) {
      const validFormats = ['number', 'currency', 'percentage'];
      if (!validFormats.includes(fieldAnalysis.numeric.format)) {
        errors.push(`Custom field analysis for ${fieldId} numeric format must be one of: ${validFormats.join(', ')}`);
      }
    }

    if (fieldAnalysis.numeric.thresholds) {
      const { min, max, warning, critical } = fieldAnalysis.numeric.thresholds;
      if (min !== undefined && max !== undefined && min >= max) {
        errors.push(`Custom field analysis for ${fieldId} numeric thresholds min must be less than max`);
      }
      if (warning && warning.min !== undefined && warning.max !== undefined && warning.min >= warning.max) {
        errors.push(`Custom field analysis for ${fieldId} numeric warning thresholds min must be less than max`);
      }
      if (critical && critical.min !== undefined && critical.max !== undefined && critical.min >= critical.max) {
        errors.push(`Custom field analysis for ${fieldId} numeric critical thresholds min must be less than max`);
      }
    }
  }

  // Validate insight rules for custom fields
  if (fieldAnalysis.insights && fieldAnalysis.insights.rules) {
    if (!Array.isArray(fieldAnalysis.insights.rules)) {
      errors.push(`Custom field analysis for ${fieldId} insights.rules must be an array`);
    } else {
      fieldAnalysis.insights.rules.forEach((rule, index) => {
        const ruleValidation = validateInsightRule(rule, index);
        if (!ruleValidation.valid) {
          errors.push(...ruleValidation.errors.map((err) => `Custom field ${fieldId} ${err}`));
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Comprehensive validation for BaselineAnalysisConfig
 * @param {Object} config - BaselineAnalysisConfig to validate
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateBaselineAnalysisConfig = (config) => {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  // Validate tenantId
  if (!config.tenantId || typeof config.tenantId !== 'string') {
    errors.push('Config must have a valid tenantId (string)');
  }

  // Validate entityType
  const validEntityTypes = ['user', 'node'];
  if (!config.entityType || !validEntityTypes.includes(config.entityType)) {
    errors.push(`Config entityType must be one of: ${validEntityTypes.join(', ')}`);
  }

  // Validate essential metrics (basic structure check)
  if (config.essentialMetrics && typeof config.essentialMetrics !== 'object') {
    errors.push('Essential metrics must be an object');
  }

  // Validate custom fields
  if (config.customFields) {
    if (!Array.isArray(config.customFields)) {
      errors.push('Custom fields must be an array');
    } else {
      config.customFields.forEach((field, index) => {
        if (!field.fieldId) {
          errors.push(`Custom field at index ${index} is missing fieldId`);
        }
        if (!field.analysis) {
          errors.push(`Custom field ${field.fieldId || index} is missing analysis config`);
        } else {
          const fieldValidation = validateCustomFieldAnalysis(field.analysis, field.fieldId);
          if (!fieldValidation.valid) {
            errors.push(...fieldValidation.errors);
          }
        }
      });
    }
  }

  // Validate global settings
  if (config.globalSettings) {
    if (typeof config.globalSettings !== 'object') {
      errors.push('Global settings must be an object');
    } else {
      // Validate thresholds
      if (config.globalSettings.thresholds) {
        const thresholdValidation = validateThresholds(config.globalSettings.thresholds);
        if (!thresholdValidation.valid) {
          errors.push(...thresholdValidation.errors);
        }
      }

      // Validate custom calculations
      if (config.globalSettings.customCalculations) {
        if (!Array.isArray(config.globalSettings.customCalculations)) {
          errors.push('Global settings customCalculations must be an array');
        } else {
          config.globalSettings.customCalculations.forEach((calc, index) => {
            const calcValidation = validateCustomCalculation(calc, index);
            if (!calcValidation.valid) {
              errors.push(...calcValidation.errors);
            }
          });
        }
      }

      // Validate field groups
      if (config.globalSettings.fieldGroups) {
        if (!Array.isArray(config.globalSettings.fieldGroups)) {
          errors.push('Global settings fieldGroups must be an array');
        } else {
          config.globalSettings.fieldGroups.forEach((group, index) => {
            const groupValidation = validateFieldGroup(group, index);
            if (!groupValidation.valid) {
              errors.push(...groupValidation.errors);
            }
          });
        }
      }

      // Validate insight rules
      if (config.globalSettings.insightRules) {
        if (!Array.isArray(config.globalSettings.insightRules)) {
          errors.push('Global settings insightRules must be an array');
        } else {
          config.globalSettings.insightRules.forEach((rule, index) => {
            const ruleValidation = validateInsightRule(rule, index);
            if (!ruleValidation.valid) {
              errors.push(...ruleValidation.errors);
            }
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateBaselineAnalysisConfig,
  validateThresholds,
  validateCustomCalculation,
  validateInsightRule,
  validateFieldGroup,
  validateCustomFieldAnalysis,
  validateInsightCondition,
};

