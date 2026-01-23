-- =============================================================================
-- PERM Calendar Refactor - Add Flexible Tracking Modes
-- =============================================================================
-- Migration: 006
-- Purpose: Add tracking_mode, daily_config, weekly_config to event_calendar
-- Author: Saby Backend Team
-- Date: 2025-10-29
-- =============================================================================
-- 
-- This migration refactors the event_calendar table to support three flexible
-- tracking modes:
--   1. 'none' - Month only (no day tracking)
--   2. 'daily' - Daily tracking with custom days and frequency
--   3. 'weekly' - Weekly tracking with per-day configuration
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Add new columns
-- =============================================================================

-- Add tracking_mode column (required, defaults to 'weekly' for backward compat)
ALTER TABLE event_calendar 
  ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(32) DEFAULT 'weekly';

-- Add daily_config JSONB column (for daily tracking mode)
ALTER TABLE event_calendar
  ADD COLUMN IF NOT EXISTS daily_config JSONB;

-- Add weekly_config JSONB column (for weekly tracking mode)
ALTER TABLE event_calendar
  ADD COLUMN IF NOT EXISTS weekly_config JSONB;

-- Add form_id column (to link calendar to specific form)
ALTER TABLE event_calendar
  ADD COLUMN IF NOT EXISTS form_id VARCHAR(64);

-- Add auto_generate flag (for auto-generation on form publish)
ALTER TABLE event_calendar
  ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN DEFAULT true;

-- =============================================================================
-- STEP 2: Set default tracking_mode for existing records
-- =============================================================================

-- For existing records with event_type, map to 'weekly' mode
UPDATE event_calendar
SET tracking_mode = 'weekly'
WHERE tracking_mode IS NULL OR tracking_mode = '';

-- =============================================================================
-- STEP 3: Migrate existing event_dates to weekly_config
-- =============================================================================

-- Convert existing event_dates to weekly_config structure for existing records
UPDATE event_calendar
SET weekly_config = jsonb_build_object(
  'days', jsonb_build_array(
    jsonb_build_object(
      'day', COALESCE(day_of_week, 0),
      'name', COALESCE(event_name, event_type),
      'frequency', COALESCE(frequency, 'weekly'),
      'dates', event_dates,
      'count', total_events
    )
  ),
  'total_events', total_events
)
WHERE tracking_mode = 'weekly' 
  AND weekly_config IS NULL
  AND event_dates IS NOT NULL
  AND jsonb_array_length(event_dates) > 0;

-- =============================================================================
-- STEP 4: Update NOT NULL constraint on tracking_mode
-- =============================================================================

-- Ensure all records have tracking_mode set
UPDATE event_calendar
SET tracking_mode = 'weekly'
WHERE tracking_mode IS NULL;

-- Now make it NOT NULL
ALTER TABLE event_calendar
  ALTER COLUMN tracking_mode SET NOT NULL;

-- =============================================================================
-- STEP 5: Add constraint for valid tracking modes
-- =============================================================================

-- Add check constraint to ensure valid tracking modes
ALTER TABLE event_calendar
  ADD CONSTRAINT chk_event_calendar_tracking_mode 
  CHECK (tracking_mode IN ('none', 'daily', 'weekly'));

-- =============================================================================
-- STEP 6: Update unique constraint
-- =============================================================================

-- Drop old unique constraint (if exists)
ALTER TABLE event_calendar
  DROP CONSTRAINT IF EXISTS uq_event_calendar_unique;

-- Add new unique constraint: one calendar per tenant/project/form/month
-- (form_id can be NULL for backward compatibility)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_calendar_v2 
  ON event_calendar (tenant_id, project_id, COALESCE(form_id, ''), month);

-- =============================================================================
-- STEP 7: Add indexes for performance
-- =============================================================================

-- Index on tracking_mode for filtering
CREATE INDEX IF NOT EXISTS idx_event_calendar_tracking_mode 
  ON event_calendar(tracking_mode);

-- GIN index for daily_config JSONB queries
CREATE INDEX IF NOT EXISTS idx_event_calendar_daily_config 
  ON event_calendar USING gin (daily_config jsonb_path_ops)
  WHERE daily_config IS NOT NULL;

-- GIN index for weekly_config JSONB queries
CREATE INDEX IF NOT EXISTS idx_event_calendar_weekly_config 
  ON event_calendar USING gin (weekly_config jsonb_path_ops)
  WHERE weekly_config IS NOT NULL;

-- Index on form_id for form-specific queries
CREATE INDEX IF NOT EXISTS idx_event_calendar_form_id 
  ON event_calendar(form_id)
  WHERE form_id IS NOT NULL;

-- Composite index for common queries (tenant + project + form + month)
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant_project_form_month 
  ON event_calendar(tenant_id, project_id, form_id, month)
  WHERE form_id IS NOT NULL;

-- =============================================================================
-- STEP 8: Add comments for documentation
-- =============================================================================

COMMENT ON COLUMN event_calendar.tracking_mode IS 
  'Tracking mode: none (month-only), daily (daily tracking), or weekly (weekly events)';

COMMENT ON COLUMN event_calendar.daily_config IS 
  'JSONB configuration for daily tracking mode. Structure: {activeDays: [0-6], frequencyPerDay: 1-4, dates: [], total_days: N, total_expected: N}';

COMMENT ON COLUMN event_calendar.weekly_config IS 
  'JSONB configuration for weekly tracking mode. Structure: {days: [{day, name, frequency, dates, count}], total_events: N}';

COMMENT ON COLUMN event_calendar.form_id IS 
  'Specific form instance ID (links calendar to ProjectForm)';

COMMENT ON COLUMN event_calendar.auto_generate IS 
  'Whether calendar should auto-generate when form is published';

-- =============================================================================
-- STEP 9: Validation queries (run these to verify migration)
-- =============================================================================

-- Verify all records have tracking_mode
-- SELECT COUNT(*) FROM event_calendar WHERE tracking_mode IS NULL;  -- Should be 0

-- Verify tracking_mode values are valid
-- SELECT DISTINCT tracking_mode FROM event_calendar;  -- Should only show: none, daily, weekly

-- Verify weekly_config structure for existing records
-- SELECT id, tracking_mode, weekly_config FROM event_calendar WHERE tracking_mode = 'weekly' LIMIT 5;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Added tracking_mode column (enum: 'none', 'daily', 'weekly')
-- ✅ Added daily_config JSONB column
-- ✅ Added weekly_config JSONB column
-- ✅ Added form_id column
-- ✅ Added auto_generate column
-- ✅ Migrated existing data to weekly_config
-- ✅ Added indexes for performance
-- ✅ Updated unique constraint
-- ✅ Added documentation comments
--
-- Next Steps:
-- 1. Test migration on development database
-- 2. Update ProjectForm model (permSettings)
-- 3. Update calendar generation service
-- 4. Update compliance calculation service

