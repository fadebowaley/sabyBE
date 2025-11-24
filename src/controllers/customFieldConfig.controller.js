const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { getCustomFieldConfig } = require('../services/customFieldAnalytics.service');

/**
 * Get custom field configuration for baseline analytics
 */
const getAnalyticsConfig = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params; // 'user' or 'node'

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  const config = await getCustomFieldConfig(tenantId, entityType);

  res.send({
    success: true,
    data: {
      entityType,
      fields: config,
      count: config.length,
    },
    message: `Custom field configuration retrieved for ${entityType}`,
  });
});

/**
 * Update custom field configuration for analytics
 */
const updateAnalyticsConfig = catchAsync(async (req, res) => {
  const { tenantId } = req.user;
  const { entityType } = req.params;
  const { fields } = req.body;

  if (!['user', 'node'].includes(entityType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Entity type must be "user" or "node"');
  }

  // Validate field configurations
  const validatedFields = fields.map(field => {
    const { fieldName, displayName, type, analyticsEnabled = true } = field;
    
    if (!fieldName || !displayName || !type) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Field must have fieldName, displayName, and type');
    }

    const validTypes = ['number', 'currency', 'percentage', 'select', 'radio', 'text', 'date', 'datetime', 'checkbox', 'boolean'];
    if (!validTypes.includes(type)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid field type: ${type}`);
    }

    return {
      fieldName,
      displayName,
      type,
      analyticsEnabled,
      ...pick(field, ['options', 'min', 'max', 'format'])
    };
  });

  // Update tenant configuration
  const { TenantConfig } = require('../models');
  
  const updatedConfig = await TenantConfig.findOneAndUpdate(
    { tenantId, entityType },
    { 
      $set: { 
        fields: validatedFields,
        analyticsEnabled: true,
        updatedAt: new Date()
      },
      $inc: { version: 1 }
    },
    { new: true, upsert: true }
  );

  res.send({
    success: true,
    data: updatedConfig,
    message: `Custom field analytics configuration updated for ${entityType}`,
  });
});

/**
 * Get sample custom field data for testing
 */
const getSampleData = catchAsync(async (req, res) => {
  const { entityType } = req.params;

  const sampleConfigs = {
    user: [
      {
        fieldName: 'averageAttendance',
        displayName: 'Average Attendance',
        type: 'percentage',
        analyticsEnabled: true,
        description: 'Average attendance percentage over the last 6 months'
      },
      {
        fieldName: 'riskLevel',
        displayName: 'Risk Level',
        type: 'select',
        analyticsEnabled: true,
        options: ['Low', 'Medium', 'High', 'Critical'],
        description: 'Risk assessment level'
      },
      {
        fieldName: 'lastVisit',
        displayName: 'Last Visit Date',
        type: 'date',
        analyticsEnabled: true,
        description: 'Date of last visit or interaction'
      },
      {
        fieldName: 'isVip',
        displayName: 'VIP Status',
        type: 'boolean',
        analyticsEnabled: true,
        description: 'Whether the user has VIP status'
      },
      {
        fieldName: 'monthlyContribution',
        displayName: 'Monthly Contribution',
        type: 'currency',
        analyticsEnabled: true,
        description: 'Average monthly financial contribution'
      }
    ],
    node: [
      {
        fieldName: 'estimatedSales',
        displayName: 'Estimated Monthly Sales',
        type: 'currency',
        analyticsEnabled: true,
        description: 'Estimated monthly sales revenue'
      },
      {
        fieldName: 'performanceScore',
        displayName: 'Performance Score',
        type: 'number',
        analyticsEnabled: true,
        min: 0,
        max: 100,
        description: 'Overall performance score (0-100)'
      },
      {
        fieldName: 'certificationLevel',
        displayName: 'Certification Level',
        type: 'select',
        analyticsEnabled: true,
        options: ['Bronze', 'Silver', 'Gold', 'Platinum'],
        description: 'Certification or accreditation level'
      },
      {
        fieldName: 'lastAuditDate',
        displayName: 'Last Audit Date',
        type: 'date',
        analyticsEnabled: true,
        description: 'Date of last audit or inspection'
      },
      {
        fieldName: 'hasInsurance',
        displayName: 'Has Insurance Coverage',
        type: 'boolean',
        analyticsEnabled: true,
        description: 'Whether the facility has insurance coverage'
      }
    ]
  };

  res.send({
    success: true,
    data: {
      entityType,
      sampleFields: sampleConfigs[entityType] || [],
      description: `Sample custom field configurations for ${entityType} analytics`
    },
    message: 'Sample custom field configurations retrieved',
  });
});

module.exports = {
  getAnalyticsConfig,
  updateAnalyticsConfig,
  getSampleData,
};
