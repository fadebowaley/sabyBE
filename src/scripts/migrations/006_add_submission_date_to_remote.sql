-- =============================================================================
-- Migration: 006 - Add submission_date Generated Column
-- =============================================================================
-- Purpose: Standardize form_submissions schema between local and remote
--          Add submission_date as GENERATED column (computed from submitted_at)
-- Author: Saby Backend Team
-- Date: 2025-11-24
-- =============================================================================
-- 
-- This migration ensures both local and remote databases have identical schema
-- for date-related columns in form_submissions table.
--
-- submission_date: GENERATED column that automatically computes date from submitted_at
--                  This ensures consistency and eliminates need for fallback logic
-- =============================================================================

-- Check if submission_date column already exists
DO $$
BEGIN
    -- Add submission_date as GENERATED column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'form_submissions' 
        AND column_name = 'submission_date'
    ) THEN
        -- Add submission_date as GENERATED column (computed from submitted_at)
        ALTER TABLE form_submissions
        ADD COLUMN submission_date DATE 
        GENERATED ALWAYS AS ((submitted_at AT TIME ZONE 'UTC')::date) STORED;
        
        RAISE NOTICE 'Added submission_date column as GENERATED column';
    ELSE
        RAISE NOTICE 'submission_date column already exists, skipping';
    END IF;
END $$;

-- Add submission_week column if it doesn't exist (for consistency with local)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'form_submissions' 
        AND column_name = 'submission_week'
    ) THEN
        ALTER TABLE form_submissions
        ADD COLUMN submission_week DATE 
        GENERATED ALWAYS AS (date_trunc('week', submitted_at AT TIME ZONE 'UTC')::date) STORED;
        
        RAISE NOTICE 'Added submission_week column as GENERATED column';
    ELSE
        RAISE NOTICE 'submission_week column already exists, skipping';
    END IF;
END $$;

-- Create index on submission_date if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_date 
    ON form_submissions(tenant_id, project_id, node_id, submission_date);

-- Create index on submission_week if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_week 
    ON form_submissions(tenant_id, project_id, node_id, submission_week);

-- Add comments for documentation
COMMENT ON COLUMN form_submissions.submission_date IS 
    'Generated column: Date portion of submitted_at (automatically computed)';

COMMENT ON COLUMN form_submissions.submission_week IS 
    'Generated column: Week start date computed from submitted_at (automatically computed)';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- After running this migration, verify with:
-- SELECT column_name, data_type, is_generated 
-- FROM information_schema.columns 
-- WHERE table_name = 'form_submissions' 
-- AND column_name IN ('submission_date', 'submission_week', 'submitted_at')
-- ORDER BY column_name;
--
-- Expected result:
-- - submission_date: date, ALWAYS (generated)
-- - submission_week: date, ALWAYS (generated)  
-- - submitted_at: timestamp with time zone, NEVER (source column)
-- =============================================================================

