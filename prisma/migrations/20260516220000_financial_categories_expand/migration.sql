-- CreateEnum
CREATE TYPE "FinancialCategoryType" AS ENUM ('RECEITA', 'DESPESA');
CREATE TYPE "FinancialCategoryKind" AS ENUM ('FIXED', 'CUSTOM');

-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'ESTORNADA';

-- AlterTable financial_transactions
ALTER TABLE "financial_transactions"
ADD COLUMN "cancel_reason" TEXT,
ADD COLUMN "cancelled_at" TIMESTAMP(3),
ADD COLUMN "cancelled_by_user_id" UUID,
ADD COLUMN "category_id" UUID,
ADD COLUMN "created_by_user_id" UUID,
ADD COLUMN "installments_total" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "is_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "payment_method_id" UUID,
ADD COLUMN "sale_id" UUID,
ADD COLUMN "service_order_id" UUID,
ADD COLUMN "supplier_id" UUID;

-- AlterTable installments
ALTER TABLE "installments"
ADD COLUMN "estornada_at" TIMESTAMP(3),
ADD COLUMN "estornada_by_user_id" UUID,
ADD COLUMN "estorno_reason" TEXT,
ADD COLUMN "paid_by_user_id" UUID;

-- CreateTable
CREATE TABLE "financial_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "FinancialCategoryType" NOT NULL,
    "kind" "FinancialCategoryKind" NOT NULL DEFAULT 'CUSTOM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "financial_categories_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "financial_categories_tenant_id_type_active_idx" ON "financial_categories"("tenant_id", "type", "active");
CREATE UNIQUE INDEX "financial_categories_tenant_id_code_key" ON "financial_categories"("tenant_id", "code");
CREATE INDEX "financial_transactions_tenant_id_sale_id_idx" ON "financial_transactions"("tenant_id", "sale_id");
CREATE INDEX "financial_transactions_tenant_id_service_order_id_idx" ON "financial_transactions"("tenant_id", "service_order_id");
CREATE INDEX "financial_transactions_tenant_id_category_id_idx" ON "financial_transactions"("tenant_id", "category_id");
CREATE INDEX "installments_tenant_id_paid_at_idx" ON "installments"("tenant_id", "paid_at");

-- FK
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "financial_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "financial_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "financial_categories"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
