-- Migration 030: Approval Orchestration
--
-- 1. Adds approval_type ('auto' | 'human') to action_catalog so the agent
--    knows whether to self-approve or queue for a human approver.
--
-- 2. Extends approval_decisions to support 'pending_human' status:
--    - Makes approved_by_user_id nullable (no approver yet for human requests)
--    - Makes approved_at nullable (set when the human actually approves)
--    - Adds 'pending_human' to the status check constraint

-- ── action_catalog ────────────────────────────────────────────────────────────

ALTER TABLE copilot.action_catalog
  ADD COLUMN IF NOT EXISTS approval_type VARCHAR(10) NOT NULL DEFAULT 'auto'
  CONSTRAINT action_catalog_approval_type_chk CHECK (approval_type IN ('auto', 'human'));

-- Backfill: all existing actions with requires_approval=true stay as 'auto'.
-- Operators can UPDATE individual rows to 'human' via migration or admin UI.
UPDATE copilot.action_catalog
  SET approval_type = 'auto'
  WHERE requires_approval = true;

-- ── approval_decisions ────────────────────────────────────────────────────────

-- Allow approved_by_user_id to be NULL for pending_human approvals
-- (the approver is not known until a human acts on the request).
ALTER TABLE copilot.approval_decisions
  ALTER COLUMN approved_by_user_id DROP NOT NULL;

-- Allow approved_at to be NULL for pending_human approvals.
ALTER TABLE copilot.approval_decisions
  ALTER COLUMN approved_at DROP NOT NULL;

-- Widen the status constraint to include 'pending_human'.
ALTER TABLE copilot.approval_decisions
  DROP CONSTRAINT IF EXISTS approval_decisions_status_chk;

ALTER TABLE copilot.approval_decisions
  ADD CONSTRAINT approval_decisions_status_chk CHECK (
    status IN (
      'pending_human',
      'approved',
      'consumed',
      'rejected',
      'revoked',
      'expired',
      'cancelled'
    )
  );

-- Index for approvers to quickly find pending_human requests by tenant.
CREATE INDEX IF NOT EXISTS idx_approval_decisions_pending_human
  ON copilot.approval_decisions (tenant_id, status, created_at DESC)
  WHERE status = 'pending_human';
