-- Create the form_submissions table for the updated submission model
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    form_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64),
    user_id VARCHAR(64),
    source VARCHAR(32) DEFAULT 'unknown',
    data JSONB NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) DEFAULT 'submitted',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_tenant_id ON form_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project_id ON form_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_node_id ON form_submissions(node_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_user_id ON form_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_status ON form_submissions(status);
CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at);

ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS project_name VARCHAR(128);
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS project_category VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_form_submissions_project_name ON form_submissions(project_name);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project_category ON form_submissions(project_category);
