-- AlterTable: ServiceOrder ganha service_provider_id (paridade Laravel prestador_id)
ALTER TABLE "service_orders"
ADD COLUMN "service_provider_id" UUID;

-- AlterTable: LabOrder ganha payable_transaction_id
ALTER TABLE "lab_orders"
ADD COLUMN "payable_transaction_id" UUID;

-- CreateEnum: ExpenseCategory + ExpenseStatus
CREATE TYPE "ExpenseCategory" AS ENUM (
  'TRAVEL', 'MEALS', 'SUPPLIES', 'MAINTENANCE', 'UTILITIES',
  'RENT', 'SOFTWARE', 'MARKETING', 'TAXES', 'OTHER'
);

CREATE TYPE "ExpenseStatus" AS ENUM (
  'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED'
);

-- CreateTable: Expense
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "rejected_reason" TEXT,
    "due_date" TIMESTAMP(3),
    "payable_transaction_id" UUID,
    "attachment_url" TEXT,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_tenant_id_status_idx" ON "expenses"("tenant_id", "status");
CREATE INDEX "expenses_tenant_id_category_idx" ON "expenses"("tenant_id", "category");
CREATE INDEX "expenses_tenant_id_created_by_user_id_idx" ON "expenses"("tenant_id", "created_by_user_id");
CREATE INDEX "expenses_tenant_id_due_date_idx" ON "expenses"("tenant_id", "due_date");
CREATE INDEX "expenses_tenant_id_deleted_at_idx" ON "expenses"("tenant_id", "deleted_at");

-- RLS
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "expenses"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
