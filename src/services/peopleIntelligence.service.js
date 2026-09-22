/**
 * People Intelligence Agent Service
 *
 * Deterministic autonomous people-intelligence workflow.
 * No AI/LLM. All logic is business-rule driven.
 *
 * Responsibilities:
 *  - Load the tenant People snapshot and run the detection rules
 *  - Durably record every observation as an audited agent task step
 *  - Classify observations deterministically (severity + rule driven)
 *  - Escalate actionable findings (ESCALATION class) into copilot.agent_escalations
 *  - Deduplicate escalations on a stable people_key
 *  - Orchestrate the full workflow through the Phase 2 agent state tables
 *
 * Guardrails:
 *  - Every query includes tenant_id — no cross-tenant leakage
 *  - Escalations are read-only findings; no business mutation happens here
 *  - Dedup prevents duplicate escalations for the same rule/subject
 *  - All steps are tracked in agent_tasks / agent_task_steps
 *  - Risk level: LOW for reads; escalation creation stays read-only
 *  - Deterministic only — no model calls
 */

const { postgresPool } = require('../config/postgres');
const config = require('../config/config');
const logger = require('../config/logger');
const agentTaskService = require('./agentTask.service');
const copilotPeopleService = require('./copilotPeople.service');
const peopleHistoryService = require('./peopleHistory.service');

const ESCALATION_INCIDENT_THRESHOLD = Number(
  process.env.PEOPLE_INTELLIGENCE_ESCALATION_INCIDENT_THRESHOLD ||
    config.peopleIntelligence?.escalationIncidentThreshold ||
    3
);

const RESPONSE_BY_RULE = {
  org_gap: {
    responseClass: 'REQUIRES_APPROVAL',
    suggestedCapability: 'users.assign',
  },
  missing_responsibility: {
    responseClass: 'REQUIRES_APPROVAL',
    suggestedCapability: 'users.assign',
  },
  identity_duplicate: {
    responseClass: 'REQUIRES_APPROVAL',
    suggestedCapability: null,
  },
  role_assignment_mismatch: {
    responseClass: 'REQUIRES_APPROVAL',
    suggestedCapability: 'users.assign',
  },
  access_anomaly: {
    responseClass: 'REQUIRES_APPROVAL',
    suggestedCapability: null,
  },
  access_flux: {
    responseClass: 'REQUIRES_APPROVAL',
    suggestedCapability: null,
  },
  lifecycle_problem: {
    responseClass: 'ESCALATION',
    suggestedCapability: 'users.deactivate',
  },
};

/**
 * Deterministic rule + severity driven classification of an observation.
 * Mirrors the copilot-saby classify layer so CLI and schedule agree.
 */
const classifyObservation = (observation) => {
  const mapped = RESPONSE_BY_RULE[observation.ruleId];
  if (mapped) return mapped;

  if (observation.ruleId === 'data_quality') {
    return observation.severity === 'warning'
      ? {
          responseClass: 'REQUIRES_APPROVAL',
          suggestedCapability: 'users.assign',
        }
      : { responseClass: 'INFORMATION', suggestedCapability: null };
  }

  if (observation.severity === 'critical') {
    return {
      responseClass: 'ESCALATION',
      suggestedCapability: 'users.deactivate',
    };
  }
  if (observation.severity === 'warning') {
    return {
      responseClass: 'REQUIRES_APPROVAL',
      suggestedCapability: 'users.assign',
    };
  }
  return { responseClass: 'INFORMATION', suggestedCapability: null };
};

const peopleKeyOf = (observation) =>
  `${observation.ruleId}:${observation.subject.kind}:${observation.subject.id}`;

const escalationReason = (observation) =>
  observation.summary ||
  `${observation.ruleId} on ${observation.subject.kind} ${observation.subject.id}`;

const targetUserOf = (observation) =>
  observation.subject.kind === 'USER' ? observation.subject.id : null;

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

const hasExistingEscalation = async ({ tenantId, peopleKey }) => {
  const { rows } = await postgresPool.query(
    `SELECT id
     FROM copilot.agent_escalations
     WHERE tenant_id = $1
       AND (metadata_json->>'people_key') = $2
       AND status IN ('open', 'acknowledged')
     LIMIT 1`,
    [tenantId, peopleKey]
  );
  return rows.length > 0;
};

const createEscalationRecord = async ({
  tenantId,
  taskId,
  stepId = null,
  reason,
  peopleKey,
  observation,
  classification,
}) => {
  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.agent_escalations (
       task_id, step_id, tenant_id, escalation_level, status, reason,
       target_user_id, metadata_json
     ) VALUES (
       $1, $2, $3, 1, 'open', $4,
       $5, $6::jsonb
     )
     RETURNING id`,
    [
      taskId,
      stepId || null,
      tenantId,
      reason,
      targetUserOf(observation),
      JSON.stringify({
        people_key: peopleKey,
        ruleId: observation.ruleId,
        severity: observation.severity,
        suggestedCapability: classification.suggestedCapability,
        responseClass: classification.responseClass,
        subject: observation.subject,
      }),
    ]
  );
  return rows[0];
};

// ---------------------------------------------------------------------------
// Full orchestrated workflow
// ---------------------------------------------------------------------------

const runPeopleIntelligence = async ({
  tenantId,
  scheduleId = null,
  correlationId = null,
}) => {
  if (!tenantId) {
    throw new Error('tenantId is required for people intelligence run');
  }

  // 1. Create top-level agent task
  const task = await agentTaskService.createTask({
    tenantId,
    source: scheduleId ? 'schedule' : 'manual',
    workflowName: 'people_intelligence',
    intent: 'people:observe_classify_escalate',
    goalText: `Run autonomous people intelligence for tenant ${tenantId}`,
    status: 'planning',
    riskLevel: 'LOW',
    correlationId,
    contextJson: { tenantId, scheduleId },
  });

  let observationCount = 0;
  let escalationsCreated = 0;
  let deduplicatedCount = 0;

  try {
    // Step 1: Observe — snapshot + deterministic detection
    let observations = [];
    const stepObserve = await agentTaskService.createTaskStep({
      taskId: task.id,
      tenantId,
      stepIndex: 1,
      title: 'Run people detection rules',
      status: 'executing',
      toolName: 'people:observe',
      inputJson: { tenantId },
    });
    await agentTaskService.setCurrentTaskStep({
      taskId: task.id,
      stepId: stepObserve.id,
    });
    try {
      const snapshot = await copilotPeopleService.getPeopleSnapshot({
        tenantId,
      });
      const state = copilotPeopleService.buildPeopleState(snapshot);
      const nativeObservations = copilotPeopleService.detectObservations(state);
      const fluxObservations = await peopleHistoryService.detectFlux({
        tenantId,
      });
      observations = [...nativeObservations, ...fluxObservations];
      await agentTaskService.updateTaskStep({
        stepId: stepObserve.id,
        tenantId,
        status: 'completed',
        outputJson: { observationCount: observations.length },
      });
    } catch (err) {
      await agentTaskService.updateTaskStep({
        stepId: stepObserve.id,
        tenantId,
        status: 'failed',
        errorMessage: err.message,
      });
      await agentTaskService.createAgentError({
        taskId: task.id,
        stepId: stepObserve.id,
        tenantId,
        errorType: 'people_snapshot',
        message: err.message,
        recoverable: true,
      });
      throw err;
    }

    // Step 2..: Durably record every observation as a task step
    await Promise.all(
      observations.map(async (observation, index) => {
        const classification = classifyObservation(observation);
        const stepRecord = await agentTaskService.createTaskStep({
          taskId: task.id,
          tenantId,
          stepIndex: 2 + index,
          title: `Record ${observation.ruleId} on ${observation.subject.kind} ${observation.subject.id}`,
          status: 'executing',
          toolName: 'people.record',
          inputJson: {
            ruleId: observation.ruleId,
            subject: observation.subject,
            severity: observation.severity,
          },
        });
        await agentTaskService.updateTaskStep({
          stepId: stepRecord.id,
          tenantId,
          status: 'completed',
          outputJson: {
            responseClass: classification.responseClass,
            suggestedCapability: classification.suggestedCapability,
          },
        });
      })
    );
    observationCount = observations.length;
    const stepIndex = 2 + observations.length;

    // Step 3: Escalate actionable findings (ESCALATION class only)
    const stepEscalate = await agentTaskService.createTaskStep({
      taskId: task.id,
      tenantId,
      stepIndex,
      title: 'Escalate actionable people findings',
      status: 'executing',
      toolName: 'people:escalate',
      inputJson: { tenantId },
    });

    try {
      const actionable = observations
        .map((observation) => ({
          observation,
          classification: classifyObservation(observation),
        }))
        .filter(
          ({ classification }) => classification.responseClass === 'ESCALATION'
        );

      const deduped = await Promise.all(
        actionable.map(async ({ observation }) => {
          const peopleKey = peopleKeyOf(observation);
          const alreadyEscalated = await hasExistingEscalation({
            tenantId,
            peopleKey,
          });
          return { observation, peopleKey, alreadyEscalated };
        })
      );
      deduplicatedCount = deduped.filter(
        (item) => item.alreadyEscalated
      ).length;

      const toOpen = deduped.filter((item) => !item.alreadyEscalated);
      await Promise.all(
        toOpen.map(async ({ observation, peopleKey }) => {
          const classification = classifyObservation(observation);
          await createEscalationRecord({
            tenantId,
            taskId: task.id,
            stepId: stepEscalate.id,
            reason: escalationReason(observation),
            peopleKey,
            observation,
            classification,
          });
          escalationsCreated += 1;
        })
      );

      await agentTaskService.updateTaskStep({
        stepId: stepEscalate.id,
        tenantId,
        status: 'completed',
        outputJson: { escalationsCreated, deduplicatedCount },
      });
    } catch (err) {
      logger.error(
        `[PeopleIntelligence] Escalation step failed: ${err.message}`
      );
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
        errorType: 'people_escalation',
        message: err.message,
        recoverable: true,
      });
    }

    // Mark task completed
    await agentTaskService.updateTaskStatus({
      taskId: task.id,
      tenantId,
      status: 'completed',
      contextJson: {
        tenantId,
        scheduleId,
        observationCount,
        escalationsCreated,
        deduplicatedCount,
        escalatedBeyondIncidentThreshold:
          escalationsCreated >= ESCALATION_INCIDENT_THRESHOLD,
      },
    });

    return {
      taskId: task.id,
      tenantId,
      observationCount,
      escalationsCreated,
      deduplicatedCount,
    };
  } catch (err) {
    logger.error(
      `[PeopleIntelligence] Run failed for tenant ${tenantId}: ${err.message}`
    );
    await agentTaskService
      .updateTaskStatus({ taskId: task.id, tenantId, status: 'failed' })
      .catch(() => {});
    throw err;
  }
};

module.exports = {
  classifyObservation,
  peopleKeyOf,
  hasExistingEscalation,
  createEscalationRecord,
  runPeopleIntelligence,
  ESCALATION_INCIDENT_THRESHOLD,
};
