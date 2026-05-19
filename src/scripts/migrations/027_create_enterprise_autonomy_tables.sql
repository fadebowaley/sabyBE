-- Migration 027: Enterprise Autonomy — Phase 7
-- Adds: workflow_definitions, workflow_runs, agent_feedback,
--        agent_eval_datasets, agent_eval_results,
--        incident_playbooks, incident_records

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS copilot;

-- ─── Workflow Definitions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.workflow_definitions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           VARCHAR(64),            -- NULL = system-level template
  name                VARCHAR(120) NOT NULL,
  description         TEXT,
  trigger_type        VARCHAR(64) NOT NULL,   -- 'schedule','event','manual'
  trigger_config      JSONB NOT NULL DEFAULT '{}',
  steps_json          JSONB NOT NULL DEFAULT '[]',
  approval_points     JSONB NOT NULL DEFAULT '[]',
  failure_policy      JSONB NOT NULL DEFAULT '{}',
  retry_policy        JSONB NOT NULL DEFAULT '{}',
  escalation_policy   JSONB NOT NULL DEFAULT '{}',
  autonomy_level      INTEGER NOT NULL DEFAULT 3
                        CHECK (autonomy_level BETWEEN 1 AND 6),
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  version             INTEGER NOT NULL DEFAULT 1,
  created_by          VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_name
  ON copilot.workflow_definitions (name, enabled);
CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant
  ON copilot.workflow_definitions (tenant_id, enabled);

-- ─── Workflow Runs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.workflow_runs (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_definition_id  UUID NOT NULL
    REFERENCES copilot.workflow_definitions(id) ON DELETE RESTRICT,
  task_id                 UUID
    REFERENCES copilot.agent_tasks(id) ON DELETE SET NULL,
  tenant_id               VARCHAR(64) NOT NULL,
  trigger_type            VARCHAR(64) NOT NULL,
  trigger_metadata        JSONB NOT NULL DEFAULT '{}',
  status                  VARCHAR(32) NOT NULL DEFAULT 'running',
  steps_completed         INTEGER NOT NULL DEFAULT 0,
  steps_total             INTEGER NOT NULL DEFAULT 0,
  result_summary          TEXT,
  error_message           TEXT,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  duration_ms             INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workflow_runs_status_chk CHECK (
    status IN ('running', 'completed', 'failed', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_status
  ON copilot.workflow_runs (tenant_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition
  ON copilot.workflow_runs (workflow_definition_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_task
  ON copilot.workflow_runs (task_id);

-- ─── Agent Feedback ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.agent_feedback (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id         UUID
    REFERENCES copilot.agent_tasks(id) ON DELETE SET NULL,
  tool_call_id    UUID
    REFERENCES copilot.agent_tool_calls(id) ON DELETE SET NULL,
  tenant_id       VARCHAR(64) NOT NULL,
  submitted_by    VARCHAR(255) NOT NULL,
  feedback_type   VARCHAR(64) NOT NULL,   -- 'correct','incorrect','partial','unsafe'
  rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  workflow_name   VARCHAR(120),
  metadata_json   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_feedback_type_chk CHECK (
    feedback_type IN ('correct', 'incorrect', 'partial', 'unsafe', 'helpful', 'not_helpful')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_tenant_task
  ON copilot.agent_feedback (tenant_id, task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_workflow
  ON copilot.agent_feedback (tenant_id, workflow_name, created_at DESC);

-- ─── Agent Eval Datasets ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.agent_eval_datasets (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                  VARCHAR(120) NOT NULL UNIQUE,
  workflow_name         VARCHAR(120),
  intent                VARCHAR(120),
  input_json            JSONB NOT NULL,
  expected_output_json  JSONB NOT NULL,
  description           TEXT,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_eval_datasets_workflow
  ON copilot.agent_eval_datasets (workflow_name, enabled);

-- ─── Agent Eval Results ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.agent_eval_results (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id          UUID NOT NULL
    REFERENCES copilot.agent_eval_datasets(id) ON DELETE CASCADE,
  task_id             UUID
    REFERENCES copilot.agent_tasks(id) ON DELETE SET NULL,
  tenant_id           VARCHAR(64),
  passed              BOOLEAN NOT NULL,
  actual_output_json  JSONB NOT NULL DEFAULT '{}',
  score               NUMERIC(5,4),  -- 0.0000 to 1.0000
  failure_reason      TEXT,
  model_used          VARCHAR(120),
  latency_ms          INTEGER,
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_eval_results_dataset
  ON copilot.agent_eval_results (dataset_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_eval_results_passed
  ON copilot.agent_eval_results (passed, evaluated_at DESC);

-- ─── Incident Playbooks ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.incident_playbooks (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      VARCHAR(120) NOT NULL UNIQUE,
  incident_type             VARCHAR(120) NOT NULL,
  description               TEXT,
  steps_json                JSONB NOT NULL DEFAULT '[]',
  severity                  VARCHAR(32) NOT NULL DEFAULT 'medium',
  auto_trigger_conditions   JSONB NOT NULL DEFAULT '{}',
  enabled                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT incident_playbooks_severity_chk CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  )
);

CREATE INDEX IF NOT EXISTS idx_incident_playbooks_type
  ON copilot.incident_playbooks (incident_type, enabled);

-- ─── Incident Records ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot.incident_records (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  playbook_id               UUID
    REFERENCES copilot.incident_playbooks(id) ON DELETE SET NULL,
  tenant_id                 VARCHAR(64) NOT NULL,
  task_id                   UUID
    REFERENCES copilot.agent_tasks(id) ON DELETE SET NULL,
  incident_type             VARCHAR(120) NOT NULL,
  severity                  VARCHAR(32) NOT NULL DEFAULT 'medium',
  status                    VARCHAR(32) NOT NULL DEFAULT 'open',
  title                     VARCHAR(255) NOT NULL,
  description               TEXT,
  context_json              JSONB NOT NULL DEFAULT '{}',
  response_steps_completed  JSONB NOT NULL DEFAULT '[]',
  resolved_by               VARCHAR(255),
  resolution_notes          TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at           TIMESTAMPTZ,
  resolved_at               TIMESTAMPTZ,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT incident_records_status_chk CHECK (
    status IN ('open','acknowledged','investigating','contained','resolved','post_mortem')
  ),
  CONSTRAINT incident_records_severity_chk CHECK (
    severity IN ('low','medium','high','critical')
  )
);

CREATE INDEX IF NOT EXISTS idx_incident_records_tenant_status
  ON copilot.incident_records (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_records_severity
  ON copilot.incident_records (tenant_id, severity, status);

-- ─── Updated-at triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION copilot.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workflow_definitions_updated_at ON copilot.workflow_definitions;
CREATE TRIGGER trg_workflow_definitions_updated_at
BEFORE UPDATE ON copilot.workflow_definitions
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_workflow_runs_updated_at ON copilot.workflow_runs;
CREATE TRIGGER trg_workflow_runs_updated_at
BEFORE UPDATE ON copilot.workflow_runs
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_eval_datasets_updated_at ON copilot.agent_eval_datasets;
CREATE TRIGGER trg_agent_eval_datasets_updated_at
BEFORE UPDATE ON copilot.agent_eval_datasets
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_incident_playbooks_updated_at ON copilot.incident_playbooks;
CREATE TRIGGER trg_incident_playbooks_updated_at
BEFORE UPDATE ON copilot.incident_playbooks
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_incident_records_updated_at ON copilot.incident_records;
CREATE TRIGGER trg_incident_records_updated_at
BEFORE UPDATE ON copilot.incident_records
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

-- ─── Seed: system-level workflow definitions ──────────────────────────────────

INSERT INTO copilot.workflow_definitions
  (tenant_id, name, description, trigger_type, autonomy_level, steps_json,
   approval_points, failure_policy, retry_policy, escalation_policy)
VALUES
  (NULL, 'autonomous_compliance_monitoring',
   'Daily compliance monitoring — scores nodes, creates action items, escalates misses',
   'schedule', 3,
   '[{"step":1,"title":"Load active projects","tool":"project_reader"},
     {"step":2,"title":"Compute compliance scores","tool":"compliance_scorer"},
     {"step":3,"title":"Create action items for misses","tool":"action_item_creator"},
     {"step":4,"title":"Send notifications","tool":"notification_sender"}]'::jsonb,
   '["step_4_bulk_external"]'::jsonb,
   '{"onFailure":"log_and_alert","notifyAdmin":true}'::jsonb,
   '{"maxRetries":3,"backoffMs":60000}'::jsonb,
   '{"escalateAfterMs":86400000,"targetRole":"tenant_admin"}'::jsonb
  ),
  (NULL, 'executive_brief_generation',
   'Weekly executive brief — loads metrics, generates AI summary, routes for approval',
   'schedule', 5,
   '[{"step":1,"title":"Collect metrics snapshot","tool":"metric_reader"},
     {"step":2,"title":"Generate brief via AI","tool":"insight_generator"},
     {"step":3,"title":"Route for approval","tool":"approval_creator"},
     {"step":4,"title":"Send after approval","tool":"notification_sender"}]'::jsonb,
   '["step_3_approval","step_4_send"]'::jsonb,
   '{"onFailure":"save_draft","notifyAdmin":true}'::jsonb,
   '{"maxRetries":2,"backoffMs":300000}'::jsonb,
   '{"escalateAfterMs":172800000,"targetRole":"super_admin"}'::jsonb
  ),
  (NULL, 'tenant_health_monitoring',
   'Nightly tenant health — scores usage, compliance, payments, flags degradation',
   'schedule', 3,
   '[{"step":1,"title":"Load tenant metrics","tool":"metric_reader"},
     {"step":2,"title":"Compute health score","tool":"health_scorer"},
     {"step":3,"title":"Create recommendations","tool":"action_item_creator"}]'::jsonb,
   '[]'::jsonb,
   '{"onFailure":"mark_partial","notifyAdmin":false}'::jsonb,
   '{"maxRetries":2,"backoffMs":120000}'::jsonb,
   '{"escalateAfterMs":86400000,"targetRole":"tenant_admin"}'::jsonb
  )
ON CONFLICT (tenant_id, name) DO NOTHING;

-- Seed: incident playbooks
INSERT INTO copilot.incident_playbooks
  (name, incident_type, description, severity, steps_json)
VALUES
  ('worker_failure_response', 'worker_failure',
   'Standard response when a background worker stops or DLQ spikes',
   'high',
   '[{"step":1,"action":"alert_on_call_engineer"},
     {"step":2,"action":"check_dlq_depth"},
     {"step":3,"action":"restart_worker"},
     {"step":4,"action":"verify_recovery"},
     {"step":5,"action":"post_mortem_if_critical"}]'::jsonb
  ),
  ('data_breach_response', 'security_incident',
   'Response to suspected cross-tenant data access or token leakage',
   'critical',
   '[{"step":1,"action":"isolate_affected_tenant"},
     {"step":2,"action":"revoke_active_sessions"},
     {"step":3,"action":"notify_security_team"},
     {"step":4,"action":"audit_log_review"},
     {"step":5,"action":"notify_affected_tenant"},
     {"step":6,"action":"post_mortem"}]'::jsonb
  ),
  ('payment_exception_response', 'payment_failure',
   'Unmatched payment or reconciliation exception requiring manual review',
   'high',
   '[{"step":1,"action":"flag_payment_for_review"},
     {"step":2,"action":"notify_finance_team"},
     {"step":3,"action":"gather_provider_events"},
     {"step":4,"action":"recommend_resolution"},
     {"step":5,"action":"require_approval_for_mutation"}]'::jsonb
  )
ON CONFLICT (name) DO NOTHING;
