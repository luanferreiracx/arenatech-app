-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CashMovementType" ADD VALUE 'EXPENSE';
ALTER TYPE "CashMovementType" ADD VALUE 'REFUND';
ALTER TYPE "CashMovementType" ADD VALUE 'OPENING';
ALTER TYPE "CashMovementType" ADD VALUE 'CLOSING';

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "current_balance" DECIMAL(10,2),
ADD COLUMN     "nature" TEXT NOT NULL DEFAULT 'INFLOW',
ADD COLUMN     "previous_balance" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "cash_registers" ADD COLUMN     "closing_details" JSONB,
ADD COLUMN     "opening_notes" TEXT;

-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN     "customer_name" TEXT,
ADD COLUMN     "emission_date" TIMESTAMP(3);
