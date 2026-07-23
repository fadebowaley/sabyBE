/**
 * WorkflowController
 *
 * Exposes workflow management endpoints:
 *
 *  GET  /v1/submissions/:id/workflows            — list workflows for a submission
 *  POST /v1/submissions/:id/workflows/:wfId/action/:stepDefId
 *                                                — approve / reject / review a step
 *  GET  /v1/workflows/inbox                      — pending steps for the current user's role
 *  GET  /v1/project-forms/:projectId/workflows   — list workflow definitions on a module
 *  PUT  /v1/project-forms/:projectId/workflows   — replace workflow definitions on a module
 */

const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const workflowService = require('../services/workflow.service');
const copilotActionService = require('../services/copilotAction.service');
const ProjectForm = require('../models/projectForm.model');

// ---------------------------------------------------------------------------
// GET /v1/submissions/:id/workflows
// ---------------------------------------------------------------------------
const getSubmissionWorkflows = catchAsync(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new ApiError(httpStatus.UNAUTHORIZED, 'Tenant context required');

  const workflows = await workflowService.getWorkflows(id, tenantId);
  res.status(httpStatus.OK).json({ submissionId: id, workflows });
});

// ---------------------------------------------------------------------------
// POST /v1/submissions/:id/workflows/:wfId/action/:stepDefId
// Body: { action: 'approved'|'rejected'|'reviewed'|'skipped', comments?: string }
// ---------------------------------------------------------------------------
const actionWorkflowStep = catchAsync(async (req, res) => {
  const { id: submissionId, wfId, stepDefId } = req.params;
  const { action, comments } = req.body;
  const tenantId = req.user?.tenantId;

  if (!action) throw new ApiError(httpStatus.BAD_REQUEST, '"action" is required');

  // Look up the workflow definition so we can advance to the next step
  const wfRow = await require('../config/postgres').postgresPool.query(
    'SELECT * FROM submission_workflows WHERE id = $1 AND tenant_id = $2',
    [wfId, tenantId]
  );
  if (wfRow.rows.length === 0) throw new ApiError(httpStatus.NOT_FOUND, 'Workflow not found');

  // Load the form to get the workflow definition
  const wfInstance = wfRow.rows[0];
  let workflowDef = null;
  if (wfInstance.workflow_def_id) {
    const form = await ProjectForm.findOne({ projectId: wfInstance.project_id })
      .select('capabilities.experience.workflow.workflows')
      .lean();
    if (form) {
      workflowDef = (
        form?.capabilities?.experience?.workflow?.workflows || []
      ).find((w) => w.id === wfInstance.workflow_def_id);
    }
  }

  const actor = {
    userId: req.user?.id || req.user?._id || req.user?.userId,
    userName: req.user?.name || [req.user?.firstname, req.user?.lastname].filter(Boolean).join(' '),
    userEmail: req.user?.email,
    role: req.user?.role || null,
  };

  const result = await workflowService.actionStep(
    wfId,
    stepDefId,
    action,
    actor,
    comments,
    workflowDef
  );

  if (action === 'approved' || action === 'rejected') {
    await copilotActionService.recordExistingAction({
      tenantId,
      actorUserId: actor.userId,
      actionType:
        action === 'approved' ? 'approve_submission' : 'reject_submission',
      entityType: 'submission',
      entityId: submissionId,
      payload: {
        source: 'workflow.controller.actionWorkflowStep',
        workflowId: wfId,
        stepDefId,
        workflowStatus: result.workflowStatus,
        stepStatus: result.stepStatus || action,
      },
      source: 'existing-service',
      priority: action === 'rejected' ? 9 : 7,
    });
  }

  res.status(httpStatus.OK).json({
    submissionId,
    workflowId: wfId,
    stepDefId,
    action,
    ...result,
  });
});

// ---------------------------------------------------------------------------
// GET /v1/workflows/inbox  — steps waiting for the current user's role or user assignment
// ---------------------------------------------------------------------------
const getInbox = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId;
  const userId = req.user?.id || req.user?._id || req.user?.userId || null;
  const role = req.query.role || req.user?.role || 'manager';
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);

  const steps = await workflowService.getPendingStepsForActor({
    tenantId,
    role,
    userId,
    limit,
  });
  res.status(httpStatus.OK).json({ role, userId, total: steps.length, steps });
});

// ---------------------------------------------------------------------------
// GET /v1/project-forms/:projectId/workflows — read workflow definitions
// ---------------------------------------------------------------------------
const getModuleWorkflows = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const form = await ProjectForm.findOne({ projectId })
    .select('projectId capabilities.experience.workflow.workflows')
    .lean();
  if (!form) throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');
  res.status(httpStatus.OK).json({
    projectId,
    workflows: form?.capabilities?.experience?.workflow?.workflows || [],
  });
});

// ---------------------------------------------------------------------------
// PUT /v1/project-forms/:projectId/workflows — replace workflow definitions
// Body: { workflows: [...] }
// ---------------------------------------------------------------------------
const updateModuleWorkflows = catchAsync(async (req, res) => {
  const { projectId } = req.params;
  const { workflows } = req.body;

  if (!Array.isArray(workflows)) {
    throw new ApiError(httpStatus.BAD_REQUEST, '"workflows" must be an array');
  }

  // Ensure each workflow has a unique id
  const { nanoid } = require('nanoid');
  const normalised = workflows.map((wf) => ({
    ...wf,
    id: wf.id || `wf_${nanoid(10)}`,
    steps: (wf.steps || []).map((s, i) => ({
      ...s,
      id: s.id || `step_${nanoid(8)}`,
      stepOrder: s.stepOrder ?? i,
    })),
  }));

  const form = await ProjectForm.findOneAndUpdate(
    { projectId },
    { $set: { 'capabilities.experience.workflow.workflows': normalised } },
    { new: true, runValidators: true }
  ).select('projectId capabilities.experience.workflow.workflows');

  if (!form) throw new ApiError(httpStatus.NOT_FOUND, 'Module not found');

  res.status(httpStatus.OK).json({
    projectId,
    workflows: form?.capabilities?.experience?.workflow?.workflows || [],
  });
});

module.exports = {
  getSubmissionWorkflows,
  actionWorkflowStep,
  getInbox,
  getModuleWorkflows,
  updateModuleWorkflows,
};
