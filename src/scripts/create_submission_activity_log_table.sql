-- Migration: Create submission_activity_log table for activity tracking
CREATE TABLE IF NOT EXISTS submission_activity_log (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    form_id VARCHAR(64),
    user_id VARCHAR(64),
    action VARCHAR(32), -- e.g., 'submitted', 'queued', 'processed', 'failed'
    status VARCHAR(32),
    job_id VARCHAR(128),
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_id ON submission_activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON submission_activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_form_id ON submission_activity_log(form_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON submission_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_job_id ON submission_activity_log(job_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON submission_activity_log(created_at);
