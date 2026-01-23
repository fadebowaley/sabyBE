const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Custom Field Analysis Configuration Schema
 * Extended analysis settings for custom fields
 */
const customFieldAnalysisSchema = new mongoose.Schema(
  {
    fieldId: {
      type: String,
      required: true,
      // References TenantConfig.fields[].id
    },
    // Analysis configuration (extends field.analytics)
    analysis: {
      enabled: { type: Boolean, default: false },

      // Type-specific analysis settings
      type: {
        type: String,
        enum: ['numeric', 'categorical', 'temporal', 'boolean'],
        // Auto-mapped from field.type
      },

      // Numeric field analysis
      numeric: {
        format: {
          type: String,
          enum: ['number', 'currency', 'percentage'],
          default: 'number',
        },
        statistics: {
          enabled: { type: Boolean, default: true },
          include: {
            total: { type: Boolean, default: true },
            average: { type: Boolean, default: true },
            median: { type: Boolean, default: true },
            min: { type: Boolean, default: true },
            max: { type: Boolean, default: true },
            standardDeviation: { type: Boolean, default: true },
          },
        },
        distribution: {
          enabled: { type: Boolean, default: true },
          ranges: {
            type: String,
            enum: ['auto', 'custom'],
            default: 'auto',
          },
          customRanges: [
            {
              name: String,
              min: Number,
              max: Number,
            },
          ],
        },
        thresholds: {
          min: Number,
          max: Number,
          warning: {
            min: Number,
            max: Number,
          },
          critical: {
            min: Number,
            max: Number,
          },
        },
      },

      // Categorical field analysis
      categorical: {
        distribution: {
          enabled: { type: Boolean, default: true },
          topN: { type: Number, default: 10 }, // Show top N values
        },
        diversity: {
          enabled: { type: Boolean, default: true },
          maxUniqueValues: Number, // Alert if exceeds
        },
      },

      // Temporal field analysis
      temporal: {
        includeTime: { type: Boolean, default: false },
        analysis: {
          earliest: { type: Boolean, default: true },
          latest: { type: Boolean, default: true },
          averageAge: { type: Boolean, default: true },
          trends: { type: Boolean, default: false }, // Future: trend analysis
        },
      },

      // Boolean field analysis
      boolean: {
        analysis: {
          trueCount: { type: Boolean, default: true },
          falseCount: { type: Boolean, default: true },
          percentage: { type: Boolean, default: true },
        },
      },

      // Common settings
      grouping: {
        enabled: { type: Boolean, default: false },
        groupBy: String, // Field ID to group by
        aggregate: {
          type: String,
          enum: ['sum', 'average', 'count', 'min', 'max'],
        },
      },

      // Insight generation
      insights: {
        enabled: { type: Boolean, default: true },
        rules: [
          {
            condition: String, // e.g., "average < 50"
            priority: {
              type: String,
              enum: ['low', 'medium', 'high', 'critical'],
            },
            message: String,
            recommendations: [String],
          },
        ],
      },

      // Display settings
      display: {
        label: String, // Override field label for analytics
        description: String,
        unit: String, // e.g., "years", "NGN", "%"
        order: Number, // Display order in reports
        category: String, // Group in reports (e.g., "Ministry Metrics")
        chartType: {
          type: String,
          enum: ['bar', 'line', 'pie', 'donut', 'gauge', 'table'],
          default: 'bar',
        },
      },
    },
  },
  { _id: false }
);

/**
 * Essential Metrics Configuration Schema
 */
const essentialMetricsSchema = new mongoose.Schema(
  {
    // Demographics
    demographics: {
      enabled: { type: Boolean, default: true },
      analysis: {
        gender: { enabled: { type: Boolean, default: true } },
        age: {
          enabled: { type: Boolean, default: true },
          ageGroups: {
            enabled: { type: Boolean, default: true },
            customGroups: [
              {
                name: String,
                min: Number,
                max: Number,
              },
            ],
          },
        },
        maritalStatus: { enabled: { type: Boolean, default: true } },
      },
    },

    // Hierarchy
    hierarchy: {
      enabled: { type: Boolean, default: true },
      analysis: {
        roleMapping: {
          owners: [{ type: String }], // Array of role IDs
          supers: [{ type: String }],
          ordinary: [{ type: String }],
        },
        terminology: {
          owners: { type: String, default: 'Owners' },
          supers: { type: String, default: 'Super Users' },
          ordinary: { type: String, default: 'Members' },
        },
      },
    },

    // Geography
    geography: {
      enabled: { type: Boolean, default: true },
      analysis: {
        levels: {
          type: [String],
          default: ['state', 'lga', 'city'],
          enum: ['country', 'state', 'lga', 'city', 'region'],
        },
        customRegions: [
          {
            name: String,
            states: [String],
            lgas: [String],
          },
        ],
      },
    },

    // Professional
    professional: {
      enabled: { type: Boolean, default: true },
      analysis: {
        occupation: { enabled: { type: Boolean, default: true } },
        employmentCategory: { enabled: { type: Boolean, default: true } },
        education: { enabled: { type: Boolean, default: true } },
      },
    },

    // Verification
    verification: {
      enabled: { type: Boolean, default: true },
      analysis: {
        email: { enabled: { type: Boolean, default: true } },
        phone: { enabled: { type: Boolean, default: true } },
      },
    },

    // Facility (for nodes)
    facility: {
      enabled: { type: Boolean, default: true },
      analysis: {
        propertyStatus: { enabled: { type: Boolean, default: true } },
        buildingType: { enabled: { type: Boolean, default: true } },
        facilityStatus: { enabled: { type: Boolean, default: true } },
      },
    },
  },
  { _id: false }
);

/**
 * Global Settings Schema
 */
const globalSettingsSchema = new mongoose.Schema(
  {
    // Thresholds for standard metrics
    thresholds: {
      leadershipRatio: {
        optimal: {
          min: Number,
          max: Number,
        },
        warning: {
          min: Number,
          max: Number,
        },
      },
      complianceRate: {
        target: Number,
        warning: Number,
      },
      capacityUtilization: {
        optimal: {
          min: Number,
          max: Number,
        },
        warning: {
          min: Number,
          max: Number,
        },
      },
    },

    // Custom calculations (formulas)
    customCalculations: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        formula: { type: String, required: true }, // e.g., "averageAttendance / totalMembers * 100"
        displayName: { type: String, required: true },
        unit: String,
        description: String,
        dependencies: [{ type: String }], // Field IDs this calculation depends on
      },
    ],

    // Field groups for reporting
    fieldGroups: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        fields: [{ type: String }], // Array of field IDs (both essential and custom)
        displayOrder: { type: Number, default: 0 },
        analysisType: {
          type: String,
          enum: ['aggregate', 'compare', 'trend'],
        },
      },
    ],

    // Insight generation rules (global)
    insightRules: [
      {
        id: { type: String, required: true },
        metric: { type: String, required: true }, // Metric name or field ID
        condition: { type: String, required: true }, // e.g., "value < 50"
        priority: {
          type: String,
          enum: ['low', 'medium', 'high', 'critical'],
          required: true,
        },
        message: { type: String, required: true },
        recommendations: [{ type: String }],
        enabled: { type: Boolean, default: true },
      },
    ],
  },
  { _id: false }
);

/**
 * Baseline Analysis Configuration Schema
 * Stores tenant-specific analysis configuration for baseline intelligence
 */
const baselineAnalysisConfigSchema = mongoose.Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    entityType: {
      type: String,
      enum: ['user', 'node'],
      required: true,
    },

    // ========== ESSENTIAL (STANDARD) METRICS CONFIGURATION ==========
    essentialMetrics: {
      type: essentialMetricsSchema,
      default: () => ({}),
    },

    // ========== CUSTOM FIELDS ANALYSIS CONFIGURATION ==========
    // This references fields from TenantConfig but adds analysis-specific settings
    customFields: {
      type: [customFieldAnalysisSchema],
      default: [],
    },

    // ========== GLOBAL ANALYSIS SETTINGS ==========
    globalSettings: {
      type: globalSettingsSchema,
      default: () => ({}),
    },

    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
baselineAnalysisConfigSchema.index({ tenantId: 1, entityType: 1 }, { unique: true });
baselineAnalysisConfigSchema.index({ 'customFields.fieldId': 1 });

// Add plugins
baselineAnalysisConfigSchema.plugin(toJSON);
baselineAnalysisConfigSchema.plugin(paginate);

/**
 * Get analysis config by tenant and entity type
 * @param {string} tenantId
 * @param {string} entityType
 * @returns {Promise<BaselineAnalysisConfig>}
 */
baselineAnalysisConfigSchema.statics.getAnalysisConfig = async function (tenantId, entityType) {
  return this.findOne({ tenantId, entityType });
};

/**
 * Get or create analysis config (lazy initialization)
 * @param {string} tenantId
 * @param {string} entityType
 * @returns {Promise<BaselineAnalysisConfig>}
 */
baselineAnalysisConfigSchema.statics.getOrCreateAnalysisConfig = async function (tenantId, entityType) {
  let config = await this.findOne({ tenantId, entityType });

  if (!config) {
    // Create default config
    config = await this.createDefaultConfig(tenantId, entityType);
  }

  return config;
};

/**
 * Create default analysis config
 * @param {string} tenantId
 * @param {string} entityType
 * @returns {Promise<BaselineAnalysisConfig>}
 */
baselineAnalysisConfigSchema.statics.createDefaultConfig = async function (tenantId, entityType) {
  const defaultConfig = {
    tenantId,
    entityType,
    essentialMetrics: {
      demographics: {
        enabled: true,
        analysis: {
          gender: { enabled: true },
          age: {
            enabled: true,
            ageGroups: {
              enabled: true,
              customGroups: [],
            },
          },
          maritalStatus: { enabled: true },
        },
      },
      hierarchy: {
        enabled: true,
        analysis: {
          roleMapping: {
            owners: [],
            supers: [],
            ordinary: [],
          },
          terminology: {
            owners: 'Owners',
            supers: 'Super Users',
            ordinary: 'Members',
          },
        },
      },
      geography: {
        enabled: true,
        analysis: {
          levels: ['state', 'lga', 'city'],
          customRegions: [],
        },
      },
      professional: {
        enabled: true,
        analysis: {
          occupation: { enabled: true },
          employmentCategory: { enabled: true },
          education: { enabled: true },
        },
      },
      verification: {
        enabled: true,
        analysis: {
          email: { enabled: true },
          phone: { enabled: true },
        },
      },
      facility: {
        enabled: true,
        analysis: {
          propertyStatus: { enabled: true },
          buildingType: { enabled: true },
          facilityStatus: { enabled: true },
        },
      },
    },
    customFields: [],
    globalSettings: {
      thresholds: {
        leadershipRatio: {
          optimal: { min: 15, max: 25 },
          warning: { min: 10, max: 30 },
        },
        complianceRate: {
          target: 80,
          warning: 70,
        },
        capacityUtilization: {
          optimal: { min: 60, max: 85 },
          warning: { min: 50, max: 90 },
        },
      },
      customCalculations: [],
      fieldGroups: [],
      insightRules: [],
    },
    version: 1,
  };

  return this.create(defaultConfig);
};

/**
 * Update custom field analysis config
 * @param {string} tenantId
 * @param {string} entityType
 * @param {string} fieldId
 * @param {Object} analysisConfig
 * @returns {Promise<BaselineAnalysisConfig>}
 */
baselineAnalysisConfigSchema.statics.updateCustomFieldAnalysis = async function (
  tenantId,
  entityType,
  fieldId,
  analysisConfig
) {
  const config = await this.findOne({ tenantId, entityType });

  if (!config) {
    throw new Error('Analysis config not found. Create it first.');
  }

  const fieldIndex = config.customFields.findIndex((f) => f.fieldId === fieldId);

  if (fieldIndex >= 0) {
    // Update existing
    config.customFields[fieldIndex].analysis = {
      ...config.customFields[fieldIndex].analysis,
      ...analysisConfig,
    };
  } else {
    // Add new
    config.customFields.push({
      fieldId,
      analysis: analysisConfig,
    });
  }

  await config.save();
  return config;
};

/**
 * Remove custom field analysis config
 * @param {string} tenantId
 * @param {string} entityType
 * @param {string} fieldId
 * @returns {Promise<BaselineAnalysisConfig>}
 */
baselineAnalysisConfigSchema.statics.removeCustomFieldAnalysis = async function (tenantId, entityType, fieldId) {
  const config = await this.findOne({ tenantId, entityType });

  if (!config) {
    return null;
  }

  config.customFields = config.customFields.filter((f) => f.fieldId !== fieldId);
  await config.save();
  return config;
};

/**
 * @typedef BaselineAnalysisConfig
 */
const BaselineAnalysisConfig = mongoose.model('BaselineAnalysisConfig', baselineAnalysisConfigSchema);

module.exports = BaselineAnalysisConfig;

