-- =============================================================================
-- Add Monthly Compliance Tracking Mode
-- =============================================================================
-- Migration: 007
-- Purpose: Extend event_calendar to support explicit monthly schedules
-- =============================================================================

ALTER TABLE event_calendar
  ADD COLUMN IF NOT EXISTS monthly_config JSONB;

ALTER TABLE event_calendar
  DROP CONSTRAINT IF EXISTS chk_event_calendar_tracking_mode;

ALTER TABLE event_calendar
  ADD CONSTRAINT chk_event_calendar_tracking_mode
  CHECK (tracking_mode IN ('none', 'daily', 'weekly', 'monthly'));

CREATE INDEX IF NOT EXISTS idx_event_calendar_monthly_config
  ON event_calendar USING gin (monthly_config jsonb_path_ops)
  WHERE monthly_config IS NOT NULL;

COMMENT ON COLUMN event_calendar.monthly_config IS
  'JSONB configuration for monthly tracking mode. Structure: {dates: [], day_numbers: [], submission_limit_per_date: N, total_expected: N}';
