const { sendEmail } = require('./email.service');
const config = require('../config/config');
const logger = require('../config/logger');

class NotificationService {
  /**
   * Send submission confirmation email
   * @param {Object} submission - The submission data
   * @param {Object} user - The user who submitted
   * @param {Object} projectForm - The project form
   * @returns {Promise<Object>} Email sending result
   */
  async sendSubmissionConfirmation(submission, user, projectForm) {
    try {
      const emailTemplate = this.createConfirmationTemplate(
        submission,
        user,
        projectForm
      );

      await sendEmail(user.email, emailTemplate.subject, emailTemplate.text);

      logger.info(
        `✅ Confirmation email sent to ${user.email} for submission ${submission._id}`
      );

      return {
        success: true,
        recipient: user.email,
        submissionId: submission._id,
      };
    } catch (error) {
      logger.error(
        `❌ Failed to send confirmation email to ${user.email}:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
        recipient: user.email,
        submissionId: submission._id,
      };
    }
  }

  /**
   * Send submission processing notification
   * @param {Object} submission - The submission data
   * @param {Object} user - The user who submitted
   * @param {Object} projectForm - The project form
   * @param {string} status - Processing status
   * @returns {Promise<Object>} Email sending result
   */
  async sendProcessingNotification(
    submission,
    user,
    projectForm,
    status = 'processing'
  ) {
    try {
      const emailTemplate = this.createProcessingTemplate(
        submission,
        user,
        projectForm,
        status
      );

      await sendEmail(user.email, emailTemplate.subject, emailTemplate.text);

      logger.info(
        `✅ Processing notification sent to ${user.email} for submission ${submission._id}`
      );

      return {
        success: true,
        recipient: user.email,
        submissionId: submission._id,
        status,
      };
    } catch (error) {
      logger.error(
        `❌ Failed to send processing notification to ${user.email}:`,
        error.message
      );
      return {
        success: false,
        error: error.message,
        recipient: user.email,
        submissionId: submission._id,
        status,
      };
    }
  }

  /**
   * Create confirmation email template
   */
  createConfirmationTemplate(submission, user, projectForm) {
    const submissionDate = new Date(submission.createdAt).toLocaleString();
    const projectName = projectForm?.identity?.name || 'Project';

    return {
      subject: `✅ Submission Received - ${projectName}`,
      text: `Dear ${user.firstname} ${user.lastname},

Thank you for your submission to "${projectName}".

Submission Details:
- Submission ID: ${submission._id}
- Project: ${projectName}
- Submitted: ${submissionDate}
- Status: Received and queued for processing

Your submission has been successfully received and is now in our processing queue. You will receive another notification once processing is complete.

If you have any questions, please contact our support team.

Best regards,
The ${projectName} Team`,
    };
  }

  /**
   * Create processing notification template
   */
  createProcessingTemplate(submission, user, projectForm, status) {
    const submissionDate = new Date(submission.createdAt).toLocaleString();
    const projectName = projectForm?.identity?.name || 'Project';

    let statusText = 'Processing';

    if (status === 'completed') {
      statusText = 'Completed Successfully';
    } else if (status === 'failed') {
      statusText = 'Processing Failed';
    }

    let statusMessage = '';
    if (status === 'completed') {
      statusMessage =
        'Your submission has been processed successfully and is now available in our system.';
    } else if (status === 'failed') {
      statusMessage =
        'There was an issue processing your submission. Please contact support for assistance.';
    } else {
      statusMessage =
        'Your submission is currently being processed. You will receive another notification once complete.';
    }

    return {
      subject: `📋 Submission ${statusText} - ${projectName}`,
      text: `Dear ${user.firstname} ${user.lastname},

Your submission to "${projectName}" has been ${statusText.toLowerCase()}.

Submission Details:
- Submission ID: ${submission._id}
- Project: ${projectName}
- Submitted: ${submissionDate}
- Status: ${statusText}

${statusMessage}

Best regards,
The ${projectName} Team`,
    };
  }
}

module.exports = new NotificationService();
