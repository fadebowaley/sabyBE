const dynamicFormSchemaService = require('./dynamicFormSchema.service');
const logger = require('../../../config/logger');

/**
 * Dynamic Validation Service
 * Handles validation of form data based on dynamic schemas loaded from database
 * Supports complex validation rules, conditional validation, and custom validation
 */
class DynamicValidationService {
  /**
   * Validate form submission against dynamic schema
   * @param {Object} answers - User answers
   * @param {string} projectId - Project ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Validation result
   */
  async validateFormSubmission(answers, projectId, tenantId) {
    try {
      logger.info(`🔍 Validating form submission for project: ${projectId}`);

      // Load form schema
      const schemaResult = await dynamicFormSchemaService.loadFormSchema(
        projectId,
        tenantId
      );
      if (!schemaResult.valid) {
        return schemaResult;
      }

      const { schema } = schemaResult;
      const validationResult = {
        valid: true,
        errors: [],
        warnings: [],
        validatedData: {},
        missingFields: [],
        extraFields: [],
        schema,
        summary: {
          totalFields: schema.totalSteps,
          requiredFields: schema.validation.required.length,
          optionalFields: schema.validation.optional.length,
          completedFields: 0,
          missingRequired: 0,
          validationErrors: 0,
        },
      };

      // Validate each form element
      for (let i = 0; i < schema.elements.length; i++) {
        const element = schema.elements[i];
        const answerKey = i.toString();
        const submittedValue = answers[answerKey];

        const fieldValidation = await this.validateFormField(
          element,
          submittedValue,
          answers,
          schema
        );

        if (fieldValidation.valid) {
          validationResult.validatedData[element.id] = fieldValidation.value;
          validationResult.summary.completedFields++;
        } else {
          validationResult.valid = false;
          validationResult.summary.validationErrors++;

          if (element.validation.required) {
            validationResult.summary.missingRequired++;
            validationResult.missingFields.push(element.label);
          }

          validationResult.errors.push({
            field: element.label,
            fieldId: element.id,
            step: i,
            error: fieldValidation.error,
            type: element.type,
            required: element.validation.required,
          });
        }
      }

      // Check for extra fields
      const expectedKeys = new Set(
        schema.elements.map((_, index) => index.toString())
      );
      Object.keys(answers).forEach((key) => {
        if (!expectedKeys.has(key)) {
          validationResult.extraFields.push(key);
        }
      });

      // Validate conditional fields
      const conditionalValidation = await this.validateConditionalFields(
        schema,
        answers
      );
      if (!conditionalValidation.valid) {
        validationResult.valid = false;
        validationResult.errors.push(...conditionalValidation.errors);
        validationResult.summary.validationErrors +=
          conditionalValidation.errors.length;
      }

      // Generate summary
      validationResult.summary.completionPercentage = Math.round(
        (validationResult.summary.completedFields /
          validationResult.summary.totalFields) *
          100
      );

      logger.info(`✅ Form validation completed for project: ${projectId}`, {
        valid: validationResult.valid,
        errors: validationResult.errors.length,
        warnings: validationResult.warnings.length,
        completion: `${validationResult.summary.completionPercentage}%`,
      });

      return validationResult;
    } catch (error) {
      logger.error(
        `❌ Error validating form submission for project ${projectId}:`,
        error.message
      );
      return {
        valid: false,
        error: 'Error validating form submission',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate individual form field
   * @param {Object} element - Form element
   * @param {*} value - Field value
   * @param {Object} allAnswers - All form answers for context
   * @param {Object} schema - Form schema
   * @returns {Promise<Object>} Field validation result
   */
  async validateFormField(element, value, allAnswers, schema) {
    try {
      // Check if field is required
      if (
        element.validation.required &&
        (value === undefined || value === null || value === '')
      ) {
        return {
          valid: false,
          error: `${element.label} is required`,
          code: 'REQUIRED_FIELD_MISSING',
        };
      }

      // Skip validation for empty optional fields
      if (
        !element.validation.required &&
        (value === undefined || value === null || value === '')
      ) {
        return { valid: true, value: null };
      }

      // Type-specific validation
      const typeValidation = this.validateFieldType(element, value);
      if (!typeValidation.valid) {
        return typeValidation;
      }

      // Constraint validation
      const constraintValidation = this.validateFieldConstraints(
        element,
        value
      );
      if (!constraintValidation.valid) {
        return constraintValidation;
      }

      // Custom validation
      if (element.validation.custom) {
        const customValidation = await this.validateCustomRules(
          element,
          value,
          allAnswers,
          schema
        );
        if (!customValidation.valid) {
          return customValidation;
        }
      }

      return { valid: true, value: typeValidation.value };
    } catch (error) {
      logger.error(`❌ Error validating field ${element.id}:`, error.message);
      return {
        valid: false,
        error: `Validation error for ${element.label}`,
        code: 'FIELD_VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate field type
   * @param {Object} element - Form element
   * @param {*} value - Field value
   * @returns {Object} Type validation result
   */
  validateFieldType(element, value) {
    const { type } = element;
    const rules = element.validation.rules || {};

    try {
      switch (type) {
        case 'text':
          return this.validateText(value, rules);
        case 'email':
          return this.validateEmail(value, rules);
        case 'phone':
          return this.validatePhone(value, rules);
        case 'number':
          return this.validateNumber(value, rules);
        case 'date':
          return this.validateDate(value, rules);
        case 'time':
          return this.validateTime(value, rules);
        case 'url':
          return this.validateUrl(value, rules);
        case 'select':
        case 'radio':
          return this.validateSelect(value, element, rules);
        case 'checkbox':
          return this.validateCheckbox(value, element, rules);
        case 'file':
          return this.validateFile(value, rules);
        case 'textarea':
          return this.validateTextarea(value, rules);
        default:
          return this.validateText(value, rules);
      }
    } catch (error) {
      return {
        valid: false,
        error: `Type validation error: ${error.message}`,
        code: 'TYPE_VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate text field
   */
  validateText(value, rules) {
    if (typeof value !== 'string') {
      return {
        valid: false,
        error: 'Value must be text',
        code: 'INVALID_TYPE',
      };
    }

    if (rules.minLength && value.length < rules.minLength) {
      return {
        valid: false,
        error: `Text must be at least ${rules.minLength} characters`,
        code: 'MIN_LENGTH',
      };
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      return {
        valid: false,
        error: `Text must be no more than ${rules.maxLength} characters`,
        code: 'MAX_LENGTH',
      };
    }

    if (rules.pattern) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        return {
          valid: false,
          error: 'Text does not match required pattern',
          code: 'PATTERN_MISMATCH',
        };
      }
    }

    return { valid: true, value };
  }

  /**
   * Validate email field
   */
  validateEmail(value, rules) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return {
        valid: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      };
    }

    return { valid: true, value: value.toLowerCase() };
  }

  /**
   * Validate phone field
   */
  validatePhone(value, rules) {
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanValue = value.replace(/[\s\-\(\)]/g, '');

    if (!phoneRegex.test(cleanValue)) {
      return {
        valid: false,
        error: 'Invalid phone number format',
        code: 'INVALID_PHONE',
      };
    }

    return { valid: true, value: cleanValue };
  }

  /**
   * Validate number field
   */
  validateNumber(value, rules) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return {
        valid: false,
        error: 'Value must be a number',
        code: 'INVALID_NUMBER',
      };
    }

    if (rules.min !== undefined && num < rules.min) {
      return {
        valid: false,
        error: `Value must be at least ${rules.min}`,
        code: 'MIN_VALUE',
      };
    }

    if (rules.max !== undefined && num > rules.max) {
      return {
        valid: false,
        error: `Value must be at most ${rules.max}`,
        code: 'MAX_VALUE',
      };
    }

    return { valid: true, value: num };
  }

  /**
   * Validate date field
   */
  validateDate(value, rules) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return {
        valid: false,
        error: 'Invalid date format',
        code: 'INVALID_DATE',
      };
    }

    return { valid: true, value: date.toISOString() };
  }

  /**
   * Validate time field
   */
  validateTime(value, rules) {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (!timeRegex.test(value)) {
      return {
        valid: false,
        error: 'Invalid time format (HH:MM or HH:MM:SS)',
        code: 'INVALID_TIME',
      };
    }

    return { valid: true, value };
  }

  /**
   * Validate URL field
   */
  validateUrl(value, rules) {
    try {
      new URL(value);
      return { valid: true, value };
    } catch {
      return { valid: false, error: 'Invalid URL format', code: 'INVALID_URL' };
    }
  }

  /**
   * Validate select/radio field
   */
  validateSelect(value, element, rules) {
    const options = element.options || [];
    const validValues = options.map((option) => option.value);

    if (!validValues.includes(value)) {
      return {
        valid: false,
        error: `Value must be one of: ${validValues.join(', ')}`,
        code: 'INVALID_OPTION',
      };
    }

    return { valid: true, value };
  }

  /**
   * Validate checkbox field
   */
  validateCheckbox(value, element, rules) {
    if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
      return {
        valid: false,
        error: 'Value must be true or false',
        code: 'INVALID_BOOLEAN',
      };
    }

    const boolValue = value === true || value === 'true';
    return { valid: true, value: boolValue };
  }

  /**
   * Validate file field
   */
  validateFile(value, rules) {
    if (!value || typeof value !== 'object') {
      return { valid: false, error: 'File is required', code: 'FILE_REQUIRED' };
    }

    // Validate file size
    if (rules.fileSize && value.size > rules.fileSize) {
      return {
        valid: false,
        error: `File size must be less than ${rules.fileSize} bytes`,
        code: 'FILE_TOO_LARGE',
      };
    }

    // Validate file type
    if (rules.fileTypes && rules.fileTypes.length > 0) {
      const fileExtension = value.filename
        ? value.filename.split('.').pop().toLowerCase()
        : '';
      const mimeType = value.mime_type || '';

      const isValidType = rules.fileTypes.some(
        (type) =>
          fileExtension === type.toLowerCase() ||
          mimeType.includes(type.toLowerCase())
      );

      if (!isValidType) {
        return {
          valid: false,
          error: `File type must be one of: ${rules.fileTypes.join(', ')}`,
          code: 'INVALID_FILE_TYPE',
        };
      }
    }

    return { valid: true, value };
  }

  /**
   * Validate textarea field
   */
  validateTextarea(value, rules) {
    return this.validateText(value, rules);
  }

  /**
   * Validate field constraints
   * @param {Object} element - Form element
   * @param {*} value - Field value
   * @returns {Object} Constraint validation result
   */
  validateFieldConstraints(element, value) {
    const constraints = element.constraints || {};

    // Add any additional constraint validation here
    // This can include business logic, dependencies, etc.

    return { valid: true, value };
  }

  /**
   * Validate custom rules
   * @param {Object} element - Form element
   * @param {*} value - Field value
   * @param {Object} allAnswers - All form answers
   * @param {Object} schema - Form schema
   * @returns {Promise<Object>} Custom validation result
   */
  async validateCustomRules(element, value, allAnswers, schema) {
    // This is where you would implement custom validation logic
    // For now, return valid
    return { valid: true, value };
  }

  /**
   * Validate conditional fields
   * @param {Object} schema - Form schema
   * @param {Object} answers - Form answers
   * @returns {Promise<Object>} Conditional validation result
   */
  async validateConditionalFields(schema, answers) {
    const errors = [];

    // Implement conditional validation logic here
    // This would check if conditional fields are properly filled based on other field values

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get validation error message
   * @param {Object} element - Form element
   * @param {string} errorCode - Error code
   * @returns {string} User-friendly error message
   */
  getValidationErrorMessage(element, errorCode) {
    const errorMessages = element.validation.errorMessages || {};

    if (errorMessages[errorCode]) {
      return errorMessages[errorCode];
    }

    // Default error messages
    const defaultMessages = {
      REQUIRED_FIELD_MISSING: `${element.label} is required`,
      INVALID_TYPE: `${element.label} has an invalid format`,
      MIN_LENGTH: `${element.label} must be at least ${element.constraints?.minLength} characters`,
      MAX_LENGTH: `${element.label} must be no more than ${element.constraints?.maxLength} characters`,
      MIN_VALUE: `${element.label} must be at least ${element.constraints?.min}`,
      MAX_VALUE: `${element.label} must be at most ${element.constraints?.max}`,
      INVALID_EMAIL: `${element.label} must be a valid email address`,
      INVALID_PHONE: `${element.label} must be a valid phone number`,
      INVALID_DATE: `${element.label} must be a valid date`,
      INVALID_TIME: `${element.label} must be a valid time`,
      INVALID_URL: `${element.label} must be a valid URL`,
      INVALID_OPTION: `${element.label} must be one of the available options`,
      INVALID_BOOLEAN: `${element.label} must be true or false`,
      FILE_REQUIRED: `${element.label} file is required`,
      FILE_TOO_LARGE: `${element.label} file is too large`,
      INVALID_FILE_TYPE: `${element.label} file type is not allowed`,
      PATTERN_MISMATCH: `${element.label} does not match the required format`,
    };

    return defaultMessages[errorCode] || `${element.label} is invalid`;
  }
}

module.exports = new DynamicValidationService();
