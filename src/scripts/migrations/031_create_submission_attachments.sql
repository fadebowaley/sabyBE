CREATE TABLE IF NOT EXISTS submission_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(64) NOT NULL,
  project_id TEXT NOT NULL,
  project_form_id TEXT,
  submission_id UUID NOT NULL,
  field_id TEXT NOT NULL,
  storage_file_id TEXT,
  node_id TEXT,
  uploaded_by TEXT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_provider TEXT,
  storage_path TEXT,
  storage_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  ingestion_mode TEXT NOT NULL DEFAULT 'off',
  ingestion_status TEXT NOT NULL DEFAULT 'pending',
  ingestion_reason TEXT,
  ingestion_error TEXT,
  embedded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT submission_attachments_status_chk CHECK (
    status IN ('active', 'archived', 'deleted')
  ),
  CONSTRAINT submission_attachments_ingestion_mode_chk CHECK (
    ingestion_mode IN ('off', 'auto', 'force')
  ),
  CONSTRAINT submission_attachments_ingestion_status_chk CHECK (
    ingestion_status IN (
      'pending',
      'skipped',
      'queued',
      'extracting',
      'embedded',
      'failed',
      'not_ingestible'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_submission_attachments_tenant_submission
  ON submission_attachments (tenant_id, submission_id);

CREATE INDEX IF NOT EXISTS idx_submission_attachments_project_form
  ON submission_attachments (tenant_id, project_form_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_attachments_ingestion
  ON submission_attachments (ingestion_status, created_at);
