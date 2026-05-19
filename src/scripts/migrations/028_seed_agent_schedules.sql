-- Migration 028: Seed agent_schedules for all known tenants
--
-- Creates three schedule rows per tenant (compliance_monitor, data_intelligence,
-- agent_eval) so the corresponding workers start running immediately for every
-- tenant that already has copilot action events recorded.
--
-- ON CONFLICT DO NOTHING is idempotent — re-running this migration is safe.
-- new tenants get their rows during onboarding (createOnboardingJob handler).

-- ─── Seed from existing tenants seen in copilot.action_events ────────────────

INSERT INTO copilot.agent_schedules
  (tenant_id, workflow_name, trigger_type, cron_expression, scope_json, enabled, next_run_at, created_by)
SELECT DISTINCT ON (ae.tenant_id, wn.workflow_name)
  ae.tenant_id,
  wn.workflow_name,
  'schedule'                                AS trigger_type,
  wn.cron_expr                              AS cron_expression,
  wn.scope                                  AS scope_json,
  TRUE                                      AS enabled,
  NOW()                                     AS next_run_at,  -- run on next worker tick
  'migration:028'                           AS created_by
FROM copilot.action_events ae
CROSS JOIN (
  VALUES
    ('compliance_monitor', '0 2 * * *',  '{"interval_hours": 24}'::jsonb),
    ('data_intelligence',  '0 3 * * *',  '{"interval_hours": 24}'::jsonb),
    ('agent_eval',         '0 4 * * *',  '{"interval_hours": 24}'::jsonb)
) AS wn(workflow_name, cron_expr, scope)
ON CONFLICT DO NOTHING;

-- ─── Rollback hint ────────────────────────────────────────────────────────────
-- To roll back: DELETE FROM copilot.agent_schedules WHERE created_by = 'migration:028';
