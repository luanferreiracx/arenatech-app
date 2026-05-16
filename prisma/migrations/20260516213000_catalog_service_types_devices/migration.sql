-- AlterTable
ALTER TABLE "services" ADD COLUMN "service_type_id" UUID;

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID,
    "name" TEXT NOT NULL,
    "condition" TEXT,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "promotional_price" DECIMAL(10,2),
    "image_url" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "price_updated_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalog_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_device_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catalog_device_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_types_tenant_id_active_idx" ON "service_types"("tenant_id", "active");
CREATE UNIQUE INDEX "service_types_tenant_id_slug_key" ON "service_types"("tenant_id", "slug");
CREATE INDEX "catalog_devices_tenant_id_available_idx" ON "catalog_devices"("tenant_id", "available");
CREATE INDEX "catalog_devices_tenant_id_category_id_idx" ON "catalog_devices"("tenant_id", "category_id");
CREATE INDEX "catalog_device_categories_tenant_id_idx" ON "catalog_device_categories"("tenant_id");
CREATE UNIQUE INDEX "catalog_device_categories_tenant_id_slug_key" ON "catalog_device_categories"("tenant_id", "slug");
CREATE INDEX "services_tenant_id_service_type_id_idx" ON "services"("tenant_id", "service_type_id");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_devices" ADD CONSTRAINT "catalog_devices_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catalog_device_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
ALTER TABLE "service_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "service_types"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "catalog_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_devices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "catalog_devices"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);

ALTER TABLE "catalog_device_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog_device_categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "catalog_device_categories"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
