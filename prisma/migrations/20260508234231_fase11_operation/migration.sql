-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('SENT', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "delivery_persons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_labs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_labs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "lab_id" UUID NOT NULL,
    "service_order_id" UUID,
    "delivery_person_id" UUID,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'SENT',
    "device_description" TEXT,
    "problem" TEXT,
    "estimated_cost" DECIMAL(10,2),
    "final_cost" DECIMAL(10,2),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_providers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "commission_rate" DECIMAL(5,2),
    "contract_details" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_persons_tenant_id_active_idx" ON "delivery_persons"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "external_labs_tenant_id_active_idx" ON "external_labs"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "lab_orders_tenant_id_status_idx" ON "lab_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "lab_orders_tenant_id_lab_id_idx" ON "lab_orders"("tenant_id", "lab_id");

-- CreateIndex
CREATE INDEX "lab_orders_tenant_id_service_order_id_idx" ON "lab_orders"("tenant_id", "service_order_id");

-- CreateIndex
CREATE INDEX "service_providers_tenant_id_active_idx" ON "service_providers"("tenant_id", "active");

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "external_labs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
