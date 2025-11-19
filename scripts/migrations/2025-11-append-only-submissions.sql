-- =============================================================================
-- Append-only PERM submissions + fact buckets
-- Date: 2025-11-14
-- =============================================================================
-- 1. Allow multiple submissions per node/month by dropping the unique index
-- 2. Add generated submission_date + submission_week columns for fast filtering
-- 3. Add day/week buckets to form_submission_facts and backfill existing rows
-- 4. Create helpful indexes for the new columns
-- =============================================================================

-- 1) Drop the uniqueness constraint that forced one row per node/month
DROP INDEX IF EXISTS idx_form_submissions_unique_node_month;

-- 2) Add generated columns derived from submitted_at for quick rollups
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS submission_date DATE GENERATED ALWAYS AS ((submitted_at AT TIME ZONE 'UTC')::date) STORED,
  ADD COLUMN IF NOT EXISTS submission_week DATE GENERATED ALWAYS AS (date_trunc('week', submitted_at AT TIME ZONE 'UTC')::date) STORED;

-- 3) Add day/week buckets to facts so we can aggregate dynamically
ALTER TABLE form_submission_facts
  ADD COLUMN IF NOT EXISTS day_bucket DATE,
  ADD COLUMN IF NOT EXISTS week_bucket DATE;

-- Populate new fact columns using existing submission timestamps
UPDATE form_submission_facts f
SET
  day_bucket = fs.submitted_at::date,
  week_bucket = date_trunc('week', fs.submitted_at)::date
FROM form_submissions fs
WHERE f.submission_id = fs.id
  AND (f.day_bucket IS NULL OR f.week_bucket IS NULL);

-- 4) Indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_date
  ON form_submissions (tenant_id, project_id, node_id, submission_date);

CREATE INDEX IF NOT EXISTS idx_form_submissions_submission_week
  ON form_submissions (tenant_id, project_id, node_id, submission_week);

CREATE INDEX IF NOT EXISTS form_submission_facts_day_idx
  ON form_submission_facts (day_bucket);

CREATE INDEX IF NOT EXISTS form_submission_facts_week_idx
  ON form_submission_facts (week_bucket);

