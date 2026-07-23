-- =============================================================================
-- Rollback alignment for submission workflow step schema
-- =============================================================================

DROP INDEX IF EXISTS idx_sub_wf_steps_assignee_roles_gin;
DROP INDEX IF EXISTS idx_sub_wf_steps_assignee_users_gin;

ALTER TABLE submission_workflow_steps
  DROP COLUMN IF EXISTS action_type;

ALTER TABLE submission_workflow_steps
  DROP COLUMN IF EXISTS assignee_roles;
