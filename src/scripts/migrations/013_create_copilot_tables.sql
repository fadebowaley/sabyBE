-- =============================================================================
-- Migration: 013_create_copilot_tables.sql
-- Purpose : Create Saby Copilot schema and core tables in existing Postgres DB
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS copilot;

-- Shared trigger helper for updated_at fields.
CREATE OR REPLACE FUNCTION copilot.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1) Action model + orchestration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.action_catalog (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type            VARCHAR(100) NOT NULL UNIQUE,
  entity_type            VARCHAR(100) NOT NULL,
  can_reverse            BOOLEAN NOT NULL DEFAULT FALSE,
  reverse_action_type    VARCHAR(100),
  is_destructive         BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval      BOOLEAN NOT NULL DEFAULT FALSE,
  preempt_window_sec     INTEGER NOT NULL DEFAULT 0,
  default_payload_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_catalog_reverse_required_chk CHECK (
    (can_reverse = FALSE) OR (reverse_action_type IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS copilot.action_events (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            VARCHAR(64) NOT NULL,
  actor_user_id        VARCHAR(255),
  action_type          VARCHAR(100) NOT NULL,
  entity_type          VARCHAR(100) NOT NULL,
  entity_id            VARCHAR(255),
  payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status               VARCHAR(40) NOT NULL DEFAULT 'requested',
  idempotency_key      VARCHAR(255),
  causation_id         UUID,
  correlation_id       UUID,
  source               VARCHAR(64) NOT NULL DEFAULT 'api',
  priority             INTEGER NOT NULL DEFAULT 0,
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at         TIMESTAMPTZ,
  queued_at            TIMESTAMPTZ,
  executed_at          TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_by_event_id UUID,
  CONSTRAINT action_events_status_chk CHECK (
    status IN (
      'requested',
      'validated',
      'queued',
      'executing',
      'completed',
      'failed',
      'cancelled',
      'reversal_requested',
      'reversed'
    )
  ),
  CONSTRAINT action_events_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT action_events_causation_fk FOREIGN KEY (causation_id)
    REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  CONSTRAINT action_events_correlation_fk FOREIGN KEY (correlation_id)
    REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  CONSTRAINT action_events_reversed_by_fk FOREIGN KEY (reversed_by_event_id)
    REFERENCES copilot.action_events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS copilot.action_outbox (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         UUID NOT NULL REFERENCES copilot.action_events(id) ON DELETE CASCADE,
  topic            VARCHAR(100) NOT NULL,
  payload_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count      INTEGER NOT NULL DEFAULT 0,
  max_retries      INTEGER NOT NULL DEFAULT 10,
  next_retry_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by        VARCHAR(128),
  locked_at        TIMESTAMPTZ,
  status           VARCHAR(32) NOT NULL DEFAULT 'pending',
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_outbox_status_chk CHECK (
    status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')
  )
);

CREATE TABLE IF NOT EXISTS copilot.action_compensations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_event_id     UUID NOT NULL REFERENCES copilot.action_events(id) ON DELETE CASCADE,
  compensating_event_id UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  reason                TEXT,
  requested_by_user_id  VARCHAR(255),
  status                VARCHAR(32) NOT NULL DEFAULT 'requested',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  CONSTRAINT action_compensations_status_chk CHECK (
    status IN ('requested', 'approved', 'executing', 'completed', 'failed', 'rejected')
  )
);

CREATE TABLE IF NOT EXISTS copilot.action_state (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            VARCHAR(64) NOT NULL,
  entity_type          VARCHAR(100) NOT NULL,
  entity_id            VARCHAR(255) NOT NULL,
  last_action_event_id UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  current_state        VARCHAR(64) NOT NULL DEFAULT 'unknown',
  state_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  version              BIGINT NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_state_unique UNIQUE (tenant_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS copilot.action_permissions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            VARCHAR(64) NOT NULL,
  action_type          VARCHAR(100) NOT NULL,
  role_id              VARCHAR(255),
  user_id              VARCHAR(255),
  allow_execute        BOOLEAN NOT NULL DEFAULT FALSE,
  allow_reverse        BOOLEAN NOT NULL DEFAULT FALSE,
  allow_preempt        BOOLEAN NOT NULL DEFAULT FALSE,
  conditions_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_permissions_scope_chk CHECK (
    role_id IS NOT NULL OR user_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS copilot.action_idempotency (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         VARCHAR(64) NOT NULL,
  idempotency_key   VARCHAR(255) NOT NULL,
  action_type       VARCHAR(100) NOT NULL,
  request_hash      VARCHAR(128) NOT NULL,
  action_event_id   UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  status            VARCHAR(32) NOT NULL DEFAULT 'accepted',
  response_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  CONSTRAINT action_idempotency_unique UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS copilot.action_dlq (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outbox_id      UUID REFERENCES copilot.action_outbox(id) ON DELETE SET NULL,
  event_id       UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  tenant_id      VARCHAR(64) NOT NULL,
  reason         TEXT NOT NULL,
  payload_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count    INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  resolution_note TEXT
);

-- ---------------------------------------------------------------------------
-- 2) Copilot task feed
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.action_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         VARCHAR(64) NOT NULL,
  project_id        VARCHAR(64),
  source_event_id   UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  entity_type       VARCHAR(100) NOT NULL,
  entity_id         VARCHAR(255),
  priority          INTEGER NOT NULL DEFAULT 0,
  status            VARCHAR(32) NOT NULL DEFAULT 'open',
  assigned_user_id  VARCHAR(255),
  assigned_role_id  VARCHAR(255),
  due_at            TIMESTAMPTZ,
  title             VARCHAR(255) NOT NULL,
  summary           TEXT,
  action_hook       JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  CONSTRAINT action_items_status_chk CHECK (
    status IN ('open', 'in_progress', 'snoozed', 'done', 'cancelled')
  )
);

CREATE TABLE IF NOT EXISTS copilot.action_item_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_item_id  UUID NOT NULL REFERENCES copilot.action_items(id) ON DELETE CASCADE,
  tenant_id       VARCHAR(64) NOT NULL,
  old_status      VARCHAR(32),
  new_status      VARCHAR(32) NOT NULL,
  changed_by      VARCHAR(255),
  change_reason   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3) Rules + scoring
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.project_rules (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      VARCHAR(64) NOT NULL,
  project_id     VARCHAR(64) NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  rules_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     VARCHAR(255),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_rules_unique UNIQUE (tenant_id, project_id, version)
);

CREATE TABLE IF NOT EXISTS copilot.project_scoreboard (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        VARCHAR(64) NOT NULL,
  project_id       VARCHAR(64) NOT NULL,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  score_status     VARCHAR(32) NOT NULL DEFAULT 'AT_RISK',
  score            NUMERIC(6,2) NOT NULL DEFAULT 0,
  kpis_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_by      VARCHAR(128) NOT NULL DEFAULT 'worker',
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_scoreboard_status_chk CHECK (
    score_status IN ('WINNING', 'LOSING', 'AT_RISK', 'NEUTRAL')
  ),
  CONSTRAINT project_scoreboard_unique UNIQUE (tenant_id, project_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS copilot.project_kpi_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       VARCHAR(64) NOT NULL,
  project_id      VARCHAR(64) NOT NULL,
  metric_name     VARCHAR(100) NOT NULL,
  metric_value    NUMERIC(20,6) NOT NULL DEFAULT 0,
  metric_unit     VARCHAR(32),
  bucket_start    TIMESTAMPTZ NOT NULL,
  bucket_end      TIMESTAMPTZ NOT NULL,
  dimensions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_kpi_snapshots_unique UNIQUE (tenant_id, project_id, metric_name, bucket_start, bucket_end)
);

-- ---------------------------------------------------------------------------
-- 4) Session context + tools
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.session_context (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          VARCHAR(64) NOT NULL,
  user_id            VARCHAR(255) NOT NULL,
  current_project_id VARCHAR(64),
  current_node_id    VARCHAR(255),
  recent_entities    JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_intent        VARCHAR(100),
  last_used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT session_context_unique UNIQUE (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS copilot.user_focus_state (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          VARCHAR(64) NOT NULL,
  user_id            VARCHAR(255) NOT NULL,
  focus_type         VARCHAR(64) NOT NULL DEFAULT 'dashboard',
  focus_entity_id    VARCHAR(255),
  focus_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_focus_state_unique UNIQUE (tenant_id, user_id, focus_type)
);

CREATE TABLE IF NOT EXISTS copilot.tool_registry (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tool_name          VARCHAR(120) NOT NULL UNIQUE,
  description        TEXT,
  category           VARCHAR(64) NOT NULL DEFAULT 'general',
  action_type        VARCHAR(100),
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  requires_approval  BOOLEAN NOT NULL DEFAULT FALSE,
  reversible         BOOLEAN NOT NULL DEFAULT FALSE,
  timeout_ms         INTEGER NOT NULL DEFAULT 15000,
  schema_json        JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS copilot.tool_call_logs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          VARCHAR(64) NOT NULL,
  user_id            VARCHAR(255),
  tool_name          VARCHAR(120) NOT NULL,
  action_event_id    UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  request_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             VARCHAR(32) NOT NULL DEFAULT 'success',
  duration_ms        INTEGER,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tool_call_logs_status_chk CHECK (
    status IN ('success', 'failed', 'timeout', 'blocked')
  )
);

CREATE TABLE IF NOT EXISTS copilot.tool_call_locks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      VARCHAR(64) NOT NULL,
  lock_key       VARCHAR(255) NOT NULL,
  holder_id      VARCHAR(255),
  acquired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT tool_call_locks_unique UNIQUE (tenant_id, lock_key)
);

-- ---------------------------------------------------------------------------
-- 5) RAG content model
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.docs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         VARCHAR(64) NOT NULL,
  title             VARCHAR(255) NOT NULL,
  source            VARCHAR(32) NOT NULL DEFAULT 'internal',
  source_ref        VARCHAR(512),
  s3_key            VARCHAR(512),
  url               TEXT,
  content_hash      VARCHAR(128),
  mime_type         VARCHAR(100),
  access_policy     JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingestion_status  VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_by        VARCHAR(255),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT docs_source_chk CHECK (source IN ('s3', 'web', 'internal', 'upload')),
  CONSTRAINT docs_ingestion_status_chk CHECK (
    ingestion_status IN ('pending', 'processing', 'indexed', 'failed')
  )
);

CREATE TABLE IF NOT EXISTS copilot.doc_chunks (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id             UUID NOT NULL REFERENCES copilot.docs(id) ON DELETE CASCADE,
  tenant_id          VARCHAR(64) NOT NULL,
  chunk_index        INTEGER NOT NULL,
  chunk_text         TEXT NOT NULL,
  token_count        INTEGER,
  chunk_hash         VARCHAR(128),
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doc_chunks_unique UNIQUE (doc_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS copilot.doc_embeddings (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id           UUID NOT NULL REFERENCES copilot.doc_chunks(id) ON DELETE CASCADE,
  tenant_id          VARCHAR(64) NOT NULL,
  embedding_model    VARCHAR(100) NOT NULL,
  embedding_dim      INTEGER NOT NULL,
  embedding_values   DOUBLE PRECISION[] NOT NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doc_embeddings_chunk_unique UNIQUE (chunk_id)
);

CREATE TABLE IF NOT EXISTS copilot.doc_ingestion_jobs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          VARCHAR(64) NOT NULL,
  doc_id             UUID REFERENCES copilot.docs(id) ON DELETE CASCADE,
  status             VARCHAR(32) NOT NULL DEFAULT 'queued',
  attempts           INTEGER NOT NULL DEFAULT 0,
  max_attempts       INTEGER NOT NULL DEFAULT 5,
  error_message      TEXT,
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT doc_ingestion_jobs_status_chk CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  )
);

-- ---------------------------------------------------------------------------
-- 6) Notifications + config + exports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copilot.notifications (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          VARCHAR(64) NOT NULL,
  user_id            VARCHAR(255),
  role_id            VARCHAR(255),
  source_event_id    UUID REFERENCES copilot.action_events(id) ON DELETE SET NULL,
  notification_type  VARCHAR(64) NOT NULL DEFAULT 'task',
  title              VARCHAR(255) NOT NULL,
  body               TEXT,
  payload_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             VARCHAR(32) NOT NULL DEFAULT 'pending',
  scheduled_for      TIMESTAMPTZ,
  read_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_target_chk CHECK (
    user_id IS NOT NULL OR role_id IS NOT NULL
  ),
  CONSTRAINT notifications_status_chk CHECK (
    status IN ('pending', 'sent', 'failed', 'read', 'cancelled')
  )
);

CREATE TABLE IF NOT EXISTS copilot.notification_deliveries (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id    UUID NOT NULL REFERENCES copilot.notifications(id) ON DELETE CASCADE,
  tenant_id          VARCHAR(64) NOT NULL,
  channel            VARCHAR(32) NOT NULL,
  provider           VARCHAR(64),
  delivery_status    VARCHAR(32) NOT NULL DEFAULT 'pending',
  external_message_id VARCHAR(255),
  error_message      TEXT,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_deliveries_channel_chk CHECK (
    channel IN ('in_app', 'email', 'whatsapp', 'telegram', 'webhook')
  ),
  CONSTRAINT notification_deliveries_status_chk CHECK (
    delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'retrying')
  )
);

CREATE TABLE IF NOT EXISTS copilot.tenants_config (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           VARCHAR(64) NOT NULL UNIQUE,
  copilot_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  features_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  rate_limits_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_prefs_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  rag_settings_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS copilot.audit_export_jobs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          VARCHAR(64) NOT NULL,
  requested_by       VARCHAR(255),
  export_type        VARCHAR(64) NOT NULL,
  filters_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             VARCHAR(32) NOT NULL DEFAULT 'queued',
  output_location    TEXT,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_export_jobs_status_chk CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  )
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_action_events_tenant_status_created
  ON copilot.action_events (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_events_tenant_entity
  ON copilot.action_events (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_action_events_tenant_action
  ON copilot.action_events (tenant_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_outbox_status_retry
  ON copilot.action_outbox (status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_action_state_tenant_entity
  ON copilot.action_state (tenant_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_action_items_tenant_status_due
  ON copilot.action_items (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_action_items_tenant_user_status
  ON copilot.action_items (tenant_id, assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_tenant_role_status
  ON copilot.action_items (tenant_id, assigned_role_id, status);

CREATE INDEX IF NOT EXISTS idx_project_rules_tenant_project_active
  ON copilot.project_rules (tenant_id, project_id, active);
CREATE INDEX IF NOT EXISTS idx_project_scoreboard_tenant_project_period
  ON copilot.project_scoreboard (tenant_id, project_id, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_project_kpi_snapshots_tenant_project_metric
  ON copilot.project_kpi_snapshots (tenant_id, project_id, metric_name, bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_session_context_tenant_user
  ON copilot.session_context (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_tool_call_logs_tenant_tool_created
  ON copilot.tool_call_logs (tenant_id, tool_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_docs_tenant_status
  ON copilot.docs (tenant_id, ingestion_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_tenant_doc
  ON copilot.doc_chunks (tenant_id, doc_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_doc_embeddings_tenant_model
  ON copilot.doc_embeddings (tenant_id, embedding_model);
CREATE INDEX IF NOT EXISTS idx_doc_ingestion_jobs_tenant_status
  ON copilot.doc_ingestion_jobs (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status_created
  ON copilot.notifications (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_status
  ON copilot.notifications (tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
  ON copilot.notification_deliveries (delivery_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_export_jobs_tenant_status
  ON copilot.audit_export_jobs (tenant_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_action_catalog_updated_at ON copilot.action_catalog;
CREATE TRIGGER trg_action_catalog_updated_at
BEFORE UPDATE ON copilot.action_catalog
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_events_updated_at ON copilot.action_events;
CREATE TRIGGER trg_action_events_updated_at
BEFORE UPDATE ON copilot.action_events
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_outbox_updated_at ON copilot.action_outbox;
CREATE TRIGGER trg_action_outbox_updated_at
BEFORE UPDATE ON copilot.action_outbox
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_compensations_updated_at ON copilot.action_compensations;
CREATE TRIGGER trg_action_compensations_updated_at
BEFORE UPDATE ON copilot.action_compensations
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_state_updated_at ON copilot.action_state;
CREATE TRIGGER trg_action_state_updated_at
BEFORE UPDATE ON copilot.action_state
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_permissions_updated_at ON copilot.action_permissions;
CREATE TRIGGER trg_action_permissions_updated_at
BEFORE UPDATE ON copilot.action_permissions
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_items_updated_at ON copilot.action_items;
CREATE TRIGGER trg_action_items_updated_at
BEFORE UPDATE ON copilot.action_items
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_project_rules_updated_at ON copilot.project_rules;
CREATE TRIGGER trg_project_rules_updated_at
BEFORE UPDATE ON copilot.project_rules
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_project_scoreboard_updated_at ON copilot.project_scoreboard;
CREATE TRIGGER trg_project_scoreboard_updated_at
BEFORE UPDATE ON copilot.project_scoreboard
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_session_context_updated_at ON copilot.session_context;
CREATE TRIGGER trg_session_context_updated_at
BEFORE UPDATE ON copilot.session_context
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_focus_state_updated_at ON copilot.user_focus_state;
CREATE TRIGGER trg_user_focus_state_updated_at
BEFORE UPDATE ON copilot.user_focus_state
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_tool_registry_updated_at ON copilot.tool_registry;
CREATE TRIGGER trg_tool_registry_updated_at
BEFORE UPDATE ON copilot.tool_registry
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_doc_ingestion_jobs_updated_at ON copilot.doc_ingestion_jobs;
CREATE TRIGGER trg_doc_ingestion_jobs_updated_at
BEFORE UPDATE ON copilot.doc_ingestion_jobs
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_docs_updated_at ON copilot.docs;
CREATE TRIGGER trg_docs_updated_at
BEFORE UPDATE ON copilot.docs
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON copilot.notifications;
CREATE TRIGGER trg_notifications_updated_at
BEFORE UPDATE ON copilot.notifications
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_deliveries_updated_at ON copilot.notification_deliveries;
CREATE TRIGGER trg_notification_deliveries_updated_at
BEFORE UPDATE ON copilot.notification_deliveries
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_tenants_config_updated_at ON copilot.tenants_config;
CREATE TRIGGER trg_tenants_config_updated_at
BEFORE UPDATE ON copilot.tenants_config
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_export_jobs_updated_at ON copilot.audit_export_jobs;
CREATE TRIGGER trg_audit_export_jobs_updated_at
BEFORE UPDATE ON copilot.audit_export_jobs
FOR EACH ROW EXECUTE FUNCTION copilot.set_updated_at();

