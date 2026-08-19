-- 036_add_service_fee.sql
-- Add Saby platform service fee column to payment_flow

BEGIN;

ALTER TABLE public.payment_flow
    ADD COLUMN IF NOT EXISTS service_fee NUMERIC(12,2) DEFAULT 0;

COMMIT;
