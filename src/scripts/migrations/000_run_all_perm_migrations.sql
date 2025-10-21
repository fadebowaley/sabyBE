-- =============================================================================
-- PERM (Per Event Reporting Model) - Master Migration Script
-- =============================================================================
-- Purpose: Run all PERM migrations in correct order
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- Usage: psql -U postgres -d sodzo -f 000_run_all_perm_migrations.sql
-- =============================================================================

\echo '========================================================================='
\echo 'PERM (Per Event Reporting Model) - Database Migrations'
\echo '========================================================================='
\echo ''
\echo 'This script will create all tables and indexes required for PERM'
\echo ''
\echo 'Tables to be created:'
\echo '  1. event_calendar'
\echo '  2. event_compliance_tracking'
\echo '  3. submission_validations'
\echo '  4. notification_queue_perm'
\echo ''
\echo 'Tables to be modified:'
\echo '  1. form_submissions (add PERM columns)'
\echo ''
\echo '========================================================================='
\echo ''

-- Start transaction
BEGIN;

\echo 'Migration 001: Creating event_calendar table...'
\i 001_create_event_calendar.sql

\echo 'Migration 002: Creating event_compliance_tracking table...'
\i 002_create_event_compliance_tracking.sql

\echo 'Migration 003: Creating submission_validations table...'
\i 003_create_submission_validations.sql

\echo 'Migration 004: Creating notification_queue_perm table...'
\i 004_create_notification_queue_perm.sql

\echo 'Migration 005: Adding PERM columns to form_submissions...'
\i 005_add_perm_columns_to_form_submissions.sql

-- Commit transaction
COMMIT;

\echo ''
\echo '========================================================================='
\echo 'PERM Migrations Completed Successfully!'
\echo '========================================================================='
\echo ''
\echo 'Verification:'
SELECT 
  tablename, 
  schemaname 
FROM pg_tables 
WHERE tablename IN (
  'event_calendar', 
  'event_compliance_tracking', 
  'submission_validations', 
  'notification_queue_perm'
)
ORDER BY tablename;

\echo ''
\echo 'New columns in form_submissions:'
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'form_submissions' 
  AND column_name IN (
    'month', 'year', 'perm_enabled', 'is_locked', 
    'event_compliance_percentage', 'completeness_status'
  )
ORDER BY column_name;

\echo ''
\echo '========================================================================='
\echo 'Next Steps:'
\echo '  1. Verify tables created successfully'
\echo '  2. Test with sample PERM submissions'
\echo '  3. Proceed to Phase 2: MongoDB integration'
\echo '========================================================================='


-- =============================================================================
-- PERM (Per Event Reporting Model) - Master Migration Script
-- =============================================================================
-- Purpose: Run all PERM migrations in correct order
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- Usage: psql -U postgres -d sodzo -f 000_run_all_perm_migrations.sql
-- =============================================================================

\echo '========================================================================='
\echo 'PERM (Per Event Reporting Model) - Database Migrations'
\echo '========================================================================='
\echo ''
\echo 'This script will create all tables and indexes required for PERM'
\echo ''
\echo 'Tables to be created:'
\echo '  1. event_calendar'
\echo '  2. event_compliance_tracking'
\echo '  3. submission_validations'
\echo '  4. notification_queue_perm'
\echo ''
\echo 'Tables to be modified:'
\echo '  1. form_submissions (add PERM columns)'
\echo ''
\echo '========================================================================='
\echo ''

-- Start transaction
BEGIN;

\echo 'Migration 001: Creating event_calendar table...'
\i 001_create_event_calendar.sql

\echo 'Migration 002: Creating event_compliance_tracking table...'
\i 002_create_event_compliance_tracking.sql

\echo 'Migration 003: Creating submission_validations table...'
\i 003_create_submission_validations.sql

\echo 'Migration 004: Creating notification_queue_perm table...'
\i 004_create_notification_queue_perm.sql

\echo 'Migration 005: Adding PERM columns to form_submissions...'
\i 005_add_perm_columns_to_form_submissions.sql

-- Commit transaction
COMMIT;

\echo ''
\echo '========================================================================='
\echo 'PERM Migrations Completed Successfully!'
\echo '========================================================================='
\echo ''
\echo 'Verification:'
SELECT 
  tablename, 
  schemaname 
FROM pg_tables 
WHERE tablename IN (
  'event_calendar', 
  'event_compliance_tracking', 
  'submission_validations', 
  'notification_queue_perm'
)
ORDER BY tablename;

\echo ''
\echo 'New columns in form_submissions:'
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'form_submissions' 
  AND column_name IN (
    'month', 'year', 'perm_enabled', 'is_locked', 
    'event_compliance_percentage', 'completeness_status'
  )
ORDER BY column_name;

\echo ''
\echo '========================================================================='
\echo 'Next Steps:'
\echo '  1. Verify tables created successfully'
\echo '  2. Test with sample PERM submissions'
\echo '  3. Proceed to Phase 2: MongoDB integration'
\echo '========================================================================='


-- =============================================================================
-- PERM (Per Event Reporting Model) - Master Migration Script
-- =============================================================================
-- Purpose: Run all PERM migrations in correct order
-- Author: Saby Backend Team
-- Date: 2025-10-19
-- Usage: psql -U postgres -d sodzo -f 000_run_all_perm_migrations.sql
-- =============================================================================

\echo '========================================================================='
\echo 'PERM (Per Event Reporting Model) - Database Migrations'
\echo '========================================================================='
\echo ''
\echo 'This script will create all tables and indexes required for PERM'
\echo ''
\echo 'Tables to be created:'
\echo '  1. event_calendar'
\echo '  2. event_compliance_tracking'
\echo '  3. submission_validations'
\echo '  4. notification_queue_perm'
\echo ''
\echo 'Tables to be modified:'
\echo '  1. form_submissions (add PERM columns)'
\echo ''
\echo '========================================================================='
\echo ''

-- Start transaction
BEGIN;

\echo 'Migration 001: Creating event_calendar table...'
\i 001_create_event_calendar.sql

\echo 'Migration 002: Creating event_compliance_tracking table...'
\i 002_create_event_compliance_tracking.sql

\echo 'Migration 003: Creating submission_validations table...'
\i 003_create_submission_validations.sql

\echo 'Migration 004: Creating notification_queue_perm table...'
\i 004_create_notification_queue_perm.sql

\echo 'Migration 005: Adding PERM columns to form_submissions...'
\i 005_add_perm_columns_to_form_submissions.sql

-- Commit transaction
COMMIT;

\echo ''
\echo '========================================================================='
\echo 'PERM Migrations Completed Successfully!'
\echo '========================================================================='
\echo ''
\echo 'Verification:'
SELECT 
  tablename, 
  schemaname 
FROM pg_tables 
WHERE tablename IN (
  'event_calendar', 
  'event_compliance_tracking', 
  'submission_validations', 
  'notification_queue_perm'
)
ORDER BY tablename;

\echo ''
\echo 'New columns in form_submissions:'
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'form_submissions' 
  AND column_name IN (
    'month', 'year', 'perm_enabled', 'is_locked', 
    'event_compliance_percentage', 'completeness_status'
  )
ORDER BY column_name;

\echo ''
\echo '========================================================================='
\echo 'Next Steps:'
\echo '  1. Verify tables created successfully'
\echo '  2. Test with sample PERM submissions'
\echo '  3. Proceed to Phase 2: MongoDB integration'
\echo '========================================================================='


