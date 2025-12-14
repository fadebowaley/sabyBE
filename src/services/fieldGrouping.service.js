const logger = require('../config/logger');

/**
 * Field Grouping Service
 * Organizes metrics into logical groups for better report organization
 */

/**
 * Get field value from metrics by field ID/path
 * @param {Object} metrics - Metrics object
 * @param {string} fieldId - Field ID or path (e.g., "users.total" or "customAnalytics.users.numeric[0].statistics.average")
 * @returns {*} Field value or null
 */
const getFieldValue = (metrics, fieldId) => {
  try {
    // Handle nested paths with dots
    if (fieldId.includes('.')) {
      const parts = fieldId.split('.');
      let value = metrics;
      
      for (const part of parts) {
        // Handle array indices like "numeric[0]"
        if (part.includes('[') && part.includes(']')) {
          const [key, indexStr] = part.split('[');
          const index = parseInt(indexStr.replace(']', ''), 10);
          if (value?.[key] && Array.isArray(value[key]) && value[key][index] !== undefined) {
            value = value[key][index];
          } else {
            return null;
          }
        } else {
          if (value?.[part] === undefined) {
            return null;
          }
          value = value[part];
        }
      }
      
      return value;
    }
    
    // Simple field access
    return metrics[fieldId] || null;
  } catch (error) {
    logger.error(`Error getting field value for "${fieldId}":`, error);
    return null;
  }
};

/**
 * Apply field groups to metrics
 * Organizes metrics into groups based on fieldGroups configuration
 * @param {Object} metrics - Baseline metrics
 * @param {Array} fieldGroups - Field groups configuration
 * @returns {Object} Metrics organized by groups
 */
const applyFieldGroups = (metrics, fieldGroups) => {
  if (!fieldGroups || !Array.isArray(fieldGroups) || fieldGroups.length === 0) {
    return {
      ...metrics,
      fieldGroups: null, // Indicate no grouping applied
    };
  }

  // Sort groups by displayOrder
  const sortedGroups = [...fieldGroups].sort((a, b) => 
    (a.displayOrder || 0) - (b.displayOrder || 0)
  );

  const groupedMetrics = {
    ...metrics,
    fieldGroups: sortedGroups.map((group) => {
      const groupData = {
        id: group.id,
        name: group.name,
        analysisType: group.analysisType || 'aggregate',
        displayOrder: group.displayOrder || 0,
        fields: [],
      };

      // Extract field values for each field in the group
      if (group.fields && Array.isArray(group.fields)) {
        groupData.fields = group.fields
          .map((fieldId) => {
            const value = getFieldValue(metrics, fieldId);
            if (value !== null && value !== undefined) {
              return {
                fieldId,
                value,
                // Include metadata if available
                displayName: fieldId, // Could be enhanced to lookup display names
              };
            }
            return null;
          })
          .filter(Boolean); // Remove null entries
      }

      // Perform group-level analysis based on analysisType
      if (groupData.fields.length > 0) {
        switch (group.analysisType) {
          case 'aggregate':
            // Calculate aggregate statistics for numeric fields
            const numericValues = groupData.fields
              .map((f) => {
                const val = typeof f.value === 'number' ? f.value : null;
                return val;
              })
              .filter((v) => v !== null);
            
            if (numericValues.length > 0) {
              groupData.aggregate = {
                sum: numericValues.reduce((a, b) => a + b, 0),
                average: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
                min: Math.min(...numericValues),
                max: Math.max(...numericValues),
                count: numericValues.length,
              };
            }
            break;

          case 'compare':
            // Prepare data for comparison (e.g., before/after, node vs network)
            groupData.comparison = {
              fields: groupData.fields.map((f) => ({
                fieldId: f.fieldId,
                value: f.value,
                displayName: f.displayName,
              })),
            };
            break;

          case 'trend':
            // Prepare data for trend analysis (would need historical data)
            groupData.trend = {
              fields: groupData.fields.map((f) => ({
                fieldId: f.fieldId,
                value: f.value,
                displayName: f.displayName,
                // Trend analysis would require historical data
              })),
            };
            break;
        }
      }

      return groupData;
    }),
  };

  return groupedMetrics;
};

/**
 * Get available field IDs from metrics structure
 * Recursively extracts all field paths from metrics object
 * @param {Object} metrics - Metrics object
 * @param {string} prefix - Current path prefix
 * @returns {Array} Array of field paths
 */
const getAvailableFieldIds = (metrics, prefix = '') => {
  const fieldIds = [];

  if (metrics === null || metrics === undefined) {
    return fieldIds;
  }

  if (Array.isArray(metrics)) {
    metrics.forEach((item, index) => {
      if (typeof item === 'object' && item !== null) {
        fieldIds.push(...getAvailableFieldIds(item, `${prefix}[${index}]`));
      }
    });
  } else if (typeof metrics === 'object') {
    Object.keys(metrics).forEach((key) => {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const value = metrics[key];

      if (value === null || value === undefined) {
        // Skip null/undefined values
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Recursively process nested objects
        fieldIds.push(...getAvailableFieldIds(value, currentPath));
      } else {
        // Add primitive value path
        fieldIds.push(currentPath);
      }
    });
  }

  return fieldIds;
};

/**
 * Validate field group configuration
 * @param {Object} fieldGroup - Field group configuration
 * @param {Object} metrics - Metrics object (for validation)
 * @returns {Object} Validation result { valid: boolean, errors: [] }
 */
const validateFieldGroup = (fieldGroup, metrics = null) => {
  const errors = [];

  if (!fieldGroup.id) {
    errors.push('Field group must have an id');
  }

  if (!fieldGroup.name) {
    errors.push('Field group must have a name');
  }

  if (!fieldGroup.fields || !Array.isArray(fieldGroup.fields) || fieldGroup.fields.length === 0) {
    errors.push('Field group must have at least one field');
  }

  if (fieldGroup.analysisType && !['aggregate', 'compare', 'trend'].includes(fieldGroup.analysisType)) {
    errors.push('analysisType must be one of: aggregate, compare, trend');
  }

  // Validate field IDs exist in metrics if metrics provided
  if (metrics && fieldGroup.fields) {
    const availableFields = getAvailableFieldIds(metrics);
    const invalidFields = fieldGroup.fields.filter(
      (fieldId) => !availableFields.includes(fieldId)
    );
    
    if (invalidFields.length > 0) {
      errors.push(`Invalid field IDs: ${invalidFields.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  applyFieldGroups,
  getFieldValue,
  getAvailableFieldIds,
  validateFieldGroup,
};

