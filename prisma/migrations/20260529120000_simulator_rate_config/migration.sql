-- CreateTable: SimulatorRateConfig (taxas exibidas ao cliente no simulador)
CREATE TABLE "simulator_rate_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "credit_avista_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "debit_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "max_installments" INTEGER NOT NULL DEFAULT 12,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "simulator_rate_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "simulator_rate_configs_tenant_id_key" ON "simulator_rate_configs"("tenant_id");

-- CreateTable: SimulatorInstallmentTier (juros_Nx relacional)
CREATE TABLE "simulator_installment_tiers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "config_id" UUID NOT NULL,
    "installments" INTEGER NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    CONSTRAINT "simulator_installment_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "simulator_installment_tiers_config_id_installments_key" ON "simulator_installment_tiers"("config_id", "installments");
CREATE INDEX "simulator_installment_tiers_tenant_id_idx" ON "simulator_installment_tiers"("tenant_id");

ALTER TABLE "simulator_installment_tiers"
  ADD CONSTRAINT "simulator_installment_tiers_config_id_fkey"
  FOREIGN KEY ("config_id") REFERENCES "simulator_rate_configs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
ALTER TABLE "simulator_rate_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "simulator_rate_configs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "simulator_rate_configs"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "simulator_installment_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "simulator_installment_tiers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "simulator_installment_tiers"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
