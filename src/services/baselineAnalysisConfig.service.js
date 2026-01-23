const { BaselineAnalysisConfig, TenantConfig } = require('../models');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');
const logger = require('../config/logger');

/**
 * Baseline Analysis Configuration Service
 * Manages tenant-specific analysis configuration for baseline intelligence
 */

/**
 * Get analysis config for a tenant and entity type
 * Creates default config if it doesn't exist (lazy initialization)
 * @param {string} tenantId
 * @param {string} entityType - 'user' or 'node'
 * @returns {Promise<Object>} Analysis config
 */
const getAnalysisConfig = async (tenantId, entityType) => {
  try {
    let config = await BaselineAnalysisConfig.findOne({ tenantId, entityType });

    if (!config) {
      // Create default config (lazy initialization)
      logger.info(`Creating default analysis config for tenant ${tenantId}, entityType ${entityType}`);
      config = await BaselineAnalysisConfig.createDefaultConfig(tenantId, entityType);
    }

    return config;
  } catch (error) {
    logger.error(`Error getting analysis config for tenant ${tenantId}, entityType ${entityType}:`, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to get analysis config');
  }
};

/**
 * Update essential metrics configuration
 * @param {string} tenantId
 * @param {string} entityType
 * @param {Object} essentialMetrics - Essential metrics config
 * @returns {Promise<Object>} Updated config
 */
const updateEssentialMetrics = async (tenantId, entityType, essentialMetrics) => {
  try {
    // Validate the update
    const validation = validateAnalysisConfig({
      tenantId,
      entityType,
      essentialMetrics,
    });
    if (!validation.valid) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid essential metrics configuration: ${validation.errors.join(', ')}`);
    }

    const config = await BaselineAnalysisConfig.findOne({ tenantId, entityType });

    if (!config) {
      // Create config if it doesn't exist
      const newConfig = await BaselineAnalysisConfig.createDefaultConfig(tenantId, entityType);
      newConfig.essentialMetrics = essentialMetrics;
      newConfig.version += 1;
      await newConfig.save();
      return newConfig;
    }

    // Update essential metrics
    config.essentialMetrics = {
      ...config.essentialMetrics,
      ...essentialMetrics,
    };
    config.version += 1;
    await config.save();

    logger.info(`Updated essential metrics for tenant ${tenantId}, entityType ${entityType}`);
    return config;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Error updating essential metrics:`, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update essential metrics');
  }
};

/**
 * Update custom field analysis configuration
 * @param {string} tenantId
 * @param {string} entityType
 * @param {string} fieldId - Field ID from TenantConfig
 * @param {Object} analysisConfig - Analysis configuration
 * @returns {Promise<Object>} Updated config
 */
const updateCustomFieldAnalysis = async (tenantId, entityType, fieldId, analysisConfig) => {
  try {
    // Validate the analysis config
    const { validateCustomFieldAnalysis } = require('./baselineAnalysisConfigValidation.service');
    const validation = validateCustomFieldAnalysis(analysisConfig, fieldId);
    if (!validation.valid) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid custom field analysis configuration: ${validation.errors.join(', ')}`);
    }

    // Verify field exists in TenantConfig
    const tenantConfig = await TenantConfig.findOne({ tenantId, entityType });
    if (!tenantConfig) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant config not found');
    }

    const field = tenantConfig.fields.find((f) => f.id === fieldId);
    if (!field) {
      throw new ApiError(httpStatus.NOT_FOUND, `Field ${fieldId} not found in tenant config`);
    }

    // Get or create analysis config
    let config = await BaselineAnalysisConfig.findOne({ tenantId, entityType });
    if (!config) {
      config = await BaselineAnalysisConfig.createDefaultConfig(tenantId, entityType);
    }

    // Auto-map analysis type from field type if not provided
    if (!analysisConfig.type) {
      analysisConfig.type = mapFieldTypeToAnalysisType(field.type, field.analytics);
    }

    // Update or add custom field analysis
    await BaselineAnalysisConfig.updateCustomFieldAnalysis(tenantId, entityType, fieldId, analysisConfig);

    // Reload config
    config = await BaselineAnalysisConfig.findOne({ tenantId, entityType });
    config.version += 1;
    await config.save();

    logger.info(`Updated custom field analysis for field ${fieldId}, tenant ${tenantId}`);
    return config;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Error updating custom field analysis:`, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update custom field analysis');
  }
};

/**
 * Update global settings
 * @param {string} tenantId
 * @param {string} entityType
 * @param {Object} globalSettings - Global settings config
 * @returns {Promise<Object>} Updated config
 */
const updateGlobalSettings = async (tenantId, entityType, globalSettings) => {
  try {
    // Validate global settings
    const { validateThresholds, validateCustomCalculation, validateFieldGroup, validateInsightRule } = require('./baselineAnalysisConfigValidation.service');
    
    // Validate thresholds
    if (globalSettings.thresholds) {
      const thresholdValidation = validateThresholds(globalSettings.thresholds);
      if (!thresholdValidation.valid) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invalid thresholds configuration: ${thresholdValidation.errors.join(', ')}`);
      }
    }

    // Validate custom calculations
    if (globalSettings.customCalculations && Array.isArray(globalSettings.customCalculations)) {
      globalSettings.customCalculations.forEach((calc, index) => {
        const calcValidation = validateCustomCalculation(calc, index);
        if (!calcValidation.valid) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Invalid custom calculation at index ${index}: ${calcValidation.errors.join(', ')}`);
        }
      });
    }

    // Validate field groups
    if (globalSettings.fieldGroups && Array.isArray(globalSettings.fieldGroups)) {
      globalSettings.fieldGroups.forEach((group, index) => {
        const groupValidation = validateFieldGroup(group, index);
        if (!groupValidation.valid) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Invalid field group at index ${index}: ${groupValidation.errors.join(', ')}`);
        }
      });
    }

    // Validate insight rules
    if (globalSettings.insightRules && Array.isArray(globalSettings.insightRules)) {
      globalSettings.insightRules.forEach((rule, index) => {
        const ruleValidation = validateInsightRule(rule, index);
        if (!ruleValidation.valid) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Invalid insight rule at index ${index}: ${ruleValidation.errors.join(', ')}`);
        }
      });
    }

    let config = await BaselineAnalysisConfig.findOne({ tenantId, entityType });

    if (!config) {
      config = await BaselineAnalysisConfig.createDefaultConfig(tenantId, entityType);
    }

    // Merge global settings
    config.globalSettings = {
      ...config.globalSettings,
      ...globalSettings,
    };
    config.version += 1;
    await config.save();

    logger.info(`Updated global settings for tenant ${tenantId}, entityType ${entityType}`);
    return config;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Error updating global settings:`, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update global settings');
  }
};

/**
 * Sync custom fields analysis config with TenantConfig
 * Automatically creates/removes analysis config entries when fields are added/removed
 * @param {string} tenantId
 * @param {string} entityType
 * @returns {Promise<Object>} Updated config
 */
const syncWithTenantConfig = async (tenantId, entityType) => {
  try {
    const tenantConfig = await TenantConfig.findOne({ tenantId, entityType });
    if (!tenantConfig) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant config not found');
    }

    let analysisConfig = await BaselineAnalysisConfig.findOne({ tenantId, entityType });
    if (!analysisConfig) {
      analysisConfig = await BaselineAnalysisConfig.createDefaultConfig(tenantId, entityType);
    }

    const tenantFieldIds = new Set(tenantConfig.fields.map((f) => f.id));
    const analysisFieldIds = new Set(analysisConfig.customFields.map((f) => f.fieldId));

    // Remove analysis config for fields that no longer exist
    const fieldsToRemove = [...analysisFieldIds].filter((id) => !tenantFieldIds.has(id));
    for (const fieldId of fieldsToRemove) {
      await BaselineAnalysisConfig.removeCustomFieldAnalysis(tenantId, entityType, fieldId);
      logger.info(`Removed analysis config for deleted field ${fieldId}`);
    }

    // Create default analysis config for new fields with analytics enabled
    const fieldsToAdd = [...tenantFieldIds].filter((id) => !analysisFieldIds.has(id));
    for (const fieldId of fieldsToAdd) {
      const field = tenantConfig.fields.find((f) => f.id === fieldId);
      if (field && field.analytics && field.analytics.enabled) {
        const defaultAnalysisConfig = createDefaultAnalysisConfigForField(field);
        await BaselineAnalysisConfig.updateCustomFieldAnalysis(
          tenantId,
          entityType,
          fieldId,
          defaultAnalysisConfig
        );
        logger.info(`Created default analysis config for field ${fieldId}`);
      }
    }

    // Reload config
    analysisConfig = await BaselineAnalysisConfig.findOne({ tenantId, entityType });
    analysisConfig.version += 1;
    await analysisConfig.save();

    logger.info(`Synced analysis config with tenant config for tenant ${tenantId}, entityType ${entityType}`);
    return analysisConfig;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Error syncing with tenant config:`, error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to sync with tenant config');
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
    number: analytics?.format === 'currency' || analytics?.format === 'percentage' ? 'numeric' : 'numeric',
    date: 'temporal',
    boolean: 'boolean',
    select: 'categorical',
    'multi-select': 'categorical',
    attachment: 'categorical', // Attachments not analyzed in detail
  };

  return mapping[fieldType] || 'categorical';
};

/**
 * Create default analysis config for a field based on its type
 * @param {Object} field - Field from TenantConfig
 * @returns {Object} Default analysis config
 */
const createDefaultAnalysisConfigForField = (field) => {
  const analysisType = mapFieldTypeToAnalysisType(field.type, field.analytics);

  const defaultConfig = {
    enabled: field.analytics?.enabled || false,
    type: analysisType,
  };

  // Add type-specific defaults
  if (analysisType === 'numeric') {
    defaultConfig.numeric = {
      format: field.analytics?.format || 'number',
      statistics: {
        enabled: true,
        include: {
          total: true,
          average: true,
          median: true,
          min: true,
          max: true,
          standardDeviation: true,
        },
      },
      distribution: {
        enabled: true,
        ranges: 'auto',
        customRanges: [],
      },
    };
  } else if (analysisType === 'categorical') {
    defaultConfig.categorical = {
      distribution: {
        enabled: true,
        topN: 10,
      },
      diversity: {
        enabled: true,
      },
    };
  } else if (analysisType === 'temporal') {
    defaultConfig.temporal = {
      includeTime: field.analytics?.includeTime || false,
      analysis: {
        earliest: true,
        latest: true,
        averageAge: true,
        trends: false,
      },
    };
  } else if (analysisType === 'boolean') {
    defaultConfig.boolean = {
      analysis: {
        trueCount: true,
        falseCount: true,
        percentage: true,
      },
    };
  }

  // Common settings
  defaultConfig.insights = {
    enabled: true,
    rules: [],
  };

  defaultConfig.display = {
    label: field.label,
    description: field.description,
    unit: field.analytics?.format === 'currency' ? 'NGN' : field.analytics?.format === 'percentage' ? '%' : '',
    order: field.ui?.order || 0,
    category: '',
    chartType: 'bar',
  };

  return defaultConfig;
};

/**
 * Validate analysis config
 * Uses comprehensive validation service
 * @param {Object} config - Analysis config to validate
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateAnalysisConfig = (config) => {
  const { validateBaselineAnalysisConfig } = require('./baselineAnalysisConfigValidation.service');
  return validateBaselineAnalysisConfig(config);
};

module.exports = {
  getAnalysisConfig,
  updateEssentialMetrics,
  updateCustomFieldAnalysis,
  updateGlobalSettings,
  syncWithTenantConfig,
  validateAnalysisConfig,
  mapFieldTypeToAnalysisType,
  createDefaultAnalysisConfigForField,
};

