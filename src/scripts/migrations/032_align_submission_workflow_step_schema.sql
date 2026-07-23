-- =============================================================================
-- Align submission workflow step schema with approval engine service writes
-- =============================================================================

ALTER TABLE submission_workflow_steps
  ADD COLUMN IF NOT EXISTS action_type VARCHAR(64);

ALTER TABLE submission_workflow_steps
  ADD COLUMN IF NOT EXISTS assignee_roles JSONB DEFAULT '[]'::jsonb;

UPDATE submission_workflow_steps
SET assignee_roles = CASE
  WHEN assignee_role IS NOT NULL AND TRIM(assignee_role) <> ''
    THEN jsonb_build_array(assignee_role)
  ELSE '[]'::jsonb
END
WHERE assignee_roles IS NULL
   OR assignee_roles = 'null'::jsonb;

CREATE INDEX IF NOT EXISTS idx_sub_wf_steps_assignee_roles_gin
  ON submission_workflow_steps USING GIN (assignee_roles);

CREATE INDEX IF NOT EXISTS idx_sub_wf_steps_assignee_users_gin
  ON submission_workflow_steps USING GIN (assignee_users);
