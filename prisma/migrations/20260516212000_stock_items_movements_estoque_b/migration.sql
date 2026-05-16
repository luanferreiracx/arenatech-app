-- CreateEnum
CREATE TYPE "StockItemStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'DEFECTIVE', 'RETURNED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "StockItemCondition" AS ENUM ('NEW', 'SEMI_NEW', 'USED', 'DISPLAY');

-- DropIndex
DROP INDEX "stock_movements_tenant_id_created_at_idx";

-- DropIndex
DROP INDEX "stock_movements_tenant_id_product_id_idx";

-- AlterTable
ALTER TABLE "stock_movements" DROP COLUMN "unit_cost",
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "quantity_after" INTEGER,
ADD COLUMN     "quantity_before" INTEGER,
ADD COLUMN     "stock_item_id" UUID,
ADD COLUMN     "variation_id" UUID;

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variation_id" UUID,
    "supplier_id" UUID,
    "imei" TEXT,
    "serial_number" TEXT,
    "barcode" TEXT,
    "condition" "StockItemCondition" NOT NULL DEFAULT 'NEW',
    "conservation_grade" TEXT,
    "battery_health" INTEGER,
    "warranty_months" INTEGER,
    "cost_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "suggested_sale_price" DECIMAL(10,2),
    "invoice_number" TEXT,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StockItemStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reserved_for_type" TEXT,
    "reserved_for_id" UUID,
    "reserved_at" TIMESTAMP(3),
    "sale_id" UUID,
    "sold_at" TIMESTAMP(3),
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_product_id_status_idx" ON "stock_items"("tenant_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_imei_idx" ON "stock_items"("tenant_id", "imei");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_serial_number_idx" ON "stock_items"("tenant_id", "serial_number");

-- CreateIndex
CREATE INDEX "stock_items_tenant_id_status_idx" ON "stock_items"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_stock_item_id_created_at_idx" ON "stock_movements"("tenant_id", "stock_item_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_type_created_at_idx" ON "stock_movements"("tenant_id", "type", "created_at");

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "product_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "stock_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "stock_items"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
