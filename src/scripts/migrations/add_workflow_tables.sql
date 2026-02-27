-- =============================================================================
-- WORKFLOW SYSTEM — migration
-- Adds two tables that store workflow instances and individual step actions
-- for every submission that has workflow add-ons configured on its module.
--
-- submission_workflows     — one row per (submission × workflow definition)
-- submission_workflow_steps — one row per (workflow instance × step definition)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- submission_workflows
-- Tracks the overall status of a workflow attached to a submission.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_workflows (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Link back to the submission
  submission_id     UUID        NOT NULL,
  tenant_id         VARCHAR(64) NOT NULL,
  project_id        VARCHAR(64),
  form_id           VARCHAR(64),

  -- Which workflow definition (from MongoDB ProjectForm.workflows[].id)
  workflow_def_id   VARCHAR(64) NOT NULL,
  workflow_name     VARCHAR(255),

  -- Workflow type mirrors ProjectForm.workflows[].type
  workflow_type     VARCHAR(64) NOT NULL DEFAULT 'approval',

  -- Overall lifecycle status
  -- pending → in_progress → approved | rejected | completed | cancelled
  status            VARCHAR(64) NOT NULL DEFAULT 'pending',

  -- Which step is currently active (step definition id)
  current_step_id   VARCHAR(64),

  -- Submitter context (denormalised for fast reads)
  submitted_by_user_id    VARCHAR(255),
  submitted_by_user_name  VARCHAR(255),
  submitted_by_user_email VARCHAR(255),

  -- Optional free-form metadata bag
  metadata          JSONB       DEFAULT '{}'::jsonb,

  initiated_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_workflows_submission_id
  ON submission_workflows(submission_id);

CREATE INDEX IF NOT EXISTS idx_sub_workflows_tenant_status
  ON submission_workflows(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_sub_workflows_project_id
  ON submission_workflows(project_id);

-- ---------------------------------------------------------------------------
-- submission_workflow_steps
-- One row per step instance — records who acted, when, and what they decided.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_workflow_steps (
  id                    UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Parent workflow instance
  workflow_id           UUID        NOT NULL REFERENCES submission_workflows(id) ON DELETE CASCADE,
  submission_id         UUID        NOT NULL,
  tenant_id             VARCHAR(64) NOT NULL,

  -- Step identity (mirrors WorkflowStepSchema fields)
  step_def_id           VARCHAR(64) NOT NULL,
  step_name             VARCHAR(255),
  step_type             VARCHAR(64) DEFAULT 'approval',  -- approval | review | notification
  step_order            INTEGER     DEFAULT 0,

  -- Lifecycle status
  -- pending → in_progress → approved | rejected | skipped | completed
  status                VARCHAR(64) DEFAULT 'pending',

  -- Assignment
  assignee_type         VARCHAR(64),               -- role | user | dynamic_field | auto
  assignee_role         VARCHAR(64),               -- e.g. "manager"
  assignee_users        JSONB       DEFAULT '[]',  -- array of user IDs who can act

  -- SLA
  sla_hours             INTEGER     DEFAULT 48,
  due_at                TIMESTAMPTZ,

  -- Action recorded
  action                VARCHAR(64),               -- approved | rejected | reviewed | skipped
  action_by_user_id     VARCHAR(255),
  action_by_user_name   VARCHAR(255),
  action_by_user_email  VARCHAR(255),
  comments              TEXT,
  actioned_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_wf_steps_workflow_id
  ON submission_workflow_steps(workflow_id);

CREATE INDEX IF NOT EXISTS idx_sub_wf_steps_submission_id
  ON submission_workflow_steps(submission_id);

CREATE INDEX IF NOT EXISTS idx_sub_wf_steps_tenant_status
  ON submission_workflow_steps(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_sub_wf_steps_assignee_role
  ON submission_workflow_steps(tenant_id, assignee_role, status);
