const ProjectForm = require('../models/projectForm.model');
const workflowService = require('./workflow.service');
const approvalNotificationService = require('./approvalNotification.service');
const logger = require('../config/logger');

const initializeSubmissionApprovals = async ({
  submission,
  projectId,
  submitter = {},
}) => {
  if (!submission || !projectId) {
    return {
      approvalRequired: false,
      workflowCount: 0,
      instances: [],
    };
  }

  const form = await ProjectForm.findOne({ projectId })
    .select('capabilities.experience.workflow.workflows')
    .lean();
  const activeWorkflows = (
    form?.capabilities?.experience?.workflow?.workflows || []
  ).filter((workflow) => workflow.enabled !== false && workflow.triggerOn !== 'manual');

  if (activeWorkflows.length === 0) {
    return {
      approvalRequired: false,
      workflowCount: 0,
      instances: [],
    };
  }

  const instances = await workflowService.initWorkflows(
    submission,
    activeWorkflows,
    submitter
  );

  logger.info(
    `[ApprovalOrchestrator] Initialised ${instances.length} approval workflow(s) for submission ${submission.id}`
  );

  await Promise.allSettled(
    instances
      .filter((instance) => instance?.workflowId)
      .map((instance) =>
        approvalNotificationService.notifyWorkflowInitialized({
          tenantId: submission.tenant_id,
          workflowId: instance.workflowId,
          submissionId: submission.id,
        })
      )
  );

  return {
    approvalRequired: instances.length > 0,
    workflowCount: activeWorkflows.length,
    instances,
  };
};

module.exports = {
  initializeSubmissionApprovals,
};
