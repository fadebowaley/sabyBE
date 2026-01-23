-- =============================================================================
-- PRODUCTION TABLES FOR FAIL-SAFE SYSTEM
-- Created: October 23, 2025
-- Purpose: Dead Letter Queue, System Alerts, Idempotency Cache
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- DEAD LETTER QUEUE (DLQ) TABLE
-- =============================================================================
-- Stores permanently failed jobs for analysis and recovery

CREATE TABLE IF NOT EXISTS dead_letter_queue (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job information
    job_id VARCHAR(255) UNIQUE NOT NULL,
    queue_name VARCHAR(100) NOT NULL,
    job_data JSONB NOT NULL,
    
    -- Error information
    error_message TEXT,
    error_stack TEXT,
    attempts INTEGER DEFAULT 0,
    failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- For filtering/analysis
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    user_id VARCHAR(64),
    
    -- Recovery tracking
    recovered BOOLEAN DEFAULT FALSE,
    recovered_at TIMESTAMP WITH TIME ZONE,
    recovered_by VARCHAR(64),
    recovery_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for dead_letter_queue
CREATE INDEX IF NOT EXISTS idx_dlq_tenant_id ON dead_letter_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_queue_name ON dead_letter_queue(queue_name);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dead_letter_queue(failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_recovered ON dead_letter_queue(recovered);
CREATE INDEX IF NOT EXISTS idx_dlq_job_id ON dead_letter_queue(job_id);
CREATE INDEX IF NOT EXISTS idx_dlq_created_at ON dead_letter_queue(created_at);

-- =============================================================================
-- SYSTEM ALERTS TABLE
-- =============================================================================
-- Stores system alerts for monitoring and debugging

CREATE TABLE IF NOT EXISTS system_alerts (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Alert information
    level VARCHAR(20) NOT NULL, -- CRITICAL, WARNING, INFO
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    error_message TEXT,
    
    -- Context
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    user_id VARCHAR(64),
    
    -- Resolution tracking
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(64),
    resolution_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for system_alerts
CREATE INDEX IF NOT EXISTS idx_alerts_level ON system_alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON system_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON system_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_id ON system_alerts(tenant_id);

-- =============================================================================
-- IDEMPOTENCY CACHE TABLE
-- =============================================================================
-- Prevents duplicate processing of same request
-- Note: Can use Redis instead for better performance

CREATE TABLE IF NOT EXISTS idempotency_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Idempotency key
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    
    -- Result
    job_id VARCHAR(255),
    result JSONB,
    
    -- Expiration
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for idempotency_cache
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_cache(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant ON idempotency_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_cache(expires_at);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('dead_letter_queue', 'system_alerts', 'idempotency_cache')
ORDER BY table_name;

-- Verify columns
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('dead_letter_queue', 'system_alerts', 'idempotency_cache')
ORDER BY table_name, ordinal_position;


