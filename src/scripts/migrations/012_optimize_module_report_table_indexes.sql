-- =============================================================================
-- Migration: 012_optimize_module_report_table_indexes.sql
-- Purpose : Improve module report table performance on large datasets
-- =============================================================================

-- Core filtering/sorting path for module-table endpoint.
CREATE INDEX IF NOT EXISTS idx_form_submissions_module_report_core
ON form_submissions (tenant_id, project_id, created_at DESC)
WHERE status != 'deleted';

-- Fast month filtering within tenant/project.
CREATE INDEX IF NOT EXISTS idx_form_submissions_module_report_month
ON form_submissions (tenant_id, project_id, month)
WHERE status != 'deleted';

-- Fast node scoping for owner/non-owner access paths.
CREATE INDEX IF NOT EXISTS idx_form_submissions_module_report_node_id
ON form_submissions (tenant_id, project_id, node_id)
WHERE status != 'deleted';

CREATE INDEX IF NOT EXISTS idx_form_submissions_module_report_node_ref
ON form_submissions (tenant_id, project_id, node_reference)
WHERE status != 'deleted';

-- Optional text-search acceleration used by module-table search filter.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_form_submissions_node_name_trgm
ON form_submissions USING gin (node_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_form_submissions_node_ref_trgm
ON form_submissions USING gin (node_reference gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_form_submissions_status_trgm
ON form_submissions USING gin (status gin_trgm_ops);
