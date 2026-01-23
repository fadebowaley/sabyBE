-- =============================================================================
-- PERM (Per Event Reporting Model) - Modify form_submissions Table
-- =============================================================================
-- Migration: 005
-- Purpose: Add PERM-specific columns to existing form_submissions table
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- ADD PERM COLUMNS TO form_submissions
-- =============================================================================

-- Time period columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS month DATE,
  ADD COLUMN IF NOT EXISTS year INT;

-- Compliance tracking columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS event_compliance_percentage DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS completeness_status VARCHAR(32) DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS total_events_required INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_events_submitted INT DEFAULT 0;

-- Lock mechanism columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(255);

-- PERM enablement flag
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS perm_enabled BOOLEAN DEFAULT false;

-- Validation status
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(32) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS validation_warnings JSONB DEFAULT '[]';

-- =============================================================================
-- CREATE NEW INDEXES
-- =============================================================================

-- Month/year lookup indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_month 
    ON form_submissions(month) 
    WHERE month IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_year 
    ON form_submissions(year) 
    WHERE year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_month_year 
    ON form_submissions(month, year) 
    WHERE month IS NOT NULL;

-- PERM-specific indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_perm_enabled 
    ON form_submissions(perm_enabled) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_locked 
    ON form_submissions(is_locked);

CREATE INDEX IF NOT EXISTS idx_form_submissions_completeness 
    ON form_submissions(completeness_status) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_compliance_pct 
    ON form_submissions(event_compliance_percentage) 
    WHERE perm_enabled = true;

-- Composite indexes for PERM queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant_project_month 
    ON form_submissions(tenant_id, project_id, month) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_node_month 
    ON form_submissions(node_id, month) 
    WHERE perm_enabled = true AND node_id IS NOT NULL;

-- Unique constraint for PERM: one submission per node per month (when unlocked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_submissions_unique_node_month 
    ON form_submissions(tenant_id, project_id, node_id, month) 
    WHERE is_locked = false AND perm_enabled = true AND node_id IS NOT NULL;

-- Unlocked PERM submissions (for month-end processing)
CREATE INDEX IF NOT EXISTS idx_form_submissions_unlocked_perm 
    ON form_submissions(month, year) 
    WHERE is_locked = false AND perm_enabled = true;

-- Incomplete submissions (for reminders)
CREATE INDEX IF NOT EXISTS idx_form_submissions_incomplete 
    ON form_submissions(tenant_id, project_id, month) 
    WHERE completeness_status != 'complete' AND is_locked = false AND perm_enabled = true;

-- Validation status index
CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_status 
    ON form_submissions(validation_status) 
    WHERE perm_enabled = true;

-- GIN indexes for validation JSONB arrays
CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_errors 
    ON form_submissions USING gin (validation_errors jsonb_path_ops) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_warnings 
    ON form_submissions USING gin (validation_warnings jsonb_path_ops) 
    WHERE perm_enabled = true;

-- =============================================================================
-- UPDATE EXISTING INDEXES (if needed)
-- =============================================================================

-- Ensure existing indexes still work with new columns
-- No changes needed to existing indexes as they don't conflict

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN form_submissions.month IS 'First day of reporting month (e.g., 2025-09-01) - PERM only';
COMMENT ON COLUMN form_submissions.year IS 'Reporting year (e.g., 2025) - PERM only';
COMMENT ON COLUMN form_submissions.event_compliance_percentage IS 'Percentage of required events submitted (0.00 to 100.00) - PERM only';
COMMENT ON COLUMN form_submissions.completeness_status IS 'Compliance status: incomplete (<40%), partial (40-99%), complete (100%) - PERM only';
COMMENT ON COLUMN form_submissions.perm_enabled IS 'Whether this submission uses PERM (Per Event Reporting Model)';
COMMENT ON COLUMN form_submissions.is_locked IS 'Whether submission is locked (no further edits allowed) - PERM only';
COMMENT ON COLUMN form_submissions.validation_errors IS 'JSONB array of validation errors - PERM only';
COMMENT ON COLUMN form_submissions.validation_warnings IS 'JSONB array of validation warnings - PERM only';

-- =============================================================================
-- DATA MIGRATION (Optional - for existing data)
-- =============================================================================

-- Set perm_enabled = false for all existing submissions (default behavior)
-- UPDATE form_submissions 
-- SET perm_enabled = false 
-- WHERE perm_enabled IS NULL;

-- Set default values for nullable columns
-- UPDATE form_submissions 
-- SET 
--   completeness_status = 'incomplete',
--   event_compliance_percentage = 0.00,
--   is_locked = false
-- WHERE perm_enabled IS NULL OR perm_enabled = false;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verification query
-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable, 
--   column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'form_submissions' 
--   AND column_name IN ('month', 'year', 'perm_enabled', 'is_locked', 'event_compliance_percentage')
-- ORDER BY column_name;


-- =============================================================================
-- PERM (Per Event Reporting Model) - Modify form_submissions Table
-- =============================================================================
-- Migration: 005
-- Purpose: Add PERM-specific columns to existing form_submissions table
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- ADD PERM COLUMNS TO form_submissions
-- =============================================================================

-- Time period columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS month DATE,
  ADD COLUMN IF NOT EXISTS year INT;

-- Compliance tracking columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS event_compliance_percentage DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS completeness_status VARCHAR(32) DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS total_events_required INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_events_submitted INT DEFAULT 0;

-- Lock mechanism columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(255);

-- PERM enablement flag
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS perm_enabled BOOLEAN DEFAULT false;

-- Validation status
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(32) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS validation_warnings JSONB DEFAULT '[]';

-- =============================================================================
-- CREATE NEW INDEXES
-- =============================================================================

-- Month/year lookup indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_month 
    ON form_submissions(month) 
    WHERE month IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_year 
    ON form_submissions(year) 
    WHERE year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_month_year 
    ON form_submissions(month, year) 
    WHERE month IS NOT NULL;

-- PERM-specific indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_perm_enabled 
    ON form_submissions(perm_enabled) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_locked 
    ON form_submissions(is_locked);

CREATE INDEX IF NOT EXISTS idx_form_submissions_completeness 
    ON form_submissions(completeness_status) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_compliance_pct 
    ON form_submissions(event_compliance_percentage) 
    WHERE perm_enabled = true;

-- Composite indexes for PERM queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant_project_month 
    ON form_submissions(tenant_id, project_id, month) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_node_month 
    ON form_submissions(node_id, month) 
    WHERE perm_enabled = true AND node_id IS NOT NULL;

-- Unique constraint for PERM: one submission per node per month (when unlocked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_submissions_unique_node_month 
    ON form_submissions(tenant_id, project_id, node_id, month) 
    WHERE is_locked = false AND perm_enabled = true AND node_id IS NOT NULL;

-- Unlocked PERM submissions (for month-end processing)
CREATE INDEX IF NOT EXISTS idx_form_submissions_unlocked_perm 
    ON form_submissions(month, year) 
    WHERE is_locked = false AND perm_enabled = true;

-- Incomplete submissions (for reminders)
CREATE INDEX IF NOT EXISTS idx_form_submissions_incomplete 
    ON form_submissions(tenant_id, project_id, month) 
    WHERE completeness_status != 'complete' AND is_locked = false AND perm_enabled = true;

-- Validation status index
CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_status 
    ON form_submissions(validation_status) 
    WHERE perm_enabled = true;

-- GIN indexes for validation JSONB arrays
CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_errors 
    ON form_submissions USING gin (validation_errors jsonb_path_ops) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_warnings 
    ON form_submissions USING gin (validation_warnings jsonb_path_ops) 
    WHERE perm_enabled = true;

-- =============================================================================
-- UPDATE EXISTING INDEXES (if needed)
-- =============================================================================

-- Ensure existing indexes still work with new columns
-- No changes needed to existing indexes as they don't conflict

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN form_submissions.month IS 'First day of reporting month (e.g., 2025-09-01) - PERM only';
COMMENT ON COLUMN form_submissions.year IS 'Reporting year (e.g., 2025) - PERM only';
COMMENT ON COLUMN form_submissions.event_compliance_percentage IS 'Percentage of required events submitted (0.00 to 100.00) - PERM only';
COMMENT ON COLUMN form_submissions.completeness_status IS 'Compliance status: incomplete (<40%), partial (40-99%), complete (100%) - PERM only';
COMMENT ON COLUMN form_submissions.perm_enabled IS 'Whether this submission uses PERM (Per Event Reporting Model)';
COMMENT ON COLUMN form_submissions.is_locked IS 'Whether submission is locked (no further edits allowed) - PERM only';
COMMENT ON COLUMN form_submissions.validation_errors IS 'JSONB array of validation errors - PERM only';
COMMENT ON COLUMN form_submissions.validation_warnings IS 'JSONB array of validation warnings - PERM only';

-- =============================================================================
-- DATA MIGRATION (Optional - for existing data)
-- =============================================================================

-- Set perm_enabled = false for all existing submissions (default behavior)
-- UPDATE form_submissions 
-- SET perm_enabled = false 
-- WHERE perm_enabled IS NULL;

-- Set default values for nullable columns
-- UPDATE form_submissions 
-- SET 
--   completeness_status = 'incomplete',
--   event_compliance_percentage = 0.00,
--   is_locked = false
-- WHERE perm_enabled IS NULL OR perm_enabled = false;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verification query
-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable, 
--   column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'form_submissions' 
--   AND column_name IN ('month', 'year', 'perm_enabled', 'is_locked', 'event_compliance_percentage')
-- ORDER BY column_name;


-- =============================================================================
-- PERM (Per Event Reporting Model) - Modify form_submissions Table
-- =============================================================================
-- Migration: 005
-- Purpose: Add PERM-specific columns to existing form_submissions table
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- ADD PERM COLUMNS TO form_submissions
-- =============================================================================

-- Time period columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS month DATE,
  ADD COLUMN IF NOT EXISTS year INT;

-- Compliance tracking columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS event_compliance_percentage DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS completeness_status VARCHAR(32) DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS total_events_required INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_events_submitted INT DEFAULT 0;

-- Lock mechanism columns
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS locked_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(255);

-- PERM enablement flag
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS perm_enabled BOOLEAN DEFAULT false;

-- Validation status
ALTER TABLE form_submissions 
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(32) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS validation_warnings JSONB DEFAULT '[]';

-- =============================================================================
-- CREATE NEW INDEXES
-- =============================================================================

-- Month/year lookup indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_month 
    ON form_submissions(month) 
    WHERE month IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_year 
    ON form_submissions(year) 
    WHERE year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_submissions_month_year 
    ON form_submissions(month, year) 
    WHERE month IS NOT NULL;

-- PERM-specific indexes
CREATE INDEX IF NOT EXISTS idx_form_submissions_perm_enabled 
    ON form_submissions(perm_enabled) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_locked 
    ON form_submissions(is_locked);

CREATE INDEX IF NOT EXISTS idx_form_submissions_completeness 
    ON form_submissions(completeness_status) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_compliance_pct 
    ON form_submissions(event_compliance_percentage) 
    WHERE perm_enabled = true;

-- Composite indexes for PERM queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant_project_month 
    ON form_submissions(tenant_id, project_id, month) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_node_month 
    ON form_submissions(node_id, month) 
    WHERE perm_enabled = true AND node_id IS NOT NULL;

-- Unique constraint for PERM: one submission per node per month (when unlocked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_form_submissions_unique_node_month 
    ON form_submissions(tenant_id, project_id, node_id, month) 
    WHERE is_locked = false AND perm_enabled = true AND node_id IS NOT NULL;

-- Unlocked PERM submissions (for month-end processing)
CREATE INDEX IF NOT EXISTS idx_form_submissions_unlocked_perm 
    ON form_submissions(month, year) 
    WHERE is_locked = false AND perm_enabled = true;

-- Incomplete submissions (for reminders)
CREATE INDEX IF NOT EXISTS idx_form_submissions_incomplete 
    ON form_submissions(tenant_id, project_id, month) 
    WHERE completeness_status != 'complete' AND is_locked = false AND perm_enabled = true;

-- Validation status index
CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_status 
    ON form_submissions(validation_status) 
    WHERE perm_enabled = true;

-- GIN indexes for validation JSONB arrays
CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_errors 
    ON form_submissions USING gin (validation_errors jsonb_path_ops) 
    WHERE perm_enabled = true;

CREATE INDEX IF NOT EXISTS idx_form_submissions_validation_warnings 
    ON form_submissions USING gin (validation_warnings jsonb_path_ops) 
    WHERE perm_enabled = true;

-- =============================================================================
-- UPDATE EXISTING INDEXES (if needed)
-- =============================================================================

-- Ensure existing indexes still work with new columns
-- No changes needed to existing indexes as they don't conflict

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON COLUMN form_submissions.month IS 'First day of reporting month (e.g., 2025-09-01) - PERM only';
COMMENT ON COLUMN form_submissions.year IS 'Reporting year (e.g., 2025) - PERM only';
COMMENT ON COLUMN form_submissions.event_compliance_percentage IS 'Percentage of required events submitted (0.00 to 100.00) - PERM only';
COMMENT ON COLUMN form_submissions.completeness_status IS 'Compliance status: incomplete (<40%), partial (40-99%), complete (100%) - PERM only';
COMMENT ON COLUMN form_submissions.perm_enabled IS 'Whether this submission uses PERM (Per Event Reporting Model)';
COMMENT ON COLUMN form_submissions.is_locked IS 'Whether submission is locked (no further edits allowed) - PERM only';
COMMENT ON COLUMN form_submissions.validation_errors IS 'JSONB array of validation errors - PERM only';
COMMENT ON COLUMN form_submissions.validation_warnings IS 'JSONB array of validation warnings - PERM only';

-- =============================================================================
-- DATA MIGRATION (Optional - for existing data)
-- =============================================================================

-- Set perm_enabled = false for all existing submissions (default behavior)
-- UPDATE form_submissions 
-- SET perm_enabled = false 
-- WHERE perm_enabled IS NULL;

-- Set default values for nullable columns
-- UPDATE form_submissions 
-- SET 
--   completeness_status = 'incomplete',
--   event_compliance_percentage = 0.00,
--   is_locked = false
-- WHERE perm_enabled IS NULL OR perm_enabled = false;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Verification query
-- SELECT 
--   column_name, 
--   data_type, 
--   is_nullable, 
--   column_default
-- FROM information_schema.columns 
-- WHERE table_name = 'form_submissions' 
--   AND column_name IN ('month', 'year', 'perm_enabled', 'is_locked', 'event_compliance_percentage')
-- ORDER BY column_name;


