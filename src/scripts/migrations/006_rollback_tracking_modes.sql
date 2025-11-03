-- =============================================================================
-- PERM Calendar Refactor - Rollback Migration
-- =============================================================================
-- Migration: 006_rollback
-- Purpose: Rollback tracking_mode changes to event_calendar table
-- Author: Saby Backend Team
-- Date: 2025-10-29
-- =============================================================================
--
-- WARNING: This rollback will remove the flexible tracking modes and revert
--          to the original structure. Only use if migration needs to be undone.
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Remove indexes first (to avoid conflicts)
-- =============================================================================

DROP INDEX IF EXISTS idx_event_calendar_tracking_mode;
DROP INDEX IF EXISTS idx_event_calendar_daily_config;
DROP INDEX IF EXISTS idx_event_calendar_weekly_config;
DROP INDEX IF EXISTS idx_event_calendar_form_id;
DROP INDEX IF EXISTS idx_event_calendar_tenant_project_form_month;
DROP INDEX IF EXISTS uq_event_calendar_v2;

-- =============================================================================
-- STEP 2: Remove constraints
-- =============================================================================

ALTER TABLE event_calendar
  DROP CONSTRAINT IF EXISTS chk_event_calendar_tracking_mode;

-- =============================================================================
-- STEP 3: Restore original unique constraint
-- =============================================================================

-- Restore original unique constraint (if needed)
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_calendar_unique 
  ON event_calendar (tenant_id, project_id, month, event_type)
  WHERE event_type IS NOT NULL;

-- =============================================================================
-- STEP 4: Remove new columns
-- =============================================================================

ALTER TABLE event_calendar
  DROP COLUMN IF EXISTS tracking_mode,
  DROP COLUMN IF EXISTS daily_config,
  DROP COLUMN IF EXISTS weekly_config,
  DROP COLUMN IF EXISTS form_id,
  DROP COLUMN IF EXISTS auto_generate;

-- =============================================================================
-- STEP 5: Remove comments
-- =============================================================================

COMMENT ON COLUMN event_calendar.tracking_mode IS NULL;
COMMENT ON COLUMN event_calendar.daily_config IS NULL;
COMMENT ON COLUMN event_calendar.weekly_config IS NULL;
COMMENT ON COLUMN event_calendar.form_id IS NULL;
COMMENT ON COLUMN event_calendar.auto_generate IS NULL;

-- =============================================================================
-- ROLLBACK COMPLETE
-- =============================================================================

-- Summary:
-- ✅ Removed tracking_mode column
-- ✅ Removed daily_config column
-- ✅ Removed weekly_config column
-- ✅ Removed form_id column
-- ✅ Removed auto_generate column
-- ✅ Removed all related indexes
-- ✅ Removed constraints
-- ✅ Restored original structure
--
-- Note: This rollback does NOT restore data that was converted from
--       event_dates to weekly_config. Data in weekly_config will be lost.
--       Backup before running migration if you need to preserve this data.



