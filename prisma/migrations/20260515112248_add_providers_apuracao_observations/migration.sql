-- CreateEnum
CREATE TYPE "ProviderProfile" AS ENUM ('SELLER', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "ProviderBondType" AS ENUM ('MEI', 'CLT');

-- CreateEnum
CREATE TYPE "ProviderApuracaoStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderReversalType" AS ENUM ('RETURN_SAME_MONTH', 'RETURN_LATER_MONTH', 'CHARGEBACK_PROVIDER', 'CHARGEBACK_FRAUD', 'DEFAULT_60D', 'WARRANTY_REFUND', 'WARRANTY_PARTIAL', 'MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "service_observations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "service_types" JSONB,
    "device_models" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cpf" TEXT,
    "whatsapp" TEXT,
    "profile" "ProviderProfile" NOT NULL,
    "bond_type" "ProviderBondType" NOT NULL DEFAULT 'MEI',
    "cnpj_mei" TEXT,
    "razao_social" TEXT,
    "cnae_principal" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "allowance_cap" DECIMAL(10,2),
    "daily_meal" DECIMAL(10,2),
    "daily_transport" DECIMAL(10,2),
    "monthly_cellphone" DECIMAL(10,2),
    "notes" TEXT,
    "signed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_commission_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'normal',
    "range_min" DECIMAL(10,2) NOT NULL,
    "range_max" DECIMAL(10,2),
    "rate" DECIMAL(7,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_apuracoes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "ProviderApuracaoStatus" NOT NULL DEFAULT 'OPEN',
    "gross_commission" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_reversals" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_allowance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cap_reduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "memory_json" JSONB,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" UUID,
    "paid_at" TIMESTAMP(3),
    "financial_transaction_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_apuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_reversals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "apuracao_id" UUID,
    "fact_date" DATE NOT NULL,
    "type" "ProviderReversalType" NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "registered_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_uncovered_days" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_uncovered_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_observations_tenant_id_active_idx" ON "service_observations"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "providers_tenant_id_active_idx" ON "providers"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "providers_tenant_id_user_id_key" ON "providers"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "provider_contracts_tenant_id_provider_id_idx" ON "provider_contracts"("tenant_id", "provider_id");

-- CreateIndex
CREATE INDEX "provider_commission_rules_tenant_id_contract_id_idx" ON "provider_commission_rules"("tenant_id", "contract_id");

-- CreateIndex
CREATE INDEX "provider_apuracoes_tenant_id_provider_id_idx" ON "provider_apuracoes"("tenant_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_apuracoes_tenant_id_provider_id_year_month_key" ON "provider_apuracoes"("tenant_id", "provider_id", "year", "month");

-- CreateIndex
CREATE INDEX "provider_reversals_tenant_id_provider_id_idx" ON "provider_reversals"("tenant_id", "provider_id");

-- CreateIndex
CREATE INDEX "provider_reversals_tenant_id_fact_date_idx" ON "provider_reversals"("tenant_id", "fact_date");

-- CreateIndex
CREATE INDEX "provider_uncovered_days_tenant_id_provider_id_idx" ON "provider_uncovered_days"("tenant_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_uncovered_days_tenant_id_provider_id_day_key" ON "provider_uncovered_days"("tenant_id", "provider_id", "day");

-- AddForeignKey
ALTER TABLE "provider_contracts" ADD CONSTRAINT "provider_contracts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_commission_rules" ADD CONSTRAINT "provider_commission_rules_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "provider_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_apuracoes" ADD CONSTRAINT "provider_apuracoes_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_reversals" ADD CONSTRAINT "provider_reversals_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_reversals" ADD CONSTRAINT "provider_reversals_apuracao_id_fkey" FOREIGN KEY ("apuracao_id") REFERENCES "provider_apuracoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_uncovered_days" ADD CONSTRAINT "provider_uncovered_days_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
