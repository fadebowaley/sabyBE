-- Add project_name and project_category columns to submission_activity_log table
ALTER TABLE submission_activity_log ADD COLUMN IF NOT EXISTS project_name VARCHAR(128);
ALTER TABLE submission_activity_log ADD COLUMN IF NOT EXISTS project_category VARCHAR(64);

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_activity_log_project_name ON submission_activity_log(project_name);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_category ON submission_activity_log(project_category);
