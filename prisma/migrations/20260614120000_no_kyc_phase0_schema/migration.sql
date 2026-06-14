-- Fase 0 do onboarding NO-KYC (ADR 0050).
-- Schema base: cpf opcional + unicidade parcial, email único parcial, tabela
-- global verification_codes (sem RLS) e campos NO-KYC em pre_registrations.
--
-- Migration SQL manual (índices/constraints sensíveis): a skill database e o
-- CLAUDE.md exigem SQL puro para mudanças de unicidade. Em banco LIMPO (CI)
-- aplica direto; em produção, criar índices CONCURRENTLY fora de transação
-- (ver nota no fim) — aqui priorizamos a aplicação limpa do CI.

-- ---------------------------------------------------------------------------
-- 1. users.cpf: NOT NULL -> NULL, e índice único TOTAL -> PARCIAL
-- ---------------------------------------------------------------------------
-- KYC loga por cpf (presente); NO-KYC loga por email (cpf nulo). Unicidade só
-- entre cpfs não-nulos.
ALTER TABLE "users" ALTER COLUMN "cpf" DROP NOT NULL;

DROP INDEX IF EXISTS "users_cpf_key";
CREATE UNIQUE INDEX "users_cpf_key" ON "users" ("cpf") WHERE "cpf" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. users.email: índice único PARCIAL (email é o login do NO-KYC)
-- ---------------------------------------------------------------------------
-- email já é nullable. Garante unicidade entre emails não-nulos sem rejeitar os
-- usuários KYC legados que não têm email.
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email") WHERE "email" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. verification_codes (tabela GLOBAL, sem RLS — igual password_reset_tokens)
-- ---------------------------------------------------------------------------
CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'WHATSAPP');

CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "channel" "VerificationChannel" NOT NULL,
    "pre_registration_id" UUID,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_codes_target_channel_idx" ON "verification_codes" ("target", "channel");
CREATE INDEX "verification_codes_pre_registration_id_idx" ON "verification_codes" ("pre_registration_id");
CREATE INDEX "verification_codes_expires_at_idx" ON "verification_codes" ("expires_at");

-- DML para app_user/app_admin vem de ALTER DEFAULT PRIVILEGES (migration
-- 20260508155300_enable_rls) — tabelas futuras já herdam os grants.

-- ---------------------------------------------------------------------------
-- 4. pre_registrations: owner_cpf opcional + campos NO-KYC
-- ---------------------------------------------------------------------------
ALTER TABLE "pre_registrations" ALTER COLUMN "owner_cpf" DROP NOT NULL;
ALTER TABLE "pre_registrations" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "pre_registrations" ADD COLUMN "email_verified_at" TIMESTAMP(3);
ALTER TABLE "pre_registrations" ADD COLUMN "phone_verified_at" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- NOTA DE PRODUÇÃO (zero-downtime):
--   Os CREATE [UNIQUE] INDEX acima rodam dentro da transação da migration (OK
--   em banco limpo do CI). Em produção, com tabela users populada, criar os
--   índices com CREATE INDEX CONCURRENTLY fora de transação e validar antes de
--   promover. Como users é pequena (poucos usuários por tenant), o lock é
--   curto; ainda assim, preferir CONCURRENTLY na janela de deploy.
-- ---------------------------------------------------------------------------
