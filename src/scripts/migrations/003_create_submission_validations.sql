-- =============================================================================
-- PERM (Per Event Reporting Model) - Submission Validations Table
-- =============================================================================
-- Migration: 003
-- Purpose: Store validation results for each submission and category
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- SUBMISSION VALIDATIONS TABLE
-- =============================================================================
-- Purpose: Track validation results for submissions (date checks, total checks, etc.)
-- Key Concept: Multiple validation entries per submission (one per validation type per category)

CREATE TABLE IF NOT EXISTS submission_validations (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to submission
    submission_id UUID NOT NULL, -- References form_submissions(id)
    
    -- Validation context
    category VARCHAR(64) NOT NULL, -- 'attendance', 'financial', 'first_timers', 'general'
    validation_type VARCHAR(64) NOT NULL, -- 'date_check', 'total_check', 'percentage_check', 'window_check', 'required_check'
    
    -- Validation result
    is_valid BOOLEAN NOT NULL,
    severity VARCHAR(16) DEFAULT 'error', -- 'error', 'warning', 'info'
    
    -- Error details
    error_code VARCHAR(64), -- 'INVALID_DATE', 'TOTALS_MISMATCH', 'WINDOW_EXPIRED', 'PERCENTAGE_OFF'
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    -- Example error_details: {
    --   "expected": 500,
    --   "actual": 490,
    --   "difference": 10,
    --   "field": "total"
    -- }
    
    -- Context data
    validated_field VARCHAR(64), -- 'date', 'total', 'offering_percentage'
    expected_value VARCHAR(255),
    actual_value VARCHAR(255),
    
    -- Metadata
    validation_metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_by VARCHAR(64), -- 'system' or user_id
    validation_version VARCHAR(16) DEFAULT '1.0.0' -- Track validation rule changes
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_validations_submission 
    ON submission_validations(submission_id);

CREATE INDEX IF NOT EXISTS idx_validations_category 
    ON submission_validations(category);

CREATE INDEX IF NOT EXISTS idx_validations_type 
    ON submission_validations(validation_type);

-- Validation status indexes
CREATE INDEX IF NOT EXISTS idx_validations_valid 
    ON submission_validations(is_valid);

CREATE INDEX IF NOT EXISTS idx_validations_severity 
    ON submission_validations(severity);

CREATE INDEX IF NOT EXISTS idx_validations_error_code 
    ON submission_validations(error_code) 
    WHERE error_code IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validations_submission_category 
    ON submission_validations(submission_id, category);

CREATE INDEX IF NOT EXISTS idx_validations_submission_valid 
    ON submission_validations(submission_id, is_valid);

-- Failed validations lookup (for reporting)
CREATE INDEX IF NOT EXISTS idx_validations_failures 
    ON submission_validations(submission_id, category, validation_type) 
    WHERE is_valid = false;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_validations_validated_at 
    ON submission_validations(validated_at DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_validations_error_details 
    ON submission_validations USING gin (error_details jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE submission_validations IS 'Stores validation results for PERM submissions (dates, totals, percentages, windows)';
COMMENT ON COLUMN submission_validations.validation_type IS 'Type of validation performed (date_check, total_check, percentage_check, etc.)';
COMMENT ON COLUMN submission_validations.error_details IS 'JSONB object with detailed error information (expected, actual, difference)';
COMMENT ON COLUMN submission_validations.severity IS 'Severity level: error (blocks submission), warning (allows but notifies), info (logs only)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: Validation results for a submission
-- INSERT INTO submission_validations (submission_id, category, validation_type, is_valid, severity, error_code, error_message, error_details)
-- VALUES 
--   ('550e8400-e29b-41d4-a716-446655440000', 'attendance', 'total_check', true, 'info', null, 'Totals match correctly', '{}'),
--   ('550e8400-e29b-41d4-a716-446655440000', 'financial', 'percentage_check', false, 'warning', 'PERCENTAGE_OFF', 'Offering percentage is 45%, expected ~50%', '{"expected": 50, "actual": 45, "tolerance": 5}'::jsonb),
--   ('550e8400-e29b-41d4-a716-446655440000', 'attendance', 'date_check', true, 'info', null, 'All dates valid', '{}');

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Submission Validations Table
-- =============================================================================
-- Migration: 003
-- Purpose: Store validation results for each submission and category
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- SUBMISSION VALIDATIONS TABLE
-- =============================================================================
-- Purpose: Track validation results for submissions (date checks, total checks, etc.)
-- Key Concept: Multiple validation entries per submission (one per validation type per category)

CREATE TABLE IF NOT EXISTS submission_validations (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to submission
    submission_id UUID NOT NULL, -- References form_submissions(id)
    
    -- Validation context
    category VARCHAR(64) NOT NULL, -- 'attendance', 'financial', 'first_timers', 'general'
    validation_type VARCHAR(64) NOT NULL, -- 'date_check', 'total_check', 'percentage_check', 'window_check', 'required_check'
    
    -- Validation result
    is_valid BOOLEAN NOT NULL,
    severity VARCHAR(16) DEFAULT 'error', -- 'error', 'warning', 'info'
    
    -- Error details
    error_code VARCHAR(64), -- 'INVALID_DATE', 'TOTALS_MISMATCH', 'WINDOW_EXPIRED', 'PERCENTAGE_OFF'
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    -- Example error_details: {
    --   "expected": 500,
    --   "actual": 490,
    --   "difference": 10,
    --   "field": "total"
    -- }
    
    -- Context data
    validated_field VARCHAR(64), -- 'date', 'total', 'offering_percentage'
    expected_value VARCHAR(255),
    actual_value VARCHAR(255),
    
    -- Metadata
    validation_metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_by VARCHAR(64), -- 'system' or user_id
    validation_version VARCHAR(16) DEFAULT '1.0.0' -- Track validation rule changes
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_validations_submission 
    ON submission_validations(submission_id);

CREATE INDEX IF NOT EXISTS idx_validations_category 
    ON submission_validations(category);

CREATE INDEX IF NOT EXISTS idx_validations_type 
    ON submission_validations(validation_type);

-- Validation status indexes
CREATE INDEX IF NOT EXISTS idx_validations_valid 
    ON submission_validations(is_valid);

CREATE INDEX IF NOT EXISTS idx_validations_severity 
    ON submission_validations(severity);

CREATE INDEX IF NOT EXISTS idx_validations_error_code 
    ON submission_validations(error_code) 
    WHERE error_code IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validations_submission_category 
    ON submission_validations(submission_id, category);

CREATE INDEX IF NOT EXISTS idx_validations_submission_valid 
    ON submission_validations(submission_id, is_valid);

-- Failed validations lookup (for reporting)
CREATE INDEX IF NOT EXISTS idx_validations_failures 
    ON submission_validations(submission_id, category, validation_type) 
    WHERE is_valid = false;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_validations_validated_at 
    ON submission_validations(validated_at DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_validations_error_details 
    ON submission_validations USING gin (error_details jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE submission_validations IS 'Stores validation results for PERM submissions (dates, totals, percentages, windows)';
COMMENT ON COLUMN submission_validations.validation_type IS 'Type of validation performed (date_check, total_check, percentage_check, etc.)';
COMMENT ON COLUMN submission_validations.error_details IS 'JSONB object with detailed error information (expected, actual, difference)';
COMMENT ON COLUMN submission_validations.severity IS 'Severity level: error (blocks submission), warning (allows but notifies), info (logs only)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: Validation results for a submission
-- INSERT INTO submission_validations (submission_id, category, validation_type, is_valid, severity, error_code, error_message, error_details)
-- VALUES 
--   ('550e8400-e29b-41d4-a716-446655440000', 'attendance', 'total_check', true, 'info', null, 'Totals match correctly', '{}'),
--   ('550e8400-e29b-41d4-a716-446655440000', 'financial', 'percentage_check', false, 'warning', 'PERCENTAGE_OFF', 'Offering percentage is 45%, expected ~50%', '{"expected": 50, "actual": 45, "tolerance": 5}'::jsonb),
--   ('550e8400-e29b-41d4-a716-446655440000', 'attendance', 'date_check', true, 'info', null, 'All dates valid', '{}');

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Submission Validations Table
-- =============================================================================
-- Migration: 003
-- Purpose: Store validation results for each submission and category
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- SUBMISSION VALIDATIONS TABLE
-- =============================================================================
-- Purpose: Track validation results for submissions (date checks, total checks, etc.)
-- Key Concept: Multiple validation entries per submission (one per validation type per category)

CREATE TABLE IF NOT EXISTS submission_validations (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to submission
    submission_id UUID NOT NULL, -- References form_submissions(id)
    
    -- Validation context
    category VARCHAR(64) NOT NULL, -- 'attendance', 'financial', 'first_timers', 'general'
    validation_type VARCHAR(64) NOT NULL, -- 'date_check', 'total_check', 'percentage_check', 'window_check', 'required_check'
    
    -- Validation result
    is_valid BOOLEAN NOT NULL,
    severity VARCHAR(16) DEFAULT 'error', -- 'error', 'warning', 'info'
    
    -- Error details
    error_code VARCHAR(64), -- 'INVALID_DATE', 'TOTALS_MISMATCH', 'WINDOW_EXPIRED', 'PERCENTAGE_OFF'
    error_message TEXT,
    error_details JSONB DEFAULT '{}',
    -- Example error_details: {
    --   "expected": 500,
    --   "actual": 490,
    --   "difference": 10,
    --   "field": "total"
    -- }
    
    -- Context data
    validated_field VARCHAR(64), -- 'date', 'total', 'offering_percentage'
    expected_value VARCHAR(255),
    actual_value VARCHAR(255),
    
    -- Metadata
    validation_metadata JSONB DEFAULT '{}',
    
    -- Audit fields
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_by VARCHAR(64), -- 'system' or user_id
    validation_version VARCHAR(16) DEFAULT '1.0.0' -- Track validation rule changes
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_validations_submission 
    ON submission_validations(submission_id);

CREATE INDEX IF NOT EXISTS idx_validations_category 
    ON submission_validations(category);

CREATE INDEX IF NOT EXISTS idx_validations_type 
    ON submission_validations(validation_type);

-- Validation status indexes
CREATE INDEX IF NOT EXISTS idx_validations_valid 
    ON submission_validations(is_valid);

CREATE INDEX IF NOT EXISTS idx_validations_severity 
    ON submission_validations(severity);

CREATE INDEX IF NOT EXISTS idx_validations_error_code 
    ON submission_validations(error_code) 
    WHERE error_code IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validations_submission_category 
    ON submission_validations(submission_id, category);

CREATE INDEX IF NOT EXISTS idx_validations_submission_valid 
    ON submission_validations(submission_id, is_valid);

-- Failed validations lookup (for reporting)
CREATE INDEX IF NOT EXISTS idx_validations_failures 
    ON submission_validations(submission_id, category, validation_type) 
    WHERE is_valid = false;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_validations_validated_at 
    ON submission_validations(validated_at DESC);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_validations_error_details 
    ON submission_validations USING gin (error_details jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE submission_validations IS 'Stores validation results for PERM submissions (dates, totals, percentages, windows)';
COMMENT ON COLUMN submission_validations.validation_type IS 'Type of validation performed (date_check, total_check, percentage_check, etc.)';
COMMENT ON COLUMN submission_validations.error_details IS 'JSONB object with detailed error information (expected, actual, difference)';
COMMENT ON COLUMN submission_validations.severity IS 'Severity level: error (blocks submission), warning (allows but notifies), info (logs only)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: Validation results for a submission
-- INSERT INTO submission_validations (submission_id, category, validation_type, is_valid, severity, error_code, error_message, error_details)
-- VALUES 
--   ('550e8400-e29b-41d4-a716-446655440000', 'attendance', 'total_check', true, 'info', null, 'Totals match correctly', '{}'),
--   ('550e8400-e29b-41d4-a716-446655440000', 'financial', 'percentage_check', false, 'warning', 'PERCENTAGE_OFF', 'Offering percentage is 45%, expected ~50%', '{"expected": 50, "actual": 45, "tolerance": 5}'::jsonb),
--   ('550e8400-e29b-41d4-a716-446655440000', 'attendance', 'date_check', true, 'info', null, 'All dates valid', '{}');

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


