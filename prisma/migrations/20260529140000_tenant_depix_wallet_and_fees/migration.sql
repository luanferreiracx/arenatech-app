-- Modulo DePix multi-tenant (LWK) — Fase 1: vinculo carteira + config de taxa.
-- Mnemonic/chave privada NUNCA aqui (fica no volume do LWK). So descriptor
-- publico (watch-only) + endereco mestre.

CREATE TABLE "tenant_depix_wallets" (
  "tenant_id"            UUID NOT NULL,
  "liquid_descriptor"    TEXT NOT NULL,
  "master_address"       TEXT NOT NULL,
  "network"              TEXT NOT NULL DEFAULT 'mainnet',
  "lbtc_funding_address" TEXT,
  "provisioned_at"       TIMESTAMP(3),
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_depix_wallets_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "tenant_depix_wallets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_depix_wallets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_depix_wallets"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Config de taxa cobrada pela Arena Tech por transacao DePix.
-- Defaults: entrada R$0,99 (99 centavos) + 1,5% ; saida R$0,99 + 1,7%.
CREATE TABLE "tenant_depix_fee_configs" (
  "tenant_id"         UUID NOT NULL,
  "entry_fee_fixed"   INTEGER NOT NULL DEFAULT 99,
  "entry_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
  "exit_fee_fixed"    INTEGER NOT NULL DEFAULT 99,
  "exit_fee_percent"  DECIMAL(5,2) NOT NULL DEFAULT 1.7,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_depix_fee_configs_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "tenant_depix_fee_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_depix_fee_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "tenant_depix_fee_configs"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
