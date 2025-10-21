-- =============================================================================
-- PERM (Per Event Reporting Model) - Notification Queue Table
-- =============================================================================
-- Migration: 004
-- Purpose: Queue PERM-specific compliance notifications
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- NOTIFICATION QUEUE PERM TABLE
-- =============================================================================
-- Purpose: Queue and track PERM compliance notifications
-- Key Concept: Separate from regular notifications for specialized retry logic

CREATE TABLE IF NOT EXISTS notification_queue_perm (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    month DATE NOT NULL,
    
    -- Notification classification
    notification_type VARCHAR(64) NOT NULL, 
    -- Types: 'incomplete_alert', 'late_submission_warning', 'completion_confirmation', 
    --        'weekly_reminder', 'month_end_summary', 'validation_failure'
    
    priority VARCHAR(16) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    
    -- Recipient information
    recipient_user_id VARCHAR(64) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(255),
    
    -- Message content
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    html_message TEXT, -- Optional HTML version
    
    -- Notification data (context)
    data JSONB DEFAULT '{}',
    -- Example: {
    --   "missing_events": ["sunday_event-2025-09-21", "sunday_event-2025-09-28"],
    --   "completeness_percentage": 61.54,
    --   "events_submitted": 8,
    --   "events_required": 13,
    --   "week": 3
    -- }
    
    -- Delivery status
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failed_reason TEXT,
    
    -- Retry mechanism
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery tracking
    delivery_metadata JSONB DEFAULT '{}',
    -- Example: {
    --   "email_provider": "smtp",
    --   "message_id": "abc123",
    --   "delivery_attempts": [
    --     { "attempt": 1, "timestamp": "...", "result": "failed", "error": "..." }
    --   ]
    -- }
    
    -- Scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- When to send
    expires_at TIMESTAMP WITH TIME ZONE, -- Notification expires if not sent by this time
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) DEFAULT 'system'
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_notif_perm_tenant 
    ON notification_queue_perm(tenant_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_project 
    ON notification_queue_perm(project_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_node 
    ON notification_queue_perm(node_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_month 
    ON notification_queue_perm(month);

-- Status and processing indexes
CREATE INDEX IF NOT EXISTS idx_notif_perm_status 
    ON notification_queue_perm(status);

CREATE INDEX IF NOT EXISTS idx_notif_perm_type 
    ON notification_queue_perm(notification_type);

CREATE INDEX IF NOT EXISTS idx_notif_perm_priority 
    ON notification_queue_perm(priority);

-- Recipient lookup
CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_user 
    ON notification_queue_perm(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_email 
    ON notification_queue_perm(recipient_email);

-- Composite indexes for worker queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_pending 
    ON notification_queue_perm(status, scheduled_for) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notif_perm_retry 
    ON notification_queue_perm(status, next_retry_at) 
    WHERE status = 'failed' AND retry_count < max_retries;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_scheduled 
    ON notification_queue_perm(scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notif_perm_created 
    ON notification_queue_perm(created_at DESC);

-- Expired notifications cleanup
CREATE INDEX IF NOT EXISTS idx_notif_perm_expired 
    ON notification_queue_perm(expires_at) 
    WHERE status = 'pending' AND expires_at IS NOT NULL;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_data 
    ON notification_queue_perm USING gin (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_notif_perm_delivery_metadata 
    ON notification_queue_perm USING gin (delivery_metadata jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE notification_queue_perm IS 'Queue for PERM compliance notifications (reminders, alerts, summaries)';
COMMENT ON COLUMN notification_queue_perm.notification_type IS 'Type: incomplete_alert, late_submission_warning, completion_confirmation, weekly_reminder, month_end_summary';
COMMENT ON COLUMN notification_queue_perm.data IS 'JSONB context data (missing events, percentages, metrics)';
COMMENT ON COLUMN notification_queue_perm.retry_count IS 'Number of retry attempts (max 3 by default)';
COMMENT ON COLUMN notification_queue_perm.scheduled_for IS 'When to send the notification (supports delayed sending)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: Weekly reminder notification
-- INSERT INTO notification_queue_perm (
--   tenant_id, project_id, node_id, month,
--   notification_type, priority,
--   recipient_user_id, recipient_email, recipient_name,
--   subject, message, data, scheduled_for
-- ) VALUES (
--   'rccg_global', 'growth_tracker', 'Lagos_Central', '2025-09-01',
--   'weekly_reminder', 'normal',
--   'user_123', 'pastor@example.com', 'Pastor John',
--   'Reminder: Submit this week''s events',
--   'You have 2 missing events for week 3. Please submit before Saturday.',
--   '{"missing_events": ["sunday_event-2025-09-21", "monday_event-2025-09-22"], "week": 3}'::jsonb,
--   '2025-09-20 18:00:00'
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Notification Queue Table
-- =============================================================================
-- Migration: 004
-- Purpose: Queue PERM-specific compliance notifications
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- NOTIFICATION QUEUE PERM TABLE
-- =============================================================================
-- Purpose: Queue and track PERM compliance notifications
-- Key Concept: Separate from regular notifications for specialized retry logic

CREATE TABLE IF NOT EXISTS notification_queue_perm (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    month DATE NOT NULL,
    
    -- Notification classification
    notification_type VARCHAR(64) NOT NULL, 
    -- Types: 'incomplete_alert', 'late_submission_warning', 'completion_confirmation', 
    --        'weekly_reminder', 'month_end_summary', 'validation_failure'
    
    priority VARCHAR(16) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    
    -- Recipient information
    recipient_user_id VARCHAR(64) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(255),
    
    -- Message content
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    html_message TEXT, -- Optional HTML version
    
    -- Notification data (context)
    data JSONB DEFAULT '{}',
    -- Example: {
    --   "missing_events": ["sunday_event-2025-09-21", "sunday_event-2025-09-28"],
    --   "completeness_percentage": 61.54,
    --   "events_submitted": 8,
    --   "events_required": 13,
    --   "week": 3
    -- }
    
    -- Delivery status
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failed_reason TEXT,
    
    -- Retry mechanism
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery tracking
    delivery_metadata JSONB DEFAULT '{}',
    -- Example: {
    --   "email_provider": "smtp",
    --   "message_id": "abc123",
    --   "delivery_attempts": [
    --     { "attempt": 1, "timestamp": "...", "result": "failed", "error": "..." }
    --   ]
    -- }
    
    -- Scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- When to send
    expires_at TIMESTAMP WITH TIME ZONE, -- Notification expires if not sent by this time
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) DEFAULT 'system'
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_notif_perm_tenant 
    ON notification_queue_perm(tenant_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_project 
    ON notification_queue_perm(project_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_node 
    ON notification_queue_perm(node_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_month 
    ON notification_queue_perm(month);

-- Status and processing indexes
CREATE INDEX IF NOT EXISTS idx_notif_perm_status 
    ON notification_queue_perm(status);

CREATE INDEX IF NOT EXISTS idx_notif_perm_type 
    ON notification_queue_perm(notification_type);

CREATE INDEX IF NOT EXISTS idx_notif_perm_priority 
    ON notification_queue_perm(priority);

-- Recipient lookup
CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_user 
    ON notification_queue_perm(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_email 
    ON notification_queue_perm(recipient_email);

-- Composite indexes for worker queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_pending 
    ON notification_queue_perm(status, scheduled_for) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notif_perm_retry 
    ON notification_queue_perm(status, next_retry_at) 
    WHERE status = 'failed' AND retry_count < max_retries;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_scheduled 
    ON notification_queue_perm(scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notif_perm_created 
    ON notification_queue_perm(created_at DESC);

-- Expired notifications cleanup
CREATE INDEX IF NOT EXISTS idx_notif_perm_expired 
    ON notification_queue_perm(expires_at) 
    WHERE status = 'pending' AND expires_at IS NOT NULL;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_data 
    ON notification_queue_perm USING gin (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_notif_perm_delivery_metadata 
    ON notification_queue_perm USING gin (delivery_metadata jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE notification_queue_perm IS 'Queue for PERM compliance notifications (reminders, alerts, summaries)';
COMMENT ON COLUMN notification_queue_perm.notification_type IS 'Type: incomplete_alert, late_submission_warning, completion_confirmation, weekly_reminder, month_end_summary';
COMMENT ON COLUMN notification_queue_perm.data IS 'JSONB context data (missing events, percentages, metrics)';
COMMENT ON COLUMN notification_queue_perm.retry_count IS 'Number of retry attempts (max 3 by default)';
COMMENT ON COLUMN notification_queue_perm.scheduled_for IS 'When to send the notification (supports delayed sending)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: Weekly reminder notification
-- INSERT INTO notification_queue_perm (
--   tenant_id, project_id, node_id, month,
--   notification_type, priority,
--   recipient_user_id, recipient_email, recipient_name,
--   subject, message, data, scheduled_for
-- ) VALUES (
--   'rccg_global', 'growth_tracker', 'Lagos_Central', '2025-09-01',
--   'weekly_reminder', 'normal',
--   'user_123', 'pastor@example.com', 'Pastor John',
--   'Reminder: Submit this week''s events',
--   'You have 2 missing events for week 3. Please submit before Saturday.',
--   '{"missing_events": ["sunday_event-2025-09-21", "monday_event-2025-09-22"], "week": 3}'::jsonb,
--   '2025-09-20 18:00:00'
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


-- =============================================================================
-- PERM (Per Event Reporting Model) - Notification Queue Table
-- =============================================================================
-- Migration: 004
-- Purpose: Queue PERM-specific compliance notifications
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- =============================================================================

-- =============================================================================
-- NOTIFICATION QUEUE PERM TABLE
-- =============================================================================
-- Purpose: Queue and track PERM compliance notifications
-- Key Concept: Separate from regular notifications for specialized retry logic

CREATE TABLE IF NOT EXISTS notification_queue_perm (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core identifiers (tenant isolation)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    month DATE NOT NULL,
    
    -- Notification classification
    notification_type VARCHAR(64) NOT NULL, 
    -- Types: 'incomplete_alert', 'late_submission_warning', 'completion_confirmation', 
    --        'weekly_reminder', 'month_end_summary', 'validation_failure'
    
    priority VARCHAR(16) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    
    -- Recipient information
    recipient_user_id VARCHAR(64) NOT NULL,
    recipient_email VARCHAR(255),
    recipient_name VARCHAR(255),
    
    -- Message content
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    html_message TEXT, -- Optional HTML version
    
    -- Notification data (context)
    data JSONB DEFAULT '{}',
    -- Example: {
    --   "missing_events": ["sunday_event-2025-09-21", "sunday_event-2025-09-28"],
    --   "completeness_percentage": 61.54,
    --   "events_submitted": 8,
    --   "events_required": 13,
    --   "week": 3
    -- }
    
    -- Delivery status
    status VARCHAR(32) DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    failed_reason TEXT,
    
    -- Retry mechanism
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery tracking
    delivery_metadata JSONB DEFAULT '{}',
    -- Example: {
    --   "email_provider": "smtp",
    --   "message_id": "abc123",
    --   "delivery_attempts": [
    --     { "attempt": 1, "timestamp": "...", "result": "failed", "error": "..." }
    --   ]
    -- }
    
    -- Scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- When to send
    expires_at TIMESTAMP WITH TIME ZONE, -- Notification expires if not sent by this time
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) DEFAULT 'system'
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_notif_perm_tenant 
    ON notification_queue_perm(tenant_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_project 
    ON notification_queue_perm(project_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_node 
    ON notification_queue_perm(node_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_month 
    ON notification_queue_perm(month);

-- Status and processing indexes
CREATE INDEX IF NOT EXISTS idx_notif_perm_status 
    ON notification_queue_perm(status);

CREATE INDEX IF NOT EXISTS idx_notif_perm_type 
    ON notification_queue_perm(notification_type);

CREATE INDEX IF NOT EXISTS idx_notif_perm_priority 
    ON notification_queue_perm(priority);

-- Recipient lookup
CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_user 
    ON notification_queue_perm(recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_notif_perm_recipient_email 
    ON notification_queue_perm(recipient_email);

-- Composite indexes for worker queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_pending 
    ON notification_queue_perm(status, scheduled_for) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notif_perm_retry 
    ON notification_queue_perm(status, next_retry_at) 
    WHERE status = 'failed' AND retry_count < max_retries;

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_scheduled 
    ON notification_queue_perm(scheduled_for);

CREATE INDEX IF NOT EXISTS idx_notif_perm_created 
    ON notification_queue_perm(created_at DESC);

-- Expired notifications cleanup
CREATE INDEX IF NOT EXISTS idx_notif_perm_expired 
    ON notification_queue_perm(expires_at) 
    WHERE status = 'pending' AND expires_at IS NOT NULL;

-- GIN indexes for JSONB queries
CREATE INDEX IF NOT EXISTS idx_notif_perm_data 
    ON notification_queue_perm USING gin (data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_notif_perm_delivery_metadata 
    ON notification_queue_perm USING gin (delivery_metadata jsonb_path_ops);

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE notification_queue_perm IS 'Queue for PERM compliance notifications (reminders, alerts, summaries)';
COMMENT ON COLUMN notification_queue_perm.notification_type IS 'Type: incomplete_alert, late_submission_warning, completion_confirmation, weekly_reminder, month_end_summary';
COMMENT ON COLUMN notification_queue_perm.data IS 'JSONB context data (missing events, percentages, metrics)';
COMMENT ON COLUMN notification_queue_perm.retry_count IS 'Number of retry attempts (max 3 by default)';
COMMENT ON COLUMN notification_queue_perm.scheduled_for IS 'When to send the notification (supports delayed sending)';

-- =============================================================================
-- SAMPLE DATA FOR TESTING
-- =============================================================================

-- Example: Weekly reminder notification
-- INSERT INTO notification_queue_perm (
--   tenant_id, project_id, node_id, month,
--   notification_type, priority,
--   recipient_user_id, recipient_email, recipient_name,
--   subject, message, data, scheduled_for
-- ) VALUES (
--   'rccg_global', 'growth_tracker', 'Lagos_Central', '2025-09-01',
--   'weekly_reminder', 'normal',
--   'user_123', 'pastor@example.com', 'Pastor John',
--   'Reminder: Submit this week''s events',
--   'You have 2 missing events for week 3. Please submit before Saturday.',
--   '{"missing_events": ["sunday_event-2025-09-21", "monday_event-2025-09-22"], "week": 3}'::jsonb,
--   '2025-09-20 18:00:00'
-- );

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================


