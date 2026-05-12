-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "birth_date" DATE;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "observations" TEXT;
