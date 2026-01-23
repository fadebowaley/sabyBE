const { projectFormService } = require('../../../services');
const logger = require('../../../config/logger');

/**
 * Dynamic Form Schema Service
 * Handles dynamic loading and processing of form schemas from database
 * Includes form elements, validation rules, and submission requirements
 */
class DynamicFormSchemaService {
  /**
   * Load complete form schema for a project
   * @param {string} projectId - Project ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Complete form schema with elements and validation
   */
  async loadFormSchema(projectId, tenantId) {
    try {
      logger.info(
        `🔍 Loading dynamic form schema for project: ${projectId}, tenant: ${tenantId}`
      );

      // Get project form from database
      const projectForm = await projectFormService.getProjectFormByProjectId(
        projectId
      );

      if (!projectForm) {
        logger.warn(`❌ Project form not found: ${projectId}`);
        return {
          valid: false,
          error: 'Project form not found',
          code: 'PROJECT_NOT_FOUND',
        };
      }

      // Validate project belongs to tenant
      if (projectForm.tenantId !== tenantId) {
        logger.warn(
          `❌ Project ${projectId} does not belong to tenant ${tenantId}`
        );
        return {
          valid: false,
          error: 'Project does not belong to your tenant',
          code: 'TENANT_MISMATCH',
        };
      }

      // Validate project is active and published
      if (
        projectForm.status !== 'active' ||
        projectForm.metadata?.deploymentStatus !== 'published'
      ) {
        logger.warn(`❌ Project ${projectId} is not active or published`);
        return {
          valid: false,
          error: 'Project is not active or published',
          code: 'PROJECT_NOT_ACTIVE',
        };
      }

      // Process form schema
      const formSchema = this.processFormSchema(projectForm);

      logger.info(
        `✅ Form schema loaded successfully for project: ${projectId}`
      );
      return { valid: true, schema: formSchema };
    } catch (error) {
      logger.error(
        `❌ Error loading form schema for project ${projectId}:`,
        error.message
      );
      return {
        valid: false,
        error: 'Error loading form schema',
        code: 'LOAD_ERROR',
      };
    }
  }

  /**
   * Process raw project form into structured schema
   * @param {Object} projectForm - Raw project form from database
   * @returns {Object} Processed form schema
   */
  processFormSchema(projectForm) {
    try {
      const elements = projectForm.elements || [];
      const configuration = projectForm.configuration || {};
      const metadata = projectForm.metadata || {};

      const processedSchema = {
        projectId: projectForm.projectId,
        projectName: configuration.projectName || projectForm.projectId,
        description: configuration.description || '',
        version: metadata.version || '1.0',
        totalSteps: elements.length,
        elements: [],
        validation: {
          required: [],
          optional: [],
          conditional: [],
        },
        submission: {
          allowPartial: metadata.allowPartial || false,
          requireAllFields: metadata.requireAllFields || true,
          maxRetries: metadata.maxRetries || 3,
          autoSave: metadata.autoSave || true,
        },
        metadata: {
          createdBy: projectForm.createdBy,
          createdAt: projectForm.createdAt,
          updatedAt: projectForm.updatedAt,
          deploymentStatus: metadata.deploymentStatus,
          formType: metadata.formType || 'standard',
          category: metadata.category || 'general',
        },
      };

      // Process each form element
      elements.forEach((element, index) => {
        const processedElement = this.processFormElement(element, index);
        processedSchema.elements.push(processedElement);

        // Track validation requirements
        if (processedElement.validation.required) {
          processedSchema.validation.required.push(index);
        } else {
          processedSchema.validation.optional.push(index);
        }

        // Track conditional validation
        if (processedElement.validation.conditional) {
          processedSchema.validation.conditional.push(index);
        }
      });

      return processedSchema;
    } catch (error) {
      logger.error(`❌ Error processing form schema:`, error.message);
      throw error;
    }
  }

  /**
   * Process individual form element
   * @param {Object} element - Raw form element
   * @param {number} index - Element index
   * @returns {Object} Processed form element
   */
  processFormElement(element, index) {
    const properties = element.properties || {};
    const validation = element.validation || {};

    const processedElement = {
      id: element.id || `field_${index}`,
      type: element.type || 'text',
      index,
      label: properties.label || `Question ${index + 1}`,
      description: properties.description || '',
      placeholder: properties.placeholder || '',
      helpText: properties.helpText || '',
      order: properties.order || index,
      validation: {
        required: properties.required || false,
        conditional: validation.conditional || null,
        rules: this.processValidationRules(validation),
        custom: validation.custom || null,
        errorMessages: validation.errorMessages || {},
      },
      options: this.processElementOptions(element),
      constraints: this.processElementConstraints(element),
      metadata: {
        fieldType: element.fieldType || 'standard',
        category: properties.category || 'general',
        tags: properties.tags || [],
        isSensitive: properties.isSensitive || false,
        isCalculated: properties.isCalculated || false,
      },
    };

    return processedElement;
  }

  /**
   * Process validation rules for an element
   * @param {Object} validation - Raw validation object
   * @returns {Object} Processed validation rules
   */
  processValidationRules(validation) {
    const rules = {};

    // Basic validation rules
    if (validation.minLength !== undefined)
      rules.minLength = validation.minLength;
    if (validation.maxLength !== undefined)
      rules.maxLength = validation.maxLength;
    if (validation.min !== undefined) rules.min = validation.min;
    if (validation.max !== undefined) rules.max = validation.max;
    if (validation.pattern !== undefined) rules.pattern = validation.pattern;
    if (validation.format !== undefined) rules.format = validation.format;

    // Type-specific validation
    if (validation.email !== undefined) rules.email = validation.email;
    if (validation.phone !== undefined) rules.phone = validation.phone;
    if (validation.url !== undefined) rules.url = validation.url;
    if (validation.date !== undefined) rules.date = validation.date;
    if (validation.time !== undefined) rules.time = validation.time;

    // File validation
    if (validation.fileSize !== undefined) rules.fileSize = validation.fileSize;
    if (validation.fileTypes !== undefined)
      rules.fileTypes = validation.fileTypes;
    if (validation.maxFiles !== undefined) rules.maxFiles = validation.maxFiles;

    // Custom validation
    if (validation.customRules !== undefined)
      rules.customRules = validation.customRules;

    return rules;
  }

  /**
   * Process element options (for select, radio, checkbox)
   * @param {Object} element - Form element
   * @returns {Array} Processed options
   */
  processElementOptions(element) {
    const properties = element.properties || {};
    const options = properties.options || [];

    return options
      .map((option, index) => {
        if (typeof option === 'string') {
          return {
            value: option,
            label: option,
            index,
          };
        }
        if (typeof option === 'object') {
          return {
            value: option.value || option.label || `option_${index}`,
            label: option.label || option.value || `Option ${index + 1}`,
            index,
            description: option.description || '',
            disabled: option.disabled || false,
            metadata: option.metadata || {},
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  /**
   * Process element constraints
   * @param {Object} element - Form element
   * @returns {Object} Processed constraints
   */
  processElementConstraints(element) {
    const properties = element.properties || {};
    const validation = element.validation || {};

    return {
      min: validation.min || properties.min,
      max: validation.max || properties.max,
      minLength: validation.minLength || properties.minLength,
      maxLength: validation.maxLength || properties.maxLength,
      step: validation.step || properties.step,
      pattern: validation.pattern || properties.pattern,
      format: validation.format || properties.format,
      fileSize: validation.fileSize || properties.fileSize,
      fileTypes: validation.fileTypes || properties.fileTypes,
      maxFiles: validation.maxFiles || properties.maxFiles,
      dependencies: validation.dependencies || properties.dependencies,
      visibility: validation.visibility || properties.visibility,
    };
  }

  /**
   * Get form element by index
   * @param {Object} schema - Form schema
   * @param {number} index - Element index
   * @returns {Object|null} Form element or null
   */
  getElementByIndex(schema, index) {
    if (
      !schema ||
      !schema.elements ||
      index < 0 ||
      index >= schema.elements.length
    ) {
      return null;
    }
    return schema.elements[index];
  }

  /**
   * Get next element in form
   * @param {Object} schema - Form schema
   * @param {number} currentIndex - Current element index
   * @returns {Object|null} Next element or null if at end
   */
  getNextElement(schema, currentIndex) {
    return this.getElementByIndex(schema, currentIndex + 1);
  }

  /**
   * Get previous element in form
   * @param {Object} schema - Form schema
   * @param {number} currentIndex - Current element index
   * @returns {Object|null} Previous element or null if at beginning
   */
  getPreviousElement(schema, currentIndex) {
    return this.getElementByIndex(schema, currentIndex - 1);
  }

  /**
   * Check if form is complete
   * @param {Object} schema - Form schema
   * @param {number} currentStep - Current step
   * @returns {boolean} True if form is complete
   */
  isFormComplete(schema, currentStep) {
    return currentStep >= schema.totalSteps;
  }

  /**
   * Get form progress percentage
   * @param {Object} schema - Form schema
   * @param {number} currentStep - Current step
   * @returns {number} Progress percentage (0-100)
   */
  getFormProgress(schema, currentStep) {
    if (schema.totalSteps === 0) return 100;
    return Math.round((currentStep / schema.totalSteps) * 100);
  }

  /**
   * Validate form schema structure
   * @param {Object} schema - Form schema to validate
   * @returns {Object} Validation result
   */
  validateSchemaStructure(schema) {
    const errors = [];

    if (!schema.projectId) {
      errors.push('Missing projectId');
    }

    if (!schema.elements || !Array.isArray(schema.elements)) {
      errors.push('Missing or invalid elements array');
    }

    if (schema.elements && schema.elements.length > 0) {
      schema.elements.forEach((element, index) => {
        if (!element.id) {
          errors.push(`Element ${index}: Missing id`);
        }
        if (!element.type) {
          errors.push(`Element ${index}: Missing type`);
        }
        if (!element.label) {
          errors.push(`Element ${index}: Missing label`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get form summary for display
   * @param {Object} schema - Form schema
   * @returns {Object} Form summary
   */
  getFormSummary(schema) {
    const elementTypes = {};
    const requiredCount = schema.validation.required.length;
    const optionalCount = schema.validation.optional.length;

    schema.elements.forEach((element) => {
      elementTypes[element.type] = (elementTypes[element.type] || 0) + 1;
    });

    return {
      projectName: schema.projectName,
      totalQuestions: schema.totalSteps,
      requiredQuestions: requiredCount,
      optionalQuestions: optionalCount,
      estimatedTime: this.estimateFormTime(schema),
      elementTypes,
      categories: this.getFormCategories(schema),
    };
  }

  /**
   * Estimate form completion time
   * @param {Object} schema - Form schema
   * @returns {number} Estimated time in minutes
   */
  estimateFormTime(schema) {
    let totalTime = 0;

    schema.elements.forEach((element) => {
      switch (element.type) {
        case 'text':
        case 'email':
        case 'phone':
        case 'number':
          totalTime += 1; // 1 minute per text field
          break;
        case 'select':
        case 'radio':
          totalTime += 0.5; // 30 seconds per selection
          break;
        case 'checkbox':
          totalTime += 0.3; // 20 seconds per checkbox
          break;
        case 'date':
          totalTime += 0.5; // 30 seconds per date
          break;
        case 'file':
          totalTime += 2; // 2 minutes per file upload
          break;
        default:
          totalTime += 1; // Default 1 minute
      }
    });

    return Math.ceil(totalTime);
  }

  /**
   * Get form categories
   * @param {Object} schema - Form schema
   * @returns {Array} Array of categories
   */
  getFormCategories(schema) {
    const categories = new Set();

    schema.elements.forEach((element) => {
      if (element.metadata && element.metadata.category) {
        categories.add(element.metadata.category);
      }
    });

    return Array.from(categories);
  }
}

module.exports = new DynamicFormSchemaService();
