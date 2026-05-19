-- Rollback 030: Approval Orchestration

-- Restore approval_decisions status constraint
ALTER TABLE copilot.approval_decisions
  DROP CONSTRAINT IF EXISTS approval_decisions_status_chk;
ALTER TABLE copilot.approval_decisions
  ADD CONSTRAINT approval_decisions_status_chk CHECK (
    status IN ('approved', 'consumed', 'rejected', 'revoked', 'expired', 'cancelled')
  );

-- Remove pending_human index
DROP INDEX IF EXISTS copilot.idx_approval_decisions_pending_human;

-- Restore NOT NULL on approved columns
-- (only safe if no pending_human rows exist)
ALTER TABLE copilot.approval_decisions
  ALTER COLUMN approved_by_user_id SET NOT NULL;
ALTER TABLE copilot.approval_decisions
  ALTER COLUMN approved_at SET NOT NULL;

-- Remove approval_type from action_catalog
ALTER TABLE copilot.action_catalog
  DROP COLUMN IF EXISTS approval_type;
