-- Migration: Create validation logging tables
-- Run this migration to add tables for tracking email validation errors and rejections

-- Table for logging email validation errors
CREATE TABLE IF NOT EXISTS email_validation_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    project_id VARCHAR(255),
    error_type VARCHAR(100) NOT NULL,
    error_message TEXT,
    validation_errors JSONB,
    email_metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_validation_errors_tenant_id ON email_validation_errors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_validation_errors_sender_email ON email_validation_errors(sender_email);
CREATE INDEX IF NOT EXISTS idx_email_validation_errors_project_id ON email_validation_errors(project_id);
CREATE INDEX IF NOT EXISTS idx_email_validation_errors_error_type ON email_validation_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_email_validation_errors_created_at ON email_validation_errors(created_at);

-- Table for logging rejected email submissions
CREATE TABLE IF NOT EXISTS email_rejected_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    project_id VARCHAR(255),
    rejection_reason TEXT,
    validation_result JSONB,
    email_content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_rejected_submissions_tenant_id ON email_rejected_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_rejected_submissions_sender_email ON email_rejected_submissions(sender_email);
CREATE INDEX IF NOT EXISTS idx_email_rejected_submissions_project_id ON email_rejected_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_email_rejected_submissions_created_at ON email_rejected_submissions(created_at);

-- Table for logging successful validations
CREATE TABLE IF NOT EXISTS email_successful_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    project_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    project_form_id VARCHAR(255),
    warnings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_successful_validations_tenant_id ON email_successful_validations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_successful_validations_sender_email ON email_successful_validations(sender_email);
CREATE INDEX IF NOT EXISTS idx_email_successful_validations_project_id ON email_successful_validations(project_id);
CREATE INDEX IF NOT EXISTS idx_email_successful_validations_user_id ON email_successful_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_email_successful_validations_created_at ON email_successful_validations(created_at);

-- Add comments for documentation
COMMENT ON TABLE email_validation_errors IS 'Logs validation errors during email processing';
COMMENT ON TABLE email_rejected_submissions IS 'Logs rejected email submissions with reasons';
COMMENT ON TABLE email_successful_validations IS 'Logs successful email validations for audit';

-- Create view for validation statistics
CREATE OR REPLACE VIEW email_validation_stats AS
SELECT
    tenant_id,
    DATE(created_at) as date,
    COUNT(*) as total_emails,
    COUNT(CASE WHEN error_type IS NOT NULL THEN 1 END) as validation_errors,
    COUNT(CASE WHEN rejection_reason IS NOT NULL THEN 1 END) as rejected_submissions,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as successful_validations,
    COUNT(DISTINCT sender_email) as unique_senders
FROM (
    SELECT tenant_id, sender_email, created_at, NULL as error_type, NULL as rejection_reason, user_id
    FROM email_successful_validations
    UNION ALL
    SELECT tenant_id, sender_email, created_at, error_type, NULL as rejection_reason, NULL as user_id
    FROM email_validation_errors
    UNION ALL
    SELECT tenant_id, sender_email, created_at, NULL as error_type, rejection_reason, NULL as user_id
    FROM email_rejected_submissions
) combined_data
GROUP BY tenant_id, DATE(created_at)
ORDER BY tenant_id, date DESC;
