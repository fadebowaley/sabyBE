-- Rollback Migration 029: Feedback Attribution + Prompt Improvement Schedule

BEGIN;

DROP INDEX IF EXISTS copilot.idx_agent_feedback_prompt_key;
ALTER TABLE copilot.agent_feedback
  DROP COLUMN IF EXISTS prompt_key,
  DROP COLUMN IF EXISTS prompt_version;

DROP INDEX IF EXISTS copilot.idx_agent_eval_results_prompt_key;
ALTER TABLE copilot.agent_eval_results
  DROP COLUMN IF EXISTS prompt_key,
  DROP COLUMN IF EXISTS prompt_version;

DELETE FROM copilot.agent_schedules
WHERE workflow_name = 'prompt_improvement'
  AND created_by = 'migration:029';

COMMIT;
