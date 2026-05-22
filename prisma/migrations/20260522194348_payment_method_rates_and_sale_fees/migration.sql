-- Paridade Laravel: configuração de formas de pagamento + tabela de taxas.

-- PaymentMethod: novos campos
ALTER TABLE "payment_methods" ADD COLUMN "code" VARCHAR(50);
ALTER TABLE "payment_methods" ADD COLUMN "fee_fixed" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "payment_methods" ADD COLUMN "accepts_installments" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payment_methods" ADD COLUMN "installments_min" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payment_methods" ADD COLUMN "installments_max" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payment_methods" ADD COLUMN "settlement_days" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "payment_methods_tenant_code_key" ON "payment_methods"("tenant_id", "code");

-- Enums
CREATE TYPE "PaymentFeePolicy" AS ENUM ('LOJA_ABSORVE', 'CLIENTE_PAGA');
CREATE TYPE "PaymentRateAppliesTo" AS ENUM ('APARELHO', 'NAO_APARELHO', 'AMBOS');

-- PaymentMethodRate (paridade forma_pagamento_taxas)
CREATE TABLE "payment_method_rates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "payment_method_id" UUID NOT NULL REFERENCES "payment_methods"("id") ON DELETE CASCADE,
  "installments" INTEGER NOT NULL,
  "applies_to" "PaymentRateAppliesTo" NOT NULL DEFAULT 'AMBOS',
  "policy" "PaymentFeePolicy" NOT NULL DEFAULT 'LOJA_ABSORVE',
  "fee_percent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
  "fee_fixed" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "settlement_days" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "payment_method_rates_method_installments_applies_key"
  ON "payment_method_rates"("payment_method_id", "installments", "applies_to");
CREATE INDEX "payment_method_rates_tenant_method_idx"
  ON "payment_method_rates"("tenant_id", "payment_method_id");

-- Sale: campos de breakdown de pagamento + receita liquida
ALTER TABLE "sales" ADD COLUMN "surcharge_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "operator_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN "net_revenue_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0;
