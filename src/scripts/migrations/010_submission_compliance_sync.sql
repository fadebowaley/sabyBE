-- =============================================================================
-- Migration: 010_submission_compliance_sync.sql
-- Purpose : Zero-drift submission/compliance synchronization primitives
-- =============================================================================
-- Canonical month key decision:
--   - Keep using event_compliance_tracking.month (DATE, first day of month)
-- Countable submission rule:
--   - status != 'deleted'
-- Tracking key:
--   - tenant_id + project_id + node_id (+ event_date or month)
-- =============================================================================

-- 1) Fast daily tracking table for calendar read paths
CREATE TABLE IF NOT EXISTS event_compliance_daily_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  node_id VARCHAR(64) NOT NULL,
  event_date DATE NOT NULL,
  submitted_count INTEGER NOT NULL DEFAULT 0,
  last_submission_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_daily_tracking_unique UNIQUE (tenant_id, project_id, node_id, event_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_tracking_lookup
  ON event_compliance_daily_tracking(tenant_id, project_id, node_id, event_date);
CREATE INDEX IF NOT EXISTS idx_daily_tracking_tenant_event_date
  ON event_compliance_daily_tracking(tenant_id, event_date);

-- 2) Monthly tracking normalization and indexes
ALTER TABLE event_compliance_tracking
  ADD COLUMN IF NOT EXISTS submitted_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_compliance_tracking_unique'
      AND conrelid = 'event_compliance_tracking'::regclass
  ) THEN
    ALTER TABLE event_compliance_tracking
      ADD CONSTRAINT uq_compliance_tracking_unique
      UNIQUE (tenant_id, project_id, node_id, month);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compliance_tenant_project_node_month
  ON event_compliance_tracking(tenant_id, project_id, node_id, month);
CREATE INDEX IF NOT EXISTS idx_compliance_tenant_month_lock
  ON event_compliance_tracking(tenant_id, month, is_locked);

-- 3) Idempotency support on form_submissions
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_form_submissions_tenant_idempotency
  ON form_submissions(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4) Trigger functions: keep daily/monthly tracking synchronized
CREATE OR REPLACE FUNCTION fn_apply_submission_tracking_delta(
  p_tenant_id VARCHAR,
  p_project_id VARCHAR,
  p_node_id VARCHAR,
  p_event_date DATE,
  p_month DATE,
  p_submitted_at TIMESTAMPTZ,
  p_delta INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_effective_month DATE;
  v_effective_event_date DATE;
BEGIN
  IF p_node_id IS NULL OR p_tenant_id IS NULL OR p_project_id IS NULL THEN
    RETURN;
  END IF;

  v_effective_event_date := p_event_date;
  IF v_effective_event_date IS NULL AND p_submitted_at IS NOT NULL THEN
    v_effective_event_date := (p_submitted_at AT TIME ZONE 'UTC')::date;
  END IF;

  v_effective_month := p_month;
  IF v_effective_month IS NULL THEN
    v_effective_month := date_trunc(
      'month',
      COALESCE(v_effective_event_date::timestamp, p_submitted_at, NOW())
    )::date;
  END IF;

  INSERT INTO event_compliance_tracking (
    tenant_id, project_id, node_id, month, year,
    total_events_required, total_events_submitted, submitted_count,
    completeness_percentage, compliance_status,
    events_breakdown, weekly_progress, missing_events, notifications_sent,
    is_locked, last_calculated_at, updated_at, created_at
  )
  VALUES (
    p_tenant_id, p_project_id, p_node_id, v_effective_month, EXTRACT(YEAR FROM v_effective_month)::int,
    0, GREATEST(p_delta, 0), GREATEST(p_delta, 0),
    0, 'incomplete',
    '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    false, NOW(), NOW(), NOW()
  )
  ON CONFLICT (tenant_id, project_id, node_id, month)
  DO UPDATE SET
    submitted_count = GREATEST(event_compliance_tracking.submitted_count + p_delta, 0),
    total_events_submitted = GREATEST(event_compliance_tracking.total_events_submitted + p_delta, 0),
    updated_at = NOW(),
    last_calculated_at = NOW();

  IF v_effective_event_date IS NOT NULL THEN
    INSERT INTO event_compliance_daily_tracking (
      tenant_id, project_id, node_id, event_date,
      submitted_count, last_submission_at, updated_at, created_at
    )
    VALUES (
      p_tenant_id, p_project_id, p_node_id, v_effective_event_date,
      GREATEST(p_delta, 0), p_submitted_at, NOW(), NOW()
    )
    ON CONFLICT (tenant_id, project_id, node_id, event_date)
    DO UPDATE SET
      submitted_count = GREATEST(event_compliance_daily_tracking.submitted_count + p_delta, 0),
      last_submission_at = CASE
        WHEN p_delta > 0 THEN COALESCE(p_submitted_at, NOW())
        ELSE event_compliance_daily_tracking.last_submission_at
      END,
      updated_at = NOW();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION trg_form_submissions_sync_compliance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_countable BOOLEAN;
  new_countable BOOLEAN;
  old_month DATE;
  new_month DATE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.status, '') <> 'deleted' THEN
      PERFORM fn_apply_submission_tracking_delta(
        NEW.tenant_id, NEW.project_id, NEW.node_id,
        NEW.event_date, NEW.month, NEW.submitted_at, 1
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.status, '') <> 'deleted' THEN
      PERFORM fn_apply_submission_tracking_delta(
        OLD.tenant_id, OLD.project_id, OLD.node_id,
        OLD.event_date, OLD.month, OLD.submitted_at, -1
      );
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  old_countable := COALESCE(OLD.status, '') <> 'deleted';
  new_countable := COALESCE(NEW.status, '') <> 'deleted';
  old_month := COALESCE(OLD.month, date_trunc('month', COALESCE(OLD.event_date::timestamp, OLD.submitted_at, NOW()))::date);
  new_month := COALESCE(NEW.month, date_trunc('month', COALESCE(NEW.event_date::timestamp, NEW.submitted_at, NOW()))::date);

  IF old_countable
    AND (
      OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR
      OLD.project_id IS DISTINCT FROM NEW.project_id OR
      OLD.node_id IS DISTINCT FROM NEW.node_id OR
      OLD.event_date IS DISTINCT FROM NEW.event_date OR
      old_month IS DISTINCT FROM new_month OR
      NEW.status = 'deleted'
    )
  THEN
    PERFORM fn_apply_submission_tracking_delta(
      OLD.tenant_id, OLD.project_id, OLD.node_id,
      OLD.event_date, old_month, OLD.submitted_at, -1
    );
  END IF;

  IF new_countable
    AND (
      OLD.tenant_id IS DISTINCT FROM NEW.tenant_id OR
      OLD.project_id IS DISTINCT FROM NEW.project_id OR
      OLD.node_id IS DISTINCT FROM NEW.node_id OR
      OLD.event_date IS DISTINCT FROM NEW.event_date OR
      old_month IS DISTINCT FROM new_month OR
      OLD.status = 'deleted'
    )
  THEN
    PERFORM fn_apply_submission_tracking_delta(
      NEW.tenant_id, NEW.project_id, NEW.node_id,
      NEW.event_date, new_month, NEW.submitted_at, 1
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_form_submissions_sync_compliance ON form_submissions;
CREATE TRIGGER trg_form_submissions_sync_compliance
AFTER INSERT OR UPDATE OR DELETE ON form_submissions
FOR EACH ROW
EXECUTE FUNCTION trg_form_submissions_sync_compliance();

