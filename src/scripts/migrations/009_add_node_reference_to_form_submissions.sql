-- =============================================================================
-- Migration: 009_add_node_reference_to_form_submissions.sql
-- Purpose : Ensure form_submissions stores both node_id and node_reference
-- =============================================================================

ALTER TABLE form_submissions
ADD COLUMN IF NOT EXISTS node_reference VARCHAR(100);

-- Keep node_name aligned with existing write paths in SubmissionModel.
ALTER TABLE form_submissions
ADD COLUMN IF NOT EXISTS node_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_form_submissions_node_reference
ON form_submissions(node_reference);

