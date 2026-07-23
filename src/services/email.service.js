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

const stripHtml = (value) =>
  String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeEmailArgs = (toOrOptions, subject, text, html = null, options = {}) => {
  if (toOrOptions && typeof toOrOptions === 'object' && !Array.isArray(toOrOptions)) {
    return {
      ...toOrOptions,
      text: toOrOptions.text || toOrOptions.message || '',
      html: toOrOptions.html || null,
      attachments: Array.isArray(toOrOptions.attachments) ? toOrOptions.attachments : [],
      branded: toOrOptions.branded,
    };
  }

  return {
    to: toOrOptions,
    subject,
    text: text || '',
    html,
    attachments: Array.isArray(options.attachments) ? options.attachments : [],
    branded: options.branded,
    from: options.from,
    cc: options.cc,
    bcc: options.bcc,
    replyTo: options.replyTo,
  };
};

const hasCidAttachment = (attachments = [], cid) =>
  attachments.some((attachment) => attachment && attachment.cid === cid);

const withBrandAttachments = (attachments = [], html = '') => {
  const nextAttachments = Array.isArray(attachments) ? [...attachments] : [];
  if (!emailTemplateService.isSabyEmail(html)) {
    return nextAttachments;
  }
  emailTemplateService.getBrandAttachments().forEach((attachment) => {
    if (attachment && !hasCidAttachment(nextAttachments, attachment.cid)) {
      nextAttachments.push(attachment);
    }
  });
  return nextAttachments;
};

const buildBrandedContent = ({ subject, text, html, branded }) => {
  if (branded === false) {
    return { html, text: text || stripHtml(html) };
  }

  if (html && emailTemplateService.isSabyEmail(html)) {
    return { html, text: text || stripHtml(html) };
  }

  const bodyText = text || stripHtml(html) || 'You have a new Saby notification.';
  const wrappedHtml = emailTemplateService.renderSabyEmail({
    title: subject || 'Saby notification',
    preheader: bodyText.slice(0, 140),
    headline: subject || 'Saby notification',
    body: html ? '' : bodyText,
    bodyHtml: html || '',
    layout: 'default',
    label: 'Saby notification',
  });

  return {
    html: wrappedHtml,
    text: bodyText,
  };
};

/**
 * Send an email. Supports both positional and object-style calls.
 * @returns {Promise}
 */
const sendEmail = async (toOrOptions, subject, text, html = null, options = {}) => {
  const normalized = normalizeEmailArgs(toOrOptions, subject, text, html, options);
  const content = buildBrandedContent(normalized);
  const attachments = withBrandAttachments(normalized.attachments, content.html);
  const msg = {
    from: normalized.from || config.email.from,
    to: normalized.to,
    subject: normalized.subject,
    text: content.text || stripHtml(content.html),
    ...(content.html && { html: content.html }),
    ...(attachments.length ? { attachments } : {}),
    ...(normalized.cc && { cc: normalized.cc }),
    ...(normalized.bcc && { bcc: normalized.bcc }),
    ...(normalized.replyTo && { replyTo: normalized.replyTo }),
  };

  await transport.sendMail(msg);
  logger.info(`Email sent to ${normalized.to}: ${normalized.subject}`);
};

const sendSabyEmail = async ({
  to,
  subject,
  attachments = [],
  from,
  cc,
  bcc,
  replyTo,
  ...templatePayload
}) => {
  const payload = {
    title: subject,
    ...templatePayload,
  };
  const html = emailTemplateService.renderSabyEmail(payload);
  const text = emailTemplateService.renderSabyText(payload);
  await sendEmail({
    to,
    subject,
    text,
    html,
    attachments,
    from,
    cc,
    bcc,
    replyTo,
  });
};

const sendResetPasswordEmail = async (to, token) => {
  const resetPasswordUrl = `${config.clientUrl}/reset-password?token=${token}`;
  await sendSabyEmail({
    to,
    subject: 'Reset your Saby password',
    preheader: 'Use this secure link to reset your Saby password.',
    layout: 'security',
    label: 'Security notice',
    icon: 'KEY',
    headline: 'Reset your password securely.',
    body: [
      'We received a request to reset the password for your Saby account. Use the button below to create a new password.',
      'If you did not request this, no action is required. Your current password will remain unchanged.',
    ],
    detailsRows: [
      ['Request type', 'Password reset'],
      ['Link expires', '10 minutes'],
      ['Account', to],
    ],
    nextStepTitle: 'Security tip',
    nextStepBody: 'Saby will never ask for your password by email.',
    ctaLabel: 'Reset password',
    ctaUrl: resetPasswordUrl,
  });
};

const sendVerificationEmail = async (to, token) => {
  const verificationEmailUrl = `${config.clientUrl}/verify-email?token=${token}`;
  await sendSabyEmail({
    to,
    subject: 'Verify your Saby email',
    preheader: 'Confirm your email address to secure your Saby account.',
    layout: 'security',
    label: 'Account verification',
    icon: 'ID',
    headline: 'Confirm your email address.',
    body: [
      'Welcome to Saby. Please verify this email address so we can secure your account and keep important workspace notifications connected to the right person.',
      'If you did not create a Saby account, you can safely ignore this email.',
    ],
    detailsRows: [
      ['Verification', 'Email address'],
      ['Account', to],
      ['Status', 'Pending confirmation'],
    ],
    ctaLabel: 'Verify email',
    ctaUrl: verificationEmailUrl,
  });
};

const sendOtpEmail = async (to, otp) => {
  await sendSabyEmail({
    to,
    subject: 'Your Saby verification code',
    preheader: 'Use this one-time code to continue in Saby.',
    layout: 'securityCode',
    label: 'Verification code',
    icon: 'OTP',
    headline: 'Use this code to continue.',
    body: [
      'Enter the verification code below to continue. This code is valid for a short time and can only be used once.',
      'If you did not request this code, you can ignore this email.',
    ],
    code: otp,
    detailsRows: [
      ['Code expires', '10 minutes'],
      ['Request type', 'One-time verification'],
    ],
  });
};

const sendWorkspaceInvitationEmail = async ({
  to,
  token,
  workspaceName,
  inviterName = null,
  accessProfileLabel = 'Viewer',
}) => {
  const inviteUrl = `${config.clientUrl}/workspace-invite/${token}`;
  const inviterLine = inviterName ? `${inviterName} invited you` : 'You have been invited';
  await sendSabyEmail({
    to,
    subject: `Workspace invitation: ${workspaceName}`,
    preheader: `${inviterLine} to join ${workspaceName} on Saby.`,
    layout: 'workspaceAccess',
    label: 'Workspace access',
    icon: 'TEAM',
    headline: 'You have been invited to a Saby workspace.',
    body: [
      `${inviterLine} to join ${workspaceName} on Saby. Accept the invitation to access the workspace and begin working with your team.`,
      'This invitation is tied to your email address.',
    ],
    detailsRows: [
      ['Workspace', workspaceName],
      ['Invited by', inviterName || 'Saby'],
      ['Access profile', accessProfileLabel],
      ['Expires', '7 days'],
    ],
    ctaLabel: 'Accept invitation',
    ctaUrl: inviteUrl,
  });
};

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
      `Submission received - ${data.projectName}`,
      `Your submission ${data.submissionId} has been received.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send submission confirmation:', error.message);
    throw error;
  }
};

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
      `Urgent compliance alert - ${data.nodeName}`,
      `Critical: your compliance is at ${data.compliance}%. Immediate action required.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send PERM critical alert:', error.message);
    throw error;
  }
};

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
      `Compliance warning - ${data.nodeName}`,
      `Your compliance is at ${data.compliance}%. Please complete remaining events.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send PERM warning:', error.message);
    throw error;
  }
};

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
      `Compliance achieved - ${data.nodeName}`,
      `You have achieved 100% compliance for ${data.month}.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send PERM completion:', error.message);
    throw error;
  }
};

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
      `Late submission - ${data.nodeName} (${data.daysOverdue} days overdue)`,
      `Your submission for ${data.month} is ${data.daysOverdue} days overdue.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send late submission warning:', error.message);
    throw error;
  }
};

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
      `Weekly reminder: PERM submission - ${data.nodeName}`,
      `Weekly reminder for your PERM submission (${data.compliance}% complete).`,
      html
    );
  } catch (error) {
    logger.error('Failed to send weekly reminder:', error.message);
    throw error;
  }
};

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
      `Monthly compliance summary - ${data.month}`,
      `Your organization's compliance summary for ${data.month}.`,
      html
    );
  } catch (error) {
    logger.error('Failed to send month-end summary:', error.message);
    throw error;
  }
};

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
      `Submission failed - ${data.submissionId}`,
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
  sendSabyEmail,
  sendOtpEmail,
  sendWorkspaceInvitationEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
  sendSubmissionConfirmation,
  sendPERMCriticalAlert,
  sendPERMWarning,
  sendPERMCompletion,
  sendLateSubmissionWarning,
  sendWeeklyReminder,
  sendMonthEndSummary,
  sendSubmissionFailed,
};
