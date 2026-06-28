-- Taxa propria do SAQUE ON-CHAIN (Sideswap), por-tenant, independente do saque
-- PIX. Default 0 (sem taxa) ate o superadmin configurar — nao muda comportamento.
ALTER TABLE "tenant_depix_fee_configs"
  ADD COLUMN "onchain_fee_fixed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "onchain_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
