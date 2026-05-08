-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('SALE', 'SERVICE_ORDER');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommissionType" NOT NULL,
    "role" TEXT NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "fixed_amount" DECIMAL(10,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rule_id" UUID,
    "type" "CommissionType" NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "reference_id" UUID NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "base_amount" DECIMAL(10,2) NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "commission_amount" DECIMAL(10,2) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imei_queries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "imei" TEXT NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imei_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imei_quotas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "monthly_limit" INTEGER NOT NULL DEFAULT 50,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "period_month" INTEGER NOT NULL,
    "period_year" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "imei_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rules_tenant_id_type_active_idx" ON "commission_rules"("tenant_id", "type", "active");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_user_id_period_year_period_month_idx" ON "commissions"("tenant_id", "user_id", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_status_idx" ON "commissions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "commissions_tenant_id_reference_id_idx" ON "commissions"("tenant_id", "reference_id");

-- CreateIndex
CREATE INDEX "imei_queries_tenant_id_created_at_idx" ON "imei_queries"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "imei_queries_tenant_id_imei_idx" ON "imei_queries"("tenant_id", "imei");

-- CreateIndex
CREATE UNIQUE INDEX "imei_quotas_tenant_id_period_month_period_year_key" ON "imei_quotas"("tenant_id", "period_month", "period_year");
