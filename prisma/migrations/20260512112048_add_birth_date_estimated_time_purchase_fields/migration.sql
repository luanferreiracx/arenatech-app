-- AlterTable
ALTER TABLE "device_purchases" ADD COLUMN     "battery_health" INTEGER,
ADD COLUMN     "sale_price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "estimated_time" TEXT;
