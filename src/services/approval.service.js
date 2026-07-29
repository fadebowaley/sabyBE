const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const ProjectForm = require('../models/projectForm.model');
const workflowService = require('./workflow.service');
const approvalNotificationService = require('./approvalNotification.service');
const { postgresPool } = require('../config/postgres');

const normalizeJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeStepStatusLabel = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'rejected') return 'Rejected';
  if (normalized === 'changes_requested') return 'Changes Requested';
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'skipped') return 'Skipped';
  if (normalized === 'in_progress') return 'Pending';
  return 'Pending';
};

const buildLevelProjection = (step, index) => ({
  approvalId: step.id,
  workflowId: step.workflow_id,
  stepDefId: step.step_def_id,
  level: index + 1,
  name: step.step_name || `Approval Level ${index + 1}`,
  actionType: step.action_type || null,
  approverType: step.assignee_type || null,
  approverRole: step.assignee_role || null,
  approverRoles: normalizeJsonArray(step.assignee_roles),
  approverUsers: normalizeJsonArray(step.assignee_users),
  status: normalizeStepStatusLabel(step.status),
  rawStatus: step.status || 'pending',
  dueAt: step.due_at || null,
  actedAt: step.actioned_at || null,
  actor: {
    userId: step.action_by_user_id || null,
    name: step.action_by_user_name || null,
    email: step.action_by_user_email || null,
  },
  comments: step.comments || null,
});

const buildWorkflowProjection = (workflow) => {
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const sortedSteps = [...steps].sort(
    (left, right) => (left.step_order || 0) - (right.step_order || 0)
  );
  const currentIndex = sortedSteps.findIndex(
    (step) => step.step_def_id === workflow.current_step_id && step.status === 'in_progress'
  );

  let status = 'Pending';
  if (workflow.status === 'rejected') {
    status = 'Rejected';
  } else if (workflow.status === 'changes_requested') {
    status = 'Changes Requested';
  } else if (workflow.status === 'escalated') {
    status = 'Escalated';
  } else if (workflow.status === 'approved' || workflow.status === 'completed') {
    status = 'Approved';
  } else if (workflow.status === 'cancelled') {
    status = 'Cancelled';
  } else if (currentIndex > 0) {
    status = `Awaiting Level ${currentIndex + 1}`;
  }

  return {
    workflowId: workflow.id,
    workflowDefinitionId: workflow.workflow_def_id || null,
    name: workflow.workflow_name || 'Approval Workflow',
    type: workflow.workflow_type || 'approval',
    status,
    rawStatus: workflow.status || 'pending',
    currentLevel: currentIndex >= 0 ? currentIndex + 1 : null,
    totalLevels: sortedSteps.length,
    submittedBy: {
      userId: workflow.submitted_by_user_id || null,
      name: workflow.submitted_by_user_name || null,
      email: workflow.submitted_by_user_email || null,
    },
    initiatedAt: workflow.initiated_at || null,
    completedAt: workflow.completed_at || null,
    levels: sortedSteps.map((step, index) => buildLevelProjection(step, index)),
  };
};

const buildApprovalSummary = (workflowProjections) => {
  if (!workflowProjections.length) {
    return {
      approvalRequired: false,
      approvalStatus: 'Not Required',
      status: 'Not Required',
      currentLevel: null,
      totalLevels: 0,
      workflowCount: 0,
      currentApproverType: null,
      currentApproverRole: null,
      currentApproverUsers: [],
      lastAction: null,
      lastActionAt: null,
    };
  }

  const inProgress = workflowProjections.find(
    (workflow) =>
      workflow.rawStatus === 'in_progress' ||
      workflow.rawStatus === 'pending' ||
      workflow.rawStatus === 'escalated'
  );
  const rejected = workflowProjections.find((workflow) => workflow.rawStatus === 'rejected');
  const changesRequested = workflowProjections.find(
    (workflow) => workflow.rawStatus === 'changes_requested'
  );
  const latestActedLevel = workflowProjections
    .flatMap((workflow) => workflow.levels || [])
    .filter((level) => level.actedAt)
    .sort(
      (left, right) =>
        new Date(right.actedAt).getTime() - new Date(left.actedAt).getTime()
    )[0];

  if (rejected) {
    return {
      approvalRequired: true,
      approvalStatus: 'Rejected',
      status: 'Rejected',
      currentLevel: null,
      totalLevels: workflowProjections.reduce(
        (sum, workflow) => sum + (workflow.totalLevels || 0),
        0
      ),
      workflowCount: workflowProjections.length,
      currentApproverType: null,
      currentApproverRole: null,
      currentApproverUsers: [],
      lastAction: latestActedLevel?.status || 'Rejected',
      lastActionAt: latestActedLevel?.actedAt || null,
    };
  }

  if (changesRequested) {
    return {
      approvalRequired: true,
      approvalStatus: 'Changes Requested',
      status: 'Changes Requested',
      currentLevel: null,
      totalLevels: workflowProjections.reduce(
        (sum, workflow) => sum + (workflow.totalLevels || 0),
        0
      ),
      workflowCount: workflowProjections.length,
      currentApproverType: null,
      currentApproverRole: null,
      currentApproverUsers: [],
      lastAction: 'Changes Requested',
      lastActionAt: latestActedLevel?.actedAt || null,
    };
  }

  if (inProgress) {
    const currentLevelProjection = (inProgress.levels || []).find(
      (level) => level.level === inProgress.currentLevel
    );
    return {
      approvalRequired: true,
      approvalStatus: inProgress.status,
      status: inProgress.status,
      currentLevel: inProgress.currentLevel,
      totalLevels: inProgress.totalLevels,
      workflowCount: workflowProjections.length,
      currentApproverType: currentLevelProjection?.approverType || null,
      currentApproverRole: currentLevelProjection?.approverRole || null,
      currentApproverUsers: currentLevelProjection?.approverUsers || [],
      lastAction:
        inProgress.rawStatus === 'escalated'
          ? 'Escalated'
          : latestActedLevel?.status || null,
      lastActionAt: latestActedLevel?.actedAt || null,
    };
  }

  return {
    approvalRequired: true,
    approvalStatus: 'Approved',
    status: 'Approved',
    currentLevel: null,
    totalLevels: workflowProjections.reduce(
      (sum, workflow) => sum + (workflow.totalLevels || 0),
      0
    ),
    workflowCount: workflowProjections.length,
    currentApproverType: null,
    currentApproverRole: null,
    currentApproverUsers: [],
    lastAction: latestActedLevel?.status || 'Approved',
    lastActionAt: latestActedLevel?.actedAt || null,
  };
};

const getSubmissionApproval = async ({ submissionId, tenantId }) => {
  const workflows = await workflowService.getWorkflows(submissionId, tenantId);
  const projections = workflows.map(buildWorkflowProjection);
  return {
    submissionId,
    ...buildApprovalSummary(projections),
    workflows: projections,
  };
};

const getApprovalQueue = async ({ tenantId, role, roles = [], userId, limit = 50 }) => {
  const steps = await workflowService.getPendingStepsForActor({
    tenantId,
    role,
    roles,
    userId,
    limit,
  });

  return steps.map((step) => ({
    approvalId: step.id,
    workflowId: step.workflow_id,
    submissionId: step.submission_id,
    workflowName: step.workflow_name || 'Approval Workflow',
    workflowType: step.workflow_type || 'approval',
    level: Number(step.step_order || 0) + 1,
    stepName: step.step_name || 'Approval Step',
    actionType: step.action_type || null,
    status: normalizeStepStatusLabel(step.status),
    rawStatus: step.status || 'pending',
    dueAt: step.due_at || null,
    approver: {
      type: step.assignee_type || null,
      role: step.assignee_role || null,
      roles: Array.isArray(step.assignee_roles) ? step.assignee_roles : [],
      users: Array.isArray(step.assignee_users) ? step.assignee_users : [],
    },
    submittedBy: {
      name: step.submitted_by_user_name || null,
      email: step.submitted_by_user_email || null,
    },
  }));
};

const resolveWorkflowDefinition = async ({ projectId, workflowDefinitionId }) => {
  if (!projectId || !workflowDefinitionId) return null;
  const form = await ProjectForm.findOne({ projectId })
    .select('capabilities.experience.workflow.workflows')
    .lean();
  const workflows = form?.capabilities?.experience?.workflow?.workflows || [];
  return workflows.find((workflow) => workflow.id === workflowDefinitionId) || null;
};

const getStepByApprovalId = async ({ approvalId, tenantId }) => {
  const result = await postgresPool.query(
    `SELECT sws.*, sw.project_id, sw.workflow_def_id, sw.status AS workflow_status
     FROM submission_workflow_steps sws
     JOIN submission_workflows sw ON sw.id = sws.workflow_id
     WHERE sws.id = $1 AND sws.tenant_id = $2
     LIMIT 1`,
    [approvalId, tenantId]
  );
  return result.rows[0] || null;
};

const mapApprovalAction = (action) =>
  action === 'approve'
    ? 'approved'
    : action === 'reject'
      ? 'rejected'
      : action === 'request_changes'
        ? 'changes_requested'
        : action === 'escalate'
          ? 'escalated'
          : null;

const actOnApproval = async ({
  approvalId,
  tenantId,
  actor,
  action,
  comments = null,
}) => {
  const step = await getStepByApprovalId({ approvalId, tenantId });
  if (!step) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Approval task not found');
  }

  const mappedAction = mapApprovalAction(action);

  if (!mappedAction) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported approval action "${action}"`);
  }

  const workflowDef = await resolveWorkflowDefinition({
    projectId: step.project_id,
    workflowDefinitionId: step.workflow_def_id,
  });

  const result = await workflowService.actionStep(
    step.workflow_id,
    step.step_def_id,
    mappedAction,
    actor,
    comments,
    workflowDef
  );

  const submissionApproval = await getSubmissionApproval({
    submissionId: step.submission_id,
    tenantId,
  });

  await approvalNotificationService.notifyApprovalAction({
    tenantId,
    workflowId: step.workflow_id,
    submissionId: step.submission_id,
    action,
    actor,
    comments,
    result,
    submissionApproval,
  });

  return {
    approvalId,
    submissionId: step.submission_id,
    workflowId: step.workflow_id,
    stepDefId: step.step_def_id,
    action,
    result,
    submissionApproval,
  };
};

const actOnApprovalsBulk = async ({
  approvalIds,
  tenantId,
  actor,
  action,
  comments = null,
}) => {
  const ids = Array.isArray(approvalIds)
    ? approvalIds.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  if (!ids.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one approval ID is required');
  }

  const mappedAction = mapApprovalAction(action);
  if (!mappedAction) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Unsupported approval action "${action}"`);
  }

  const results = [];

  for (const approvalId of ids) {
    try {
      const item = await actOnApproval({
        approvalId,
        tenantId,
        actor,
        action,
        comments,
      });
      results.push({
        approvalId,
        success: true,
        submissionId: item.submissionId,
        workflowId: item.workflowId,
        submissionApproval: item.submissionApproval,
      });
    } catch (error) {
      results.push({
        approvalId,
        success: false,
        error: {
          message: error.message || 'Bulk approval action failed',
          statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
        },
      });
    }
  }

  return {
    action,
    total: ids.length,
    succeeded: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
};

module.exports = {
  getSubmissionApproval,
  getApprovalQueue,
  actOnApproval,
  actOnApprovalsBulk,
};
