-- =============================================================================
-- Migration: 014_create_copilot_entity_resolution_logs.sql
-- Purpose : Add audit + metrics table for copilot entity resolution outcomes.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS copilot.entity_resolution_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             VARCHAR(64) NOT NULL,
  actor_user_id         VARCHAR(255),
  action_type           VARCHAR(100),
  source                VARCHAR(64) NOT NULL DEFAULT 'resolver',
  entity_type           VARCHAR(64) NOT NULL,
  query_text            VARCHAR(255) NOT NULL,
  status                VARCHAR(32) NOT NULL,
  selected_entity_id    VARCHAR(255),
  candidate_count       INTEGER NOT NULL DEFAULT 0,
  top_candidates_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms            INTEGER,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT entity_resolution_logs_status_chk CHECK (
    status IN ('resolved', 'ambiguous', 'not_found', 'error')
  )
);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_logs_tenant_created
  ON copilot.entity_resolution_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_logs_status_created
  ON copilot.entity_resolution_logs (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_logs_action_created
  ON copilot.entity_resolution_logs (tenant_id, action_type, created_at DESC);

COMMIT;
