CREATE TABLE IF NOT EXISTS public_form_uploads (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  reference TEXT NULL,
  access_token_hash TEXT NULL,
  session_key TEXT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'aws-s3',
  storage_path TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  width INTEGER NULL,
  height INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  submission_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_public_form_uploads_form_field
ON public_form_uploads (tenant_id, project_id, form_id, field_id, status);

CREATE INDEX IF NOT EXISTS idx_public_form_uploads_reference
ON public_form_uploads (reference);

CREATE INDEX IF NOT EXISTS idx_public_form_uploads_submission
ON public_form_uploads (submission_id);
