-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('OPEN', 'IN_DIAGNOSIS', 'WAITING_APPROVAL', 'APPROVED', 'WAITING_PARTS', 'IN_PROGRESS', 'COMPLETED', 'PAID', 'READY_FOR_PICKUP', 'DELIVERED', 'IN_WARRANTY', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ServiceOrderItemType" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "technician_id" UUID,
    "created_by_id" UUID NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'OPEN',
    "public_link" TEXT NOT NULL,
    "device_type" TEXT,
    "device_brand" TEXT,
    "device_model" TEXT,
    "serial_number" TEXT,
    "imei" TEXT,
    "device_password" TEXT,
    "accessories" TEXT,
    "reported_problem" TEXT,
    "diagnosed_problem" TEXT,
    "internal_notes" TEXT,
    "customer_notes" TEXT,
    "entry_checklist" JSONB,
    "exit_checklist" JSONB,
    "device_info" JSONB,
    "service_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "parts_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "parts_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "is_warranty" BOOLEAN NOT NULL DEFAULT false,
    "warranty_type" TEXT,
    "warranty_months" INTEGER NOT NULL DEFAULT 3,
    "original_order_id" UUID,
    "entry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "delivered_date" TIMESTAMP(3),
    "payment_method" TEXT,
    "payment_notes" TEXT,
    "payment_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cancellation_reason" TEXT,
    "refund_reason" TEXT,
    "refunded_at" TIMESTAMP(3),
    "refunded_by_id" UUID,
    "sent_to_lab" BOOLEAN NOT NULL DEFAULT false,
    "lab_received" BOOLEAN NOT NULL DEFAULT false,
    "delivery_person_id" UUID,
    "signature_document_id" TEXT,
    "signature_url" TEXT,
    "signature_sent_at" TIMESTAMP(3),
    "signature_signed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "ServiceOrderItemType" NOT NULL,
    "service_id" UUID,
    "product_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "cost_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_public_link_key" ON "service_orders"("public_link");

-- CreateIndex
CREATE INDEX "service_orders_tenant_id_status_idx" ON "service_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "service_orders_tenant_id_customer_id_idx" ON "service_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "service_orders_tenant_id_technician_id_idx" ON "service_orders"("tenant_id", "technician_id");

-- CreateIndex
CREATE INDEX "service_orders_tenant_id_entry_date_idx" ON "service_orders"("tenant_id", "entry_date");

-- CreateIndex
CREATE INDEX "service_orders_tenant_id_deleted_at_idx" ON "service_orders"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "service_orders_public_link_idx" ON "service_orders"("public_link");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_tenant_id_number_key" ON "service_orders"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "service_order_items_tenant_id_order_id_idx" ON "service_order_items"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "service_order_history_tenant_id_order_id_idx" ON "service_order_history"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "service_order_documents_tenant_id_order_id_idx" ON "service_order_documents"("tenant_id", "order_id");

-- AddForeignKey
ALTER TABLE "service_order_items" ADD CONSTRAINT "service_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_history" ADD CONSTRAINT "service_order_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_documents" ADD CONSTRAINT "service_order_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
