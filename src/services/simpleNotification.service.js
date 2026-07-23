const { sendSabyEmail } = require('./email.service');
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
      const projectName =
        (projectData && projectData.projectName) || 'Your Project';
      const userName = (userData && userData.firstname) || 'User';

      await sendSabyEmail({
        to: userData.email,
        subject: `Data received - ${projectName}`,
        preheader: `Your submission to ${projectName} has been received.`,
        layout: 'submissionStatus',
        label: 'Submission received',
        icon: 'IN',
        headline: 'Your submission is in Saby.',
        body: [
          `Hello ${userName},`,
          `We have received your submission to ${projectName} and placed it in the processing queue.`,
          'Saby will review the data, run validation checks, and notify you when the next update is available.',
        ],
        detailsRows: [
          ['Project', projectName],
          ['Submission ID', submission._id || 'N/A'],
          ['Received', new Date().toLocaleString()],
          ['Status', 'Received and queued'],
        ],
      });

      logger.info(`✅ Submission confirmation sent to ${userData.email}`);
      return {
        success: true,
        recipient: userData.email,
        type: 'submission_confirmation',
      };
    } catch (error) {
      logger.error(
        `❌ Failed to send submission confirmation to ${userData.email}:`,
        error.message
      );
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
  async sendValidationFailureNotification(
    validationData,
    userData,
    projectData
  ) {
    try {
      const projectName =
        (projectData && projectData.projectName) || 'Your Project';
      const userName = (userData && userData.firstname) || 'User';
      const { errors, warnings, step } = validationData;
      const stepDescription = this.getStepDescription(step);
      const issueItems = [
        ...(Array.isArray(errors)
          ? errors.map((err) => `${err.field || err.step || 'Field'}: ${err.error}`)
          : []),
        ...(Array.isArray(warnings)
          ? warnings.map((warn) => `${warn.field || 'Field'}: ${warn.warning}`)
          : []),
      ];

      await sendSabyEmail({
        to: userData.email,
        subject: `Submission issue - ${projectName}`,
        preheader: 'Your submission needs attention before it can be processed.',
        layout: 'validationIssue',
        label: 'Validation required',
        icon: 'FIX',
        headline: 'Your submission needs correction.',
        body: [
          `Hello ${userName},`,
          `We received your submission to ${projectName}, but Saby found issues that must be corrected before processing can continue.`,
          'Review the items below and submit the corrected information.',
        ],
        detailsRows: [
          ['Project', projectName],
          ['Problem area', stepDescription],
          ['Submitted', new Date().toLocaleString()],
        ],
        issueTitle: 'Items to fix',
        issueItems,
        ctaLabel: 'Review submission',
      });

      logger.info(
        `✅ Validation failure notification sent to ${userData.email}`
      );
      return {
        success: true,
        recipient: userData.email,
        type: 'validation_failure',
      };
    } catch (error) {
      logger.error(
        `❌ Failed to send validation failure notification to ${userData.email}:`,
        error.message
      );
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
  async sendProcessingNotification(
    submission,
    userData,
    projectData,
    status = 'processing'
  ) {
    try {
      const projectName =
        (projectData && projectData.projectName) || 'Your Project';
      const userName = (userData && userData.firstname) || 'User';
      const statusMessages = {
        processing: 'Your submission is currently being processed.',
        completed: 'Your submission has been successfully processed.',
        failed: 'There was an issue processing your submission.',
      };
      const statusMessage = statusMessages[status] || statusMessages.processing;

      await sendSabyEmail({
        to: userData.email,
        subject: `Processing update - ${projectName}`,
        preheader: statusMessage,
        layout: status === 'failed' ? 'validationIssue' : 'submissionStatus',
        label: status === 'failed' ? 'Submission issue' : 'Submission processing',
        icon: status === 'failed' ? 'FIX' : 'RUN',
        headline:
          status === 'completed'
            ? 'Submission processed.'
            : status === 'failed'
              ? 'Processing issue found.'
              : 'Saby is processing your submission.',
        body: [
          `Hello ${userName},`,
          status === 'processing'
            ? `Your submission to ${projectName} is now being processed. We are checking the data and preparing the result.`
            : statusMessage,
          status === 'processing'
            ? 'You will receive another update if action is required or once processing is complete.'
            : 'You can review the latest status in Saby.',
        ],
        detailsRows: [
          ['Project', projectName],
          ['Submission ID', submission._id || 'N/A'],
          ['Status', status],
          ['Updated', new Date().toLocaleString()],
        ],
      });

      logger.info(
        `✅ Processing notification sent to ${userData.email} (status: ${status})`
      );
      return {
        success: true,
        recipient: userData.email,
        type: 'processing_notification',
        status,
      };
    } catch (error) {
      logger.error(
        `❌ Failed to send processing notification to ${userData.email}:`,
        error.message
      );
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
    const projectName =
      (projectData && projectData.projectName) || 'Your Project';
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
    const projectName =
      (projectData && projectData.projectName) || 'Your Project';
    const userName = (userData && userData.firstname) || 'User';
    const { errors, warnings, step } = validationData;

    let errorDetails = '';
    if (errors && errors.length > 0) {
      errorDetails = `\n\nValidation Errors:\n${errors
        .map((err) => `- ${err.field || err.step}: ${err.error}`)
        .join('\n')}`;
    }

    if (warnings && warnings.length > 0) {
      errorDetails += `\n\nWarnings:\n${warnings
        .map((warn) => `- ${warn.field}: ${warn.warning}`)
        .join('\n')}`;
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

    return stepDescriptions[step] || stepDescriptions.unknown;
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
    const projectName =
      (projectData && projectData.projectName) || 'Your Project';
    const userName = (userData && userData.firstname) || 'User';

    const statusMessages = {
      processing: 'Your submission is currently being processed.',
      completed: 'Your submission has been successfully processed.',
      failed: 'There was an issue processing your submission.',
    };

    const statusMessage = statusMessages[status] || statusMessages.processing;

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
