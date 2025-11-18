const { userService } = require('../../../services');
const { projectFormService } = require('../../../services');
const duplicatePreventionService = require('../../../services/duplicatePrevention.service');
const notificationQueueService = require('../../../services/notificationQueue.service');
const logger = require('../../../config/logger');

/**
 * WhatsApp Validation Service
 * Handles validation of WhatsApp submissions including:
 * 1. User authentication (phone number verification)
 * 2. Project form validation (project must exist and user must have access)
 * 3. Form field validation (submitted data must match form requirements)
 * 4. Session management and state tracking
 */

class WhatsAppValidationService {
  /**
   * Validate user by phone number
   * @param {string} phoneNumber - Phone number from WhatsApp
   * @param {string} tenantId - Tenant ID for the submission
   * @returns {Promise<Object>} User object if valid, null if invalid
   */
  async validateUserByPhone(phoneNumber, tenantId) {
    try {
      logger.info(
        `🔍 Validating WhatsApp user by phone: ${phoneNumber} for tenant: ${tenantId}`
      );

      // Find user by phone number
      const user = await userService.getUserByPhone(phoneNumber);
      console.log(
        `[whatsappValidationService] getUserByPhone(${phoneNumber}) result:`,
        user
      );
      if (!user) {
        logger.warn(`❌ WhatsApp user not found: ${phoneNumber}`);
        return {
          valid: false,
          error: 'User is not registered',
          code: 'USER_NOT_FOUND',
        };
      }

      // Check if user belongs to the tenant
      if (user.tenantId !== tenantId) {
        logger.warn(
          `❌ WhatsApp user ${phoneNumber} does not belong to tenant ${tenantId}`
        );
        return {
          valid: false,
          error: 'User does not belong to this tenant',
          code: 'TENANT_MISMATCH',
        };
      }

      // Check if user is active (not soft deleted)
      if (user.deletedAt) {
        logger.warn(`❌ WhatsApp user ${phoneNumber} is deleted`);
        return {
          valid: false,
          error: 'User account is inactive',
          code: 'USER_DELETED',
        };
      }

      logger.info(
        `✅ WhatsApp user validated: ${phoneNumber} (User ID: ${user._id})`
      );
      return { valid: true, user };
    } catch (error) {
      logger.error(
        `❌ Error validating WhatsApp user ${phoneNumber}:`,
        error.message
      );
      return {
        valid: false,
        error: 'Error validating user',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate project form exists and user has access
   * @param {string} projectId - Project ID
   * @param {Object} user - User object from validation
   * @returns {Promise<Object>} Project form object if valid, null if invalid
   */
  async validateProjectForm(projectId, user) {
    try {
      logger.info(
        `🔍 Validating project form: ${projectId} for WhatsApp user: ${user.phone}`
      );

      // Find project form by project ID
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

      // Check if project belongs to the same tenant as user
      if (projectForm.tenantId !== user.tenantId) {
        logger.warn(
          `❌ Project ${projectId} does not belong to user's tenant ${user.tenantId}`
        );
        return {
          valid: false,
          error: 'Project does not belong to your tenant',
          code: 'PROJECT_TENANT_MISMATCH',
        };
      }

      // Check if project is active and published
      if (
        projectForm.status !== 'active' ||
        projectForm.metadata.deploymentStatus !== 'published'
      ) {
        logger.warn(`❌ Project ${projectId} is not active or published`);
        return {
          valid: false,
          error: 'Project is not active or published',
          code: 'PROJECT_NOT_ACTIVE',
        };
      }

      // Check if project is not deleted
      if (projectForm.deletedAt) {
        logger.warn(`❌ Project ${projectId} is deleted`);
        return {
          valid: false,
          error: 'Project has been deleted',
          code: 'PROJECT_DELETED',
        };
      }

      logger.info(`✅ Project form validated: ${projectId}`);
      return { valid: true, projectForm };
    } catch (error) {
      logger.error(
        `❌ Error validating project form ${projectId}:`,
        error.message
      );
      return {
        valid: false,
        error: 'Error validating project form',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate form fields for WhatsApp submission
   * @param {Object} answers - Answers from WhatsApp user
   * @param {Object} projectForm - Project form object
   * @returns {Promise<Object>} Validation result
   */
  async validateFormFields(answers, projectForm) {
    try {
      logger.info(
        `🔍 Validating form fields for WhatsApp project: ${projectForm.projectId}`
      );

      const validationResult = {
        valid: true,
        errors: [],
        warnings: [],
        validatedData: {},
        missingFields: [],
        extraFields: [],
      };

      const formElements = projectForm.elements || [];
      const answerMap = new Map(Object.entries(answers));

      // Track which fields from the form we've found in answers
      const foundFormFields = new Set();

      // Validate each form element
      for (let i = 0; i < formElements.length; i++) {
        const element = formElements[i];
        const fieldName =
          element.properties && element.properties.label
            ? element.properties.label
            : element.id;
        const fieldKey = this.normalizeFieldName(fieldName);
        const isRequired =
          element.properties && element.properties.required
            ? element.properties.required
            : false;
        const fieldType = element.type;

        // Check if field is present in answers (by step index)
        const answerKey = i.toString();
        const submittedValue = answerMap.get(answerKey);

        if (submittedValue !== undefined) {
          foundFormFields.add(fieldKey);

          // Validate field value based on type
          const fieldValidation = this.validateFieldValue(
            submittedValue,
            element
          );
          if (!fieldValidation.valid) {
            validationResult.errors.push({
              field: fieldName,
              error: fieldValidation.error,
              type: fieldType,
              step: i,
            });
            validationResult.valid = false;
          } else {
            validationResult.validatedData[fieldKey] = fieldValidation.value;
          }
        } else if (isRequired) {
          // Required field is missing
          validationResult.missingFields.push(fieldName);
          validationResult.warnings.push({
            field: fieldName,
            warning: 'Required field is missing',
            type: fieldType,
            step: i,
          });
          validationResult.valid = false;
        }
      }

      if (validationResult.valid) {
        logger.info(
          `✅ Form fields validated successfully for WhatsApp project: ${projectForm.projectId}`
        );
      } else {
        logger.warn(
          `⚠️ Form validation failed for WhatsApp project: ${projectForm.projectId}`,
          {
            errors: validationResult.errors.length,
            missing: validationResult.missingFields.length,
            extra: validationResult.extraFields.length,
          }
        );
      }

      return validationResult;
    } catch (error) {
      logger.error(`❌ Error validating form fields:`, error.message);
      return {
        valid: false,
        errors: [
          { field: 'validation', error: 'Error validating form fields' },
        ],
        validatedData: {},
        missingFields: [],
        extraFields: [],
      };
    }
  }

  /**
   * Normalize field name for comparison
   * @param {string} fieldName - Original field name
   * @returns {string} Normalized field name
   */
  normalizeFieldName(fieldName) {
    return fieldName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  /**
   * Validate individual field value based on field type
   * @param {*} value - Field value
   * @param {Object} element - Form element definition
   * @returns {Object} Validation result
   */
  validateFieldValue(value, element) {
    const fieldType = element.type;
    const properties = element.properties || {};

    try {
      switch (fieldType) {
        case 'email':
          return this.validateEmail(value);
        case 'phone':
          return this.validatePhone(value);
        case 'number':
          return this.validateNumber(value, properties);
        case 'date':
          return this.validateDate(value);
        case 'select':
        case 'radio':
          return this.validateSelect(value, properties);
        case 'checkbox':
          return this.validateCheckbox(value, properties);
        case 'file':
          return this.validateFile(value, properties);
        default:
          return this.validateText(value, properties);
      }
    } catch (error) {
      return { valid: false, error: `Validation error: ${error.message}` };
    }
  }

  /**
   * Validate email field
   */
  validateEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return { valid: false, error: 'Invalid email format' };
    }
    return { valid: true, value };
  }

  /**
   * Validate phone field
   */
  validatePhone(value) {
    if (value === null || value === undefined) {
      return { valid: false, error: 'Phone number is required' };
    }

    const stringValue = String(value).trim();
    if (!stringValue) {
      return { valid: false, error: 'Phone number is required' };
    }

    const digitsOnly = stringValue.replace(/\D+/g, '');
    const hasLeadingPlus = stringValue.trim().startsWith('+');
    const normalized = hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;

    const phoneRegex = /^[+]?[\d]{7,16}$/;

    if (!phoneRegex.test(normalized)) {
      return { valid: false, error: 'Invalid phone number format' };
    }

    return { valid: true, value: normalized };
  }

  /**
   * Validate number field
   */
  validateNumber(value, properties) {
    if (value === null || value === undefined || value === '') {
      return { valid: false, error: 'Value must be a number' };
    }

    let normalizedValue;
    if (typeof value === 'number') {
      normalizedValue = value;
    } else {
      const cleaned = String(value).trim().replace(/,/g, '');
      const match = cleaned.match(/-?\d+(?:\.\d+)?/);
      normalizedValue = match ? parseFloat(match[0]) : NaN;
    }

    const num = Number(normalizedValue);
    if (isNaN(num)) {
      return { valid: false, error: 'Value must be a number' };
    }

    if (properties.min !== undefined && num < properties.min) {
      return {
        valid: false,
        error: `Value must be at least ${properties.min}`,
      };
    }

    if (properties.max !== undefined && num > properties.max) {
      return { valid: false, error: `Value must be at most ${properties.max}` };
    }

    return { valid: true, value: num };
  }

  /**
   * Validate date field
   */
  validateDate(value) {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }
    return { valid: true, value: date.toISOString() };
  }

  /**
   * Validate select/radio field
   */
  validateSelect(value, properties) {
    const options = properties.options || [];
    if (options.length > 0 && !options.includes(value)) {
      return {
        valid: false,
        error: `Value must be one of: ${options.join(', ')}`,
      };
    }
    return { valid: true, value };
  }

  /**
   * Validate checkbox field
   */
  validateCheckbox(value, properties) {
    const options = properties.options || [];
    if (properties.multiple) {
      // Multiple selection
      const values = Array.isArray(value) ? value : [value];
      for (const val of values) {
        if (!options.includes(val)) {
          return { valid: false, error: `Invalid option: ${val}` };
        }
      }
      return { valid: true, value: values };
    }
    // Single selection
    return this.validateSelect(value, properties);
  }

  /**
   * Validate file field
   */
  validateFile(value, properties) {
    // For WhatsApp submissions, files come as document/image messages
    if (properties.required && (!value || value.length === 0)) {
      return { valid: false, error: 'Required file is missing' };
    }
    return { valid: true, value };
  }

  /**
   * Validate text field
   */
  validateText(value, properties) {
    if (typeof value !== 'string') {
      return { valid: false, error: 'Value must be text' };
    }

    if (properties.minLength && value.length < properties.minLength) {
      return {
        valid: false,
        error: `Text must be at least ${properties.minLength} characters`,
      };
    }

    if (properties.maxLength && value.length > properties.maxLength) {
      return {
        valid: false,
        error: `Text must be at most ${properties.maxLength} characters`,
      };
    }

    return { valid: true, value };
  }

  /**
   * Send validation failure notification to user via WhatsApp
   * @param {Object} validationResult - Validation result with errors
   * @param {string} phoneNumber - Verified phone number
   * @param {Object} projectForm - Project form object
   * @returns {Promise<void>}
   */
  async sendValidationFailureNotification(
    validationResult,
    phoneNumber,
    projectForm
  ) {
    try {
      // Verify that we have a valid phone number from a registered user
      if (!phoneNumber) {
        logger.info(
          `📧 Skipping validation failure notification - no verified phone provided`
        );
        return;
      }

      // Get user data from the verified phone number
      const user = await userService.getUserByPhone(phoneNumber);
      if (!user) {
        logger.warn(
          `📧 Skipping validation failure notification - verified phone not found in database: ${phoneNumber}`
        );
        return;
      }

      const userData = {
        email: user.email, // Use email for notification service
        phone: phoneNumber,
        firstname: user.firstname || user.name || 'User',
        name: user.name || user.firstname || 'User',
      };

      const projectData = {
        projectName:
          (projectForm &&
            projectForm.configuration &&
            projectForm.configuration.projectName) ||
          'Your Project',
      };

      // Get the first error step for notification
      const firstError =
        validationResult.errors && validationResult.errors.length > 0
          ? validationResult.errors[0]
          : null;
      const validationData = {
        errors: validationResult.errors || [],
        warnings: validationResult.warnings || [],
        step: firstError ? firstError.step : 'unknown',
      };

      const notificationResult =
        await notificationQueueService.queueValidationFailureNotification(
          validationData,
          userData,
          projectData
        );

      if (notificationResult.success) {
        logger.info(
          `📧 Validation failure notification queued for ${phoneNumber} - Job ID: ${notificationResult.jobId}`
        );
      } else {
        logger.warn(
          `⚠️ Failed to queue validation failure notification for ${phoneNumber}: ${notificationResult.error}`
        );
      }
    } catch (error) {
      logger.error(
        `❌ Error sending validation failure notification to ${phoneNumber}:`,
        error.message
      );
    }
  }

  /**
   * Comprehensive validation of WhatsApp submission
   * @param {Object} sessionData - Session data with user info
   * @param {Object} answers - User answers
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} Complete validation result
   */
  async validateWhatsAppSubmission(sessionData, answers, projectId) {
    const { phoneNumber } = sessionData;
    const { tenantId } = sessionData;

    logger.info(
      `🔍 Starting comprehensive validation for WhatsApp submission from ${phoneNumber} to project ${projectId}`
    );

    const validationResult = {
      valid: false,
      user: null,
      projectForm: null,
      formValidation: null,
      errors: [],
      warnings: [],
      verifiedPhone: null, // Track verified phone for notifications
    };

    try {
      // Step 1: Validate user by phone number
      logger.info(`🔍 Validating user by phone: ${phoneNumber}`);
      const userValidation = await this.validateUserByPhone(
        phoneNumber,
        tenantId
      );

      if (!userValidation.valid) {
        logger.warn(`❌ User validation failed: ${userValidation.error}`);
        validationResult.errors.push({
          step: 'user_validation',
          error: userValidation.error,
          code: userValidation.code,
        });
        // Don't send notification for unregistered users
        return validationResult;
      }

      // Store verified phone for notifications
      validationResult.verifiedPhone = phoneNumber;
      validationResult.user = userValidation.user;

      // Step 2: Validate project form
      logger.info(`🔍 Validating project form: ${projectId}`);
      const projectValidation = await this.validateProjectForm(
        projectId,
        userValidation.user
      );

      if (!projectValidation.valid) {
        logger.warn(`❌ Project validation failed: ${projectValidation.error}`);
        validationResult.errors.push({
          step: 'project_validation',
          error: projectValidation.error,
          code: projectValidation.code,
        });
        // Send notification for project validation failures
        await this.sendValidationFailureNotification(
          validationResult,
          validationResult.verifiedPhone,
          null
        );
        return validationResult;
      }

      validationResult.projectForm = projectValidation.projectForm;

      // Step 3: Validate form fields
      const formValidation = await this.validateFormFields(
        answers,
        projectValidation.projectForm
      );
      validationResult.formValidation = formValidation;

      if (!formValidation.valid) {
        validationResult.errors.push({
          step: 'form_validation',
          errors: formValidation.errors,
          missingFields: formValidation.missingFields,
        });
        // Send notification for form validation failures
        await this.sendValidationFailureNotification(
          validationResult,
          validationResult.verifiedPhone,
          projectValidation.projectForm
        );
        return validationResult;
      }

      // Step 4: Check for duplicate submissions (optional)
      // This can be implemented similar to email validation

      // All validations passed
      validationResult.valid = true;
      validationResult.warnings = formValidation.warnings;

      logger.info(
        `✅ WhatsApp submission validation successful for ${phoneNumber} to project ${projectId} (tenant: ${tenantId})`
      );
      return validationResult;
    } catch (error) {
      logger.error(
        `❌ Error during WhatsApp submission validation:`,
        error.message
      );
      validationResult.errors.push({
        step: 'validation_error',
        error: 'Unexpected error during validation',
        details: error.message,
      });
      return validationResult;
    }
  }
}

module.exports = new WhatsAppValidationService();
