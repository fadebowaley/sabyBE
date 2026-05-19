CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS copilot;

CREATE OR REPLACE FUNCTION copilot.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS copilot.agent_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(64) NOT NULL,
  requested_by_user_id VARCHAR(255),
  source VARCHAR(64) NOT NULL DEFAULT 'system',
  workflow_name VARCHAR(120),
  intent VARCHAR(120) NOT NULL,
  goal_text TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  risk_level VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  priority INTEGER NOT NULL DEFAULT 0,
  correlation_id UUID,
  current_step_id UUID,
  approval_id UUID,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_tasks_status_chk CHECK (
    status IN (
      'queued',
      'planning',
      'waiting_approval',
      'executing',
      'completed',
      'failed',
      'escalated',
      'cancelled'
    )
  )
);

CREATE TABLE IF NOT EXISTS copilot.agent_task_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES copilot.agent_tasks(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL,
  step_index INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  tool_name VARCHAR(120),
  action_type VARCHAR(120),
  action_event_id UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  depends_on_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_task_steps_status_chk CHECK (
    status IN (
      'queued',
      'planning',
      'waiting_approval',
      'executing',
      'completed',
      'failed',
      'escalated',
      'cancelled'
    )
  ),
  CONSTRAINT agent_task_steps_unique_step UNIQUE (task_id, step_index)
);

ALTER TABLE copilot.agent_tasks
  ADD CONSTRAINT agent_tasks_current_step_fk
  FOREIGN KEY (current_step_id)
  REFERENCES copilot.agent_task_steps(id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS copilot.agent_tool_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES copilot.agent_tasks(id) ON DELETE SET NULL,
  step_id UUID REFERENCES copilot.agent_task_steps(id) ON DELETE SET NULL,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(255),
  tool_name VARCHAR(120) NOT NULL,
  action_event_id UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  duration_ms INTEGER,
  input_hash VARCHAR(128),
  model_decision_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  policy_decision_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS copilot.agent_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES copilot.agent_tasks(id) ON DELETE CASCADE,
  step_id UUID REFERENCES copilot.agent_task_steps(id) ON DELETE SET NULL,
  tool_call_id UUID REFERENCES copilot.agent_tool_calls(id) ON DELETE SET NULL,
  tenant_id VARCHAR(64) NOT NULL,
  error_type VARCHAR(120) NOT NULL,
  error_code VARCHAR(120),
  message TEXT NOT NULL,
  stack_hash VARCHAR(128),
  recoverable BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_status VARCHAR(32) NOT NULL DEFAULT 'open',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_errors_resolution_status_chk CHECK (
    resolution_status IN ('open', 'acknowledged', 'resolved', 'ignored')
  )
);

CREATE TABLE IF NOT EXISTS copilot.agent_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(64) NOT NULL,
  workflow_name VARCHAR(120) NOT NULL,
  cron_expression VARCHAR(120),
  trigger_type VARCHAR(64) NOT NULL,
  scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by VARCHAR(255),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS copilot.agent_escalations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES copilot.agent_tasks(id) ON DELETE CASCADE,
  step_id UUID REFERENCES copilot.agent_task_steps(id) ON DELETE SET NULL,
  tenant_id VARCHAR(64) NOT NULL,
  escalation_level INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  reason TEXT NOT NULL,
  target_user_id VARCHAR(255),
  target_role_id VARCHAR(255),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_escalations_status_chk CHECK (
    status IN ('open', 'acknowledged', 'resolved', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_tenant_status_created
  ON copilot.agent_tasks (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_workflow_name
  ON copilot.agent_tasks (tenant_id, workflow_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_correlation
  ON copilot.agent_tasks (correlation_id);

CREATE INDEX IF NOT EXISTS idx_agent_task_steps_task_status
  ON copilot.agent_task_steps (task_id, status, step_index);
CREATE INDEX IF NOT EXISTS idx_agent_task_steps_action_event
  ON copilot.agent_task_steps (action_event_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_task_step_created
  ON copilot.agent_tool_calls (task_id, step_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_action_event
  ON copilot.agent_tool_calls (action_event_id);

CREATE INDEX IF NOT EXISTS idx_agent_errors_task_status
  ON copilot.agent_errors (task_id, resolution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_schedules_tenant_enabled
  ON copilot.agent_schedules (tenant_id, enabled, workflow_name);
CREATE INDEX IF NOT EXISTS idx_agent_escalations_task_status
  ON copilot.agent_escalations (task_id, status, escalation_level);

DROP TRIGGER IF EXISTS trg_agent_tasks_updated_at ON copilot.agent_tasks;
CREATE TRIGGER trg_agent_tasks_updated_at
BEFORE UPDATE ON copilot.agent_tasks
FOR EACH ROW
EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_task_steps_updated_at ON copilot.agent_task_steps;
CREATE TRIGGER trg_agent_task_steps_updated_at
BEFORE UPDATE ON copilot.agent_task_steps
FOR EACH ROW
EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_errors_updated_at ON copilot.agent_errors;
CREATE TRIGGER trg_agent_errors_updated_at
BEFORE UPDATE ON copilot.agent_errors
FOR EACH ROW
EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_schedules_updated_at ON copilot.agent_schedules;
CREATE TRIGGER trg_agent_schedules_updated_at
BEFORE UPDATE ON copilot.agent_schedules
FOR EACH ROW
EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_escalations_updated_at ON copilot.agent_escalations;
CREATE TRIGGER trg_agent_escalations_updated_at
BEFORE UPDATE ON copilot.agent_escalations
FOR EACH ROW
EXECUTE FUNCTION copilot.set_updated_at();
