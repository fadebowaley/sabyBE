-- =============================================================================
-- PERM (Per Event Reporting Model) - Event Compliance Tracking Table
-- =============================================================================
-- Migration: 002
-- Purpose: Track compliance metrics per node per month
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- EVENT COMPLIANCE TRACKING TABLE
-- =============================================================================
-- Purpose: Track compliance status and metrics for each node's monthly submission
-- Key Concept: One entry per tenant/project/node/month
-- Updates: Automatically updated when submission changes

CREATE TABLE IF NOT EXISTS event_compliance_tracking (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to submission
    submission_id UUID, -- References form_submissions(id), but nullable for pre-creation
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    
    -- Time period
    month DATE NOT NULL, -- First day of month: '2025-09-01'
    year INT NOT NULL,
    
    -- Compliance metrics
    total_events_required INT NOT NULL DEFAULT 0, -- From event_calendar
    total_events_submitted INT NOT NULL DEFAULT 0, -- From submission data
    completeness_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- 0.00 to 100.00
    compliance_status VARCHAR(32) NOT NULL DEFAULT 'incomplete', -- 'incomplete', 'partial', 'complete'
    
    -- Per-event type breakdown
    events_breakdown JSONB NOT NULL DEFAULT '{}', 
    -- Example: { 
    --   "sunday_event": { "required": 4, "submitted": 3, "missing": 1, "percentage": 75.00 },
    --   "monday_event": { "required": 5, "submitted": 5, "missing": 0, "percentage": 100.00 }
    -- }
    
    -- Week-by-week progress tracking
    weekly_progress JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "week": 1, "events_submitted": 3, "cumulative_percentage": 23.08 },
    --   { "week": 2, "events_submitted": 3, "cumulative_percentage": 46.15 },
    --   { "week": 3, "events_submitted": 3, "cumulative_percentage": 69.23 },
    --   { "week": 4, "events_submitted": 4, "cumulative_percentage": 100.00 }
    -- ]
    
    -- Missing events tracking
    missing_events JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "event_type": "sunday_event", "expected_date": "2025-09-28", "status": "not_submitted" }
    -- ]
    
    -- Notifications tracking
    notifications_sent JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "type": "weekly_reminder", "sent_at": "2025-09-12T18:00:00Z", "week": 2 },
    --   { "type": "completion_confirmation", "sent_at": "2025-09-30T10:00:00Z" }
    -- ]
    
    -- Locking mechanism
    is_locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by VARCHAR(64), -- User ID who locked (or 'system' for auto-lock)
    lock_reason VARCHAR(255), -- 'month_end', 'manual_lock', 'admin_lock'
    
    -- Calculation metadata
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_version VARCHAR(16) DEFAULT '1.0.0', -- For tracking calculation logic changes
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one tracking entry per tenant/project/node/month
    CONSTRAINT uq_compliance_tracking_unique UNIQUE(tenant_id, project_id, node_id, month)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_compliance_tenant 
    ON event_compliance_tracking(tenant_id);

CREATE INDEX IF NOT EXISTS idx_compliance_project 
    ON event_compliance_tracking(project_id);

CREATE INDEX IF NOT EXISTS idx_compliance_node 
    ON event_compliance_tracking(node_id);

CREATE INDEX IF NOT EXISTS idx_compliance_month 
    ON event_compliance_tracking(month);

CREATE INDEX IF NOT EXISTS idx_compliance_year 
    ON event_compliance_tracking(year);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_tenant_project_month 
    ON event_compliance_tracking(tenant_id, project_id, month);

CREATE INDEX IF NOT EXISTS idx_compliance_node_month 
    ON event_compliance_tracking(node_id, month);

CREATE INDEX IF NOT EXISTS idx_compliance_tenant_node_month 
    ON event_compliance_tracking(tenant_id, node_id, month);

-- Status and filtering indexes
CREATE INDEX IF NOT EXISTS idx_compliance_status 
    ON event_compliance_tracking(compliance_status);

CREATE INDEX IF NOT EXISTS idx_compliance_locked 
    ON event_compliance_tracking(is_locked);

CREATE INDEX IF NOT EXISTS idx_compliance_percentage 
    ON event_compliance_tracking(completeness_percentage);

-- Incomplete submissions lookup (for reminders)
CREATE INDEX IF NOT EXISTS idx_compliance_incomplete 
    ON event_compliance_tracking(tenant_id, project_id, month) 
    WHERE compliance_status != 'complete' AND is_locked = false;

-- Unlocked submissions for month-end processing
CREATE INDEX IF NOT EXISTS idx_compliance_unlocked 
    ON event_compliance_tracking(month) 
    WHERE is_locked = false;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_compliance_events_breakdown 
    ON event_compliance_tracking USING gin (events_breakdown jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_compliance_weekly_progress 
    ON event_compliance_tracking USING gin (weekly_progress jsonb_path_ops);

-- Foreign key index (if submission_id is set)
CREATE INDEX IF NOT EXISTS idx_compliance_submission 
    ON event_compliance_tracking(submission_id) 
    WHERE submission_id IS NOT NULL;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE event_compliance_tracking IS 'Tracks compliance metrics for PERM submissions (one entry per node per month)';
COMMENT ON COLUMN event_compliance_tracking.completeness_percentage IS 'Percentage of required events submitted (0.00 to 100.00)';
COMMENT ON COLUMN event_compliance_tracking.events_breakdown IS 'JSONB object tracking each event type (required, submitted, missing, percentage)';
COMMENT ON COLUMN event_compliance_tracking.weekly_progress IS 'JSONB array tracking weekly cumulative progress';
COMMENT ON COLUMN event_compliance_tracking.is_locked IS 'Whether this month is locked (no further submissions allowed)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: September 2025 compliance tracking for Lagos_Central node
-- INSERT INTO event_compliance_tracking (
--   tenant_id, project_id, node_id, month, year,
--   total_events_required, total_events_submitted, completeness_percentage, compliance_status,
--   events_breakdown, weekly_progress, is_locked
-- ) VALUES (
--   'rccg_global', 'growth_tracker', 'Lagos_Central', '2025-09-01', 2025,
--   13, 13, 100.00, 'complete',
--   '{"sunday_event": {"required": 4, "submitted": 4, "missing": 0, "percentage": 100.00}}'::jsonb,
--   '[{"week": 1, "events_submitted": 3, "cumulative_percentage": 23.08}]'::jsonb,
--   false
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Event Compliance Tracking Table
-- =============================================================================
-- Migration: 002
-- Purpose: Track compliance metrics per node per month
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- EVENT COMPLIANCE TRACKING TABLE
-- =============================================================================
-- Purpose: Track compliance status and metrics for each node's monthly submission
-- Key Concept: One entry per tenant/project/node/month
-- Updates: Automatically updated when submission changes

CREATE TABLE IF NOT EXISTS event_compliance_tracking (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to submission
    submission_id UUID, -- References form_submissions(id), but nullable for pre-creation
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    
    -- Time period
    month DATE NOT NULL, -- First day of month: '2025-09-01'
    year INT NOT NULL,
    
    -- Compliance metrics
    total_events_required INT NOT NULL DEFAULT 0, -- From event_calendar
    total_events_submitted INT NOT NULL DEFAULT 0, -- From submission data
    completeness_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- 0.00 to 100.00
    compliance_status VARCHAR(32) NOT NULL DEFAULT 'incomplete', -- 'incomplete', 'partial', 'complete'
    
    -- Per-event type breakdown
    events_breakdown JSONB NOT NULL DEFAULT '{}', 
    -- Example: { 
    --   "sunday_event": { "required": 4, "submitted": 3, "missing": 1, "percentage": 75.00 },
    --   "monday_event": { "required": 5, "submitted": 5, "missing": 0, "percentage": 100.00 }
    -- }
    
    -- Week-by-week progress tracking
    weekly_progress JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "week": 1, "events_submitted": 3, "cumulative_percentage": 23.08 },
    --   { "week": 2, "events_submitted": 3, "cumulative_percentage": 46.15 },
    --   { "week": 3, "events_submitted": 3, "cumulative_percentage": 69.23 },
    --   { "week": 4, "events_submitted": 4, "cumulative_percentage": 100.00 }
    -- ]
    
    -- Missing events tracking
    missing_events JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "event_type": "sunday_event", "expected_date": "2025-09-28", "status": "not_submitted" }
    -- ]
    
    -- Notifications tracking
    notifications_sent JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "type": "weekly_reminder", "sent_at": "2025-09-12T18:00:00Z", "week": 2 },
    --   { "type": "completion_confirmation", "sent_at": "2025-09-30T10:00:00Z" }
    -- ]
    
    -- Locking mechanism
    is_locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by VARCHAR(64), -- User ID who locked (or 'system' for auto-lock)
    lock_reason VARCHAR(255), -- 'month_end', 'manual_lock', 'admin_lock'
    
    -- Calculation metadata
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_version VARCHAR(16) DEFAULT '1.0.0', -- For tracking calculation logic changes
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one tracking entry per tenant/project/node/month
    CONSTRAINT uq_compliance_tracking_unique UNIQUE(tenant_id, project_id, node_id, month)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_compliance_tenant 
    ON event_compliance_tracking(tenant_id);

CREATE INDEX IF NOT EXISTS idx_compliance_project 
    ON event_compliance_tracking(project_id);

CREATE INDEX IF NOT EXISTS idx_compliance_node 
    ON event_compliance_tracking(node_id);

CREATE INDEX IF NOT EXISTS idx_compliance_month 
    ON event_compliance_tracking(month);

CREATE INDEX IF NOT EXISTS idx_compliance_year 
    ON event_compliance_tracking(year);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_tenant_project_month 
    ON event_compliance_tracking(tenant_id, project_id, month);

CREATE INDEX IF NOT EXISTS idx_compliance_node_month 
    ON event_compliance_tracking(node_id, month);

CREATE INDEX IF NOT EXISTS idx_compliance_tenant_node_month 
    ON event_compliance_tracking(tenant_id, node_id, month);

-- Status and filtering indexes
CREATE INDEX IF NOT EXISTS idx_compliance_status 
    ON event_compliance_tracking(compliance_status);

CREATE INDEX IF NOT EXISTS idx_compliance_locked 
    ON event_compliance_tracking(is_locked);

CREATE INDEX IF NOT EXISTS idx_compliance_percentage 
    ON event_compliance_tracking(completeness_percentage);

-- Incomplete submissions lookup (for reminders)
CREATE INDEX IF NOT EXISTS idx_compliance_incomplete 
    ON event_compliance_tracking(tenant_id, project_id, month) 
    WHERE compliance_status != 'complete' AND is_locked = false;

-- Unlocked submissions for month-end processing
CREATE INDEX IF NOT EXISTS idx_compliance_unlocked 
    ON event_compliance_tracking(month) 
    WHERE is_locked = false;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_compliance_events_breakdown 
    ON event_compliance_tracking USING gin (events_breakdown jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_compliance_weekly_progress 
    ON event_compliance_tracking USING gin (weekly_progress jsonb_path_ops);

-- Foreign key index (if submission_id is set)
CREATE INDEX IF NOT EXISTS idx_compliance_submission 
    ON event_compliance_tracking(submission_id) 
    WHERE submission_id IS NOT NULL;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE event_compliance_tracking IS 'Tracks compliance metrics for PERM submissions (one entry per node per month)';
COMMENT ON COLUMN event_compliance_tracking.completeness_percentage IS 'Percentage of required events submitted (0.00 to 100.00)';
COMMENT ON COLUMN event_compliance_tracking.events_breakdown IS 'JSONB object tracking each event type (required, submitted, missing, percentage)';
COMMENT ON COLUMN event_compliance_tracking.weekly_progress IS 'JSONB array tracking weekly cumulative progress';
COMMENT ON COLUMN event_compliance_tracking.is_locked IS 'Whether this month is locked (no further submissions allowed)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: September 2025 compliance tracking for Lagos_Central node
-- INSERT INTO event_compliance_tracking (
--   tenant_id, project_id, node_id, month, year,
--   total_events_required, total_events_submitted, completeness_percentage, compliance_status,
--   events_breakdown, weekly_progress, is_locked
-- ) VALUES (
--   'rccg_global', 'growth_tracker', 'Lagos_Central', '2025-09-01', 2025,
--   13, 13, 100.00, 'complete',
--   '{"sunday_event": {"required": 4, "submitted": 4, "missing": 0, "percentage": 100.00}}'::jsonb,
--   '[{"week": 1, "events_submitted": 3, "cumulative_percentage": 23.08}]'::jsonb,
--   false
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Event Compliance Tracking Table
-- =============================================================================
-- Migration: 002
-- Purpose: Track compliance metrics per node per month
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- EVENT COMPLIANCE TRACKING TABLE
-- =============================================================================
-- Purpose: Track compliance status and metrics for each node's monthly submission
-- Key Concept: One entry per tenant/project/node/month
-- Updates: Automatically updated when submission changes

CREATE TABLE IF NOT EXISTS event_compliance_tracking (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Link to submission
    submission_id UUID, -- References form_submissions(id), but nullable for pre-creation
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    
    -- Time period
    month DATE NOT NULL, -- First day of month: '2025-09-01'
    year INT NOT NULL,
    
    -- Compliance metrics
    total_events_required INT NOT NULL DEFAULT 0, -- From event_calendar
    total_events_submitted INT NOT NULL DEFAULT 0, -- From submission data
    completeness_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00, -- 0.00 to 100.00
    compliance_status VARCHAR(32) NOT NULL DEFAULT 'incomplete', -- 'incomplete', 'partial', 'complete'
    
    -- Per-event type breakdown
    events_breakdown JSONB NOT NULL DEFAULT '{}', 
    -- Example: { 
    --   "sunday_event": { "required": 4, "submitted": 3, "missing": 1, "percentage": 75.00 },
    --   "monday_event": { "required": 5, "submitted": 5, "missing": 0, "percentage": 100.00 }
    -- }
    
    -- Week-by-week progress tracking
    weekly_progress JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "week": 1, "events_submitted": 3, "cumulative_percentage": 23.08 },
    --   { "week": 2, "events_submitted": 3, "cumulative_percentage": 46.15 },
    --   { "week": 3, "events_submitted": 3, "cumulative_percentage": 69.23 },
    --   { "week": 4, "events_submitted": 4, "cumulative_percentage": 100.00 }
    -- ]
    
    -- Missing events tracking
    missing_events JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "event_type": "sunday_event", "expected_date": "2025-09-28", "status": "not_submitted" }
    -- ]
    
    -- Notifications tracking
    notifications_sent JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   { "type": "weekly_reminder", "sent_at": "2025-09-12T18:00:00Z", "week": 2 },
    --   { "type": "completion_confirmation", "sent_at": "2025-09-30T10:00:00Z" }
    -- ]
    
    -- Locking mechanism
    is_locked BOOLEAN DEFAULT false,
    locked_at TIMESTAMP WITH TIME ZONE,
    locked_by VARCHAR(64), -- User ID who locked (or 'system' for auto-lock)
    lock_reason VARCHAR(255), -- 'month_end', 'manual_lock', 'admin_lock'
    
    -- Calculation metadata
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculation_version VARCHAR(16) DEFAULT '1.0.0', -- For tracking calculation logic changes
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one tracking entry per tenant/project/node/month
    CONSTRAINT uq_compliance_tracking_unique UNIQUE(tenant_id, project_id, node_id, month)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_compliance_tenant 
    ON event_compliance_tracking(tenant_id);

CREATE INDEX IF NOT EXISTS idx_compliance_project 
    ON event_compliance_tracking(project_id);

CREATE INDEX IF NOT EXISTS idx_compliance_node 
    ON event_compliance_tracking(node_id);

CREATE INDEX IF NOT EXISTS idx_compliance_month 
    ON event_compliance_tracking(month);

CREATE INDEX IF NOT EXISTS idx_compliance_year 
    ON event_compliance_tracking(year);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_tenant_project_month 
    ON event_compliance_tracking(tenant_id, project_id, month);

CREATE INDEX IF NOT EXISTS idx_compliance_node_month 
    ON event_compliance_tracking(node_id, month);

CREATE INDEX IF NOT EXISTS idx_compliance_tenant_node_month 
    ON event_compliance_tracking(tenant_id, node_id, month);

-- Status and filtering indexes
CREATE INDEX IF NOT EXISTS idx_compliance_status 
    ON event_compliance_tracking(compliance_status);

CREATE INDEX IF NOT EXISTS idx_compliance_locked 
    ON event_compliance_tracking(is_locked);

CREATE INDEX IF NOT EXISTS idx_compliance_percentage 
    ON event_compliance_tracking(completeness_percentage);

-- Incomplete submissions lookup (for reminders)
CREATE INDEX IF NOT EXISTS idx_compliance_incomplete 
    ON event_compliance_tracking(tenant_id, project_id, month) 
    WHERE compliance_status != 'complete' AND is_locked = false;

-- Unlocked submissions for month-end processing
CREATE INDEX IF NOT EXISTS idx_compliance_unlocked 
    ON event_compliance_tracking(month) 
    WHERE is_locked = false;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_compliance_events_breakdown 
    ON event_compliance_tracking USING gin (events_breakdown jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_compliance_weekly_progress 
    ON event_compliance_tracking USING gin (weekly_progress jsonb_path_ops);

-- Foreign key index (if submission_id is set)
CREATE INDEX IF NOT EXISTS idx_compliance_submission 
    ON event_compliance_tracking(submission_id) 
    WHERE submission_id IS NOT NULL;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE event_compliance_tracking IS 'Tracks compliance metrics for PERM submissions (one entry per node per month)';
COMMENT ON COLUMN event_compliance_tracking.completeness_percentage IS 'Percentage of required events submitted (0.00 to 100.00)';
COMMENT ON COLUMN event_compliance_tracking.events_breakdown IS 'JSONB object tracking each event type (required, submitted, missing, percentage)';
COMMENT ON COLUMN event_compliance_tracking.weekly_progress IS 'JSONB array tracking weekly cumulative progress';
COMMENT ON COLUMN event_compliance_tracking.is_locked IS 'Whether this month is locked (no further submissions allowed)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: September 2025 compliance tracking for Lagos_Central node
-- INSERT INTO event_compliance_tracking (
--   tenant_id, project_id, node_id, month, year,
--   total_events_required, total_events_submitted, completeness_percentage, compliance_status,
--   events_breakdown, weekly_progress, is_locked
-- ) VALUES (
--   'rccg_global', 'growth_tracker', 'Lagos_Central', '2025-09-01', 2025,
--   13, 13, 100.00, 'complete',
--   '{"sunday_event": {"required": 4, "submitted": 4, "missing": 0, "percentage": 100.00}}'::jsonb,
--   '[{"week": 1, "events_submitted": 3, "cumulative_percentage": 23.08}]'::jsonb,
--   false
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


