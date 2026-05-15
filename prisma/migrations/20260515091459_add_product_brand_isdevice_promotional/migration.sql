-- AlterTable
ALTER TABLE "products" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "image_url" TEXT,
ADD COLUMN     "is_device" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promotional_price" DECIMAL(10,2);
