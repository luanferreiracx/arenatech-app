-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_type" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "imei" TEXT,
    "serial_number" TEXT,
    "customer_id" UUID,
    "customer_name" TEXT,
    "results" JSONB NOT NULL DEFAULT '{}',
    "offered_value" DECIMAL(10,2),
    "evaluator_notes" TEXT,
    "service_order_id" UUID,
    "purchase_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklists_tenant_id_created_at_idx" ON "checklists"("tenant_id", "created_at");
CREATE INDEX "checklists_tenant_id_device_type_idx" ON "checklists"("tenant_id", "device_type");
CREATE INDEX "checklists_tenant_id_customer_id_idx" ON "checklists"("tenant_id", "customer_id");
CREATE INDEX "checklists_tenant_id_imei_idx" ON "checklists"("tenant_id", "imei");
