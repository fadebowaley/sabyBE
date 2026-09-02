-- 037_add_payment_flow_settlement_breakdown.sql
-- Align payment_flow with settlement fields emitted by paymentFlow.service.

BEGIN;

ALTER TABLE public.payment_flow
    ADD COLUMN IF NOT EXISTS provider_fee NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_app_fee NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS provider_merchant_fee NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS destination_account_number VARCHAR(128),
    ADD COLUMN IF NOT EXISTS destination_account_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS destination_bank_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS destination_bank_code VARCHAR(64);

COMMIT;
