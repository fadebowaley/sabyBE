-- =============================================================================
-- Migration: 008 - Add missing columns to submission_activity_log
-- =============================================================================
-- Purpose: Ensure activity logger INSERT succeeds (node_id, source, submitter blueprint)
-- Fixes: Form submission failures when activity log INSERT fails due to missing columns
-- =============================================================================

-- node_id (for log-dashboard and node-scoped queries)
ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS node_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_activity_log_node_id 
ON submission_activity_log(node_id);

-- source (api, web, mobile, etc.)
ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS source VARCHAR(32);

-- Submitter Blueprint (denormalized for display)
ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);

ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);

ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS user_phone VARCHAR(50);

ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS node_reference VARCHAR(100);

ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS node_name VARCHAR(255);

ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS form_reference VARCHAR(100);
