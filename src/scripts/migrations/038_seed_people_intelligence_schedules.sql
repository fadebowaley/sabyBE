-- Migration 038: Seed agent_schedules for the people_intelligence workflow
--
-- Creates one schedule row per tenant (people_intelligence) so the
-- people-intelligence worker starts running immediately for every tenant that
-- already has copilot action events recorded.
--
-- ON CONFLICT DO NOTHING is idempotent — re-running this migration is safe.
-- Tenants created after this migration are back-filled by the worker bootstrap
-- (peopleIntelligence.worker → ensureSchedulesForActiveTenants).

INSERT INTO copilot.agent_schedules
  (tenant_id, workflow_name, trigger_type, cron_expression, scope_json, enabled, next_run_at, created_by)
SELECT DISTINCT ON (ae.tenant_id)
  ae.tenant_id,
  'people_intelligence'                  AS workflow_name,
  'schedule'                             AS trigger_type,
  '0 5 * * *'                            AS cron_expression,
  '{"interval_hours": 24}'::jsonb        AS scope_json,
  TRUE                                   AS enabled,
  NOW()                                  AS next_run_at,  -- run on next worker tick
  'migration:038'                        AS created_by
FROM copilot.action_events ae
LEFT JOIN copilot.agent_schedules s
  ON s.tenant_id = ae.tenant_id
 AND s.workflow_name = 'people_intelligence'
WHERE s.id IS NULL;

-- ─── Rollback hint ────────────────────────────────────────────────────────────
-- To roll back: DELETE FROM copilot.agent_schedules WHERE created_by = 'migration:038';