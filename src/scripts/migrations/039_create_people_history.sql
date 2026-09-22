-- Migration 039: Append-only people history
--
-- Tracks every agent-initiated people mutation (role assignment, activation,
-- node membership, permission grants, etc.) as an immutable subject timeline.
-- This is the temporal layer that powers change-triggered re-observation and
-- the access_flux detection rule.
--
-- One row per action event (action_event_id is UNIQUE), so re-executed /
-- replayed events never duplicate history. No UPDATE/DELETE path exists by
-- design.

CREATE TABLE IF NOT EXISTS copilot.people_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(64) NOT NULL,
  action_event_id UUID UNIQUE REFERENCES copilot.action_events(id) ON DELETE CASCADE,
  task_id UUID,
  actor_user_id VARCHAR(255),
  action_type VARCHAR(120) NOT NULL,
  subject_kind VARCHAR(32) NOT NULL,
  subject_id VARCHAR(255) NOT NULL,
  after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT people_history_subject_kind_chk CHECK (
    subject_kind IN ('USER', 'ROLE', 'NODE')
  )
);

CREATE INDEX IF NOT EXISTS idx_people_history_tenant_subject
  ON copilot.people_history (tenant_id, subject_kind, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_people_history_tenant_action
  ON copilot.people_history (tenant_id, action_type, created_at DESC);

-- ─── Rollback hint ────────────────────────────────────────────────────────────
-- To roll back: DROP TABLE copilot.people_history;