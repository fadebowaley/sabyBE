// src/ingestion/email/email.ingestor.js

const Imap = require('imap-simple');
const { simpleParser } = require('mailparser');
const {
  getTenantsWithEmailConfig,
  isAuthorizedSender,
} = require('./email.tenants.config');
const { parseEmailToSubmission } = require('./email.parser');
const { queueSubmission } = require('../../services/submission.service');
const logger = require('../../config/logger');

const processTenantInbox = async (tenant) => {
  console.log(
    '[Ingestor] Starting processTenantInbox for tenant:',
    tenant.tenantId
  );
  const imapConfig = {
    imap: {
      user: tenant.email,
      password: tenant.password,
      host: tenant.imapHost,
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: {
        rejectUnauthorized: false, // Allow self-signed or mismatched certificates
        servername: tenant.imapHost, // Use the hostname for SNI
      },
    },
  };

  try {
    const connection = await Imap.connect(imapConfig);
    await connection.openBox('INBOX');

    const searchCriteria = ['UNSEEN'];
    const fetchOptions = { bodies: [''], markSeen: true };

    const messages = await connection.search(searchCriteria, fetchOptions);

    for (const item of messages) {
      const all = item.parts.find((part) => part.which === '');
      const parsedEmail = await simpleParser(all.body);
      console.log('[Ingestor] Parsed email:', parsedEmail.subject);

      const senderEmail = parsedEmail.from.value[0].address.toLowerCase();

      // Note: Authorization is now handled by the email validation service
      // which checks if the sender is a registered user and belongs to the correct tenant

      try {
        // Parse and validate email submission
        const submission = await parseEmailToSubmission(parsedEmail, tenant);

        // Check if parsing/validation failed
        if (!submission.success) {
          if (submission.reason === 'duplicate_submission') {
            logger.warn(
              `[REJECT] Duplicate submission from ${senderEmail}: ${submission.error}`
            );
          } else if (submission.reason === 'validation_failed') {
            logger.warn(
              `[REJECT] Email validation failed for ${senderEmail}:`,
              {
                errors: submission.errors.map((e) => e.error).join(', '),
              }
            );
          } else {
            logger.warn(
              `[REJECT] Email processing failed for ${senderEmail}: ${submission.reason}`
            );
          }
          continue;
        }

        // Check validation results
        const { validation } = submission.data.metadata;
        console.log('[Ingestor] Validation result:', validation);

        if (!validation || !validation.validated) {
          // Log validation errors
          if (validation && validation.validationErrors) {
            logger.warn(
              `[REJECT] Email validation failed for ${senderEmail}:`,
              {
                errors: validation.validationErrors,
                warnings: validation.validationWarnings,
              }
            );
          } else {
            logger.warn(
              `[REJECT] Email validation failed for ${senderEmail}: No validation result`
            );
          }
          continue;
        }

        // Queue the validated submission
        console.log('[Ingestor] Queuing submission:', submission.data);
        await queueSubmission(submission.data);

        logger.info(
          `[✓] Queued validated email from ${senderEmail} for tenant ${tenant.tenantId}`,
          {
            projectId: submission.data.projectId,
            senderId: validation.senderId,
            projectFormId: validation.projectFormId,
            warnings:
              (validation.validationWarnings &&
                validation.validationWarnings.length) ||
              0,
          }
        );
      } catch (error) {
        console.log('[Ingestor] Error processing email:', error.message);
        // Continue processing other emails
      }
    }

    await connection.end();
  } catch (err) {
    logger.error(`❌ Error processing tenant ${tenant.tenantId}:`, err.message);
  }
};

const runEmailIngestor = async () => {
  const tenants = await getTenantsWithEmailConfig();

  for (const tenant of tenants) {
    await processTenantInbox(tenant);
  }
};

module.exports = { runEmailIngestor };
