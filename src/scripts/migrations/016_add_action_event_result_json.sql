-- Add execution result payload support for copilot action events.
ALTER TABLE copilot.action_events
  ADD COLUMN IF NOT EXISTS result_json JSONB;

