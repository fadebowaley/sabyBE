-- =============================================================================
-- PERM (Per Event Reporting Model) - Rollback Migration Script
-- =============================================================================
-- Purpose: Rollback all PERM migrations (drop tables and columns)
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- WARNING: This will DELETE all PERM data! Use with caution!
-- Usage: psql -U postgres -d sodzo -f 999_rollback_perm_migrations.sql
-- =============================================================================

\echo '========================================================================='
\echo 'PERM (Per Event Reporting Model) - ROLLBACK Migrations'
\echo '========================================================================='
\echo ''
\echo 'WARNING: This will DELETE all PERM data!'
\echo ''
\echo 'Tables to be dropped:'
\echo '  1. notification_queue_perm'
\echo '  2. submission_validations'
\echo '  3. event_compliance_tracking'
\echo '  4. event_calendar'
\echo ''
\echo 'Columns to be removed from form_submissions:'
\echo '  - month, year, perm_enabled, is_locked, event_compliance_percentage'
\echo '  - completeness_status, total_events_required, total_events_submitted'
\echo '  - locked_at, locked_by, lock_reason, validation_status'
\echo '  - validation_errors, validation_warnings'
\echo ''
\echo 'Press Ctrl+C to cancel or Enter to continue...'
\prompt 'Continue with rollback?' confirm

-- Start transaction
BEGIN;

\echo ''
\echo 'Dropping PERM tables...'

-- Drop tables in reverse order (respecting foreign keys)
\echo '  Dropping notification_queue_perm...'
DROP TABLE IF EXISTS notification_queue_perm CASCADE;

\echo '  Dropping submission_validations...'
DROP TABLE IF EXISTS submission_validations CASCADE;

\echo '  Dropping event_compliance_tracking...'
DROP TABLE IF EXISTS event_compliance_tracking CASCADE;

\echo '  Dropping event_calendar...'
DROP TABLE IF EXISTS event_calendar CASCADE;

\echo ''
\echo 'Removing PERM columns from form_submissions...'

-- Remove PERM columns from form_submissions
ALTER TABLE form_submissions 
  DROP COLUMN IF EXISTS month CASCADE,
  DROP COLUMN IF EXISTS year CASCADE,
  DROP COLUMN IF EXISTS event_compliance_percentage CASCADE,
  DROP COLUMN IF EXISTS completeness_status CASCADE,
  DROP COLUMN IF EXISTS total_events_required CASCADE,
  DROP COLUMN IF EXISTS total_events_submitted CASCADE,
  DROP COLUMN IF EXISTS is_locked CASCADE,
  DROP COLUMN IF EXISTS locked_at CASCADE,
  DROP COLUMN IF EXISTS locked_by CASCADE,
  DROP COLUMN IF EXISTS lock_reason CASCADE,
  DROP COLUMN IF EXISTS perm_enabled CASCADE,
  DROP COLUMN IF EXISTS validation_status CASCADE,
  DROP COLUMN IF EXISTS validation_errors CASCADE,
  DROP COLUMN IF EXISTS validation_warnings CASCADE;

-- Commit transaction
COMMIT;

\echo ''
\echo '========================================================================='
\echo 'PERM Rollback Completed Successfully!'
\echo '========================================================================='
\echo ''
\echo 'Verification:'
SELECT 
  tablename 
FROM pg_tables 
WHERE tablename IN (
  'event_calendar', 
  'event_compliance_tracking', 
  'submission_validations', 
  'notification_queue_perm'
);

\echo ''
\echo 'If no rows returned above, rollback was successful.'
\echo ''
\echo 'Remaining columns in form_submissions:'
SELECT 
  column_name, 
  data_type
FROM information_schema.columns 
WHERE table_name = 'form_submissions'
ORDER BY ordinal_position;

\echo ''
\echo '========================================================================='
\echo 'Rollback complete. PERM has been removed from the database.'
\echo '========================================================================='


-- =============================================================================
-- PERM (Per Event Reporting Model) - Rollback Migration Script
-- =============================================================================
-- Purpose: Rollback all PERM migrations (drop tables and columns)
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- WARNING: This will DELETE all PERM data! Use with caution!
-- Usage: psql -U postgres -d sodzo -f 999_rollback_perm_migrations.sql
-- =============================================================================

\echo '========================================================================='
\echo 'PERM (Per Event Reporting Model) - ROLLBACK Migrations'
\echo '========================================================================='
\echo ''
\echo 'WARNING: This will DELETE all PERM data!'
\echo ''
\echo 'Tables to be dropped:'
\echo '  1. notification_queue_perm'
\echo '  2. submission_validations'
\echo '  3. event_compliance_tracking'
\echo '  4. event_calendar'
\echo ''
\echo 'Columns to be removed from form_submissions:'
\echo '  - month, year, perm_enabled, is_locked, event_compliance_percentage'
\echo '  - completeness_status, total_events_required, total_events_submitted'
\echo '  - locked_at, locked_by, lock_reason, validation_status'
\echo '  - validation_errors, validation_warnings'
\echo ''
\echo 'Press Ctrl+C to cancel or Enter to continue...'
\prompt 'Continue with rollback?' confirm

-- Start transaction
BEGIN;

\echo ''
\echo 'Dropping PERM tables...'

-- Drop tables in reverse order (respecting foreign keys)
\echo '  Dropping notification_queue_perm...'
DROP TABLE IF EXISTS notification_queue_perm CASCADE;

\echo '  Dropping submission_validations...'
DROP TABLE IF EXISTS submission_validations CASCADE;

\echo '  Dropping event_compliance_tracking...'
DROP TABLE IF EXISTS event_compliance_tracking CASCADE;

\echo '  Dropping event_calendar...'
DROP TABLE IF EXISTS event_calendar CASCADE;

\echo ''
\echo 'Removing PERM columns from form_submissions...'

-- Remove PERM columns from form_submissions
ALTER TABLE form_submissions 
  DROP COLUMN IF EXISTS month CASCADE,
  DROP COLUMN IF EXISTS year CASCADE,
  DROP COLUMN IF EXISTS event_compliance_percentage CASCADE,
  DROP COLUMN IF EXISTS completeness_status CASCADE,
  DROP COLUMN IF EXISTS total_events_required CASCADE,
  DROP COLUMN IF EXISTS total_events_submitted CASCADE,
  DROP COLUMN IF EXISTS is_locked CASCADE,
  DROP COLUMN IF EXISTS locked_at CASCADE,
  DROP COLUMN IF EXISTS locked_by CASCADE,
  DROP COLUMN IF EXISTS lock_reason CASCADE,
  DROP COLUMN IF EXISTS perm_enabled CASCADE,
  DROP COLUMN IF EXISTS validation_status CASCADE,
  DROP COLUMN IF EXISTS validation_errors CASCADE,
  DROP COLUMN IF EXISTS validation_warnings CASCADE;

-- Commit transaction
COMMIT;

\echo ''
\echo '========================================================================='
\echo 'PERM Rollback Completed Successfully!'
\echo '========================================================================='
\echo ''
\echo 'Verification:'
SELECT 
  tablename 
FROM pg_tables 
WHERE tablename IN (
  'event_calendar', 
  'event_compliance_tracking', 
  'submission_validations', 
  'notification_queue_perm'
);

\echo ''
\echo 'If no rows returned above, rollback was successful.'
\echo ''
\echo 'Remaining columns in form_submissions:'
SELECT 
  column_name, 
  data_type
FROM information_schema.columns 
WHERE table_name = 'form_submissions'
ORDER BY ordinal_position;

\echo ''
\echo '========================================================================='
\echo 'Rollback complete. PERM has been removed from the database.'
\echo '========================================================================='


-- =============================================================================
-- PERM (Per Event Reporting Model) - Rollback Migration Script
-- =============================================================================
-- Purpose: Rollback all PERM migrations (drop tables and columns)
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- WARNING: This will DELETE all PERM data! Use with caution!
-- Usage: psql -U postgres -d sodzo -f 999_rollback_perm_migrations.sql
-- =============================================================================

\echo '========================================================================='
\echo 'PERM (Per Event Reporting Model) - ROLLBACK Migrations'
\echo '========================================================================='
\echo ''
\echo 'WARNING: This will DELETE all PERM data!'
\echo ''
\echo 'Tables to be dropped:'
\echo '  1. notification_queue_perm'
\echo '  2. submission_validations'
\echo '  3. event_compliance_tracking'
\echo '  4. event_calendar'
\echo ''
\echo 'Columns to be removed from form_submissions:'
\echo '  - month, year, perm_enabled, is_locked, event_compliance_percentage'
\echo '  - completeness_status, total_events_required, total_events_submitted'
\echo '  - locked_at, locked_by, lock_reason, validation_status'
\echo '  - validation_errors, validation_warnings'
\echo ''
\echo 'Press Ctrl+C to cancel or Enter to continue...'
\prompt 'Continue with rollback?' confirm

-- Start transaction
BEGIN;

\echo ''
\echo 'Dropping PERM tables...'

-- Drop tables in reverse order (respecting foreign keys)
\echo '  Dropping notification_queue_perm...'
DROP TABLE IF EXISTS notification_queue_perm CASCADE;

\echo '  Dropping submission_validations...'
DROP TABLE IF EXISTS submission_validations CASCADE;

\echo '  Dropping event_compliance_tracking...'
DROP TABLE IF EXISTS event_compliance_tracking CASCADE;

\echo '  Dropping event_calendar...'
DROP TABLE IF EXISTS event_calendar CASCADE;

\echo ''
\echo 'Removing PERM columns from form_submissions...'

-- Remove PERM columns from form_submissions
ALTER TABLE form_submissions 
  DROP COLUMN IF EXISTS month CASCADE,
  DROP COLUMN IF EXISTS year CASCADE,
  DROP COLUMN IF EXISTS event_compliance_percentage CASCADE,
  DROP COLUMN IF EXISTS completeness_status CASCADE,
  DROP COLUMN IF EXISTS total_events_required CASCADE,
  DROP COLUMN IF EXISTS total_events_submitted CASCADE,
  DROP COLUMN IF EXISTS is_locked CASCADE,
  DROP COLUMN IF EXISTS locked_at CASCADE,
  DROP COLUMN IF EXISTS locked_by CASCADE,
  DROP COLUMN IF EXISTS lock_reason CASCADE,
  DROP COLUMN IF EXISTS perm_enabled CASCADE,
  DROP COLUMN IF EXISTS validation_status CASCADE,
  DROP COLUMN IF EXISTS validation_errors CASCADE,
  DROP COLUMN IF EXISTS validation_warnings CASCADE;

-- Commit transaction
COMMIT;

\echo ''
\echo '========================================================================='
\echo 'PERM Rollback Completed Successfully!'
\echo '========================================================================='
\echo ''
\echo 'Verification:'
SELECT 
  tablename 
FROM pg_tables 
WHERE tablename IN (
  'event_calendar', 
  'event_compliance_tracking', 
  'submission_validations', 
  'notification_queue_perm'
);

\echo ''
\echo 'If no rows returned above, rollback was successful.'
\echo ''
\echo 'Remaining columns in form_submissions:'
SELECT 
  column_name, 
  data_type
FROM information_schema.columns 
WHERE table_name = 'form_submissions'
ORDER BY ordinal_position;

\echo ''
\echo '========================================================================='
\echo 'Rollback complete. PERM has been removed from the database.'
\echo '========================================================================='


