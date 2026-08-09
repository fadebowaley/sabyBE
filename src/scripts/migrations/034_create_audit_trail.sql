-- 034_create_audit_trail.sql
-- Universal user activity audit trail
-- Captures: user X from tenant R performed action Y on resource Z at time T from IP A

BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_trail (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       VARCHAR(64)  NOT NULL,
    user_id         VARCHAR(64),
    user_name       VARCHAR(255),
    user_email      VARCHAR(255),
    action          VARCHAR(64)  NOT NULL,
    resource        VARCHAR(128) NOT NULL,
    resource_id     VARCHAR(128),
    method          VARCHAR(10)  NOT NULL,
    path            VARCHAR(512) NOT NULL,
    status_code     INTEGER,
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    request_body    JSONB,
    duration_ms     INTEGER,
    error_message   TEXT,
    correlation_id  VARCHAR(64),
    source          VARCHAR(32)  DEFAULT 'api',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_id
    ON public.audit_trail (tenant_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id
    ON public.audit_trail (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_action
    ON public.audit_trail (action);

CREATE INDEX IF NOT EXISTS idx_audit_trail_resource
    ON public.audit_trail (resource, resource_id);

CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at
    ON public.audit_trail (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_trail_method
    ON public.audit_trail (method);

COMMIT;
