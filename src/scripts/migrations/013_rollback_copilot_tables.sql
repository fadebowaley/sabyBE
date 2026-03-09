-- =============================================================================
-- Rollback: 013_rollback_copilot_tables.sql
-- Purpose : Roll back Copilot schema objects created by 013_create_copilot_tables.sql
-- WARNING : This removes all data under schema copilot.
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS copilot CASCADE;

-- Keep extension in place if other modules rely on UUID generation.
-- DROP EXTENSION IF EXISTS "uuid-ossp";

COMMIT;
