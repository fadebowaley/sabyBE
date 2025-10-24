-- Fix submission_activity_log table - Add missing node_id column
-- Issue: Column "node_id" missing from table but code tries to insert it
-- Date: October 23, 2025

-- Add node_id column to submission_activity_log table
ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS node_id VARCHAR(64);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_activity_log_node_id 
ON submission_activity_log(node_id);

-- Verify the fix
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'submission_activity_log'
ORDER BY ordinal_position;


