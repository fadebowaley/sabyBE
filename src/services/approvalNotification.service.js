const logger = require('../config/logger');
const mongoose = require('mongoose');
const { postgresPool } = require('../config/postgres');
const User = require('../models/user.model');
const Role = require('../models/role.model');
const emailService = require('./email.service');
const { logActivity } = require('../utils/activityLogger');

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  return [];
};

const buildUserLabel = (user) => {
  const fullName = [user?.firstname, user?.lastname].filter(Boolean).join(' ').trim();
  return fullName || String(user?.email || user?.userId || user?._id || 'User').trim();
};

const getWorkflowRecord = async ({ workflowId, tenantId }) => {
  const result = await postgresPool.query(
    `SELECT *
     FROM submission_workflows
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [workflowId, tenantId]
  );

  return result.rows[0] || null;
};

const getCurrentWorkflowStep = async ({ workflowId }) => {
  const result = await postgresPool.query(
    `SELECT *
     FROM submission_workflow_steps
     WHERE workflow_id = $1 AND status = 'in_progress'
     ORDER BY step_order ASC, created_at ASC
     LIMIT 1`,
    [workflowId]
  );

  return result.rows[0] || null;
};

const getSubmissionContext = async ({ submissionId, tenantId }) => {
  const result = await postgresPool.query(
    `SELECT id, tenant_id, project_id, form_id, project_name, project_category, node_id,
            user_id, node_name, node_reference
     FROM form_submissions
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [submissionId, tenantId]
  );

  return result.rows[0] || null;
};

const resolveRoleRecipients = async ({ tenantId, roleIdentifiers = [] }) => {
  const identifiers = normalizeStringArray(roleIdentifiers);
  if (!identifiers.length) return [];
  const objectIds = identifiers.filter((entry) => mongoose.isValidObjectId(entry));

  const roleDocs = await Role.find({
    tenantId,
    isActive: { $ne: false },
    $or: [{ _id: { $in: objectIds } }, { name: { $in: identifiers } }],
  })
    .select('_id name')
    .lean();

  if (!roleDocs.length) return [];

  const roleIds = roleDocs.map((role) => role._id);

  return User.find({
    tenantId,
    deletedAt: null,
    roles: { $in: roleIds },
  })
    .select('_id userId firstname lastname email')
    .lean();
};

const resolveDirectUserRecipients = async ({ tenantId, userIdentifiers = [] }) => {
  const identifiers = normalizeStringArray(userIdentifiers);
  if (!identifiers.length) return [];
  const objectIds = identifiers.filter((entry) => mongoose.isValidObjectId(entry));

  return User.find({
    tenantId,
    deletedAt: null,
    $or: [{ _id: { $in: objectIds } }, { userId: { $in: identifiers } }],
  })
    .select('_id userId firstname lastname email')
    .lean();
};

const resolveStepRecipients = async ({ tenantId, step }) => {
  if (!tenantId || !step) return [];

  const roleIdentifiers = [
    ...normalizeStringArray(step.assignee_roles),
    String(step.assignee_role || '').trim(),
  ].filter(Boolean);
  const userIdentifiers = normalizeStringArray(step.assignee_users);

  const [roleRecipients, userRecipients] = await Promise.all([
    resolveRoleRecipients({ tenantId, roleIdentifiers }),
    resolveDirectUserRecipients({ tenantId, userIdentifiers }),
  ]);

  const byEmail = new Map();
  [...roleRecipients, ...userRecipients].forEach((user) => {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        label: buildUserLabel(user),
        userId: String(user?.userId || user?._id || '').trim() || null,
      });
    }
  });

  return Array.from(byEmail.values());
};

const sendBulkEmails = async ({ recipients, subject, template }) => {
  if (!Array.isArray(recipients) || recipients.length === 0) return;

  const deliveries = await Promise.allSettled(
    recipients.map((recipient) =>
      emailService.sendSabyEmail({
        to: recipient.email,
        subject,
        ...template,
      })
    )
  );

  deliveries.forEach((delivery, index) => {
    if (delivery.status === 'rejected') {
      logger.warn(
        `[ApprovalNotification] Failed to email ${recipients[index]?.email}: ${delivery.reason?.message || 'unknown error'}`
      );
    }
  });
};

const logApprovalActivity = async ({
  tenantId,
  submissionId,
  workflow,
  submissionContext,
  action,
  status,
  message,
}) => {
  try {
    await logActivity({
      tenant_id: tenantId,
      project_id: workflow?.project_id || submissionContext?.project_id || null,
      project_name: submissionContext?.project_name || null,
      project_category: submissionContext?.project_category || null,
      form_id: workflow?.form_id || submissionContext?.form_id || null,
      node_id: submissionContext?.node_id || null,
      user_id: submissionContext?.user_id || null,
      action,
      status,
      job_id: submissionId,
      message,
      source: 'workflow',
      user_name: workflow?.submitted_by_user_name || null,
      user_email: workflow?.submitted_by_user_email || null,
      node_name: submissionContext?.node_name || null,
      node_reference: submissionContext?.node_reference || null,
    });
  } catch (error) {
    logger.warn(`[ApprovalNotification] Activity log failed: ${error.message}`);
  }
};

const notifyCurrentApprover = async ({ tenantId, workflow, step, subjectPrefix, messageBody }) => {
  if (!workflow || !step) return;

  const recipients = await resolveStepRecipients({ tenantId, step });
  if (!recipients.length) return;

  const subject = `${subjectPrefix} ${workflow.workflow_name || 'Approval Workflow'}`;
  await sendBulkEmails({
    recipients,
    subject,
    template: {
      preheader: 'A submission is waiting for your approval.',
      layout: 'approvalAction',
      label: 'Approval workflow',
      icon: 'APP',
      headline: 'A submission needs your approval.',
      body: [
        `A submission has reached your approval level in ${workflow.workflow_name || 'Approval Workflow'}.`,
        'Review the submission details and approve, reject, or request changes from Saby.',
        messageBody,
      ],
      detailsRows: [
        ['Submission', workflow.submission_id],
        ['Workflow', workflow.workflow_name || 'Approval Workflow'],
        ['Approval level', step.step_name || 'Approval step'],
        ['Submitter', workflow.submitted_by_user_name || 'Unknown submitter'],
      ],
    },
  });
};

const notifySubmitter = async ({ workflow, subject, text }) => {
  const email = String(workflow?.submitted_by_user_email || '').trim();
  if (!email) return;
  try {
    const isRejected = subject.toLowerCase().includes('rejected');
    const isChangeRequest = subject.toLowerCase().includes('changes');
    await emailService.sendSabyEmail({
      to: email,
      subject,
      preheader: text,
      layout: 'approvalResult',
      label: 'Approval update',
      icon: 'APP',
      headline: isRejected
        ? 'Submission rejected.'
        : isChangeRequest
          ? 'Changes were requested.'
          : 'Your submission was approved.',
      body: [
        isRejected
          ? `Your submission was rejected in ${workflow.workflow_name || 'Approval Workflow'}.`
          : isChangeRequest
            ? `An approver requested changes to your submission in ${workflow.workflow_name || 'Approval Workflow'}.`
            : `Your submission has been approved in ${workflow.workflow_name || 'Approval Workflow'}.`,
        isRejected
          ? "Review the decision details in Saby and follow your organization's next-step process."
          : isChangeRequest
            ? 'Review the request, update the submission, and resend it through the approval workflow.'
            : 'Saby has recorded the approval and will continue the workflow if more steps are required.',
        text,
      ],
      detailsRows: [
        ['Submission', workflow.submission_id],
        ['Workflow', workflow.workflow_name || 'Approval Workflow'],
        ['Status', isRejected ? 'Rejected' : isChangeRequest ? 'Changes requested' : 'Approved'],
      ],
    });
  } catch (error) {
    logger.warn(`[ApprovalNotification] Failed to email submitter ${email}: ${error.message}`);
  }
};

const notifyWorkflowInitialized = async ({ tenantId, workflowId, submissionId }) => {
  try {
    const [workflow, step, submissionContext] = await Promise.all([
      getWorkflowRecord({ workflowId, tenantId }),
      getCurrentWorkflowStep({ workflowId }),
      getSubmissionContext({ submissionId, tenantId }),
    ]);

    if (!workflow || !step) return;

    await notifyCurrentApprover({
      tenantId,
      workflow,
      step,
      subjectPrefix: '[Approval Required]',
      messageBody: 'A new submission is waiting for your approval.',
    });

    await logApprovalActivity({
      tenantId,
      submissionId,
      workflow,
      submissionContext,
      action: 'approval_initialized',
      status: 'pending_approval',
      message: `Approval workflow "${workflow.workflow_name || 'Approval Workflow'}" started`,
    });
  } catch (error) {
    logger.warn(`[ApprovalNotification] Failed to notify initial approver: ${error.message}`);
  }
};

const notifyApprovalAction = async ({
  tenantId,
  workflowId,
  submissionId,
  action,
  actor,
  comments,
  result,
  submissionApproval,
}) => {
  try {
    const [workflow, step, submissionContext] = await Promise.all([
      getWorkflowRecord({ workflowId, tenantId }),
      getCurrentWorkflowStep({ workflowId }),
      getSubmissionContext({ submissionId, tenantId }),
    ]);

    if (!workflow) return;

    const actorName = String(actor?.userName || actor?.userEmail || 'An approver').trim();
    const normalizedAction = String(action || '').trim().toLowerCase();

    if (normalizedAction === 'approve') {
      if (result?.workflowStatus === 'approved' || result?.workflowStatus === 'completed') {
        await notifySubmitter({
          workflow,
          subject: '[Approved] Your submission has been approved',
          text: `${actorName} approved your submission${comments ? `.\n\nComment: ${comments}` : '.'}`,
        });
      } else if (step) {
        await notifyCurrentApprover({
          tenantId,
          workflow,
          step,
          subjectPrefix: '[Approval Required]',
          messageBody: `${actorName} completed the previous approval level. This submission is now waiting for your review.`,
        });
      }
    } else if (normalizedAction === 'reject') {
      await notifySubmitter({
        workflow,
        subject: '[Rejected] Your submission was rejected',
        text: `${actorName} rejected your submission${comments ? `.\n\nReason: ${comments}` : '.'}`,
      });
    } else if (normalizedAction === 'request_changes') {
      await notifySubmitter({
        workflow,
        subject: '[Changes Requested] Your submission needs updates',
        text: `${actorName} requested changes to your submission${comments ? `.\n\nComment: ${comments}` : '.'}`,
      });
    } else if (normalizedAction === 'escalate' && step) {
      await notifyCurrentApprover({
        tenantId,
        workflow,
        step,
        subjectPrefix: '[Escalated Approval]',
        messageBody: `${actorName} escalated this approval to you${comments ? `.\n\nComment: ${comments}` : '.'}`,
      });
    }

    await logApprovalActivity({
      tenantId,
      submissionId,
      workflow,
      submissionContext,
      action: `approval_${normalizedAction}`,
      status: submissionApproval?.status || result?.workflowStatus || workflow?.status || 'pending_approval',
      message: `Approval action "${normalizedAction}" recorded for workflow "${workflow.workflow_name || 'Approval Workflow'}"`,
    });
  } catch (error) {
    logger.warn(`[ApprovalNotification] Failed to process approval action notifications: ${error.message}`);
  }
};

module.exports = {
  notifyWorkflowInitialized,
  notifyApprovalAction,
};
