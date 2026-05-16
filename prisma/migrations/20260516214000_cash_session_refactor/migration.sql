-- CreateEnum
CREATE TYPE "CashSessionCloseType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('SALE', 'DEPOSIT', 'WITHDRAWAL', 'EXPENSE');

-- CreateEnum
CREATE TYPE "CashMovementNature" AS ENUM ('INCOME', 'OUTCOME');

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "initial_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "calculated_balance" DECIMAL(10,2),
    "declared_balance" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "opening_note" TEXT,
    "closing_note" TEXT,
    "close_type" "CashSessionCloseType",
    "closed_by_user_id" UUID,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" UUID,
    "verified_note" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "nature" "CashMovementNature" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" TEXT,
    "payment_method_id" UUID,
    "description" TEXT,
    "reference_type" TEXT,
    "reference_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_user_id_opened_at_idx" ON "cash_sessions"("tenant_id", "user_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_closed_at_idx" ON "cash_sessions"("tenant_id", "closed_at");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_verified_close_type_idx" ON "cash_sessions"("tenant_id", "verified", "close_type");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_tenant_id_user_id_closed_at_key" ON "cash_sessions"("tenant_id", "user_id", "closed_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_cash_session_id_created_at_idx" ON "cash_movements"("tenant_id", "cash_session_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_type_created_at_idx" ON "cash_movements"("tenant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_payment_method_created_at_idx" ON "cash_movements"("tenant_id", "payment_method", "created_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_reference_type_reference_id_idx" ON "cash_movements"("tenant_id", "reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS

ALTER TABLE "cash_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cash_sessions"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cash_movements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "cash_movements"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
