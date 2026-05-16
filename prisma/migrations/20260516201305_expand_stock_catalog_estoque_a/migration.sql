/*
  Warnings:

  - You are about to drop the column `current_stock` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `is_device` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `cpf_cnpj` on the `suppliers` table. All the data in the column will be lost.
  - The `type` column on the `suppliers` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('PF', 'PJ');

-- DropIndex
DROP INDEX "suppliers_tenant_id_cpf_cnpj_idx";

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "badge_color" TEXT NOT NULL DEFAULT '#6c757d',
ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "current_stock",
DROP COLUMN "is_device",
ADD COLUMN     "cest" TEXT,
ADD COLUMN     "default_margin" DECIMAL(5,2),
ADD COLUMN     "has_variations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "icms_differential_rate" DECIMAL(5,2),
ADD COLUMN     "is_premium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_serialized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ncm" TEXT;

-- AlterTable
ALTER TABLE "suppliers" DROP COLUMN "address",
DROP COLUMN "cpf_cnpj",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "complement" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "street" TEXT,
ADD COLUMN     "street_number" TEXT,
ADD COLUMN     "zip_code" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "SupplierType" NOT NULL DEFAULT 'PJ';

-- CreateTable
CREATE TABLE "product_category_pivots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_category_pivots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_values" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "attribute_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "display_value" TEXT,
    "code" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "cost_price" DECIMAL(10,2),
    "sale_price" DECIMAL(10,2),
    "promotional_price" DECIMAL(10,2),
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variation_attributes" (
    "id" UUID NOT NULL,
    "variation_id" UUID NOT NULL,
    "attribute_value_id" UUID NOT NULL,

    CONSTRAINT "product_variation_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_configs" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "attribute_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_attribute_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "thumb_url" TEXT,
    "medium_url" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_category_pivots_category_id_idx" ON "product_category_pivots"("category_id");

-- CreateIndex
CREATE INDEX "product_category_pivots_tenant_id_idx" ON "product_category_pivots"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_category_pivots_product_id_category_id_key" ON "product_category_pivots"("product_id", "category_id");

-- CreateIndex
CREATE INDEX "product_attributes_tenant_id_active_idx" ON "product_attributes"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_attributes_tenant_id_slug_key" ON "product_attributes"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "product_attribute_values_tenant_id_attribute_id_idx" ON "product_attribute_values"("tenant_id", "attribute_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_values_attribute_id_value_key" ON "product_attribute_values"("attribute_id", "value");

-- CreateIndex
CREATE INDEX "product_variations_tenant_id_product_id_idx" ON "product_variations"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "product_variations_tenant_id_sku_idx" ON "product_variations"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variation_attributes_variation_id_attribute_value_i_key" ON "product_variation_attributes"("variation_id", "attribute_value_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_attribute_configs_product_id_attribute_id_key" ON "product_attribute_configs"("product_id", "attribute_id");

-- CreateIndex
CREATE INDEX "product_photos_tenant_id_product_id_order_idx" ON "product_photos"("tenant_id", "product_id", "order");

-- CreateIndex
CREATE INDEX "product_photos_tenant_id_product_id_is_primary_idx" ON "product_photos"("tenant_id", "product_id", "is_primary");

-- CreateIndex
CREATE INDEX "products_tenant_id_brand_idx" ON "products"("tenant_id", "brand");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_cpf_idx" ON "suppliers"("tenant_id", "cpf");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_cnpj_idx" ON "suppliers"("tenant_id", "cnpj");

-- AddForeignKey
ALTER TABLE "product_category_pivots" ADD CONSTRAINT "product_category_pivots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_pivots" ADD CONSTRAINT "product_category_pivots_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variations" ADD CONSTRAINT "product_variations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variation_attributes" ADD CONSTRAINT "product_variation_attributes_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "product_variations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variation_attributes" ADD CONSTRAINT "product_variation_attributes_attribute_value_id_fkey" FOREIGN KEY ("attribute_value_id") REFERENCES "product_attribute_values"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_configs" ADD CONSTRAINT "product_attribute_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_configs" ADD CONSTRAINT "product_attribute_configs_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
