-- =============================================================================
-- CLEANUP TEST DATA - Fresh Start Script
-- =============================================================================
-- Purpose: Clean up all test/old data from DLQ and activity tables
-- Date: November 4, 2025
-- USE WITH CAUTION: This will delete data!
-- =============================================================================

-- Show what will be deleted (run this first to review)
SELECT 'dead_letter_queue' as table_name, COUNT(*) as records FROM dead_letter_queue
UNION ALL
SELECT 'system_alerts', COUNT(*) FROM system_alerts
UNION ALL
SELECT 'submission_activity_log', COUNT(*) FROM submission_activity_log
UNION ALL
SELECT 'form_submissions', COUNT(*) FROM form_submissions
UNION ALL
SELECT 'idempotency_cache', COUNT(*) FROM idempotency_cache;

-- =============================================================================
-- OPTION 1: CLEAN EVERYTHING (Complete Fresh Start)
-- =============================================================================

-- Clean DLQ (Dead Letter Queue)
DELETE FROM dead_letter_queue;

-- Clean System Alerts
DELETE FROM system_alerts;

-- Clean Activity Log
DELETE FROM submission_activity_log;

-- Clean Form Submissions (all test data)
DELETE FROM form_submissions;

-- Clean Idempotency Cache
DELETE FROM idempotency_cache;

-- Reset sequences if needed
-- (PostgreSQL auto-increments will continue, UUIDs don't need reset)

-- =============================================================================
-- OPTION 2: KEEP PRODUCTION DATA, CLEAN ONLY TEST DATA
-- =============================================================================

-- If you have production data mixed with test data, use this instead:
-- Uncomment and modify the WHERE clauses as needed

-- DELETE FROM dead_letter_queue 
-- WHERE tenant_id = 'test-tenant-001';  -- Only test tenant

-- DELETE FROM system_alerts 
-- WHERE type LIKE 'test_%';  -- Only test alerts

-- DELETE FROM submission_activity_log 
-- WHERE tenant_id IN ('test-tenant-001');  -- Only test data

-- DELETE FROM form_submissions 
-- WHERE tenant_id IN ('test-tenant-001');  -- Only test submissions

-- =============================================================================
-- VERIFICATION QUERIES (run after cleanup)
-- =============================================================================

-- Check if tables are empty
SELECT 'dead_letter_queue' as table_name, COUNT(*) as remaining FROM dead_letter_queue
UNION ALL
SELECT 'system_alerts', COUNT(*) FROM system_alerts
UNION ALL
SELECT 'submission_activity_log', COUNT(*) FROM submission_activity_log
UNION ALL
SELECT 'form_submissions', COUNT(*) FROM form_submissions
UNION ALL
SELECT 'idempotency_cache', COUNT(*) FROM idempotency_cache;

-- Expected result: All should show 0 records

-- =============================================================================
-- COMPLETED
-- =============================================================================





