const { sendSabyEmail } = require('./email.service');
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
      const submissionDate = new Date(submission.createdAt).toLocaleString();
      const projectName = projectForm?.identity?.name || 'Project';
      const userName = [user.firstname, user.lastname].filter(Boolean).join(' ') || 'User';

      await sendSabyEmail({
        to: user.email,
        subject: `Submission received - ${projectName}`,
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
          ['Submission ID', submission._id],
          ['Submitted', submissionDate],
          ['Status', 'Received and queued'],
        ],
      });

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
      const submissionDate = new Date(submission.createdAt).toLocaleString();
      const projectName = projectForm?.identity?.name || 'Project';
      const userName = [user.firstname, user.lastname].filter(Boolean).join(' ') || 'User';
      const statusText =
        status === 'completed'
          ? 'Completed successfully'
          : status === 'failed'
            ? 'Processing failed'
            : 'Processing';
      const statusMessage =
        status === 'completed'
          ? 'Your submission has been processed successfully and is now available in Saby.'
          : status === 'failed'
            ? 'There was an issue processing your submission. Please contact support for assistance.'
            : 'Your submission is currently being processed. We will notify you when it is complete.';

      await sendSabyEmail({
        to: user.email,
        subject: `Submission ${statusText.toLowerCase()} - ${projectName}`,
        preheader: statusMessage,
        layout: status === 'failed' ? 'validationIssue' : 'submissionStatus',
        label: status === 'failed' ? 'Submission issue' : 'Submission processing',
        icon: status === 'failed' ? 'FIX' : 'RUN',
        headline:
          status === 'completed'
            ? 'Submission processed.'
            : status === 'failed'
              ? 'Processing failed.'
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
          ['Submission ID', submission._id],
          ['Submitted', submissionDate],
          ['Status', statusText],
        ],
      });

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
