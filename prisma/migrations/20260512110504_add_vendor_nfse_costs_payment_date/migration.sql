-- AlterTable
ALTER TABLE "service_orders" ADD COLUMN     "nfse_issued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nfse_number" TEXT,
ADD COLUMN     "other_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payment_date" TIMESTAMP(3),
ADD COLUMN     "vendor_id" UUID;
