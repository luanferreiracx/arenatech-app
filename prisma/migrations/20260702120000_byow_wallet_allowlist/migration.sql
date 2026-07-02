-- Allowlist de carteiras BYOW (self-custody) do DePix por tenant (ADR 0057, fase
-- BYOW). A API de parceiro só pode receber DePix num endereço que JÁ esteja aqui;
-- cadastrar exige confirmação humana forte (senha+2FA+email+WhatsApp) no painel.
CREATE TABLE "tenant_byow_wallets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "address" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_third_party" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_byow_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_byow_wallets_tenant_id_address_key"
  ON "tenant_byow_wallets"("tenant_id", "address");
CREATE INDEX "tenant_byow_wallets_tenant_id_active_idx"
  ON "tenant_byow_wallets"("tenant_id", "active");

-- RLS: isolamento por tenant (mesmo backstop das demais tabelas tenant-scoped).
ALTER TABLE "tenant_byow_wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_byow_wallets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_byow_wallets"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

-- Snapshot BYOW na transação: o webhook Eulen confirma via valueInCents (sem
-- cross-check on-chain) quando o depósito caiu numa carteira própria do tenant.
ALTER TABLE "tenant_depix_transactions"
  ADD COLUMN "is_byow" BOOLEAN NOT NULL DEFAULT false;
