-- =============================================================================
-- COMPLETE DATABASE SCHEMA FOR HALO BACKEND
-- =============================================================================
-- This script creates all necessary tables for the Halo Backend application
-- Run this script to set up the complete database schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- FORM SUBMISSIONS TABLE
-- =============================================================================
-- Main table for storing form submissions with comprehensive metadata

CREATE TABLE IF NOT EXISTS form_submissions (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Core identifiers
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    form_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64),
    user_id VARCHAR(64),

    -- Submission metadata
    source VARCHAR(32) DEFAULT 'unknown',
    status VARCHAR(32) DEFAULT 'submitted',

    -- Data storage
    data JSONB NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    -- Project information (for easier querying)
    project_name VARCHAR(128),
    project_category VARCHAR(64),

    -- Event tracking
    event_date DATE,
    month DATE,
    year INTEGER,
    event_compliance_percentage NUMERIC(5,2) DEFAULT 0.00,
    completeness_status VARCHAR(32) DEFAULT 'incomplete',
    total_events_required INTEGER DEFAULT 0,
    total_events_submitted INTEGER DEFAULT 0,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(64),
    lock_reason VARCHAR(255),
    perm_enabled BOOLEAN DEFAULT FALSE,
    validation_status VARCHAR(32) DEFAULT 'pending',
    validation_errors JSONB DEFAULT '[]'::jsonb,
    validation_warnings JSONB DEFAULT '[]'::jsonb,
    submitted_by VARCHAR(64),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    node_name VARCHAR(128),
    node_reference VARCHAR(128),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submission_date DATE GENERATED ALWAYS AS ((submitted_at AT TIME ZONE 'UTC')::date) STORED,
    submission_week DATE GENERATED ALWAYS AS (date_trunc('week', submitted_at AT TIME ZONE 'UTC')::date) STORED
);

-- Indexes for form_submissions table
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant_id ON form_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project_id ON form_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_node_id ON form_submissions(node_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project_name ON form_submissions(project_name);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project_category ON form_submissions(project_category);
CREATE INDEX IF NOT EXISTS idx_form_submissions_event_date ON form_submissions(event_date);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_date ON form_submissions(tenant_id, project_id, node_id, submission_date);
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_week ON form_submissions(tenant_id, project_id, node_id, submission_week);

-- GIN index for JSONB data field (optimizes JSON queries)
CREATE INDEX IF NOT EXISTS idx_form_submissions_data 
ON form_submissions USING gin (data jsonb_path_ops);

-- =============================================================================
-- SUBMISSION ACTIVITY LOG TABLE
-- =============================================================================
-- Table for tracking submission processing activities and status changes

CREATE TABLE IF NOT EXISTS submission_activity_log (
    -- Primary key
    id SERIAL PRIMARY KEY,
    
    -- Core identifiers
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    form_id VARCHAR(64),
    user_id VARCHAR(64),
    
    -- Activity tracking
    action VARCHAR(32), -- e.g., 'submitted', 'queued', 'processed', 'failed'
    status VARCHAR(32),
    job_id VARCHAR(128),
    message TEXT,
    
    -- Project information (for easier querying)
    project_name VARCHAR(128),
    project_category VARCHAR(64),
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for submission_activity_log table
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_id ON submission_activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON submission_activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_form_id ON submission_activity_log(form_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON submission_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_job_id ON submission_activity_log(job_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON submission_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_name ON submission_activity_log(project_name);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_category ON submission_activity_log(project_category);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON submission_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_status ON submission_activity_log(status);

-- =============================================================================
-- ADDITIONAL TABLES (Future Extensions)
-- =============================================================================

-- Form Templates Table (for future use)
CREATE TABLE IF NOT EXISTS form_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    template_name VARCHAR(128) NOT NULL,
    template_schema JSONB NOT NULL,
    version VARCHAR(16) DEFAULT '1.0.0',
    is_active BOOLEAN DEFAULT true,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for form_templates table
CREATE INDEX IF NOT EXISTS idx_form_templates_tenant_id ON form_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_project_id ON form_templates(project_id);
CREATE INDEX IF NOT EXISTS idx_form_templates_template_name ON form_templates(template_name);
CREATE INDEX IF NOT EXISTS idx_form_templates_is_active ON form_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_form_templates_created_at ON form_templates(created_at);

-- Form Validation Rules Table (for future use)
CREATE TABLE IF NOT EXISTS form_validation_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    form_id VARCHAR(64) NOT NULL,
    field_name VARCHAR(128) NOT NULL,
    validation_type VARCHAR(32) NOT NULL, -- 'required', 'email', 'phone', 'custom'
    validation_config JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for form_validation_rules table
CREATE INDEX IF NOT EXISTS idx_validation_rules_tenant_id ON form_validation_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_validation_rules_project_id ON form_validation_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_validation_rules_form_id ON form_validation_rules(form_id);
CREATE INDEX IF NOT EXISTS idx_validation_rules_field_name ON form_validation_rules(field_name);
CREATE INDEX IF NOT EXISTS idx_validation_rules_validation_type ON form_validation_rules(validation_type);
CREATE INDEX IF NOT EXISTS idx_validation_rules_is_active ON form_validation_rules(is_active);

-- =============================================================================
-- TRIGGERS AND FUNCTIONS
-- =============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at for form_submissions
DROP TRIGGER IF EXISTS update_form_submissions_updated_at ON form_submissions;
CREATE TRIGGER update_form_submissions_updated_at
    BEFORE UPDATE ON form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at for form_templates
DROP TRIGGER IF EXISTS update_form_templates_updated_at ON form_templates;
CREATE TRIGGER update_form_templates_updated_at
    BEFORE UPDATE ON form_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at for form_validation_rules
DROP TRIGGER IF EXISTS update_form_validation_rules_updated_at ON form_validation_rules;
CREATE TRIGGER update_form_validation_rules_updated_at
    BEFORE UPDATE ON form_validation_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View for recent submissions with project information
CREATE OR REPLACE VIEW recent_submissions AS
SELECT 
    fs.id,
    fs.tenant_id,
    fs.project_id,
    fs.project_name,
    fs.project_category,
    fs.form_id,
    fs.user_id,
    fs.source,
    fs.status,
    fs.event_date,
    fs.created_at,
    fs.updated_at,
    jsonb_array_length(fs.data) as data_field_count
FROM form_submissions fs
ORDER BY fs.created_at DESC;

-- View for submission statistics by project
CREATE OR REPLACE VIEW submission_stats_by_project AS
SELECT 
    tenant_id,
    project_id,
    project_name,
    project_category,
    COUNT(*) as total_submissions,
    COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_count,
    COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
    MIN(created_at) as first_submission,
    MAX(created_at) as last_submission
FROM form_submissions
GROUP BY tenant_id, project_id, project_name, project_category;

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

-- This will be displayed when the script completes
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'HALO BACKEND DATABASE SCHEMA CREATED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created:';
    RAISE NOTICE '- form_submissions (main submissions table)';
    RAISE NOTICE '- submission_activity_log (activity tracking)';
    RAISE NOTICE '- form_templates (template management)';
    RAISE NOTICE '- form_validation_rules (validation rules)';
    RAISE NOTICE '';
    RAISE NOTICE 'Views created:';
    RAISE NOTICE '- recent_submissions (recent submissions view)';
    RAISE NOTICE '- submission_stats_by_project (project statistics)';
    RAISE NOTICE '';
    RAISE NOTICE 'Triggers created:';
    RAISE NOTICE '- Auto-update timestamps for all tables';
    RAISE NOTICE '';
    RAISE NOTICE 'Database is ready for use!';
    RAISE NOTICE '========================================';
END $$;
