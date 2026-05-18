-- CreateEnum
CREATE TYPE "NfeImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NfeItemStatus" AS ENUM ('PENDING', 'LINKED', 'IMPORTED', 'IGNORED');

-- CreateTable
CREATE TABLE "nfe_imports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "access_key" TEXT NOT NULL,
    "nf_number" TEXT,
    "series" TEXT,
    "issue_date" TIMESTAMP(3),
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" UUID,
    "issuer_cnpj" TEXT,
    "issuer_name" TEXT,
    "issuer_trade_name" TEXT,
    "issuer_ie" TEXT,
    "recipient_cnpj" TEXT,
    "recipient_name" TEXT,
    "total_products_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freight_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "insurance_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_expenses_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "effective_freight" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "effective_insurance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "effective_other_expenses" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "icms_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ipi_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pis_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cofins_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "NfeImportStatus" NOT NULL DEFAULT 'PENDING',
    "processed_by_id" UUID,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "xml_original" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfe_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfe_import_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nfe_import_id" UUID NOT NULL,
    "item_number" INTEGER NOT NULL,
    "product_code" TEXT,
    "barcode" TEXT,
    "description" TEXT NOT NULL,
    "ncm" TEXT,
    "cest" TEXT,
    "cfop" TEXT,
    "unit" TEXT,
    "quantity" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "custom_unit_price" DECIMAL(10,4),
    "total_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allocated_freight" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "allocated_insurance" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "allocated_other_expenses" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "total_unit_cost" DECIMAL(10,4),
    "icms_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ipi_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "product_id" UUID,
    "variation_id" UUID,
    "condition" TEXT,
    "status" "NfeItemStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "nfe_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nfe_imports_tenant_id_access_key_key" ON "nfe_imports"("tenant_id", "access_key");
CREATE INDEX "nfe_imports_tenant_id_status_idx" ON "nfe_imports"("tenant_id", "status");
CREATE INDEX "nfe_imports_tenant_id_issuer_cnpj_idx" ON "nfe_imports"("tenant_id", "issuer_cnpj");
CREATE INDEX "nfe_imports_tenant_id_entry_date_idx" ON "nfe_imports"("tenant_id", "entry_date");
CREATE INDEX "nfe_import_items_tenant_id_nfe_import_id_idx" ON "nfe_import_items"("tenant_id", "nfe_import_id");
CREATE INDEX "nfe_import_items_tenant_id_product_id_idx" ON "nfe_import_items"("tenant_id", "product_id");

-- AddForeignKey
ALTER TABLE "nfe_import_items" ADD CONSTRAINT "nfe_import_items_nfe_import_id_fkey" FOREIGN KEY ("nfe_import_id") REFERENCES "nfe_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
