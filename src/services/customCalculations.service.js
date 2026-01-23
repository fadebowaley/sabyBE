const logger = require('../config/logger');

/**
 * Custom Calculations Service
 * Evaluates custom formulas defined in BaselineAnalysisConfig
 */

/**
 * Evaluate a custom calculation formula
 * @param {string} formula - Formula string (e.g., "averageAttendance / totalMembers * 100")
 * @param {Object} context - Context object with available metrics/values
 * @returns {number|null} Calculated result or null if error
 */
const evaluateFormula = (formula, context) => {
  try {
    // Create a safe evaluation context
    const safeContext = {
      // Math functions
      Math,
      // Common operations
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      abs: Math.abs,
      min: Math.min,
      max: Math.max,
      sqrt: Math.sqrt,
      pow: Math.pow,
      // Context variables (flatten nested objects for easier access)
      ...flattenContext(context),
    };

    // Replace variable names with safe context access
    let evalString = formula;
    
    // Extract variable names from formula (simple pattern matching)
    const variablePattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const variables = new Set();
    let match;
    while ((match = variablePattern.exec(formula)) !== null) {
      const varName = match[1];
      // Skip JavaScript keywords and Math functions
      if (!['Math', 'round', 'floor', 'ceil', 'abs', 'min', 'max', 'sqrt', 'pow', 'if', 'else', 'return'].includes(varName)) {
        variables.add(varName);
      }
    }

    // Replace variables with context access
    variables.forEach(varName => {
      if (safeContext[varName] !== undefined) {
        evalString = evalString.replace(new RegExp(`\\b${varName}\\b`, 'g'), `safeContext.${varName}`);
      }
    });

    // Evaluate using Function constructor for safety
    const result = new Function('safeContext', `return ${evalString}`)(safeContext);
    
    // Validate result
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
    
    logger.warn(`Formula evaluation returned invalid result: ${result} for formula: ${formula}`);
    return null;
  } catch (error) {
    logger.error(`Error evaluating formula "${formula}":`, error);
    return null;
  }
};

/**
 * Flatten nested context object for easier formula access
 * @param {Object} context - Nested context object
 * @param {string} prefix - Prefix for flattened keys
 * @returns {Object} Flattened context
 */
const flattenContext = (context, prefix = '') => {
  const flattened = {};
  
  for (const key in context) {
    if (context.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}_${key}` : key;
      const value = context[key];
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenContext(value, newKey));
      } else {
        // Add primitive value or array
        flattened[newKey] = value;
        // Also add with dot notation for convenience
        if (prefix) {
          flattened[`${prefix}.${key}`] = value;
        }
      }
    }
  }
  
  return flattened;
};

/**
 * Apply custom calculations to baseline metrics
 * @param {Object} metrics - Baseline metrics
 * @param {Array} customCalculations - Array of custom calculation configs
 * @returns {Object} Metrics with custom calculations added
 */
const applyCustomCalculations = (metrics, customCalculations) => {
  if (!customCalculations || !Array.isArray(customCalculations) || customCalculations.length === 0) {
    return metrics;
  }

  const customMetrics = {};

  customCalculations.forEach(calc => {
    if (!calc.id || !calc.formula) {
      logger.warn(`Skipping invalid custom calculation: missing id or formula`);
      return;
    }

    try {
      // Evaluate formula with metrics as context
      const result = evaluateFormula(calc.formula, metrics);
      
      if (result !== null) {
        customMetrics[calc.id] = {
          value: result,
          displayName: calc.displayName || calc.name,
          unit: calc.unit || '',
          description: calc.description || '',
          formula: calc.formula,
        };
      } else {
        logger.warn(`Custom calculation "${calc.id}" returned null, skipping`);
      }
    } catch (error) {
      logger.error(`Error applying custom calculation "${calc.id}":`, error);
    }
  });

  // Add custom metrics to metrics object
  if (Object.keys(customMetrics).length > 0) {
    metrics.customMetrics = customMetrics;
  }

  return metrics;
};

/**
 * Validate custom calculation formula
 * @param {string} formula - Formula to validate
 * @param {Array} dependencies - Required dependencies (field IDs)
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateFormula = (formula, dependencies = []) => {
  const errors = [];

  if (!formula || typeof formula !== 'string') {
    errors.push('Formula must be a non-empty string');
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
  ];

  dangerousPatterns.forEach(pattern => {
    if (pattern.test(formula)) {
      errors.push(`Formula contains potentially dangerous pattern: ${pattern}`);
    }
  });

  // Check for balanced parentheses
  const openParens = (formula.match(/\(/g) || []).length;
  const closeParens = (formula.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push('Formula has unbalanced parentheses');
  }

  // Check for balanced brackets
  const openBrackets = (formula.match(/\[/g) || []).length;
  const closeBrackets = (formula.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push('Formula has unbalanced brackets');
  }

  // Validate dependencies are referenced
  if (dependencies && dependencies.length > 0) {
    const missingDeps = dependencies.filter(dep => !formula.includes(dep));
    if (missingDeps.length > 0) {
      errors.push(`Formula does not reference declared dependencies: ${missingDeps.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  evaluateFormula,
  applyCustomCalculations,
  validateFormula,
  flattenContext,
};

