-- =============================================================================
-- Migration: 023_create_compliance_agent_tables.sql
-- Purpose : Add compliance_run_snapshots for durable per-run compliance state,
--           and a supporting index on agent_schedules for next_run_at polling.
-- Phase   : 3 — Autonomous Compliance Agent
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS copilot;

-- ---------------------------------------------------------------------------
-- compliance_run_snapshots
-- Stores one row per compliance monitor run per tenant/project/month.
-- The agent worker writes this after completing the detect + action-item phase.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.compliance_run_snapshots (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id                  UUID REFERENCES copilot.agent_tasks(id) ON DELETE SET NULL,
  schedule_id              UUID REFERENCES copilot.agent_schedules(id) ON DELETE SET NULL,
  tenant_id                VARCHAR(64) NOT NULL,
  project_id               VARCHAR(64) NOT NULL,
  month                    DATE NOT NULL,
  total_nodes              INTEGER NOT NULL DEFAULT 0,
  compliant_nodes          INTEGER NOT NULL DEFAULT 0,
  partial_nodes            INTEGER NOT NULL DEFAULT 0,
  incomplete_nodes         INTEGER NOT NULL DEFAULT 0,
  compliance_percentage    DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  missing_submission_count INTEGER NOT NULL DEFAULT 0,
  action_items_created     INTEGER NOT NULL DEFAULT 0,
  escalations_created      INTEGER NOT NULL DEFAULT 0,
  snapshot_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_tenant_project_month
  ON copilot.compliance_run_snapshots (tenant_id, project_id, month DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_snapshots_task
  ON copilot.compliance_run_snapshots (task_id);

-- ---------------------------------------------------------------------------
-- Supporting index: agent_schedules polling by next_run_at
-- The compliance worker polls this column on every tick.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_agent_schedules_next_run_at
  ON copilot.agent_schedules (tenant_id, enabled, next_run_at)
  WHERE enabled = TRUE;
