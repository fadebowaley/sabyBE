-- Migration 029: Feedback Attribution + Prompt Improvement Schedule
--
-- Adds prompt attribution columns to agent_feedback and agent_eval_results so
-- every feedback vote and eval result is tied to the exact prompt version that
-- produced the response. This is the prerequisite for the automatic prompt
-- promotion loop in promptImprovement.worker.js.
--
-- Also seeds the 'prompt_improvement' agent_schedule so the new worker fires
-- automatically for every existing tenant.
--
-- To roll back: see 029_rollback_feedback_attribution.sql

BEGIN;

-- ─── 1. Attribution columns on agent_feedback ─────────────────────────────────

ALTER TABLE copilot.agent_feedback
  ADD COLUMN IF NOT EXISTS prompt_key     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS prompt_version INTEGER;

COMMENT ON COLUMN copilot.agent_feedback.prompt_key
  IS 'The promptRegistry key (e.g. intent_classification) active when this response was generated.';
COMMENT ON COLUMN copilot.agent_feedback.prompt_version
  IS 'The integer version of the prompt that generated the rated response.';

CREATE INDEX IF NOT EXISTS idx_agent_feedback_prompt_key
  ON copilot.agent_feedback (prompt_key, prompt_version)
  WHERE prompt_key IS NOT NULL;

-- ─── 2. Attribution columns on agent_eval_results ─────────────────────────────

ALTER TABLE copilot.agent_eval_results
  ADD COLUMN IF NOT EXISTS prompt_key     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS prompt_version INTEGER;

COMMENT ON COLUMN copilot.agent_eval_results.prompt_key
  IS 'The promptRegistry key active during this eval run.';
COMMENT ON COLUMN copilot.agent_eval_results.prompt_version
  IS 'The integer version of the prompt evaluated.';

CREATE INDEX IF NOT EXISTS idx_agent_eval_results_prompt_key
  ON copilot.agent_eval_results (prompt_key, prompt_version)
  WHERE prompt_key IS NOT NULL;

-- ─── 3. Seed prompt_improvement schedule for all existing tenants ─────────────
-- Runs weekly (168 h). The worker checks eval pass rate + feedback accuracy
-- and promotes the highest-version draft prompt when the threshold is breached.

INSERT INTO copilot.agent_schedules
  (tenant_id, workflow_name, trigger_type, cron_expression, scope_json, enabled, next_run_at, created_by)
SELECT DISTINCT
  tenant_id,
  'prompt_improvement',
  'schedule',
  '0 5 * * 0',   -- Sunday 05:00 UTC
  '{"interval_hours": 168}'::jsonb,
  true,
  NOW(),
  'migration:029'
FROM copilot.agent_schedules
WHERE workflow_name = 'agent_eval'   -- one schedule per tenant that already has eval enabled
ON CONFLICT DO NOTHING;

COMMIT;
