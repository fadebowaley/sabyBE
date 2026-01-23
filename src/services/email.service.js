const nodemailer = require('nodemailer');
const config = require('../config/config');
const logger = require('../config/logger');
const emailTemplateService = require('./emailTemplate.service');

const transport = nodemailer.createTransport(config.email.smtp);
/* istanbul ignore next */
if (config.env !== 'test') {
  transport
    .verify()
    .then(() => logger.info('Connected to email server'))
    .catch(() =>
      logger.warn(
        'Unable to connect to email server. Make sure you have configured the SMTP options in .env'
      )
    );
}

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} html - Optional HTML content
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text, html = null) => {
  const msg = {
    from: config.email.from,
    to,
    subject,
    text,
    ...(html && { html }),
  };
  await transport.sendMail(msg);
  logger.info(`✅ Email sent to ${to}: ${subject}`);
};

/**
 * Send reset password email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 *
 */

const sendResetPasswordEmail = async (to, token) => {
  const subject = 'Reset password';
  // replace this url with the link to the reset password page of your front-end app
  const resetPasswordUrl = `${config.clientUrl}/reset-password?token=${token}`;
  const text = `Dear user,
To reset your password, click on this link: ${resetPasswordUrl}
If you did not request any password resets, then ignore this email.`;
  await sendEmail(to, subject, text);
};

/**
 * Send verification email
 * @param {string} to
 * @param {string} token
 * @returns {Promise}
 */

const sendVerificationEmail = async (to, token) => {
  const subject = 'Email Verification';
  // replace this url with the link to the email verification page of your front-end app
  const verificationEmailUrl = `http://link-to-app/verify-email?token=${token}`;
  const text = `Dear user,
To verify your email, click on this link: ${verificationEmailUrl}
If you did not create an account, then ignore this email.`;
  await sendEmail(to, subject, text);
};

/**
 * Send OTP email
 * @param {string} to - Email of the user
 * @param {string} otp - The generated OTP
 */
const sendOtpEmail = async (to, otp) => {
  const subject = 'Your OTP Code';
  const text = `Dear user,
Your OTP code is: ${otp}
It will expire in 10 minutes.
If you did not initiate this request, please ignore this email.`;
  await sendEmail(to, subject, text);
};

/**
 * Send submission confirmation email
 */
const sendSubmissionConfirmation = async (to, data) => {
  try {
    const html = await emailTemplateService.render('submission-confirmation', {
      userName: data.userName || 'User',
      submissionId: data.submissionId,
      projectName: data.projectName,
      submittedAt: new Date(data.submittedAt).toLocaleString(),
      statusUrl: `${config.clientUrl}/submissions/${data.submissionId}`,
    });

    await sendEmail(
      to,
      `✅ Submission Received - ${data.projectName}`,
      `Your submission ${data.submissionId} has been received.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send submission confirmation:', error.message);
    throw error;
  }
};

/**
 * Send PERM critical alert (< 40% compliance)
 */
const sendPERMCriticalAlert = async (to, data) => {
  try {
    const html = await emailTemplateService.render('perm-critical-alert', {
      nodeName: data.nodeName,
      month: data.month,
      compliance: data.compliance,
      eventsSubmitted: data.eventsSubmitted,
      eventsRequired: data.eventsRequired,
      eventsRemaining: data.eventsRequired - data.eventsSubmitted,
      daysRemaining: data.daysRemaining || 0,
      submissionUrl: `${config.clientUrl}/submissions/perm/${data.submissionId}`,
    });

    await sendEmail(
      to,
      `⚠️ URGENT: Low Compliance Alert - ${data.nodeName}`,
      `Critical: Your compliance is at ${data.compliance}%. Immediate action required.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send PERM critical alert:', error.message);
    throw error;
  }
};

/**
 * Send PERM warning (40-79% compliance)
 */
const sendPERMWarning = async (to, data) => {
  try {
    const html = await emailTemplateService.render('perm-warning', {
      nodeName: data.nodeName,
      month: data.month,
      compliance: data.compliance,
      eventsSubmitted: data.eventsSubmitted,
      eventsRequired: data.eventsRequired,
      eventsRemaining: data.eventsRequired - data.eventsSubmitted,
      daysRemaining: data.daysRemaining || 0,
      submissionUrl: `${config.clientUrl}/submissions/perm/${data.submissionId}`,
    });

    await sendEmail(
      to,
      `⚠️ Compliance Warning - ${data.nodeName}`,
      `Your compliance is at ${data.compliance}%. Please complete remaining events.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send PERM warning:', error.message);
    throw error;
  }
};

/**
 * Send PERM completion (100% compliance)
 */
const sendPERMCompletion = async (to, data) => {
  try {
    const html = await emailTemplateService.render('perm-completion', {
      nodeName: data.nodeName,
      month: data.month,
      eventsRequired: data.eventsRequired,
      events: data.events || [],
      reportUrl: `${config.clientUrl}/reports/perm/${data.submissionId}`,
    });

    await sendEmail(
      to,
      `✅ 100% Compliance Achieved - ${data.nodeName}`,
      `Congratulations! You've achieved 100% compliance for ${data.month}.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send PERM completion:', error.message);
    throw error;
  }
};

/**
 * Send late submission warning
 */
const sendLateSubmissionWarning = async (to, data) => {
  try {
    const html = await emailTemplateService.render('perm-late-submission', {
      nodeName: data.nodeName,
      month: data.month,
      compliance: data.compliance,
      eventsSubmitted: data.eventsSubmitted,
      eventsRequired: data.eventsRequired,
      daysOverdue: data.daysOverdue,
      submissionUrl: `${config.clientUrl}/submissions/perm/${data.submissionId}`,
    });

    await sendEmail(
      to,
      `🚨 Late Submission - ${data.nodeName} (${data.daysOverdue} days overdue)`,
      `Your submission for ${data.month} is ${data.daysOverdue} days overdue.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send late submission warning:', error.message);
    throw error;
  }
};

/**
 * Send weekly reminder
 */
const sendWeeklyReminder = async (to, data) => {
  try {
    const html = await emailTemplateService.render('perm-weekly-reminder', {
      nodeName: data.nodeName,
      month: data.month,
      compliance: data.compliance,
      eventsSubmitted: data.eventsSubmitted,
      eventsRequired: data.eventsRequired,
      daysRemaining: data.daysRemaining,
      events: data.events || [],
      submissionUrl: `${config.clientUrl}/submissions/perm/${data.submissionId}`,
    });

    await sendEmail(
      to,
      `📅 Weekly Reminder: PERM Submission - ${data.nodeName}`,
      `Weekly reminder for your PERM submission (${data.compliance}% complete).`,
      html
    );
  } catch (error) {
    logger.error('Failed to send weekly reminder:', error.message);
    throw error;
  }
};

/**
 * Send month-end summary
 */
const sendMonthEndSummary = async (to, data) => {
  try {
    const html = await emailTemplateService.render('perm-month-end-summary', {
      organizationName: data.organizationName,
      month: data.month,
      overallCompliance: data.overallCompliance,
      totalNodes: data.totalNodes,
      compliantNodes: data.compliantNodes,
      nonCompliantNodes: data.nonCompliantNodes,
      nodes: data.nodes || [],
      dashboardUrl: `${config.clientUrl}/dashboard/perm`,
    });

    await sendEmail(
      to,
      `📊 Monthly Compliance Summary - ${data.month}`,
      `Your organization's compliance summary for ${data.month}.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send month-end summary:', error.message);
    throw error;
  }
};

/**
 * Send submission failed notification
 */
const sendSubmissionFailed = async (to, data) => {
  try {
    const html = await emailTemplateService.render('submission-failed', {
      userName: data.userName || 'User',
      submissionId: data.submissionId,
      errorMessage: data.errorMessage,
      attempts: data.attempts || 5,
      retryUrl: `${config.clientUrl}/submissions/new`,
    });

    await sendEmail(
      to,
      `❌ Submission Failed - ${data.submissionId}`,
      `Your submission failed after ${data.attempts} attempts. Please try again.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send submission failed email:', error.message);
    throw error;
  }
};

module.exports = {
  transport,
  sendEmail,
  sendOtpEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  // New submission notifications
  sendSubmissionConfirmation,
  sendPERMCriticalAlert,
  sendPERMWarning,
  sendPERMCompletion,
  sendLateSubmissionWarning,
  sendWeeklyReminder,
  sendMonthEndSummary,
  sendSubmissionFailed,
};

