-- AlterTable: Add cancellation and date fields to device_purchases
ALTER TABLE "device_purchases" ADD COLUMN "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "device_purchases" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "device_purchases" ADD COLUMN "cancellation_reason" TEXT;
