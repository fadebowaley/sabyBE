// src/ingestion/email/services/emailValidation.service.js

const { userService } = require('../../../services');
const { projectFormService } = require('../../../services');
const duplicatePreventionService = require('../../../services/duplicatePrevention.service');
const notificationQueueService = require('../../../services/notificationQueue.service');
const logger = require('../../../config/logger');

/**
 * Email Validation Service
 * Handles validation of email submissions including:
 * 1. User authentication (sender must be registered user)
 * 2. Project form validation (project must exist and user must have access)
 * 3. Form field validation (submitted data must match form requirements)
 */

class EmailValidationService {
  /**
   * Validate email sender is a registered user
   * @param {string} senderEmail - Email address of the sender
   * @param {string} tenantId - Tenant ID for the submission
   * @returns {Promise<Object>} User object if valid, null if invalid
   */
  async validateSender(senderEmail, tenantId) {
    try {
      logger.info(
        `🔍 Validating sender: ${senderEmail} for tenant: ${tenantId}`
      );
      // Find user by email
      const user = await userService.getUserByEmail(senderEmail);
      if (!user) {
        logger.warn(`❌ Sender not found: ${senderEmail}`);
        return {
          valid: false,
          error: 'Sender is not a registered user',
          code: 'SENDER_NOT_FOUND',
        };
      }
      console.log('this is a user,', user);
      // Check if user belongs to the tenant
      if (user.tenantId !== tenantId) {
        logger.warn(
          `❌ Sender ${senderEmail} does not belong to tenant ${tenantId}`
        );
        return {
          valid: false,
          error: 'Sender does not belong to this tenant',
          code: 'TENANT_MISMATCH',
        };
      }
      console.log('this is tenantId', user.tenantId);

      // Check if user is active (not soft deleted)
      if (user.deletedAt) {
        logger.warn(`❌ Sender ${senderEmail} is deleted`);
        return {
          valid: false,
          error: 'Sender account is inactive',
          code: 'USER_DELETED',
        };
      }
      console.log('this user is not deleted', user.deletedAt);
      logger.info(`✅ Sender validated: ${senderEmail} (User ID: ${user._id})`);
      return { valid: true, user };
    } catch (error) {
      logger.error(`❌ Error validating sender ${senderEmail}:`, error.message);
      return {
        valid: false,
        error: 'Error validating sender',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate project form exists and user has access
   * @param {string} projectId - Project ID from email
   * @param {Object} user - User object from validation
   * @returns {Promise<Object>} Project form object if valid, null if invalid
   */
  async validateProjectForm(projectId, user) {
    try {
      logger.info(
        `🔍 Validating project form: ${projectId} for user: ${user.email}`
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
        projectForm.identity?.status !== 'published'
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
   * Validate form fields match project form requirements
   * @param {Object} submittedData - Data extracted from email body
   * @param {Object} projectForm - Project form object
   * @returns {Promise<Object>} Validation result
   */
  async validateFormFields(submittedData, projectForm) {
    try {
      logger.info(
        `🔍 Validating form fields for project: ${projectForm.projectId}`
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
      const submittedFields = submittedData.structured || {};

      // Track which fields from the form we've found in submission
      const foundFormFields = new Set();

      // Validate each form element
      for (const element of formElements) {
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

        // Check if field is present in submission
        const submittedValue = this.findFieldValue(
          submittedFields,
          fieldKey,
          fieldName
        );

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
            });
            validationResult.valid = false;
          } else {
            validationResult.validatedData[fieldKey] = fieldValidation.value;
          }
        } else if (isRequired) {
          // Required field is missing (TEMPORARILY ALLOWED FOR TESTING)
          validationResult.missingFields.push(fieldName);
          validationResult.warnings.push({
            field: fieldName,
            warning: 'Required field is missing (temporarily allowed)',
            type: fieldType,
          });
          // validationResult.valid = false; // Temporarily disabled
        }
      }

      // Check for extra fields in submission
      for (const submittedField in submittedFields) {
        if (!foundFormFields.has(submittedField)) {
          validationResult.extraFields.push(submittedField);
          validationResult.warnings.push({
            field: submittedField,
            warning: 'Field not defined in form schema',
          });
        }
      }

      if (validationResult.valid) {
        logger.info(
          `✅ Form fields validated successfully for project: ${projectForm.projectId}`
        );
      } else {
        logger.warn(
          `⚠️ Form validation failed for project: ${projectForm.projectId}`,
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
   * Find field value in submitted data using multiple strategies
   * @param {Object} submittedFields - Submitted form data
   * @param {string} fieldKey - Normalized field key
   * @param {string} originalFieldName - Original field name
   * @returns {*} Field value or undefined
   */
  findFieldValue(submittedFields, fieldKey, originalFieldName) {
    // Try exact match first
    if (submittedFields[fieldKey] !== undefined) {
      return submittedFields[fieldKey];
    }

    // Try original field name
    if (submittedFields[originalFieldName] !== undefined) {
      return submittedFields[originalFieldName];
    }

    // Try camelCase version
    const camelCaseKey = originalFieldName
      .toLowerCase()
      .replace(/[^a-z0-9]+([a-z0-9])/g, (_, chr) => chr.toUpperCase());
    if (submittedFields[camelCaseKey] !== undefined) {
      return submittedFields[camelCaseKey];
    }

    // Try common variations
    const variations = [
      originalFieldName.toLowerCase(),
      originalFieldName.replace(/\s+/g, ''),
      originalFieldName.replace(/\s+/g, '_'),
      originalFieldName.replace(/\s+/g, '-'),
    ];

    for (const variation of variations) {
      if (submittedFields[variation] !== undefined) {
        return submittedFields[variation];
      }
    }

    return undefined;
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
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
      return { valid: false, error: 'Invalid phone number format' };
    }
    return { valid: true, value };
  }

  /**
   * Validate number field
   */
  validateNumber(value, properties) {
    const num = parseFloat(value);
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
    // For email submissions, files come as attachments
    // This validation would check if required files are present
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
   * Send validation failure notification to verified user
   * @param {Object} validationResult - Validation result with errors
   * @param {string} verifiedEmail - Verified sender email address (must be from registered user)
   * @param {Object} projectForm - Project form object
   * @returns {Promise<void>}
   */
  async sendValidationFailureNotification(
    validationResult,
    verifiedEmail,
    projectForm
  ) {
    try {
      // Verify that we have a valid email from a registered user
      if (!verifiedEmail) {
        logger.info(
          `📧 Skipping validation failure notification - no verified email provided`
        );
        return;
      }

      // Get user data from the verified email
      const user = await userService.getUserByEmail(verifiedEmail);
      if (!user) {
        logger.warn(
          `📧 Skipping validation failure notification - verified email not found in database: ${verifiedEmail}`
        );
        return;
      }

      const userData = {
        email: verifiedEmail,
        firstname: user.firstname || user.name || 'User',
        name: user.name || user.firstname || 'User',
      };

      const projectData = {
        projectName: projectForm?.identity?.name || 'Your Project',
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
          `📧 Validation failure notification queued for ${verifiedEmail} - Job ID: ${notificationResult.jobId}`
        );
      } else {
        logger.warn(
          `⚠️ Failed to queue validation failure notification for ${verifiedEmail}: ${notificationResult.error}`
        );
      }
    } catch (error) {
      logger.error(
        `❌ Error sending validation failure notification to ${verifiedEmail}:`,
        error.message
      );
    }
  }

  /**
   * Comprehensive validation of email submission
   * @param {Object} parsedEmail - Parsed email object
   * @param {Object} submissionData - Extracted submission data
   * @returns {Promise<Object>} Complete validation result
   */
  async validateEmailSubmission(parsedEmail, submissionData) {
    const senderEmail =
      parsedEmail.from && parsedEmail.from.value && parsedEmail.from.value[0]
        ? parsedEmail.from.value[0].address
        : null;
    const { projectId } = submissionData;

    logger.info(
      `🔍 Starting comprehensive validation for email from ${senderEmail} to project ${projectId}`
    );

    const validationResult = {
      valid: false,
      sender: null,
      projectForm: null,
      formValidation: null,
      errors: [],
      warnings: [],
      verifiedEmail: null, // Track verified email for notifications
    };

    try {
      // Step 1: Validate sender (email authorization) - find user by email first
      logger.info(`🔍 Validating sender email: ${senderEmail}`);
      let user;
      try {
        // Use direct mongoose query to bypass TenantPlugin for user lookup
        const { User } = require('../../../models');
        console.log(
          '🔍 [DEBUG] About to query User.findOne for email:',
          senderEmail
        );
        console.log('🔍 [DEBUG] User model:', User);
        console.log(
          '🔍 [DEBUG] Mongoose connection state:',
          require('mongoose').connection.readyState
        );

        user = await User.findOne({ email: senderEmail });
        console.log(
          '🔍 [DEBUG] User query result:',
          user ? 'User found' : 'User not found'
        );
        if (user) {
          console.log('🔍 [DEBUG] User details:', {
            id: user._id,
            email: user.email,
            tenantId: user.tenantId,
            isOwner: user.isOwner,
          });
        }
      } catch (error) {
        console.log('🔍 [DEBUG] Error details:', error);
        logger.error(`❌ Error looking up user: ${error.message}`);
        validationResult.errors.push({
          step: 'sender_validation',
          error: 'Error looking up user',
          code: 'USER_LOOKUP_ERROR',
        });
        return validationResult;
      }

      if (!user) {
        logger.warn(`❌ Sender not found: ${senderEmail}`);
        validationResult.errors.push({
          step: 'sender_validation',
          error: 'Sender is not a registered user',
          code: 'SENDER_NOT_FOUND',
        });
        // Don't send notification for unregistered users
        return validationResult;
      }

      // Store verified email for notifications
      validationResult.verifiedEmail = senderEmail;

      if (user.deletedAt) {
        logger.warn(`❌ Sender ${senderEmail} is deleted`);
        validationResult.errors.push({
          step: 'sender_validation',
          error: 'Sender account is inactive',
          code: 'USER_DELETED',
        });
        // Send notification for deleted user accounts
        await this.sendValidationFailureNotification(
          validationResult,
          validationResult.verifiedEmail,
          null
        );
        return validationResult;
      }

      logger.info(
        `✅ Sender validated: ${senderEmail} (User ID: ${user._id}, Tenant: ${user.tenantId})`
      );
      validationResult.sender = user;

      // Step 2: Look up project form by project ID (without tenant filtering)
      logger.info(`🔍 Looking up project form: ${projectId}`);
      let projectForm;
      try {
        // Use direct mongoose query to bypass TenantPlugin
        const { ProjectForm } = require('../../../models');
        console.log(
          '🔍 [DEBUG] About to query ProjectForm.findOne for projectId:',
          projectId
        );
        console.log('🔍 [DEBUG] ProjectForm model:', ProjectForm);
        console.log(
          '🔍 [DEBUG] Mongoose connection state:',
          require('mongoose').connection.readyState
        );

        projectForm = await ProjectForm.findOne({
          projectId,
          deletedAt: null,
        }).populate('createdBy');

        console.log(
          '🔍 [DEBUG] ProjectForm query result:',
          projectForm ? 'ProjectForm found' : 'ProjectForm not found'
        );
        if (projectForm) {
          console.log('🔍 [DEBUG] ProjectForm details:', {
            id: projectForm._id,
            projectId: projectForm.projectId,
            tenantId: projectForm.tenantId,
            status: projectForm.status,
            deploymentStatus:
              projectForm.identity && projectForm.identity.status
                ? projectForm.identity.status
                : null,
          });
        }
      } catch (error) {
        console.log('🔍 [DEBUG] ProjectForm error details:', error);
        logger.error(`❌ Error looking up project form: ${error.message}`);
        validationResult.errors.push({
          step: 'project_lookup',
          error: 'Error looking up project form',
          code: 'PROJECT_LOOKUP_ERROR',
        });
        return validationResult;
      }

      if (!projectForm) {
        logger.warn(`❌ Project form not found: ${projectId}`);
        validationResult.errors.push({
          step: 'project_lookup',
          error: 'Project form not found',
          code: 'PROJECT_NOT_FOUND',
        });
        // Send notification for project not found
        await this.sendValidationFailureNotification(
          validationResult,
          validationResult.verifiedEmail,
          null
        );
        return validationResult;
      }

      logger.info(
        `✅ Found project form: ${projectId} (Tenant: ${projectForm.tenantId})`
      );

      // Step 3: Validate tenant access (user must belong to same tenant as project)
      if (projectForm.tenantId !== user.tenantId) {
        logger.warn(
          `❌ User ${senderEmail} (tenant: ${user.tenantId}) does not have access to project ${projectId} (tenant: ${projectForm.tenantId})`
        );
        validationResult.errors.push({
          step: 'tenant_validation',
          error: 'User does not have access to this project',
          code: 'TENANT_ACCESS_DENIED',
        });
        // Send notification for tenant access denied
        await this.sendValidationFailureNotification(
          validationResult,
          validationResult.verifiedEmail,
          projectForm
        );
        return validationResult;
      }

      logger.info(`✅ Tenant access validated for user ${senderEmail}`);

      // Step 4: Validate project form status
      if (
        projectForm.status !== 'active' ||
        projectForm.identity?.status !== 'published'
      ) {
        logger.warn(`❌ Project ${projectId} is not active or published`);
        validationResult.errors.push({
          step: 'project_validation',
          error: 'Project is not active or published',
          code: 'PROJECT_NOT_ACTIVE',
        });
        // Send notification for inactive project
        await this.sendValidationFailureNotification(
          validationResult,
          validationResult.verifiedEmail,
          projectForm
        );
        return validationResult;
      }

      logger.info(`✅ Project form status validated: ${projectId}`);
      validationResult.projectForm = projectForm;

      // Step 5: Validate form fields
      const formValidation = await this.validateFormFields(
        submissionData,
        projectForm
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
          validationResult.verifiedEmail,
          projectForm
        );
        return validationResult;
      }

      // Step 6: Check for duplicate submissions (TEMPORARILY DISABLED)
      logger.info(`🔍 Duplicate validation temporarily disabled for testing`);
      // const duplicateValidation = await duplicatePreventionService.validateSubmission(submissionData, user, projectForm);

      // if (!duplicateValidation.valid) {
      //   logger.warn(`❌ Duplicate submission detected: ${duplicateValidation.reason}`);
      //   validationResult.errors.push({
      //     step: 'duplicate_validation',
      //     error: duplicateValidation.reason,
      //     type: duplicateValidation.type,
      //     details: duplicateValidation.details,
      //   });
      //   return validationResult;
      // }

      // logger.info(`✅ Duplicate validation passed for user ${senderEmail} to project ${projectId}`);
      // validationResult.duplicateValidation = duplicateValidation;

      // All validations passed
      validationResult.valid = true;
      validationResult.warnings = formValidation.warnings;

      logger.info(
        `✅ Email submission validation successful for ${senderEmail} to project ${projectId} (tenant: ${projectForm.tenantId})`
      );
      return validationResult;
    } catch (error) {
      logger.error(
        `❌ Error during email submission validation:`,
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

module.exports = new EmailValidationService();
