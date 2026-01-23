-- =============================================================================
-- SYNC MISSING TABLES TO REMOTE SERVER
-- =============================================================================
-- Migration: 007
-- Purpose: Create missing tables on remote server to match local schema
-- Author: Saby Backend Team
-- Date: 2025-11-24
-- =============================================================================
-- This migration ensures remote server has all required tables:
-- 1. form_field_catalog
-- 2. dead_letter_queue
-- 3. idempotency_cache
-- 4. notification_queue_perm
-- 5. system_alerts
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. FORM FIELD CATALOG TABLE
-- =============================================================================
-- Purpose: Catalog of form fields for submission processing and analytics

CREATE TABLE IF NOT EXISTS form_field_catalog (
    catalog_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64),
    form_id VARCHAR(64),
    field_id VARCHAR(64),
    field_key VARCHAR(64) NOT NULL,
    field_label TEXT,
    field_type TEXT,
    is_required BOOLEAN DEFAULT false,
    options JSONB DEFAULT '[]'::jsonb,
    aliases JSONB DEFAULT '[]'::jsonb,
    transformations JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    catalog_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT form_field_catalog_project_field_idx UNIQUE (project_id, field_key)
);

-- Indexes for form_field_catalog
CREATE INDEX IF NOT EXISTS idx_form_field_catalog_project_id ON form_field_catalog(project_id);
CREATE INDEX IF NOT EXISTS idx_form_field_catalog_tenant_id ON form_field_catalog(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_field_catalog_form_id ON form_field_catalog(form_id);
CREATE INDEX IF NOT EXISTS idx_form_field_catalog_field_key ON form_field_catalog(field_key);

COMMENT ON TABLE form_field_catalog IS 'Catalog of form fields for submission processing and analytics';

-- =============================================================================
-- 2. DEAD LETTER QUEUE TABLE
-- =============================================================================
-- Purpose: Store permanently failed jobs for analysis and recovery

CREATE TABLE IF NOT EXISTS dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id VARCHAR(255) NOT NULL UNIQUE,
    queue_name VARCHAR(100) NOT NULL,
    job_data JSONB NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    attempts INTEGER DEFAULT 0,
    failed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    user_id VARCHAR(64),
    recovered BOOLEAN DEFAULT false,
    recovered_at TIMESTAMP WITH TIME ZONE,
    recovered_by VARCHAR(64),
    recovery_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for dead_letter_queue
CREATE INDEX IF NOT EXISTS idx_dlq_job_id ON dead_letter_queue(job_id);
CREATE INDEX IF NOT EXISTS idx_dlq_queue_name ON dead_letter_queue(queue_name);
CREATE INDEX IF NOT EXISTS idx_dlq_tenant_id ON dead_letter_queue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at ON dead_letter_queue(failed_at);
CREATE INDEX IF NOT EXISTS idx_dlq_created_at ON dead_letter_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_dlq_recovered ON dead_letter_queue(recovered);

COMMENT ON TABLE dead_letter_queue IS 'Store permanently failed jobs for analysis and recovery';

-- =============================================================================
-- 3. IDEMPOTENCY CACHE TABLE
-- =============================================================================
-- Purpose: Prevent duplicate submissions using idempotency keys

CREATE TABLE IF NOT EXISTS idempotency_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    tenant_id VARCHAR(64) NOT NULL,
    job_id VARCHAR(255),
    result JSONB,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for idempotency_cache
CREATE INDEX IF NOT EXISTS idx_idempotency_key ON idempotency_cache(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_tenant ON idempotency_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_cache(expires_at);

COMMENT ON TABLE idempotency_cache IS 'Prevent duplicate submissions using idempotency keys';

-- =============================================================================
-- 4. NOTIFICATION QUEUE PERM TABLE
-- =============================================================================
-- Purpose: Queue PERM-specific compliance notifications

CREATE TABLE IF NOT EXISTS notification_queue_perm (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    month DATE NOT NULL,
    notification_type VARCHAR(64) NOT NULL,
    priority VARCHAR(16) DEFAULT 'normal',
    recipient_user_id VARCHAR(64) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(255),
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    html_message TEXT,
    data JSONB DEFAULT '{}',
    status VARCHAR(32) DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failed_reason TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    delivery_metadata JSONB DEFAULT '{}',
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) DEFAULT 'system'
);

-- Indexes for notification_queue_perm
CREATE INDEX IF NOT EXISTS idx_notif_perm_tenant ON notification_queue_perm(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_perm_project ON notification_queue_perm(project_id);
CREATE INDEX IF NOT EXISTS idx_notif_perm_node ON notification_queue_perm(node_id);
CREATE INDEX IF NOT EXISTS idx_notif_perm_month ON notification_queue_perm(month);
CREATE INDEX IF NOT EXISTS idx_notif_perm_status ON notification_queue_perm(status);
CREATE INDEX IF NOT EXISTS idx_notif_perm_type ON notification_queue_perm(notification_type);
CREATE INDEX IF NOT EXISTS idx_notif_perm_priority ON notification_queue_perm(priority);
CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_user ON notification_queue_perm(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notif_perm_scheduled ON notification_queue_perm(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notif_perm_created ON notification_queue_perm(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_perm_expired ON notification_queue_perm(expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_perm_data ON notification_queue_perm USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_notif_perm_delivery_metadata ON notification_queue_perm USING gin (delivery_metadata jsonb_path_ops);

COMMENT ON TABLE notification_queue_perm IS 'Queue for PERM compliance notifications (reminders, alerts, summaries)';

-- =============================================================================
-- 5. SYSTEM ALERTS TABLE
-- =============================================================================
-- Purpose: Store system-level alerts and notifications

CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    level VARCHAR(20) NOT NULL,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    error_message TEXT,
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    user_id VARCHAR(64),
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(64),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for system_alerts
CREATE INDEX IF NOT EXISTS idx_alerts_level ON system_alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_id ON system_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON system_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON system_alerts(created_at);

COMMENT ON TABLE system_alerts IS 'Store system-level alerts and notifications';

-- =============================================================================
-- COMPLETION MESSAGE
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MISSING TABLES SYNC COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created/verified:';
    RAISE NOTICE '- form_field_catalog';
    RAISE NOTICE '- dead_letter_queue';
    RAISE NOTICE '- idempotency_cache';
    RAISE NOTICE '- notification_queue_perm';
    RAISE NOTICE '- system_alerts';
    RAISE NOTICE '';
    RAISE NOTICE 'Remote server schema is now synchronized!';
    RAISE NOTICE '========================================';
END $$;

