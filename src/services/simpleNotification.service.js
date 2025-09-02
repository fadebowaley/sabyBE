const { sendEmail } = require('./email.service');
const logger = require('../config/logger');

class SimpleNotificationService {
  /**
   * Send submission confirmation email using data from the job
   * @param {Object} submission - The submission data from database
   * @param {Object} userData - User data (email, firstname, lastname)
   * @param {Object} projectData - Project data (projectName)
   * @returns {Promise<Object>} Email sending result
   */
  async sendSubmissionConfirmation(submission, userData, projectData) {
    try {
      const emailTemplate = this.createConfirmationTemplate(submission, userData, projectData);

      await sendEmail(userData.email, emailTemplate.subject, emailTemplate.text);

      logger.info(`✅ Submission confirmation sent to ${userData.email}`);
      return {
        success: true,
        recipient: userData.email,
        type: 'submission_confirmation',
      };
    } catch (error) {
      logger.error(`❌ Failed to send submission confirmation to ${userData.email}:`, error.message);
      return {
        success: false,
        error: error.message,
        recipient: userData.email,
        type: 'submission_confirmation',
      };
    }
  }

  /**
   * Send validation failure notification
   * @param {Object} validationData - Validation failure data
   * @param {Object} userData - User data (email, firstname, lastname)
   * @param {Object} projectData - Project data (projectName)
   * @returns {Promise<Object>} Email sending result
   */
  async sendValidationFailureNotification(validationData, userData, projectData) {
    try {
      const emailTemplate = this.createValidationFailureTemplate(validationData, userData, projectData);

      await sendEmail(userData.email, emailTemplate.subject, emailTemplate.text);

      logger.info(`✅ Validation failure notification sent to ${userData.email}`);
      return {
        success: true,
        recipient: userData.email,
        type: 'validation_failure',
      };
    } catch (error) {
      logger.error(`❌ Failed to send validation failure notification to ${userData.email}:`, error.message);
      return {
        success: false,
        error: error.message,
        recipient: userData.email,
        type: 'validation_failure',
      };
    }
  }

  /**
   * Send processing notification
   * @param {Object} submission - The submission data
   * @param {Object} userData - User data (email, firstname, lastname)
   * @param {Object} projectData - Project data (projectName)
   * @param {string} status - Processing status
   * @returns {Promise<Object>} Email sending result
   */
  async sendProcessingNotification(submission, userData, projectData, status = 'processing') {
    try {
      const emailTemplate = this.createProcessingTemplate(submission, userData, projectData, status);

      await sendEmail(userData.email, emailTemplate.subject, emailTemplate.text);

      logger.info(`✅ Processing notification sent to ${userData.email} (status: ${status})`);
      return {
        success: true,
        recipient: userData.email,
        type: 'processing_notification',
        status,
      };
    } catch (error) {
      logger.error(`❌ Failed to send processing notification to ${userData.email}:`, error.message);
      return {
        success: false,
        error: error.message,
        recipient: userData.email,
        type: 'processing_notification',
        status,
      };
    }
  }

  /**
   * Create confirmation email template
   * @param {Object} submission - The submission data
   * @param {Object} userData - User data
   * @param {Object} projectData - Project data
   * @returns {Object} Email template
   */
  createConfirmationTemplate(submission, userData, projectData) {
    const projectName = (projectData && projectData.projectName) || 'Your Project';
    const userName = (userData && userData.firstname) || 'User';

    return {
      subject: `✅ Data Received - ${projectName}`,
      text: `Dear ${userName},

Thank you for your submission to ${projectName}.

We have successfully received your data and it has been queued for processing. You will receive another notification once processing is complete.

Submission Details:
- Project: ${projectName}
- Submission ID: ${submission._id || 'N/A'}
- Received: ${new Date().toLocaleString()}

If you have any questions, please contact our support team.

Best regards,
The ${projectName} Team`,
    };
  }

  /**
   * Create validation failure email template
   * @param {Object} validationData - Validation failure data
   * @param {Object} userData - User data
   * @param {Object} projectData - Project data
   * @returns {Object} Email template
   */
  createValidationFailureTemplate(validationData, userData, projectData) {
    const projectName = (projectData && projectData.projectName) || 'Your Project';
    const userName = (userData && userData.firstname) || 'User';
    const { errors, warnings, step } = validationData;

    let errorDetails = '';
    if (errors && errors.length > 0) {
      errorDetails = '\n\nValidation Errors:\n' + errors.map((err) => `- ${err.field || err.step}: ${err.error}`).join('\n');
    }

    if (warnings && warnings.length > 0) {
      errorDetails += '\n\nWarnings:\n' + warnings.map((warn) => `- ${warn.field}: ${warn.warning}`).join('\n');
    }

    const stepDescription = this.getStepDescription(step);

    return {
      subject: `⚠️ Submission Issue - ${projectName}`,
      text: `Dear ${userName},

We received your submission to ${projectName}, but encountered some issues that need to be addressed.

Issue Details:
- Problem: ${stepDescription}
- Project: ${projectName}
- Submitted: ${new Date().toLocaleString()}

${errorDetails}

Please review the information above and resubmit with the correct data. If you continue to experience issues, please contact our support team.

Best regards,
The ${projectName} Team`,
    };
  }

  /**
   * Get human-readable description for validation step
   * @param {string} step - Validation step
   * @returns {string} Step description
   */
  getStepDescription(step) {
    const stepDescriptions = {
      sender_validation: 'User authentication issue',
      project_lookup: 'Project not found or inaccessible',
      tenant_validation: 'Access permission issue',
      project_validation: 'Project status issue',
      form_validation: 'Form data validation issue',
      duplicate_validation: 'Duplicate submission detected',
      validation_error: 'System validation error',
      unknown: 'Unknown validation issue',
    };

    return stepDescriptions[step] || stepDescriptions['unknown'];
  }

  /**
   * Create processing notification template
   * @param {Object} submission - The submission data
   * @param {Object} userData - User data
   * @param {Object} projectData - Project data
   * @param {string} status - Processing status
   * @returns {Object} Email template
   */
  createProcessingTemplate(submission, userData, projectData, status) {
    const projectName = (projectData && projectData.projectName) || 'Your Project';
    const userName = (userData && userData.firstname) || 'User';

    const statusMessages = {
      processing: 'Your submission is currently being processed.',
      completed: 'Your submission has been successfully processed.',
      failed: 'There was an issue processing your submission.',
    };

    const statusMessage = statusMessages[status] || statusMessages['processing'];

    return {
      subject: `📋 Processing Update - ${projectName}`,
      text: `Dear ${userName},

${statusMessage}

Submission Details:
- Project: ${projectName}
- Submission ID: ${submission._id || 'N/A'}
- Status: ${status}
- Updated: ${new Date().toLocaleString()}

If you have any questions, please contact our support team.

Best regards,
The ${projectName} Team`,
    };
  }
}

module.exports = new SimpleNotificationService();
