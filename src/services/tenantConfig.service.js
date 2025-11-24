const TenantConfig = require('../models/tenantConfig.model');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

const DEFAULT_UI = { sections: [] };

const buildFallbackConfig = (tenantId, entityType) => ({
  tenantId,
  entityType,
  fields: [],
  ui: DEFAULT_UI,
  version: 1,
});

const getTenantConfig = async (tenantId, entityType) => {
  return TenantConfig.findOne({ tenantId, entityType }).lean();
};

const upsertTenantConfig = async (tenantId, entityType, payload, userId) => {
  const fields = payload.fields || [];
  const ui = payload.ui || DEFAULT_UI;
  const update = {
    $set: {
      fields,
      ui,
      updatedBy: userId || null,
    },
    $setOnInsert: {
      tenantId,
      entityType,
      createdBy: userId || null,
    },
  };

  if (typeof payload.version === 'number') {
    update.$set.version = payload.version;
  } else {
    update.$inc = { version: 1 };
  }

  const config = await TenantConfig.findOneAndUpdate(
    { tenantId, entityType },
    update,
    { new: true, upsert: true }
  ).lean();

  return config;
};

/**
 * Toggle analytics for a specific field
 * @param {string} tenantId - Tenant identifier
 * @param {string} entityType - 'user' or 'node'
 * @param {string} fieldId - Field identifier
 * @param {boolean} enabled - Enable or disable analytics
 * @returns {Promise<Object>} Updated field
 */
const toggleFieldAnalytics = async (tenantId, entityType, fieldId, enabled) => {
  const config = await TenantConfig.findOne({ tenantId, entityType });
  if (!config) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Configuration not found');
  }

  const field = config.fields.id(fieldId) || config.fields.find(f => f.id === fieldId);
  if (!field) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Field not found');
  }

  // Initialize analytics object if it doesn't exist
  if (!field.analytics) {
    field.analytics = {};
  }

  // Update enabled state
  field.analytics.enabled = Boolean(enabled);

  // Auto-map analytics type if enabling for first time
  if (enabled && !field.analytics.type) {
    try {
      // Try to import type mapper (may not exist in backend, use fallback)
      let mapTenantTypeToAnalyticsType;
      try {
        const typeMapper = require('../../sabyFrontend/apps/isomorphic/src/app/lib/utils/fieldTypeMapper');
        mapTenantTypeToAnalyticsType = typeMapper.mapTenantTypeToAnalyticsType;
      } catch (e) {
        // Fallback mapping if frontend utility not available
        mapTenantTypeToAnalyticsType = (tenantType, metadata) => {
          const mapping = {
            'text': 'text',
            'textarea': 'text',
            'number': metadata?.format === 'currency' ? 'currency' : metadata?.format === 'percentage' ? 'percentage' : 'number',
            'date': metadata?.includeTime ? 'datetime' : 'date',
            'boolean': 'boolean',
            'select': 'select',
            'multi-select': 'multi-select',
            'attachment': 'text',
          };
          return mapping[tenantType] || 'text';
        };
      }

      field.analytics.type = mapTenantTypeToAnalyticsType(field.type, field.analytics);
    } catch (error) {
      // If type mapping fails, use field type as fallback
      field.analytics.type = field.type;
    }
  }

  await config.save();
  return field.toObject();
};

/**
 * Get analytics summary for a tenant
 * @param {string} tenantId - Tenant identifier
 * @param {string} entityType - 'user' or 'node'
 * @returns {Promise<Object>} Analytics summary
 */
const getAnalyticsSummary = async (tenantId, entityType) => {
  const config = await TenantConfig.findOne({ tenantId, entityType }).lean();
  if (!config) {
    return { totalFields: 0, enabledFields: 0, fields: [] };
  }

  const fields = (config.fields || []).map(field => ({
    fieldId: field.id,
    fieldName: field.label,
    analyticsEnabled: field.analytics?.enabled || false,
    analyticsType: field.analytics?.type || null,
    lastAnalyzed: field.analytics?.lastAnalyzed || null,
  }));

  return {
    totalFields: fields.length,
    enabledFields: fields.filter(f => f.analyticsEnabled).length,
    fields,
  };
};

module.exports = {
  getTenantConfig,
  upsertTenantConfig,
  buildFallbackConfig,
  toggleFieldAnalytics,
  getAnalyticsSummary,
};

