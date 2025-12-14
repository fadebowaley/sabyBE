const Joi = require('joi');

/**
 * Validation schemas for Baseline Analysis Config endpoints
 */

const getAnalysisConfig = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
};

const updateEssentialMetrics = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
  body: Joi.object()
    .keys({
      essentialMetrics: Joi.object()
        .keys({
          demographics: Joi.object().keys({
            enabled: Joi.boolean(),
            analysis: Joi.object().keys({
              gender: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
              age: Joi.object().keys({
                enabled: Joi.boolean(),
                ageGroups: Joi.object().keys({
                  enabled: Joi.boolean(),
                  customGroups: Joi.array().items(
                    Joi.object().keys({
                      name: Joi.string().required(),
                      min: Joi.number().required(),
                      max: Joi.number().required(),
                    })
                  ),
                }),
              }),
              maritalStatus: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
            }),
          }),
          hierarchy: Joi.object().keys({
            enabled: Joi.boolean(),
            analysis: Joi.object().keys({
              roleMapping: Joi.object().keys({
                owners: Joi.array().items(Joi.string()),
                supers: Joi.array().items(Joi.string()),
                ordinary: Joi.array().items(Joi.string()),
              }),
              terminology: Joi.object().keys({
                owners: Joi.string(),
                supers: Joi.string(),
                ordinary: Joi.string(),
              }),
            }),
          }),
          geography: Joi.object().keys({
            enabled: Joi.boolean(),
            analysis: Joi.object().keys({
              levels: Joi.array().items(Joi.string().valid('country', 'state', 'lga', 'city', 'region')),
              customRegions: Joi.array().items(
                Joi.object().keys({
                  name: Joi.string().required(),
                  states: Joi.array().items(Joi.string()),
                  lgas: Joi.array().items(Joi.string()),
                })
              ),
            }),
          }),
          professional: Joi.object().keys({
            enabled: Joi.boolean(),
            analysis: Joi.object().keys({
              occupation: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
              employmentCategory: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
              education: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
            }),
          }),
          verification: Joi.object().keys({
            enabled: Joi.boolean(),
            analysis: Joi.object().keys({
              email: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
              phone: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
            }),
          }),
          facility: Joi.object().keys({
            enabled: Joi.boolean(),
            analysis: Joi.object().keys({
              propertyStatus: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
              buildingType: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
              facilityStatus: Joi.object().keys({
                enabled: Joi.boolean(),
              }),
            }),
          }),
        })
        .unknown(true), // Allow additional properties for extensibility
    })
    .unknown(false),
};

const updateCustomFieldAnalysis = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
    fieldId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      analysis: Joi.object()
        .keys({
          enabled: Joi.boolean(),
          type: Joi.string().valid('numeric', 'categorical', 'temporal', 'boolean'),
          numeric: Joi.object().keys({
            format: Joi.string().valid('number', 'currency', 'percentage'),
            statistics: Joi.object().keys({
              enabled: Joi.boolean(),
              include: Joi.object().keys({
                total: Joi.boolean(),
                average: Joi.boolean(),
                median: Joi.boolean(),
                min: Joi.boolean(),
                max: Joi.boolean(),
                standardDeviation: Joi.boolean(),
              }),
            }),
            distribution: Joi.object().keys({
              enabled: Joi.boolean(),
              ranges: Joi.string().valid('auto', 'custom'),
              customRanges: Joi.array().items(
                Joi.object().keys({
                  name: Joi.string().required(),
                  min: Joi.number().required(),
                  max: Joi.number().required(),
                })
              ),
            }),
            thresholds: Joi.object().keys({
              min: Joi.number(),
              max: Joi.number(),
              warning: Joi.object().keys({
                min: Joi.number(),
                max: Joi.number(),
              }),
              critical: Joi.object().keys({
                min: Joi.number(),
                max: Joi.number(),
              }),
            }),
          }),
          categorical: Joi.object().keys({
            distribution: Joi.object().keys({
              enabled: Joi.boolean(),
              topN: Joi.number().integer().min(1),
            }),
            diversity: Joi.object().keys({
              enabled: Joi.boolean(),
              maxUniqueValues: Joi.number().integer().min(1),
            }),
          }),
          temporal: Joi.object().keys({
            includeTime: Joi.boolean(),
            analysis: Joi.object().keys({
              earliest: Joi.boolean(),
              latest: Joi.boolean(),
              averageAge: Joi.boolean(),
              trends: Joi.boolean(),
            }),
          }),
          boolean: Joi.object().keys({
            analysis: Joi.object().keys({
              trueCount: Joi.boolean(),
              falseCount: Joi.boolean(),
              percentage: Joi.boolean(),
            }),
          }),
          grouping: Joi.object().keys({
            enabled: Joi.boolean(),
            groupBy: Joi.string(),
            aggregate: Joi.string().valid('sum', 'average', 'count', 'min', 'max'),
          }),
          insights: Joi.object().keys({
            enabled: Joi.boolean(),
            rules: Joi.array().items(
              Joi.object().keys({
                condition: Joi.string().required(),
                priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
                message: Joi.string().required(),
                recommendations: Joi.array().items(Joi.string()),
              })
            ),
          }),
          display: Joi.object().keys({
            label: Joi.string(),
            description: Joi.string(),
            unit: Joi.string(),
            order: Joi.number().integer(),
            category: Joi.string(),
            chartType: Joi.string().valid('bar', 'line', 'pie', 'donut', 'gauge', 'table'),
          }),
        })
        .unknown(true), // Allow additional properties for extensibility
    })
    .unknown(false),
};

const updateGlobalSettings = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
  body: Joi.object()
    .keys({
      globalSettings: Joi.object()
        .keys({
          thresholds: Joi.object().keys({
            leadershipRatio: Joi.object().keys({
              optimal: Joi.object().keys({
                min: Joi.number().required(),
                max: Joi.number().required(),
              }),
              warning: Joi.object().keys({
                min: Joi.number(),
                max: Joi.number(),
              }),
            }),
            complianceRate: Joi.object().keys({
              target: Joi.number().required(),
              warning: Joi.number(),
            }),
            capacityUtilization: Joi.object().keys({
              optimal: Joi.object().keys({
                min: Joi.number().required(),
                max: Joi.number().required(),
              }),
              warning: Joi.object().keys({
                min: Joi.number(),
                max: Joi.number(),
              }),
            }),
          }),
          customCalculations: Joi.array().items(
            Joi.object().keys({
              id: Joi.string().required(),
              name: Joi.string().required(),
              formula: Joi.string().required(),
              displayName: Joi.string().required(),
              unit: Joi.string(),
              description: Joi.string(),
              dependencies: Joi.array().items(Joi.string()),
            })
          ),
          fieldGroups: Joi.array().items(
            Joi.object().keys({
              id: Joi.string().required(),
              name: Joi.string().required(),
              fields: Joi.array().items(Joi.string()).required(),
              displayOrder: Joi.number().integer(),
              analysisType: Joi.string().valid('aggregate', 'compare', 'trend'),
            })
          ),
          insightRules: Joi.array().items(
            Joi.object().keys({
              id: Joi.string().required(),
              metric: Joi.string().required(),
              condition: Joi.string().required(),
              priority: Joi.string().valid('low', 'medium', 'high', 'critical').required(),
              message: Joi.string().required(),
              recommendations: Joi.array().items(Joi.string()),
              enabled: Joi.boolean(),
            })
          ),
        })
        .unknown(true), // Allow additional properties for extensibility
    })
    .unknown(false),
};

const syncWithTenantConfig = {
  params: Joi.object().keys({
    entityType: Joi.string().valid('user', 'node').required(),
  }),
};

module.exports = {
  getAnalysisConfig,
  updateEssentialMetrics,
  updateCustomFieldAnalysis,
  updateGlobalSettings,
  syncWithTenantConfig,
};

