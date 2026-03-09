-- =============================================================================
-- Rollback: 014_rollback_copilot_entity_resolution_logs.sql
-- Purpose : Remove copilot.entity_resolution_logs table.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS copilot.entity_resolution_logs;

COMMIT;
