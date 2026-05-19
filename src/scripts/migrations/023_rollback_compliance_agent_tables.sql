-- =============================================================================
-- Rollback: 023_rollback_compliance_agent_tables.sql
-- =============================================================================

DROP INDEX IF EXISTS copilot.idx_agent_schedules_next_run_at;
DROP INDEX IF EXISTS copilot.idx_compliance_snapshots_task;
DROP INDEX IF EXISTS copilot.idx_compliance_snapshots_tenant_project_month;
DROP TABLE IF EXISTS copilot.compliance_run_snapshots;
