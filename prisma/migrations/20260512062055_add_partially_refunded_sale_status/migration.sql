-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterTable
ALTER TABLE "financial_transactions" ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "supplier" TEXT;

-- AlterTable
ALTER TABLE "installments" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "payment_method" TEXT;
