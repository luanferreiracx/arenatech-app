-- Instruções da loja para o bot Talison (ADR 0055 + revisão 2026-07-13). Aditiva,
-- tudo nullable/default — zero-downtime, sem backfill. tenant_settings já tem RLS
-- forçado (guard-rail da auditoria) — os novos campos herdam o isolamento por tenant.

ALTER TABLE "tenant_settings"
  ADD COLUMN "bot_instructions_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bot_instructions" TEXT,
  ADD COLUMN "bot_instructions_previous" TEXT,
  ADD COLUMN "bot_instructions_updated_at" TIMESTAMP(3);
