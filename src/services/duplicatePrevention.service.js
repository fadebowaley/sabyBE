const { ProjectFormSubmission } = require('../models');
const logger = require('../config/logger');

class DuplicatePreventionService {
  /**
   * Check if submission is a duplicate
   * @param {Object} submissionData - The submission data
   * @param {Object} user - The user making the submission
   * @param {Object} projectForm - The project form
   * @returns {Promise<Object>} Duplicate check result
   */
  async checkDuplicateSubmission(submissionData, user, projectForm) {
    try {
      const { projectId } = submissionData;
      const userId = user._id;

      // Check if form allows multiple submissions
      const allowsMultiple = this.checkIfFormAllowsMultiple(projectForm);

      if (allowsMultiple) {
        logger.info(
          `✅ Form ${projectId} allows multiple submissions for user ${user.email}`
        );
        return {
          isDuplicate: false,
          allowsMultiple: true,
          reason: 'Form allows multiple submissions',
        };
      }

      // Check for existing submissions by this user for this project
      const existingSubmission = await ProjectFormSubmission.findOne({
        projectId,
        submittedBy: userId,
        deletedAt: null,
      });

      if (existingSubmission) {
        logger.warn(
          `❌ Duplicate submission detected for user ${user.email} to project ${projectId}`
        );
        return {
          isDuplicate: true,
          allowsMultiple: false,
          reason: 'User has already submitted to this form',
          existingSubmissionId: existingSubmission._id,
          existingSubmissionDate: existingSubmission.createdAt,
        };
      }

      logger.info(
        `✅ No duplicate submission found for user ${user.email} to project ${projectId}`
      );
      return {
        isDuplicate: false,
        allowsMultiple: false,
        reason: 'No existing submission found',
      };
    } catch (error) {
      logger.error(`❌ Error checking duplicate submission:`, error.message);
      return {
        isDuplicate: false,
        allowsMultiple: false,
        reason: 'Error checking duplicates - allowing submission',
        error: error.message,
      };
    }
  }

  /**
   * Check if form configuration allows multiple submissions
   * @param {Object} projectForm - The project form
   * @returns {boolean} Whether multiple submissions are allowed
   */
  checkIfFormAllowsMultiple(projectForm) {
    try {
      // Check form configuration for multiple submission settings
      const configuration = projectForm.configuration || {};
      const settings = configuration.settings || {};

      // Check if multiple submissions are explicitly allowed
      if (settings.allowMultipleSubmissions === true) {
        return true;
      }

      // Check if there's a time-based restriction
      if (settings.submissionCooldown) {
        return true; // If there's a cooldown, it implies multiple submissions are allowed
      }

      // Check if form is configured for repeated submissions
      if (
        settings.formType === 'recurring' ||
        settings.formType === 'periodic'
      ) {
        return true;
      }

      // Default: single submission only
      return false;
    } catch (error) {
      logger.error(
        `❌ Error checking form multiple submission settings:`,
        error.message
      );
      return false; // Default to single submission on error
    }
  }

  /**
   * Check if submission is within cooldown period
   * @param {Object} submissionData - The submission data
   * @param {Object} user - The user making the submission
   * @param {Object} projectForm - The project form
   * @returns {Promise<Object>} Cooldown check result
   */
  async checkSubmissionCooldown(submissionData, user, projectForm) {
    try {
      const { projectId } = submissionData;
      const userId = user._id;

      // Get cooldown settings from form
      const configuration = projectForm.configuration || {};
      const settings = configuration.settings || {};
      const cooldownMinutes = settings.submissionCooldown || 0;

      if (cooldownMinutes <= 0) {
        return {
          inCooldown: false,
          reason: 'No cooldown period configured',
        };
      }

      // Find the most recent submission by this user for this project
      const lastSubmission = await ProjectFormSubmission.findOne({
        projectId,
        submittedBy: userId,
        deletedAt: null,
      }).sort({ createdAt: -1 });

      if (!lastSubmission) {
        return {
          inCooldown: false,
          reason: 'No previous submissions found',
        };
      }

      const now = new Date();
      const lastSubmissionTime = new Date(lastSubmission.createdAt);
      const timeDifference = now - lastSubmissionTime;
      const minutesSinceLastSubmission = timeDifference / (1000 * 60);

      if (minutesSinceLastSubmission < cooldownMinutes) {
        const remainingMinutes = Math.ceil(
          cooldownMinutes - minutesSinceLastSubmission
        );
        logger.warn(
          `❌ Submission cooldown active for user ${user.email} to project ${projectId}. ${remainingMinutes} minutes remaining.`
        );

        return {
          inCooldown: true,
          reason: `Cooldown period active. ${remainingMinutes} minutes remaining.`,
          remainingMinutes,
          lastSubmissionTime: lastSubmission.createdAt,
          cooldownMinutes,
        };
      }

      return {
        inCooldown: false,
        reason: 'Cooldown period has passed',
      };
    } catch (error) {
      logger.error(`❌ Error checking submission cooldown:`, error.message);
      return {
        inCooldown: false,
        reason: 'Error checking cooldown - allowing submission',
        error: error.message,
      };
    }
  }

  /**
   * Comprehensive duplicate and cooldown check
   * @param {Object} submissionData - The submission data
   * @param {Object} user - The user making the submission
   * @param {Object} projectForm - The project form
   * @returns {Promise<Object>} Comprehensive check result
   */
  async validateSubmission(submissionData, user, projectForm) {
    try {
      // Check for duplicates
      const duplicateCheck = await this.checkDuplicateSubmission(
        submissionData,
        user,
        projectForm
      );

      if (duplicateCheck.isDuplicate) {
        return {
          valid: false,
          reason: duplicateCheck.reason,
          type: 'duplicate',
          details: duplicateCheck,
        };
      }

      // Check cooldown if multiple submissions are allowed
      if (duplicateCheck.allowsMultiple) {
        const cooldownCheck = await this.checkSubmissionCooldown(
          submissionData,
          user,
          projectForm
        );

        if (cooldownCheck.inCooldown) {
          return {
            valid: false,
            reason: cooldownCheck.reason,
            type: 'cooldown',
            details: cooldownCheck,
          };
        }
      }

      return {
        valid: true,
        reason: 'Submission validation passed',
        type: 'valid',
        details: {
          duplicateCheck,
          allowsMultiple: duplicateCheck.allowsMultiple,
        },
      };
    } catch (error) {
      logger.error(
        `❌ Error in comprehensive submission validation:`,
        error.message
      );
      return {
        valid: false,
        reason: 'Error during validation',
        type: 'error',
        details: { error: error.message },
      };
    }
  }
}

module.exports = new DuplicatePreventionService();
