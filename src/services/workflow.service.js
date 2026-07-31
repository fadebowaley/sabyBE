/**
 * WorkflowService
 *
 * Manages the lifecycle of workflow add-ons attached to module submissions.
 * Each module (ProjectForm) may carry an array of workflow definitions.
 * When a submission is created the worker calls `initWorkflows`, which
 * instantiates one submission_workflows row + N submission_workflow_steps rows
 * per enabled workflow definition.
 *
 * Step lifecycle:
 *   pending → in_progress → approved | rejected | reviewed | skipped
 *
 * Workflow lifecycle:
 *   pending → in_progress → approved | rejected | completed | cancelled
 */

const { v4: uuidv4 } = require('uuid');
const { postgresPool } = require('../config/postgres');
const logger = require('../config/logger');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the ISO due date for a step based on its SLA in hours. */
function computeDueAt(slaHours = 48) {
  const d = new Date();
  d.setHours(d.getHours() + slaHours);
  return d.toISOString();
}

/** Determine first step of a workflow definition. */
function firstStep(workflowDef) {
  if (!workflowDef.steps || workflowDef.steps.length === 0) return null;
  return [...workflowDef.steps].sort((a, b) => (a.stepOrder || 0) - (b.stepOrder || 0))[0];
}

/** Find the step definition that follows the current step. */
function nextStepDef(workflowDef, currentStepDefId) {
  const sorted = [...workflowDef.steps].sort((a, b) => (a.stepOrder || 0) - (b.stepOrder || 0));
  const idx = sorted.findIndex((s) => s.id === currentStepDefId);
  if (idx === -1 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1];
}

const findStepDef = (workflowDef, currentStepDefId) => {
  if (!workflowDef || !Array.isArray(workflowDef.steps)) return null;
  return (
    workflowDef.steps.find((step) => step.id === currentStepDefId) || null
  );
};

const syncSubmissionApprovalStatus = async (submissionId, status) => {
  if (!submissionId || !status) return;
  await postgresPool.query(
    `UPDATE form_submissions
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [status, submissionId]
  );
};

const APPROVAL_FALLBACK_ROLE_REFS = new Set([
  'admin',
  'owner',
  'sabyadmin',
  'sabyowner',
  'superadmin',
  'superuser',
  'tenantadmin',
  'tenantowner',
]);

const actorHasApprovalFallbackAccess = (actor = {}) => {
  if (actor.isAdmin || actor.isOwner || actor.isSaby || actor.isSuper) {
    return true;
  }

  const roleRefs = [actor.role, ...(Array.isArray(actor.roles) ? actor.roles : [])]
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  return roleRefs.some((entry) => APPROVAL_FALLBACK_ROLE_REFS.has(entry));
};

const canActorActionStep = (step, actor = {}) => {
  const actorRoleRefs = [
    actor.role,
    ...(Array.isArray(actor.roles) ? actor.roles : []),
  ]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
  const actorUserId = String(actor.userId || '').trim();
  const assigneeType = String(step.assignee_type || '').trim().toLowerCase();
  const assigneeRole = String(step.assignee_role || '').trim();
  const assigneeRoles = Array.isArray(step.assignee_roles) ? step.assignee_roles : [];
  const assigneeUsers = Array.isArray(step.assignee_users) ? step.assignee_users : [];

  if (assigneeType === 'user') {
    const allowedUsers = assigneeUsers
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    if (allowedUsers.length > 0) {
      if (!actorUserId) return false;
      return allowedUsers.includes(actorUserId);
    }

    // Legacy/broken workflow rows may have `assignee_type=user` without users.
    // Let workspace owners/admins recover the approval instead of deadlocking it.
    return actorHasApprovalFallbackAccess(actor);
  }

  if (assigneeType === 'role' || !assigneeType) {
    if (actorRoleRefs.length === 0) return false;
    const allowedRoles = new Set(
      [assigneeRole, ...assigneeRoles]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    );
    return actorRoleRefs.some((entry) => allowedRoles.has(entry));
  }

  return true;
};

// ---------------------------------------------------------------------------
// autoAdvanceNotifySteps
// ---------------------------------------------------------------------------
/**
 * After a step becomes `in_progress`, check whether it is a system-handled
 * step type that should be completed automatically (no human action required).
 *
 * Auto-complete action types:
 *   - NOTIFY  — a notification is sent by the system; no actor needed.
 *   - SUBMIT  — records that the submitter acted; already implicit.
 *
 * The function recurses until it hits a non-auto step or runs out of steps.
 *
 * @param {string} workflowId
 * @param {object|null} workflowDef  - full workflow definition (used for
 *                                     nextStepDef lookup). Pass null to skip.
 */
const autoAdvanceNotifySteps = async (workflowId, workflowDef) => {
  // Get the current in_progress step for this workflow
  const stepResult = await postgresPool.query(
    `SELECT * FROM submission_workflow_steps
     WHERE workflow_id = $1 AND status = 'in_progress'
     ORDER BY step_order ASC
     LIMIT 1`,
    [workflowId]
  );

  if (stepResult.rows.length === 0) return;
  const step = stepResult.rows[0];

  const isAutoStep =
    step.action_type === 'NOTIFY' ||
    step.action_type === 'SUBMIT';

  if (!isAutoStep) return;

  // Auto-complete the step immediately
  await postgresPool.query(
    `UPDATE submission_workflow_steps
     SET status = 'completed', action = 'auto_completed',
         actioned_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [step.id]
  );

  logger.info(
    `[Workflow] Auto-advanced ${step.action_type} step "${step.step_name}" ` +
    `(${step.id}) in workflow ${workflowId}`
  );

  // Try to advance to the next step
  const next = workflowDef ? nextStepDef(workflowDef, step.step_def_id) : null;

  if (next) {
    await postgresPool.query(
      `UPDATE submission_workflow_steps
       SET status = 'in_progress', due_at = $1, updated_at = NOW()
       WHERE workflow_id = $2 AND step_def_id = $3`,
      [computeDueAt(next.sla?.hours), workflowId, next.id]
    );
    await postgresPool.query(
      `UPDATE submission_workflows
       SET current_step_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [next.id, workflowId]
    );
    // Recurse: the next step might also be auto-type
    await autoAdvanceNotifySteps(workflowId, workflowDef);
  } else {
    // No more steps — complete the workflow
    await postgresPool.query(
      `UPDATE submission_workflows
       SET status = 'completed', current_step_id = NULL,
           completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [workflowId]
    );
    logger.info(`[Workflow] Workflow ${workflowId} auto-completed (all steps were auto-type).`);
  }
};

// ---------------------------------------------------------------------------
// initWorkflows
// ---------------------------------------------------------------------------
/**
 * Called by the submission worker immediately after a submission is persisted.
 * Creates one workflow instance per enabled workflow definition on the form.
 *
 * @param {object} submission  - Row from form_submissions (must have id, tenant_id, etc.)
 * @param {Array}  workflows   - ProjectForm.workflows[] from MongoDB
 * @param {object} [submitter] - { userId, userName, userEmail } — optional
 */
const initWorkflows = async (submission, workflows = [], submitter = {}) => {
  if (!workflows || workflows.length === 0) return [];

  const active = workflows.filter((wf) => wf.enabled !== false && wf.triggerOn !== 'manual');
  if (active.length === 0) return [];

  const instances = [];
  let hasActiveApproval = false;

  for (const wf of active) {
    try {
      const existingResult = await postgresPool.query(
        `SELECT id, workflow_def_id, workflow_name, status
         FROM submission_workflows
         WHERE submission_id = $1 AND tenant_id = $2 AND workflow_def_id = $3
         LIMIT 1`,
        [submission.id, submission.tenant_id, wf.id]
      );
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        instances.push({
          workflowId: existing.id,
          workflowDefId: existing.workflow_def_id,
          name: existing.workflow_name || wf.name,
          existing: true,
          status: existing.status || null,
        });
        if (['pending', 'in_progress'].includes(String(existing.status || '').trim().toLowerCase())) {
          hasActiveApproval = true;
        }
        continue;
      }

      // ------------------------------------------------------------------
      // 1. Create the workflow instance row
      // ------------------------------------------------------------------
      const wfId = uuidv4();
      const first = firstStep(wf);

      await postgresPool.query(
        `INSERT INTO submission_workflows (
          id, submission_id, tenant_id, project_id, form_id,
          workflow_def_id, workflow_name, workflow_type, status,
          current_step_id,
          submitted_by_user_id, submitted_by_user_name, submitted_by_user_email,
          metadata, initiated_at, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,
          $10,
          $11,$12,$13,
          $14, NOW(), NOW(), NOW()
        )`,
        [
          wfId,
          submission.id,
          submission.tenant_id,
          submission.project_id || null,
          submission.form_id || null,
          wf.id,
          wf.name,
          wf.type || 'approval',
          first ? 'in_progress' : 'completed',
          first ? first.id : null,
          submitter.userId || null,
          submitter.userName || null,
          submitter.userEmail || null,
          JSON.stringify(wf.metadata || {}),
        ]
      );

      // ------------------------------------------------------------------
      // 2. Create step instance rows
      // ------------------------------------------------------------------
      const sorted = [...(wf.steps || [])].sort((a, b) => (a.stepOrder || 0) - (b.stepOrder || 0));

      for (const step of sorted) {
        const isFirst = first && step.id === first.id;
        const stepStatus = isFirst ? 'in_progress' : 'pending';
        const dueAt = isFirst ? computeDueAt(step.sla?.hours) : null;

        // Resolve the primary role: use first of assigneeRoles[], fall back to assigneeRole
        const primaryRole = (step.assigneeRoles && step.assigneeRoles.length > 0)
          ? step.assigneeRoles[0]
          : step.assigneeRole || null;

        await postgresPool.query(
          `INSERT INTO submission_workflow_steps (
            id, workflow_id, submission_id, tenant_id,
            step_def_id, step_name, step_type, step_order, action_type,
            status, assignee_type, assignee_role, assignee_roles, assignee_users,
            sla_hours, due_at,
            created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,
            $5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,
            $15,$16,
            NOW(), NOW()
          )`,
          [
            uuidv4(),
            wfId,
            submission.id,
            submission.tenant_id,
            step.id,
            step.name,
            step.type || 'approval',
            step.stepOrder || 0,
            step.actionType || null,
            stepStatus,
            step.assigneeType || 'role',
            primaryRole,
            JSON.stringify(step.assigneeRoles || (step.assigneeRole ? [step.assigneeRole] : [])),
            JSON.stringify(step.assigneeUsers || []),
            step.sla?.hours || 48,
            dueAt,
          ]
        );
      }

      instances.push({ workflowId: wfId, workflowDefId: wf.id, name: wf.name });
      if (first) {
        hasActiveApproval = true;
      }
      logger.info(`[Workflow] Initiated workflow "${wf.name}" (${wfId}) for submission ${submission.id}`);

      // Auto-advance the first step if it is a NOTIFY or SUBMIT type
      // (no human action needed; these steps complete themselves on init).
      try {
        await autoAdvanceNotifySteps(wfId, wf);
      } catch (autoErr) {
        logger.warn(`[Workflow] Auto-advance failed for workflow ${wfId}: ${autoErr.message}`);
      }
    } catch (err) {
      // Never block the submission because of a workflow init failure
      logger.error(`[Workflow] Failed to init workflow "${wf.name}" for submission ${submission.id}: ${err.message}`);
    }
  }

  if (hasActiveApproval) {
    await syncSubmissionApprovalStatus(submission.id, 'pending_approval');
  }

  return instances;
};

// ---------------------------------------------------------------------------
// getWorkflows
// ---------------------------------------------------------------------------
/**
 * Returns all workflow instances (with their steps) for a given submission.
 */
const getWorkflows = async (submissionId, tenantId) => {
  const wfRows = await postgresPool.query(
    `SELECT * FROM submission_workflows
     WHERE submission_id = $1 AND tenant_id = $2
     ORDER BY initiated_at ASC`,
    [submissionId, tenantId]
  );

  const workflows = [];
  for (const wf of wfRows.rows) {
    const stepRows = await postgresPool.query(
      `SELECT * FROM submission_workflow_steps
       WHERE workflow_id = $1
       ORDER BY step_order ASC, created_at ASC`,
      [wf.id]
    );
    workflows.push({ ...wf, steps: stepRows.rows });
  }

  return workflows;
};

// ---------------------------------------------------------------------------
// actionStep
// ---------------------------------------------------------------------------
/**
 * Record an action (approve / reject / review / skip / request changes / escalate)
 * on a workflow step.
 * Automatically advances or completes the parent workflow.
 *
 * @param {string} workflowId - submission_workflows.id (UUID)
 * @param {string} stepDefId  - step_def_id to act on
 * @param {string} action     - 'approved' | 'rejected' | 'reviewed' | 'skipped' | 'changes_requested' | 'escalated'
 * @param {object} actor      - { userId, userName, userEmail }
 * @param {string} [comments]
 * @param {Array}  [workflowDef] - full workflow definition steps (optional, for auto-advance)
 */
const actionStep = async (workflowId, stepDefId, action, actor, comments, workflowDef) => {
  const validActions = [
    'approved',
    'rejected',
    'reviewed',
    'skipped',
    'changes_requested',
    'escalated',
  ];
  if (!validActions.includes(action)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid action "${action}". Must be one of: ${validActions.join(', ')}`);
  }

  // Fetch the workflow instance
  const wfResult = await postgresPool.query(
    'SELECT * FROM submission_workflows WHERE id = $1',
    [workflowId]
  );
  if (wfResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workflow instance not found');
  }
  const wf = wfResult.rows[0];

  // Fetch the step instance
  const stepResult = await postgresPool.query(
    'SELECT * FROM submission_workflow_steps WHERE workflow_id = $1 AND step_def_id = $2',
    [workflowId, stepDefId]
  );
  if (stepResult.rows.length === 0) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Workflow step not found');
  }
  const step = stepResult.rows[0];

  if (step.status !== 'in_progress') {
    throw new ApiError(httpStatus.CONFLICT, `Step is already in status "${step.status}" and cannot be actioned`);
  }

  if (!canActorActionStep(step, actor)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not allowed to action this approval step');
  }

  const currentStepDef = findStepDef(workflowDef, stepDefId);

  if (action === 'escalated') {
    const escalationRoles = Array.isArray(currentStepDef?.escalationRoles)
      ? currentStepDef.escalationRoles.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    const escalationUsers = Array.isArray(currentStepDef?.escalationUsers)
      ? currentStepDef.escalationUsers.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    const escalationType = String(currentStepDef?.escalationType || '').trim().toLowerCase();
    const fallbackEscalateTo = String(currentStepDef?.sla?.escalateTo || '').trim();

    let nextAssigneeType = null;
    let nextAssigneeRole = null;
    let nextAssigneeRoles = [];
    let nextAssigneeUsers = [];

    if (escalationType === 'role' && escalationRoles.length > 0) {
      nextAssigneeType = 'role';
      nextAssigneeRoles = escalationRoles;
      nextAssigneeRole = escalationRoles[0];
    } else if (escalationType === 'user' && escalationUsers.length > 0) {
      nextAssigneeType = 'user';
      nextAssigneeUsers = escalationUsers;
    } else if (fallbackEscalateTo) {
      nextAssigneeType = 'role';
      nextAssigneeRole = fallbackEscalateTo;
      nextAssigneeRoles = [fallbackEscalateTo];
    }

    if (!nextAssigneeType) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'This approval level does not have an escalation target configured'
      );
    }

    await postgresPool.query(
      `UPDATE submission_workflow_steps
       SET assignee_type = $1,
           assignee_role = $2,
           assignee_roles = $3::jsonb,
           assignee_users = $4::jsonb,
           action = 'escalated',
           action_by_user_id = $5,
           action_by_user_name = $6,
           action_by_user_email = $7,
           comments = $8,
           actioned_at = NOW(),
           updated_at = NOW()
       WHERE id = $9`,
      [
        nextAssigneeType,
        nextAssigneeRole,
        JSON.stringify(nextAssigneeRoles),
        JSON.stringify(nextAssigneeUsers),
        actor.userId || null,
        actor.userName || null,
        actor.userEmail || null,
        comments || null,
        step.id,
      ]
    );

    await postgresPool.query(
      `UPDATE submission_workflows
       SET status = 'escalated', updated_at = NOW()
       WHERE id = $1`,
      [workflowId]
    );
    await syncSubmissionApprovalStatus(wf.submission_id, 'pending_approval');
    return {
      workflowStatus: 'escalated',
      stepStatus: 'in_progress',
      reassignedTo: {
        type: nextAssigneeType,
        role: nextAssigneeRole,
        roles: nextAssigneeRoles,
        users: nextAssigneeUsers,
      },
    };
  }

  // Record the action on the step
  await postgresPool.query(
    `UPDATE submission_workflow_steps SET
      status = $1, action = $2,
      action_by_user_id = $3, action_by_user_name = $4, action_by_user_email = $5,
      comments = $6, actioned_at = NOW(), updated_at = NOW()
     WHERE id = $7`,
    [
      action === 'approved' ? 'approved'
        : action === 'rejected' ? 'rejected'
        : action === 'changes_requested' ? 'changes_requested'
        : action === 'reviewed' ? 'completed'
        : 'skipped',
      action,
      actor.userId || null,
      actor.userName || null,
      actor.userEmail || null,
      comments || null,
      step.id,
    ]
  );

  // ── Advance or terminate the workflow ──────────────────────────────────

  if (action === 'rejected') {
    // Rejected — mark all pending steps as skipped and close the workflow
    await postgresPool.query(
      `UPDATE submission_workflow_steps
       SET status = 'skipped', updated_at = NOW()
       WHERE workflow_id = $1 AND status IN ('pending','in_progress') AND id != $2`,
      [workflowId, step.id]
    );
    await postgresPool.query(
      `UPDATE submission_workflows
       SET status = 'rejected', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [workflowId]
    );
    await syncSubmissionApprovalStatus(wf.submission_id, 'rejected');
    return { workflowStatus: 'rejected', stepStatus: 'rejected' };
  }

  if (action === 'changes_requested') {
    await postgresPool.query(
      `UPDATE submission_workflow_steps
       SET status = 'skipped', updated_at = NOW()
       WHERE workflow_id = $1 AND status IN ('pending','in_progress') AND id != $2`,
      [workflowId, step.id]
    );
    await postgresPool.query(
      `UPDATE submission_workflows
       SET status = 'changes_requested', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [workflowId]
    );
    await syncSubmissionApprovalStatus(wf.submission_id, 'changes_requested');
    return {
      workflowStatus: 'changes_requested',
      stepStatus: 'changes_requested',
    };
  }

  // Approved/reviewed/skipped — try to advance to the next step
  if (workflowDef) {
    const next = nextStepDef(workflowDef, stepDefId);
    if (next) {
      // Activate the next step
      await postgresPool.query(
        `UPDATE submission_workflow_steps
         SET status = 'in_progress', due_at = $1, updated_at = NOW()
         WHERE workflow_id = $2 AND step_def_id = $3`,
        [computeDueAt(next.sla?.hours), workflowId, next.id]
      );
      await postgresPool.query(
        `UPDATE submission_workflows
         SET status = 'in_progress', current_step_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [next.id, workflowId]
      );
      await syncSubmissionApprovalStatus(wf.submission_id, 'pending_approval');

      // If the newly activated step is a NOTIFY/SUBMIT type, auto-advance it
      await autoAdvanceNotifySteps(workflowId, workflowDef);

      // Re-read the workflow status in case auto-advance finished it
      const wfRefresh = await postgresPool.query(
        'SELECT status, current_step_id FROM submission_workflows WHERE id = $1',
        [workflowId]
      );
      const refreshed = wfRefresh.rows[0];
      return {
        workflowStatus: refreshed?.status ?? 'in_progress',
        nextStepId: refreshed?.current_step_id ?? next.id,
      };
    }
  }

  // No more steps — workflow is complete/approved
  const terminalStatus = action === 'approved' ? 'approved' : 'completed';
  await postgresPool.query(
    `UPDATE submission_workflows
     SET status = $1, current_step_id = NULL, completed_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [terminalStatus, workflowId]
  );
  await syncSubmissionApprovalStatus(
    wf.submission_id,
    terminalStatus === 'approved' ? 'approved' : 'submitted'
  );
  return { workflowStatus: terminalStatus };
};

// ---------------------------------------------------------------------------
// getWorkflowsByTenant  (for dashboard / approval inbox)
// ---------------------------------------------------------------------------
/**
 * Fetch all in-progress workflow steps assigned to a given role and/or user.
 * Used to build an approval inbox view.
 */
const getPendingStepsForActor = async ({
  tenantId,
  role = null,
  roles = [],
  userId = null,
  limit = 50,
}) => {
  const roleRefs = Array.from(
    new Set(
      [role, ...(Array.isArray(roles) ? roles : [])]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
  const result = await postgresPool.query(
    `SELECT sws.*, sw.workflow_name, sw.workflow_type, sw.submission_id,
            sw.submitted_by_user_name, sw.submitted_by_user_email
     FROM submission_workflow_steps sws
     JOIN submission_workflows sw ON sws.workflow_id = sw.id
     WHERE sws.tenant_id = $1
       AND (
         ($2::text[] IS NOT NULL AND array_length($2::text[], 1) > 0 AND (
           sws.assignee_role = ANY($2::text[])
           OR COALESCE(sws.assignee_roles, '[]'::jsonb) ?| $2::text[]
         ))
         OR
         ($3::varchar IS NOT NULL AND COALESCE(sws.assignee_users, '[]'::jsonb) @> jsonb_build_array($3::varchar))
       )
       AND sws.status = 'in_progress'
     ORDER BY sws.due_at ASC NULLS LAST
     LIMIT $4`,
    [tenantId, roleRefs.length ? roleRefs : null, userId || null, limit]
  );
  return result.rows;
};

const getPendingStepsForRole = async (tenantId, role, limit = 50) =>
  getPendingStepsForActor({ tenantId, role, limit });

/**
 * Cancel all workflow instances for a submission (e.g. when submission is deleted).
 */
const cancelWorkflows = async (submissionId, tenantId) => {
  await postgresPool.query(
    `UPDATE submission_workflow_steps
     SET status = 'skipped', updated_at = NOW()
     WHERE submission_id = $1 AND tenant_id = $2 AND status IN ('pending','in_progress')`,
    [submissionId, tenantId]
  );
  await postgresPool.query(
    `UPDATE submission_workflows
     SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
     WHERE submission_id = $1 AND tenant_id = $2 AND status NOT IN ('approved','rejected','completed','cancelled')`,
    [submissionId, tenantId]
  );
};

module.exports = {
  initWorkflows,
  getWorkflows,
  actionStep,
  getPendingStepsForActor,
  getPendingStepsForRole,
  cancelWorkflows,
  autoAdvanceNotifySteps,
};
