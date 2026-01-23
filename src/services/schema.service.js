const User = require('../models/user.model');
const Nodes = require('../models/node.model');
const tenantConfigService = require('./tenantConfig.service');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * Extract schema information from Mongoose schema
 * @param {mongoose.Schema} schema - Mongoose schema
 * @param {string} prefix - Path prefix for nested schemas
 * @returns {Object} Schema definition with fields and their properties
 */
const extractMongooseSchema = (schema, prefix = '') => {
  const fields = {};
  const schemaPaths = schema.paths;

  for (const [pathName, schemaType] of Object.entries(schemaPaths)) {
    // Skip internal fields
    if (pathName.startsWith('_') || pathName === 'id' || pathName === '__v') {
      continue;
    }

    const fullPath = prefix ? `${prefix}.${pathName}` : pathName;

    const fieldInfo = {
      path: fullPath,
      type: getFieldType(schemaType),
      required: schemaType.isRequired || false,
      default: schemaType.defaultValue !== undefined ? schemaType.defaultValue : null,
      enum: schemaType.enumValues && schemaType.enumValues.length > 0 ? schemaType.enumValues : null,
      description: schemaType.options?.description || null,
    };

    // Handle nested objects (like profile)
    if (schemaType.schema) {
      fieldInfo.nested = extractMongooseSchema(schemaType.schema, fullPath);
    }

    // Handle arrays
    if (schemaType.instance === 'Array') {
      fieldInfo.isArray = true;
      if (schemaType.caster) {
        if (schemaType.caster.instance === 'ObjectID') {
          fieldInfo.ref = schemaType.caster.options?.ref || null;
        } else if (schemaType.caster.schema) {
          // Array of subdocuments
          fieldInfo.nested = extractMongooseSchema(schemaType.caster.schema, fullPath);
        }
      }
    }

    // Handle ObjectId references
    if (schemaType.instance === 'ObjectID') {
      fieldInfo.ref = schemaType.options?.ref || null;
    }

    fields[pathName] = fieldInfo;
  }

  return fields;
};

/**
 * Get JavaScript type from Mongoose schema type
 * @param {*} schemaType - Mongoose schema type
 * @returns {string} JavaScript type
 */
const getFieldType = (schemaType) => {
  if (schemaType.instance === 'String') return 'string';
  if (schemaType.instance === 'Number') return 'number';
  if (schemaType.instance === 'Date') return 'date';
  if (schemaType.instance === 'Boolean') return 'boolean';
  if (schemaType.instance === 'ObjectID') return 'objectId';
  if (schemaType.instance === 'Array') return 'array';
  if (schemaType.instance === 'Decimal128') return 'decimal';
  if (schemaType.instance === 'Mixed') return 'mixed';
  if (schemaType.instance === 'Object') return 'object';
  return 'unknown';
};

/**
 * Get User schema with custom fields
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Complete user schema
 */
const getUserSchema = async (tenantId) => {
  try {
    // Get standard fields from User model
    const userSchema = User.schema;
    const standardFields = extractMongooseSchema(userSchema);

    // Get custom fields configuration from TenantConfig
    let customFieldsConfig = [];
    try {
      const tenantConfig = await tenantConfigService.getTenantConfig(tenantId, 'user');
      if (tenantConfig && tenantConfig.fields) {
        customFieldsConfig = tenantConfig.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required || false,
          defaultValue: field.defaultValue || null,
          placeholder: field.placeholder || null,
          description: field.description || null,
          options: field.options || [],
          validation: field.validation ? Object.fromEntries(field.validation) : {},
          visibility: field.visibility || {},
          ui: field.ui || {},
          analytics: field.analytics || {},
        }));
      }
    } catch (error) {
      console.warn(`[SchemaService] Could not load custom fields for tenant ${tenantId}:`, error.message);
    }

    // Organize fields by category
    const organizedFields = {
      // Identity fields
      identity: {
        userId: standardFields.userId,
        haloId: standardFields.haloId,
        tenantId: standardFields.tenantId,
      },
      // Basic information
      basic: {
        firstname: standardFields.firstname,
        lastname: standardFields.lastname,
        email: standardFields.email,
        phoneNumber: standardFields.phoneNumber,
        avatar: standardFields.avatar,
        status: standardFields.status,
      },
      // Profile fields (nested object)
      profile: standardFields.profile?.nested || {},
      // Roles and permissions
      roles: {
        roles: standardFields.roles,
        isOwner: standardFields.isOwner,
        isSuper: standardFields.isSuper,
        isSaby: standardFields.isSaby,
        isAdmin: standardFields.isAdmin,
      },
      // Verification
      verification: {
        isEmailVerified: standardFields.isEmailVerified,
        isPhoneVerified: standardFields.isPhoneVerified,
        otpVerified: standardFields.otpVerified,
      },
      // Compliance
      compliance: {
        profileUpdateCompliant: standardFields.profileUpdateCompliant,
        profileUpdateCompliantAt: standardFields.profileUpdateCompliantAt,
        profileUpdateCompliantBy: standardFields.profileUpdateCompliantBy,
      },
      // Metadata
      metadata: {
        createdBy: standardFields.createdBy,
        createdAt: standardFields.createdAt,
        updatedAt: standardFields.updatedAt,
        deletedAt: standardFields.deletedAt,
      },
      // Custom fields (tenant-specific)
      customFields: {
        type: 'object',
        description: 'Tenant-specific custom fields',
        fields: customFieldsConfig,
      },
    };

    return {
      entityType: 'user',
      tenantId,
      standardFields: organizedFields,
      customFields: customFieldsConfig,
      version: 1,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[SchemaService] Error getting user schema:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to get user schema');
  }
};

/**
 * Get Node schema with custom fields
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Complete node schema
 */
const getNodeSchema = async (tenantId) => {
  try {
    // Get standard fields from Node model
    const nodeSchema = Nodes.schema;
    const standardFields = extractMongooseSchema(nodeSchema);

    // Get custom fields configuration from TenantConfig
    let customFieldsConfig = [];
    try {
      const tenantConfig = await tenantConfigService.getTenantConfig(tenantId, 'node');
      if (tenantConfig && tenantConfig.fields) {
        customFieldsConfig = tenantConfig.fields.map((field) => ({
          id: field.id,
          label: field.label,
          type: field.type,
          required: field.required || false,
          defaultValue: field.defaultValue || null,
          placeholder: field.placeholder || null,
          description: field.description || null,
          options: field.options || [],
          validation: field.validation ? Object.fromEntries(field.validation) : {},
          visibility: field.visibility || {},
          ui: field.ui || {},
          analytics: field.analytics || {},
        }));
      }
    } catch (error) {
      console.warn(`[SchemaService] Could not load custom fields for tenant ${tenantId}:`, error.message);
    }

    // Organize fields by category
    const organizedFields = {
      // Identity fields
      identity: {
        nodeId: standardFields.nodeId,
        tenantId: standardFields.tenantId,
      },
      // Basic information
      basic: {
        name: standardFields.name,
        address: standardFields.address,
        city: standardFields.city,
        state: standardFields.state,
        country: standardFields.country,
        postalCode: standardFields.postalCode,
        isMain: standardFields.isMain,
        isActive: standardFields.isActive,
      },
      // Hierarchy
      hierarchy: {
        level: standardFields.level,
        structure: standardFields.structure,
        parent: standardFields.parent,
        path: standardFields.path,
        identity: standardFields.identity,
        hierarchy: standardFields.hierarchy,
      },
      // Profile fields (nested object)
      profile: standardFields.profile?.nested || {},
      // Relationships
      relationships: {
        users: standardFields.users,
        dateOfEstablishment: standardFields.dateOfEstablishment,
      },
      // Compliance
      compliance: {
        profileUpdateCompliant: standardFields.profileUpdateCompliant,
        profileUpdateCompliantAt: standardFields.profileUpdateCompliantAt,
        profileUpdateCompliantBy: standardFields.profileUpdateCompliantBy,
      },
      // Metadata
      metadata: {
        createdAt: standardFields.createdAt,
        updatedAt: standardFields.updatedAt,
        deletedAt: standardFields.deletedAt,
      },
      // Custom fields (tenant-specific)
      customFields: {
        type: 'object',
        description: 'Tenant-specific custom fields',
        fields: customFieldsConfig,
      },
    };

    return {
      entityType: 'node',
      tenantId,
      standardFields: organizedFields,
      customFields: customFieldsConfig,
      version: 1,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[SchemaService] Error getting node schema:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to get node schema');
  }
};

module.exports = {
  getUserSchema,
  getNodeSchema,
};

