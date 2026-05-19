'use strict';

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPool }));

// ── Modules under test ────────────────────────────────────────────────────────

const workflowDefs    = require('../services/workflowDefinitions.service');
const agentFeedback   = require('../services/agentFeedback.service');
const agentEval       = require('../services/agentEval.service');
const incidentPB      = require('../services/incidentPlaybook.service');

const TENANT = 'tenant-phase7';
const RUN_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const DEF_ID = 'ffffffff-0000-1111-2222-333333333333';

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// workflowDefinitions — registerWorkflowDefinition
// ─────────────────────────────────────────────────────────────────────────────

describe('workflowDefinitions — registerWorkflowDefinition', () => {
  test('inserts new definition and returns row', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: DEF_ID, name: 'my_workflow', version: 1 }],
    });
    const def = await workflowDefs.registerWorkflowDefinition({
      name: 'my_workflow',
      triggerType: 'schedule',
    });
    expect(def.name).toBe('my_workflow');
    expect(def.version).toBe(1);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
  });

  test('upserts on conflict and bumps version', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: DEF_ID, name: 'my_workflow', version: 2 }],
    });
    const def = await workflowDefs.registerWorkflowDefinition({
      name: 'my_workflow',
      triggerType: 'manual',
      description: 'Updated description',
    });
    expect(def.version).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workflowDefinitions — startWorkflowRun
// ─────────────────────────────────────────────────────────────────────────────

describe('workflowDefinitions — startWorkflowRun', () => {
  test('throws WORKFLOW_NOT_FOUND when definition does not exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] }); // getWorkflowDefinition
    await expect(
      workflowDefs.startWorkflowRun({ workflowName: 'missing', tenantId: TENANT, triggerType: 'manual' })
    ).rejects.toMatchObject({ code: 'WORKFLOW_NOT_FOUND' });
  });

  test('creates run row when definition exists', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: DEF_ID, steps_json: [{}, {}] }] }) // getWorkflowDefinition
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID, status: 'running', steps_total: 2 }] }) // INSERT
    ;
    const run = await workflowDefs.startWorkflowRun({
      workflowName: 'my_workflow', tenantId: TENANT, triggerType: 'schedule',
    });
    expect(run.id).toBe(RUN_ID);
    expect(run.status).toBe('running');
    expect(run.steps_total).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workflowDefinitions — completeWorkflowRun / failWorkflowRun
// ─────────────────────────────────────────────────────────────────────────────

describe('workflowDefinitions — run lifecycle', () => {
  test('completeWorkflowRun returns updated row', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: RUN_ID, status: 'completed', duration_ms: 3200 }],
    });
    const run = await workflowDefs.completeWorkflowRun({ runId: RUN_ID, resultSummary: 'All done' });
    expect(run.status).toBe('completed');
    expect(run.duration_ms).toBe(3200);
  });

  test('completeWorkflowRun throws RUN_NOT_FOUND for missing run', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      workflowDefs.completeWorkflowRun({ runId: RUN_ID })
    ).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });

  test('failWorkflowRun sets status to failed', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: RUN_ID, status: 'failed' }],
    });
    const run = await workflowDefs.failWorkflowRun({ runId: RUN_ID, errorMessage: 'DB timeout' });
    expect(run.status).toBe('failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// workflowDefinitions — getWorkflowStats
// ─────────────────────────────────────────────────────────────────────────────

describe('workflowDefinitions — getWorkflowStats', () => {
  test('computes completion rate from query results', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        total_runs: '10', completed_runs: '8', failed_runs: '2',
        avg_duration_ms: '4500', completion_rate_pct: '80.00',
      }],
    });
    const stats = await workflowDefs.getWorkflowStats({
      tenantId: TENANT, workflowName: 'my_workflow', days: 30,
    });
    expect(stats.totalRuns).toBe(10);
    expect(stats.completedRuns).toBe(8);
    expect(stats.completionRatePct).toBe(80);
    expect(stats.avgDurationMs).toBe(4500);
  });

  test('handles zero runs gracefully', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        total_runs: '0', completed_runs: '0', failed_runs: '0',
        avg_duration_ms: null, completion_rate_pct: null,
      }],
    });
    const stats = await workflowDefs.getWorkflowStats({
      tenantId: TENANT, workflowName: 'empty', days: 7,
    });
    expect(stats.totalRuns).toBe(0);
    expect(stats.completionRatePct).toBeNull();
    expect(stats.avgDurationMs).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agentFeedback — submitFeedback
// ─────────────────────────────────────────────────────────────────────────────

describe('agentFeedback — submitFeedback', () => {
  test('saves feedback and returns row', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'fb-1', feedback_type: 'correct', rating: 5 }],
    });
    const fb = await agentFeedback.submitFeedback({
      tenantId: TENANT, submittedBy: 'user-1',
      feedbackType: 'correct', rating: 5,
    });
    expect(fb.feedback_type).toBe('correct');
    expect(fb.rating).toBe(5);
  });

  test('saves feedback with prompt attribution', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'fb-2', feedback_type: 'helpful', prompt_key: 'intent_classification', prompt_version: 3 }],
    });
    const fb = await agentFeedback.submitFeedback({
      tenantId: TENANT, submittedBy: 'user-1',
      feedbackType: 'helpful',
      promptKey: 'intent_classification',
      promptVersion: 3,
    });
    expect(fb.prompt_key).toBe('intent_classification');
    expect(fb.prompt_version).toBe(3);
    // Verify prompt_key and prompt_version are in the INSERT
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('prompt_key');
    expect(sql).toContain('prompt_version');
  });

  test('throws INVALID_FEEDBACK_TYPE for unknown type', async () => {
    await expect(
      agentFeedback.submitFeedback({
        tenantId: TENANT, submittedBy: 'user-1',
        feedbackType: 'thumbs_up',
      })
    ).rejects.toMatchObject({ code: 'INVALID_FEEDBACK_TYPE' });
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agentFeedback — getFeedbackSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('agentFeedback — getFeedbackSummary', () => {
  test('returns parsed summary from query', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        total_feedback: '50', correct_count: '40', incorrect_count: '5',
        unsafe_count: '1', avg_rating: '4.20', accuracy_rate_pct: '80.00',
      }],
    });
    const s = await agentFeedback.getFeedbackSummary({ tenantId: TENANT, days: 30 });
    expect(s.totalFeedback).toBe(50);
    expect(s.correctCount).toBe(40);
    expect(s.avgRating).toBe(4.2);
    expect(s.accuracyRatePct).toBe(80);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agentEval — runDeterministicEval
// ─────────────────────────────────────────────────────────────────────────────

describe('agentEval — runDeterministicEval', () => {
  test('passes when actual matches expected exactly', () => {
    const result = agentEval.runDeterministicEval(
      { status: 'completed', count: 3 },
      { status: 'completed', count: 3 }
    );
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.failureReason).toBeNull();
  });

  test('fails when a key value does not match', () => {
    const result = agentEval.runDeterministicEval(
      { status: 'completed' },
      { status: 'failed' }
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.failureReason).toContain('status');
  });

  test('partial score when some keys match', () => {
    const result = agentEval.runDeterministicEval(
      { a: 1, b: 2, c: 3 },
      { a: 1, b: 99, c: 3 }
    );
    expect(result.passed).toBe(false);
    expect(result.score).toBeCloseTo(2 / 3, 2);
  });

  test('passes with empty expected output', () => {
    const result = agentEval.runDeterministicEval({}, { anything: 'here' });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
  });

  test('presence-only check when expected value is null', () => {
    const result = agentEval.runDeterministicEval(
      { taskId: null },
      { taskId: 'some-uuid' }
    );
    expect(result.passed).toBe(true);
  });

  test('presence-only check fails when key is missing', () => {
    const result = agentEval.runDeterministicEval(
      { taskId: null },
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain('taskId');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agentEval — createEvalDataset (idempotent upsert)
// ─────────────────────────────────────────────────────────────────────────────

describe('agentEval — createEvalDataset', () => {
  test('upserts and returns dataset row', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'ds-1', name: 'golden_compliance', enabled: true }],
    });
    const ds = await agentEval.createEvalDataset({
      name: 'golden_compliance',
      workflowName: 'autonomous_compliance_monitoring',
      inputJson: { query: 'check node A' },
      expectedOutputJson: { status: 'completed' },
    });
    expect(ds.name).toBe('golden_compliance');
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// agentEval — getEvalStats
// ─────────────────────────────────────────────────────────────────────────────

describe('agentEval — getEvalStats', () => {
  test('returns parsed stats', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        total_evals: '20', passed_evals: '18', failed_evals: '2',
        avg_score: '0.9100', pass_rate_pct: '90.00',
      }],
    });
    const s = await agentEval.getEvalStats({ workflowName: 'my_workflow', days: 30 });
    expect(s.totalEvals).toBe(20);
    expect(s.passedEvals).toBe(18);
    expect(s.passRatePct).toBe(90);
    expect(s.avgScore).toBeCloseTo(0.91);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// incidentPlaybook — openIncident + acknowledgeIncident
// ─────────────────────────────────────────────────────────────────────────────

describe('incidentPlaybook — openIncident', () => {
  test('creates incident record with correct defaults', async () => {
    // auto-select playbook query (returns one matching playbook)
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'pb-auto-1' }],
    });
    // INSERT incident record
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'inc-1', status: 'open', severity: 'high', tenant_id: TENANT, playbook_id: 'pb-auto-1' }],
    });
    const inc = await incidentPB.openIncident({
      tenantId: TENANT,
      incidentType: 'worker_failure',
      title: 'Submission worker DLQ spike',
      severity: 'high',
    });
    expect(inc.status).toBe('open');
    expect(inc.severity).toBe('high');
    expect(inc.playbook_id).toBe('pb-auto-1');
  });

  test('opens incident without playbook when none matches', async () => {
    // auto-select playbook query (no match)
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // INSERT incident record
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'inc-2', status: 'open', severity: 'medium', tenant_id: TENANT, playbook_id: null }],
    });
    const inc = await incidentPB.openIncident({
      tenantId: TENANT,
      incidentType: 'unknown_type',
      title: 'Unknown incident',
      severity: 'medium',
    });
    expect(inc.status).toBe('open');
    expect(inc.playbook_id).toBeNull();
  });

  test('opens incident when explicit playbookId is supplied (no auto-select)', async () => {
    // No playbook auto-select query — explicit playbookId provided
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'inc-3', status: 'open', severity: 'critical', tenant_id: TENANT, playbook_id: 'pb-explicit' }],
    });
    const inc = await incidentPB.openIncident({
      tenantId: TENANT,
      incidentType: 'data_anomaly',
      title: 'Critical data anomaly',
      severity: 'critical',
      playbookId: 'pb-explicit',
    });
    expect(inc.status).toBe('open');
    expect(inc.playbook_id).toBe('pb-explicit');
    // Only the INSERT query should have fired (no auto-select)
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  test('throws INVALID_SEVERITY for unknown severity', async () => {
    await expect(
      incidentPB.openIncident({
        tenantId: TENANT, incidentType: 'test',
        title: 'Bad', severity: 'extreme',
      })
    ).rejects.toMatchObject({ code: 'INVALID_SEVERITY' });
    expect(mockPool.query).not.toHaveBeenCalled();
  });
});

describe('incidentPlaybook — acknowledgeIncident', () => {
  test('acknowledges open incident', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'inc-1', status: 'acknowledged' }],
    });
    const inc = await incidentPB.acknowledgeIncident({
      incidentId: 'inc-1', tenantId: TENANT, userId: 'user-1',
    });
    expect(inc.status).toBe('acknowledged');
  });

  test('throws INCIDENT_NOT_ACTIONABLE when incident is not open', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      incidentPB.acknowledgeIncident({ incidentId: 'inc-1', tenantId: TENANT, userId: 'user-1' })
    ).rejects.toMatchObject({ code: 'INCIDENT_NOT_ACTIONABLE' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// incidentPlaybook — resolveIncident
// ─────────────────────────────────────────────────────────────────────────────

describe('incidentPlaybook — resolveIncident', () => {
  test('resolves incident and records resolution', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'inc-1', status: 'resolved', resolved_by: 'user-2' }],
    });
    const inc = await incidentPB.resolveIncident({
      incidentId: 'inc-1', tenantId: TENANT,
      resolvedBy: 'user-2', resolutionNotes: 'Restarted worker and cleared DLQ',
    });
    expect(inc.status).toBe('resolved');
    expect(inc.resolved_by).toBe('user-2');
  });

  test('throws INCIDENT_NOT_ACTIONABLE for already-resolved incident', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      incidentPB.resolveIncident({
        incidentId: 'inc-1', tenantId: TENANT, resolvedBy: 'user-2',
      })
    ).rejects.toMatchObject({ code: 'INCIDENT_NOT_ACTIONABLE' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// incidentPlaybook — createPlaybook
// ─────────────────────────────────────────────────────────────────────────────

describe('incidentPlaybook — createPlaybook', () => {
  test('upserts playbook and returns row', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 'pb-1', name: 'worker_failure_response', severity: 'high' }],
    });
    const pb = await incidentPB.createPlaybook({
      name: 'worker_failure_response',
      incidentType: 'worker_failure',
      severity: 'high',
      stepsJson: [{ step: 1, action: 'alert_engineer' }],
    });
    expect(pb.name).toBe('worker_failure_response');
    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT');
  });

  test('throws INVALID_SEVERITY for bad severity', async () => {
    await expect(
      incidentPB.createPlaybook({ name: 'pb', incidentType: 'x', severity: 'catastrophic' })
    ).rejects.toMatchObject({ code: 'INVALID_SEVERITY' });
  });
});
