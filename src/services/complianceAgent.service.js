/**
 * Compliance Agent Service
 *
 * Deterministic autonomous compliance monitoring workflow.
 * No AI/LLM. All logic is business-rule driven.
 *
 * Responsibilities:
 *  - Load active projects for a tenant
 *  - Detect nodes with missing/incomplete submissions for the current month
 *  - Deduplicate action items before creating new ones
 *  - Create copilot.action_items for missing submissions
 *  - Escalate overdue open action items
 *  - Save compliance_run_snapshots for observability
 *  - Orchestrate the full workflow through Phase 2 agent state tables
 *
 * Guardrails:
 *  - Every query includes tenant_id — no cross-tenant leakage
 *  - Dedup prevents duplicate action items for the same node/project/month
 *  - All steps are tracked in agent_tasks / agent_task_steps
 *  - Risk level: LOW for reads; MEDIUM for action item creation
 *  - Deterministic only — no model calls
 */

const { postgresPool } = require('../config/postgres');
const { ProjectForm } = require('../models');
const logger = require('../config/logger');
const agentTaskService = require('./agentTask.service');

const CURRENT_MONTH = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const END_OF_CURRENT_MONTH = () => {
  const now = new Date();
  const last = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)
  );
  return last.toISOString();
};

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

const loadActiveProjects = async (tenantId) => {
  const forms = await ProjectForm.find(
    { tenantId, status: 'active', deletedAt: null },
    { _id: 1, projectId: 1, name: 1, title: 1 }
  ).lean();
  return forms.map((f) => ({
    id: String(f._id),
    projectId: f.projectId || String(f._id),
    name: f.name || f.title || f.projectId || String(f._id),
  }));
};

const loadIncompleteNodes = async ({ tenantId, projectId, month }) => {
  const { rows } = await postgresPool.query(
    `SELECT
       node_id,
       compliance_status,
       completeness_percentage,
       total_events_required,
       total_events_submitted
     FROM event_compliance_tracking
     WHERE tenant_id = $1
       AND project_id = $2
       AND month = $3
       AND compliance_status IN ('incomplete', 'partial')
     ORDER BY completeness_percentage ASC`,
    [tenantId, projectId, month]
  );
  return rows;
};

const countAllNodes = async ({ tenantId, projectId, month }) => {
  const { rows } = await postgresPool.query(
    `SELECT
       COUNT(*)::int                                             AS total_nodes,
       COUNT(*) FILTER (WHERE compliance_status = 'complete')::int  AS compliant_nodes,
       COUNT(*) FILTER (WHERE compliance_status = 'partial')::int   AS partial_nodes,
       COUNT(*) FILTER (WHERE compliance_status = 'incomplete')::int AS incomplete_nodes,
       COALESCE(AVG(completeness_percentage), 0)::numeric(5,2) AS avg_percentage
     FROM event_compliance_tracking
     WHERE tenant_id = $1
       AND project_id = $2
       AND month = $3`,
    [tenantId, projectId, month]
  );
  return rows[0] || { total_nodes: 0, compliant_nodes: 0, partial_nodes: 0, incomplete_nodes: 0, avg_percentage: 0 };
};

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

const hasOpenActionItemForNode = async ({ tenantId, projectId, nodeId, month }) => {
  const monthStart = month;
  const { rows } = await postgresPool.query(
    `SELECT id
     FROM copilot.action_items
     WHERE tenant_id = $1
       AND project_id = $2
       AND entity_type = 'compliance_submission'
       AND entity_id = $3
       AND status IN ('open', 'in_progress', 'snoozed')
       AND created_at >= $4::timestamptz
     LIMIT 1`,
    [tenantId, projectId, nodeId, monthStart]
  );
  return rows.length > 0;
};

// ---------------------------------------------------------------------------
// Action item creation
// ---------------------------------------------------------------------------

const createMissingSubmissionActionItem = async ({
  tenantId,
  projectId,
  projectName,
  nodeId,
  assignedUserId = null,
  month,
  completenessPercentage,
  complianceStatus,
  taskId,
}) => {
  const dueAt = END_OF_CURRENT_MONTH();
  const priority = complianceStatus === 'incomplete' ? 2 : 1;

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.action_items (
       tenant_id, project_id, source_event_id, entity_type, entity_id,
       priority, status, assigned_user_id, due_at, title, summary,
       action_hook, metadata
     ) VALUES (
       $1, $2, NULL, 'compliance_submission', $3,
       $4, 'open', $5, $6::timestamptz, $7, $8,
       $9::jsonb, $10::jsonb
     )
     RETURNING id`,
    [
      tenantId,
      projectId,
      nodeId,
      priority,
      assignedUserId || null,
      dueAt,
      `Missing submission: ${projectName} — Node ${nodeId}`,
      `Node ${nodeId} is ${completenessPercentage}% complete for ${month}. Status: ${complianceStatus}.`,
      JSON.stringify({ type: 'compliance_reminder', projectId, nodeId, month }),
      JSON.stringify({ taskId, completenessPercentage, complianceStatus, month }),
    ]
  );
  return rows[0];
};

// ---------------------------------------------------------------------------
// Escalation of overdue action items
// ---------------------------------------------------------------------------

const findOverdueActionItems = async (tenantId) => {
  const { rows } = await postgresPool.query(
    `SELECT id, project_id, entity_id AS node_id, title
     FROM copilot.action_items
     WHERE tenant_id = $1
       AND entity_type = 'compliance_submission'
       AND status IN ('open', 'in_progress')
       AND due_at < NOW()
     ORDER BY due_at ASC
     LIMIT 100`,
    [tenantId]
  );
  return rows;
};

const hasExistingEscalation = async ({ tenantId, taskId: _taskId, actionItemId }) => {
  const { rows } = await postgresPool.query(
    `SELECT id
     FROM copilot.agent_escalations
     WHERE tenant_id = $1
       AND (metadata_json->>'action_item_id') = $2
       AND status IN ('open', 'acknowledged')
     LIMIT 1`,
    [tenantId, actionItemId]
  );
  return rows.length > 0;
};

const createEscalationRecord = async ({
  tenantId,
  taskId,
  stepId = null,
  actionItemId,
  reason,
}) => {
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.agent_escalations (
       task_id, step_id, tenant_id, escalation_level, status, reason,
       metadata_json
     ) VALUES (
       $1, $2, $3, 1, 'open', $4,
       $5::jsonb
     )
     RETURNING id`,
    [
      taskId,
      stepId || null,
      tenantId,
      reason,
      JSON.stringify({ action_item_id: actionItemId }),
    ]
  );
  return rows[0];
};

// ---------------------------------------------------------------------------
// Compliance run snapshot
// ---------------------------------------------------------------------------

const saveComplianceRunSnapshot = async ({
  taskId,
  scheduleId,
  tenantId,
  projectId,
  month,
  stats,
}) => {
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.compliance_run_snapshots (
       task_id, schedule_id, tenant_id, project_id, month,
       total_nodes, compliant_nodes, partial_nodes, incomplete_nodes,
       compliance_percentage, missing_submission_count,
       action_items_created, escalations_created, snapshot_json
     ) VALUES (
       $1, $2, $3, $4, $5::date,
       $6, $7, $8, $9,
       $10, $11,
       $12, $13, $14::jsonb
     )
     RETURNING id`,
    [
      taskId || null,
      scheduleId || null,
      tenantId,
      projectId,
      month,
      stats.totalNodes,
      stats.compliantNodes,
      stats.partialNodes,
      stats.incompleteNodes,
      stats.compliancePercentage,
      stats.missingSubmissionCount,
      stats.actionItemsCreated,
      stats.escalationsCreated,
      JSON.stringify(stats.detail || {}),
    ]
  );
  return rows[0];
};

// ---------------------------------------------------------------------------
// Full orchestrated workflow
// ---------------------------------------------------------------------------

const runComplianceMonitor = async ({ tenantId, scheduleId = null, correlationId = null }) => {
  if (!tenantId) {
    throw new Error('tenantId is required for compliance monitor run');
  }

  const month = CURRENT_MONTH();

  // 1. Create top-level agent task
  const task = await agentTaskService.createTask({
    tenantId,
    source: scheduleId ? 'schedule' : 'manual',
    workflowName: 'compliance_monitor',
    intent: 'compliance:detect_missing_submissions',
    goalText: `Run autonomous compliance monitoring for tenant ${tenantId} — ${month}`,
    status: 'planning',
    riskLevel: 'LOW',
    correlationId,
    contextJson: { tenantId, month, scheduleId },
  });

  let totalActionItemsCreated = 0;
  let totalEscalationsCreated = 0;
  const projectSnapshots = [];

  try {
    // Step 1: Load active projects
    const stepLoad = await agentTaskService.createTaskStep({
      taskId: task.id,
      tenantId,
      stepIndex: 1,
      title: 'Load active projects',
      status: 'executing',
      toolName: 'compliance:load_active_projects',
      inputJson: { tenantId },
    });
    await agentTaskService.setCurrentTaskStep({ taskId: task.id, stepId: stepLoad.id });

    let activeProjects = [];
    try {
      activeProjects = await loadActiveProjects(tenantId);
      await agentTaskService.updateTaskStep({
        stepId: stepLoad.id,
        tenantId,
        status: 'completed',
        outputJson: { count: activeProjects.length },
      });
    } catch (err) {
      await agentTaskService.updateTaskStep({
        stepId: stepLoad.id,
        tenantId,
        status: 'failed',
        errorMessage: err.message,
      });
      await agentTaskService.createAgentError({
        taskId: task.id,
        stepId: stepLoad.id,
        tenantId,
        errorType: 'data_load',
        message: err.message,
        recoverable: true,
      });
      throw err;
    }

    // Step 2: Detect missing submissions and create action items per project
    let stepIndex = 2;
    for (const project of activeProjects) {
      const stepDetect = await agentTaskService.createTaskStep({
        taskId: task.id,
        tenantId,
        stepIndex,
        title: `Detect missing: ${project.name}`,
        status: 'executing',
        toolName: 'compliance:detect_missing_submissions',
        inputJson: { projectId: project.projectId, month },
      });
      stepIndex += 1;

      let actionItemsCreated = 0;
      try {
        const incompleteNodes = await loadIncompleteNodes({
          tenantId,
          projectId: project.projectId,
          month,
        });

        for (const node of incompleteNodes) {
          const alreadyExists = await hasOpenActionItemForNode({
            tenantId,
            projectId: project.projectId,
            nodeId: node.node_id,
            month,
          });
          if (alreadyExists) continue;

          await createMissingSubmissionActionItem({
            tenantId,
            projectId: project.projectId,
            projectName: project.name,
            nodeId: node.node_id,
            month,
            completenessPercentage: Number(node.completeness_percentage || 0),
            complianceStatus: node.compliance_status,
            taskId: task.id,
          });
          actionItemsCreated += 1;
        }

        const counts = await countAllNodes({ tenantId, projectId: project.projectId, month });
        projectSnapshots.push({
          projectId: project.projectId,
          projectName: project.name,
          ...counts,
          actionItemsCreated,
        });
        totalActionItemsCreated += actionItemsCreated;

        await agentTaskService.updateTaskStep({
          stepId: stepDetect.id,
          tenantId,
          status: 'completed',
          outputJson: { incompleteCount: incompleteNodes.length, actionItemsCreated },
        });
      } catch (err) {
        // Project-level failure does not abort the whole run
        logger.error(`[ComplianceAgent] Failed project ${project.projectId}: ${err.message}`);
        await agentTaskService.updateTaskStep({
          stepId: stepDetect.id,
          tenantId,
          status: 'failed',
          errorMessage: err.message,
        });
        await agentTaskService.createAgentError({
          taskId: task.id,
          stepId: stepDetect.id,
          tenantId,
          errorType: 'project_compliance_scan',
          message: err.message,
          recoverable: true,
          metadataJson: { projectId: project.projectId },
        });
      }
    }

    // Step 3: Escalate overdue action items
    const stepEscalate = await agentTaskService.createTaskStep({
      taskId: task.id,
      tenantId,
      stepIndex,
      title: 'Escalate overdue action items',
      status: 'executing',
      toolName: 'compliance:escalate_overdue',
      inputJson: { tenantId },
    });
    stepIndex += 1;

    try {
      const overdue = await findOverdueActionItems(tenantId);
      for (const item of overdue) {
        const alreadyEscalated = await hasExistingEscalation({
          tenantId,
          actionItemId: item.id,
        });
        if (alreadyEscalated) continue;

        await createEscalationRecord({
          tenantId,
          taskId: task.id,
          stepId: stepEscalate.id,
          actionItemId: item.id,
          reason: `Action item overdue: ${item.title}`,
        });
        totalEscalationsCreated += 1;
      }

      await agentTaskService.updateTaskStep({
        stepId: stepEscalate.id,
        tenantId,
        status: 'completed',
        outputJson: { overdueFound: overdue.length, escalationsCreated: totalEscalationsCreated },
      });
    } catch (err) {
      logger.error(`[ComplianceAgent] Escalation step failed: ${err.message}`);
      await agentTaskService.updateTaskStep({
        stepId: stepEscalate.id,
        tenantId,
        status: 'failed',
        errorMessage: err.message,
      });
      await agentTaskService.createAgentError({
        taskId: task.id,
        stepId: stepEscalate.id,
        tenantId,
        errorType: 'escalation',
        message: err.message,
        recoverable: true,
      });
    }

    // Step 4: Save snapshots and generate summary
    const stepSummary = await agentTaskService.createTaskStep({
      taskId: task.id,
      tenantId,
      stepIndex,
      title: 'Save compliance snapshots',
      status: 'executing',
      toolName: 'compliance:save_snapshots',
      inputJson: { month, projectCount: activeProjects.length },
    });

    try {
      for (const snap of projectSnapshots) {
        await saveComplianceRunSnapshot({
          taskId: task.id,
          scheduleId,
          tenantId,
          projectId: snap.projectId,
          month,
          stats: {
            totalNodes: snap.total_nodes || 0,
            compliantNodes: snap.compliant_nodes || 0,
            partialNodes: snap.partial_nodes || 0,
            incompleteNodes: snap.incomplete_nodes || 0,
            compliancePercentage: Number(snap.avg_percentage || 0),
            missingSubmissionCount: (snap.partial_nodes || 0) + (snap.incomplete_nodes || 0),
            actionItemsCreated: snap.actionItemsCreated || 0,
            escalationsCreated: 0,
            detail: snap,
          },
        });
      }

      await agentTaskService.updateTaskStep({
        stepId: stepSummary.id,
        tenantId,
        status: 'completed',
        outputJson: {
          snapshotsSaved: projectSnapshots.length,
          totalActionItemsCreated,
          totalEscalationsCreated,
        },
      });
    } catch (err) {
      await agentTaskService.updateTaskStep({
        stepId: stepSummary.id,
        tenantId,
        status: 'failed',
        errorMessage: err.message,
      });
    }

    // Mark task completed
    await agentTaskService.updateTaskStatus({
      taskId: task.id,
      tenantId,
      status: 'completed',
      contextJson: {
        tenantId,
        month,
        scheduleId,
        projectsScanned: activeProjects.length,
        totalActionItemsCreated,
        totalEscalationsCreated,
      },
    });

    return {
      taskId: task.id,
      tenantId,
      month,
      projectsScanned: activeProjects.length,
      totalActionItemsCreated,
      totalEscalationsCreated,
    };
  } catch (err) {
    logger.error(`[ComplianceAgent] Run failed for tenant ${tenantId}: ${err.message}`);
    await agentTaskService.updateTaskStatus({
      taskId: task.id,
      tenantId,
      status: 'failed',
    }).catch(() => {});
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Query: recent snapshots for a tenant
// ---------------------------------------------------------------------------

const listComplianceSnapshots = async ({ tenantId, projectId, limit = 50 }) => {
  if (!tenantId) throw new Error('tenantId is required');
  const values = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (projectId) {
    values.push(projectId);
    where += ` AND project_id = $${values.length}`;
  }
  values.push(Math.max(1, Math.min(200, Number(limit) || 50)));

  const { rows } = await postgresPool.query(
    `SELECT *
     FROM copilot.compliance_run_snapshots
     ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values
  );
  return rows;
};

module.exports = {
  loadActiveProjects,
  loadIncompleteNodes,
  hasOpenActionItemForNode,
  createMissingSubmissionActionItem,
  findOverdueActionItems,
  createEscalationRecord,
  saveComplianceRunSnapshot,
  runComplianceMonitor,
  listComplianceSnapshots,
};
