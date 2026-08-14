-- 035_create_payment_flow.sql
-- Denormalized payment → settlement flow for dashboard visibility
-- One row per payment, upserted on every lifecycle event

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_flow (
    id                   BIGSERIAL PRIMARY KEY,

    tenant_id            VARCHAR(64)   NOT NULL,
    user_id              VARCHAR(64),
    user_name            VARCHAR(255),
    user_email           VARCHAR(255),

    payment_id           VARCHAR(64)   NOT NULL UNIQUE,
    payment_reference    VARCHAR(128)  NOT NULL,
    provider             VARCHAR(32)   NOT NULL,
    amount               NUMERIC(12,2) NOT NULL,
    currency             VARCHAR(8)    NOT NULL,
    purpose              VARCHAR(32)   NOT NULL,
    beneficiary          VARCHAR(16)   NOT NULL,

    payment_status       VARCHAR(16)   NOT NULL,
    payment_created_at   TIMESTAMPTZ,
    payment_processed_at TIMESTAMPTZ,
    payment_completed_at TIMESTAMPTZ,
    payment_failed_at    TIMESTAMPTZ,
    failure_reason       TEXT,

    settlement_id        VARCHAR(64),
    settlement_status    VARCHAR(16),
    funding_status       VARCHAR(32),
    availability_status  VARCHAR(32),
    provider_settlement_id VARCHAR(128),
    provider_settled_at  TIMESTAMPTZ,
    settlement_fee       NUMERIC(12,2) DEFAULT 0,
    net_amount           NUMERIC(12,2),

    destination_type     VARCHAR(32),
    destination_node     VARCHAR(128),

    reconciliation_status VARCHAR(16) DEFAULT 'clean',
    last_reconciled_at   TIMESTAMPTZ,
    remittance_queued    BOOLEAN DEFAULT FALSE,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_tenant  ON public.payment_flow (tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_pf_provider ON public.payment_flow (provider, funding_status);
CREATE INDEX IF NOT EXISTS idx_pf_date    ON public.payment_flow (payment_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pf_status  ON public.payment_flow (payment_status);
CREATE INDEX IF NOT EXISTS idx_pf_ref     ON public.payment_flow (payment_reference);

COMMIT;
