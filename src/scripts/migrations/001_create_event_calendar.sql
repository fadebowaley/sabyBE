-- =============================================================================
-- PERM (Per Event Reporting Model) - Event Calendar Table
-- =============================================================================
-- Migration: 001
-- Purpose: Create event_calendar table for managing valid event dates per month
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- EVENT CALENDAR TABLE
-- =============================================================================
-- Purpose: Define valid event dates for each month per project
-- Key Concept: One entry per tenant/project/month/event_type
-- Example: September 2025 Sunday events for "growth_tracker" project

CREATE TABLE IF NOT EXISTS event_calendar (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    
    -- Time period
    month DATE NOT NULL, -- First day of month: '2025-09-01'
    year INT NOT NULL,
    
    -- Event configuration
    event_type VARCHAR(64) NOT NULL, -- 'sunday_event', 'monday_event', 'delivery_day', etc.
    event_name VARCHAR(128), -- Human-readable: 'Sunday Service', 'Weekly Meeting'
    day_of_week INT, -- 0=Sunday, 1=Monday, ..., 6=Saturday
    frequency VARCHAR(32) DEFAULT 'weekly', -- 'daily', 'weekly', 'biweekly', 'monthly'
    
    -- Event dates for the month
    event_dates JSONB NOT NULL, -- ["2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28"]
    total_events INT NOT NULL, -- Count of dates in event_dates array
    
    -- Configuration
    is_required BOOLEAN DEFAULT true, -- Must be submitted for compliance
    is_active BOOLEAN DEFAULT true, -- Calendar is active
    
    -- Metadata
    description TEXT, -- Optional description
    metadata JSONB DEFAULT '{}', -- Additional configuration
    
    -- Audit fields
    created_by VARCHAR(64), -- User who created the calendar
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one calendar entry per tenant/project/month/event_type
    CONSTRAINT uq_event_calendar_unique UNIQUE(tenant_id, project_id, month, event_type)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant 
    ON event_calendar(tenant_id);

CREATE INDEX IF NOT EXISTS idx_event_calendar_project 
    ON event_calendar(project_id);

CREATE INDEX IF NOT EXISTS idx_event_calendar_month 
    ON event_calendar(month);

CREATE INDEX IF NOT EXISTS idx_event_calendar_year 
    ON event_calendar(year);

CREATE INDEX IF NOT EXISTS idx_event_calendar_event_type 
    ON event_calendar(event_type);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant_project_month 
    ON event_calendar(tenant_id, project_id, month);

CREATE INDEX IF NOT EXISTS idx_event_calendar_month_year 
    ON event_calendar(month, year);

-- Active calendar lookup
CREATE INDEX IF NOT EXISTS idx_event_calendar_active 
    ON event_calendar(is_active) 
    WHERE is_active = true;

-- Required events lookup
CREATE INDEX IF NOT EXISTS idx_event_calendar_required 
    ON event_calendar(is_required) 
    WHERE is_required = true;

-- GIN index for JSONB queries (event_dates array)
CREATE INDEX IF NOT EXISTS idx_event_calendar_dates 
    ON event_calendar USING gin (event_dates jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE event_calendar IS 'Stores valid event dates for PERM (Per Event Reporting Model) compliance tracking';
COMMENT ON COLUMN event_calendar.event_dates IS 'JSONB array of valid event dates for the month, e.g., ["2025-09-07", "2025-09-14"]';
COMMENT ON COLUMN event_calendar.total_events IS 'Count of dates in event_dates array (for quick compliance calculation)';
COMMENT ON COLUMN event_calendar.is_required IS 'Whether this event type is required for 100% compliance';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: September 2025 calendar for growth_tracker project
-- INSERT INTO event_calendar (tenant_id, project_id, month, year, event_type, event_name, day_of_week, event_dates, total_events, is_required)
-- VALUES 
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'sunday_event', 'Sunday Service', 0, '["2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28"]', 4, true),
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'monday_event', 'Bible Study', 1, '["2025-09-01", "2025-09-08", "2025-09-15", "2025-09-22", "2025-09-29"]', 5, true),
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'thursday_event', 'Prayer Meeting', 4, '["2025-09-03", "2025-09-10", "2025-09-17", "2025-09-24"]', 4, true);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Event Calendar Table
-- =============================================================================
-- Migration: 001
-- Purpose: Create event_calendar table for managing valid event dates per month
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- EVENT CALENDAR TABLE
-- =============================================================================
-- Purpose: Define valid event dates for each month per project
-- Key Concept: One entry per tenant/project/month/event_type
-- Example: September 2025 Sunday events for "growth_tracker" project

CREATE TABLE IF NOT EXISTS event_calendar (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    
    -- Time period
    month DATE NOT NULL, -- First day of month: '2025-09-01'
    year INT NOT NULL,
    
    -- Event configuration
    event_type VARCHAR(64) NOT NULL, -- 'sunday_event', 'monday_event', 'delivery_day', etc.
    event_name VARCHAR(128), -- Human-readable: 'Sunday Service', 'Weekly Meeting'
    day_of_week INT, -- 0=Sunday, 1=Monday, ..., 6=Saturday
    frequency VARCHAR(32) DEFAULT 'weekly', -- 'daily', 'weekly', 'biweekly', 'monthly'
    
    -- Event dates for the month
    event_dates JSONB NOT NULL, -- ["2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28"]
    total_events INT NOT NULL, -- Count of dates in event_dates array
    
    -- Configuration
    is_required BOOLEAN DEFAULT true, -- Must be submitted for compliance
    is_active BOOLEAN DEFAULT true, -- Calendar is active
    
    -- Metadata
    description TEXT, -- Optional description
    metadata JSONB DEFAULT '{}', -- Additional configuration
    
    -- Audit fields
    created_by VARCHAR(64), -- User who created the calendar
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one calendar entry per tenant/project/month/event_type
    CONSTRAINT uq_event_calendar_unique UNIQUE(tenant_id, project_id, month, event_type)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant 
    ON event_calendar(tenant_id);

CREATE INDEX IF NOT EXISTS idx_event_calendar_project 
    ON event_calendar(project_id);

CREATE INDEX IF NOT EXISTS idx_event_calendar_month 
    ON event_calendar(month);

CREATE INDEX IF NOT EXISTS idx_event_calendar_year 
    ON event_calendar(year);

CREATE INDEX IF NOT EXISTS idx_event_calendar_event_type 
    ON event_calendar(event_type);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant_project_month 
    ON event_calendar(tenant_id, project_id, month);

CREATE INDEX IF NOT EXISTS idx_event_calendar_month_year 
    ON event_calendar(month, year);

-- Active calendar lookup
CREATE INDEX IF NOT EXISTS idx_event_calendar_active 
    ON event_calendar(is_active) 
    WHERE is_active = true;

-- Required events lookup
CREATE INDEX IF NOT EXISTS idx_event_calendar_required 
    ON event_calendar(is_required) 
    WHERE is_required = true;

-- GIN index for JSONB queries (event_dates array)
CREATE INDEX IF NOT EXISTS idx_event_calendar_dates 
    ON event_calendar USING gin (event_dates jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE event_calendar IS 'Stores valid event dates for PERM (Per Event Reporting Model) compliance tracking';
COMMENT ON COLUMN event_calendar.event_dates IS 'JSONB array of valid event dates for the month, e.g., ["2025-09-07", "2025-09-14"]';
COMMENT ON COLUMN event_calendar.total_events IS 'Count of dates in event_dates array (for quick compliance calculation)';
COMMENT ON COLUMN event_calendar.is_required IS 'Whether this event type is required for 100% compliance';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: September 2025 calendar for growth_tracker project
-- INSERT INTO event_calendar (tenant_id, project_id, month, year, event_type, event_name, day_of_week, event_dates, total_events, is_required)
-- VALUES 
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'sunday_event', 'Sunday Service', 0, '["2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28"]', 4, true),
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'monday_event', 'Bible Study', 1, '["2025-09-01", "2025-09-08", "2025-09-15", "2025-09-22", "2025-09-29"]', 5, true),
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'thursday_event', 'Prayer Meeting', 4, '["2025-09-03", "2025-09-10", "2025-09-17", "2025-09-24"]', 4, true);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Event Calendar Table
-- =============================================================================
-- Migration: 001
-- Purpose: Create event_calendar table for managing valid event dates per month
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- EVENT CALENDAR TABLE
-- =============================================================================
-- Purpose: Define valid event dates for each month per project
-- Key Concept: One entry per tenant/project/month/event_type
-- Example: September 2025 Sunday events for "growth_tracker" project

CREATE TABLE IF NOT EXISTS event_calendar (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    
    -- Time period
    month DATE NOT NULL, -- First day of month: '2025-09-01'
    year INT NOT NULL,
    
    -- Event configuration
    event_type VARCHAR(64) NOT NULL, -- 'sunday_event', 'monday_event', 'delivery_day', etc.
    event_name VARCHAR(128), -- Human-readable: 'Sunday Service', 'Weekly Meeting'
    day_of_week INT, -- 0=Sunday, 1=Monday, ..., 6=Saturday
    frequency VARCHAR(32) DEFAULT 'weekly', -- 'daily', 'weekly', 'biweekly', 'monthly'
    
    -- Event dates for the month
    event_dates JSONB NOT NULL, -- ["2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28"]
    total_events INT NOT NULL, -- Count of dates in event_dates array
    
    -- Configuration
    is_required BOOLEAN DEFAULT true, -- Must be submitted for compliance
    is_active BOOLEAN DEFAULT true, -- Calendar is active
    
    -- Metadata
    description TEXT, -- Optional description
    metadata JSONB DEFAULT '{}', -- Additional configuration
    
    -- Audit fields
    created_by VARCHAR(64), -- User who created the calendar
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: one calendar entry per tenant/project/month/event_type
    CONSTRAINT uq_event_calendar_unique UNIQUE(tenant_id, project_id, month, event_type)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant 
    ON event_calendar(tenant_id);

CREATE INDEX IF NOT EXISTS idx_event_calendar_project 
    ON event_calendar(project_id);

CREATE INDEX IF NOT EXISTS idx_event_calendar_month 
    ON event_calendar(month);

CREATE INDEX IF NOT EXISTS idx_event_calendar_year 
    ON event_calendar(year);

CREATE INDEX IF NOT EXISTS idx_event_calendar_event_type 
    ON event_calendar(event_type);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_calendar_tenant_project_month 
    ON event_calendar(tenant_id, project_id, month);

CREATE INDEX IF NOT EXISTS idx_event_calendar_month_year 
    ON event_calendar(month, year);

-- Active calendar lookup
CREATE INDEX IF NOT EXISTS idx_event_calendar_active 
    ON event_calendar(is_active) 
    WHERE is_active = true;

-- Required events lookup
CREATE INDEX IF NOT EXISTS idx_event_calendar_required 
    ON event_calendar(is_required) 
    WHERE is_required = true;

-- GIN index for JSONB queries (event_dates array)
CREATE INDEX IF NOT EXISTS idx_event_calendar_dates 
    ON event_calendar USING gin (event_dates jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE event_calendar IS 'Stores valid event dates for PERM (Per Event Reporting Model) compliance tracking';
COMMENT ON COLUMN event_calendar.event_dates IS 'JSONB array of valid event dates for the month, e.g., ["2025-09-07", "2025-09-14"]';
COMMENT ON COLUMN event_calendar.total_events IS 'Count of dates in event_dates array (for quick compliance calculation)';
COMMENT ON COLUMN event_calendar.is_required IS 'Whether this event type is required for 100% compliance';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: September 2025 calendar for growth_tracker project
-- INSERT INTO event_calendar (tenant_id, project_id, month, year, event_type, event_name, day_of_week, event_dates, total_events, is_required)
-- VALUES 
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'sunday_event', 'Sunday Service', 0, '["2025-09-07", "2025-09-14", "2025-09-21", "2025-09-28"]', 4, true),
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'monday_event', 'Bible Study', 1, '["2025-09-01", "2025-09-08", "2025-09-15", "2025-09-22", "2025-09-29"]', 5, true),
--   ('rccg_global', 'growth_tracker', '2025-09-01', 2025, 'thursday_event', 'Prayer Meeting', 4, '["2025-09-03", "2025-09-10", "2025-09-17", "2025-09-24"]', 4, true);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


