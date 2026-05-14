-- AlterTable
ALTER TABLE "products" ADD COLUMN     "category_id" UUID;

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PJ',
    "name" TEXT NOT NULL,
    "trade_name" TEXT,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_idx" ON "product_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenant_id_name_key" ON "product_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_active_idx" ON "suppliers"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_cpf_cnpj_idx" ON "suppliers"("tenant_id", "cpf_cnpj");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_name_idx" ON "suppliers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_id_idx" ON "products"("tenant_id", "category_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
