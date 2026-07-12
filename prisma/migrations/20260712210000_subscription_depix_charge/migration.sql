-- ADR 0058: cobrança da assinatura via DePix (self-service + webhook).
-- 1. Novo valor de enum SUBSCRIPTION em DepixTransactionSourceType.
-- 2. Coluna subscription_applied_at (guarda de idempotência da renovação).

ALTER TYPE "DepixTransactionSourceType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';

ALTER TABLE "tenant_depix_transactions"
  ADD COLUMN IF NOT EXISTS "subscription_applied_at" TIMESTAMP(3);
