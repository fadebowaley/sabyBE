// email.parser.js

const bodyParser = require('./utils/bodyParser');
const emailValidationService = require('./services/emailValidation.service');

/**
 * Extract metadata fields from email body structured data
 * @param {object} structured - parsed structured data from email body
 * @returns {object} metadata fields
 */
function extractMetadataFields(structured) {
  const metadata = {};

  // Map common field variations to standard names
  const fieldMappings = {
    tenantId: ['tenantId', 'tenant_id', 'tenant'],
    projectId: ['projectId', 'project_id', 'project'],
    formId: ['formId', 'form_id', 'form'],
    nodeId: ['nodeId', 'node_id', 'node'],
    userId: ['userId', 'user_id', 'user'],
    source: ['source'],
    status: ['status'],
    project_name: ['project_name', 'projectName', 'project name'],
    project_category: [
      'project_category',
      'projectCategory',
      'project category',
    ],
  };

  // Extract metadata fields from structured data
  Object.entries(fieldMappings).forEach(([standardField, variations]) => {
    for (const variation of variations) {
      if (structured[variation]) {
        metadata[standardField] = structured[variation];
        break;
      }
    }
  });

  return metadata;
}

/**
 * Build a submission object suitable for queueSubmission from a parsed email
 * @param {object} parsedEmail - result of mailparser.simpleParser
 * @param {object} tenant - tenant config record containing tenantId, defaultProjectId, etc.
 * @param {object} validationResult - validation result from emailValidationService
 * @returns {object} submissionBody
 */
function buildSubmissionPayload(parsedEmail, tenant, validationResult = null) {
  const fromAddress = parsedEmail.from?.value?.[0]?.address || '';
  const subject = parsedEmail.subject || '';
  const toAddress = parsedEmail.to?.value?.[0]?.address || '';
  const date = parsedEmail.date || new Date();
  const body = bodyParser(parsedEmail);
  const attachments = parsedEmail.attachments || [];

  // Extract metadata fields from email body
  const emailMetadata = extractMetadataFields(body.structured || {});

  // Use tenant ID from validation result if available, otherwise fall back to email metadata or tenant defaults
  const discoveredTenantId =
    validationResult?.projectForm?.tenantId ||
    emailMetadata.tenantId ||
    tenant.tenantId;

  const submissionPayload = {
    // TODO:: We are replacing these values wiith real Node IDs and others from Database
    tenantId: discoveredTenantId,
    projectId: emailMetadata.projectId || tenant.defaultProjectId,
    project_name:
      emailMetadata.project_name ||
      validationResult?.projectForm?.configuration?.projectName ||
      'Email Form',
    project_category: emailMetadata.project_category || 'General',
    formId:
      emailMetadata.formId ||
      validationResult?.projectForm?._id ||
      `email-form-${Date.now()}`,
    nodeId: emailMetadata.nodeId || `email-node-${Date.now()}`,
    userId:
      emailMetadata.userId ||
      validationResult?.sender?._id ||
      '507f1f77bcf86cd799439011',
    source: emailMetadata.source || 'email',
    status: emailMetadata.status || 'submitted',
    metadata: {
      from: fromAddress,
      to: toAddress,
      subject,
      date,
      messageId: parsedEmail.messageId,
      emailMetadata, // Include extracted metadata for debugging
      validation: validationResult
        ? {
            validated: validationResult.valid,
            senderId: validationResult.sender?._id,
            projectFormId: validationResult.projectForm?._id,
            validationErrors: validationResult.errors,
            validationWarnings: validationResult.warnings,
            verifiedEmail: validationResult.verifiedEmail, // Pass verified email for notifications
          }
        : null,
    },
    payload: {
      text: body.text,
      html: body.html,
      structured:
        validationResult?.formValidation?.validatedData || body.structured,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      })),
    },
  };

  return submissionPayload;
}

/**
 * Convert a parsed email (from mailparser.simpleParser) into a submission body.
 * This module intentionally does not enqueue or POST anything; that is the
 * responsibility of the caller (e.g. email.ingestor.js).
 */
async function parseEmailToSubmission(parsedEmail, tenant) {
  if (!tenant) {
    throw new Error(
      'Tenant configuration not supplied to parseEmailToSubmission'
    );
  }

  console.log('[Parser] Parsed email:', parsedEmail.subject);

  // Extract basic submission data for validation
  const body = bodyParser(parsedEmail);
  const emailMetadata = extractMetadataFields(body.structured || {});

  const submissionData = {
    projectId: emailMetadata.projectId || tenant.defaultProjectId,
    structured: body.structured || {},
  };

  // Perform comprehensive validation (tenant ID will be discovered dynamically)
  const validationResult = await emailValidationService.validateEmailSubmission(
    parsedEmail,
    submissionData
  );

  console.log('[Parser] Validation result:', validationResult);

  // Check if validation failed due to duplicate submission
  const duplicateError = validationResult.errors.find(
    (error) => error.step === 'duplicate_validation'
  );
  if (duplicateError) {
    logger.warn(`❌ Duplicate submission rejected: ${duplicateError.error}`);
    return {
      success: false,
      reason: 'duplicate_submission',
      error: duplicateError.error,
      details: duplicateError.details,
    };
  }

  // Check if validation failed for other reasons
  if (!validationResult.valid) {
    logger.warn(
      `❌ Email validation failed: ${validationResult.errors
        .map((e) => e.error)
        .join(', ')}`
    );
    return {
      success: false,
      reason: 'validation_failed',
      errors: validationResult.errors,
    };
  }

  // Add debug logging to see the validation result structure
  console.log('[Parser] Validation result structure:', {
    valid: validationResult.valid,
    errors: validationResult.errors,
    warnings: validationResult.warnings,
    sender: validationResult.sender,
    projectForm: validationResult.projectForm,
  });

  console.log('[Parser] Returning submission:', submissionData);

  // Build submission payload with validation results
  const submissionPayload = buildSubmissionPayload(
    parsedEmail,
    tenant,
    validationResult
  );

  return {
    success: true,
    data: submissionPayload,
  };
}

module.exports = { parseEmailToSubmission };
