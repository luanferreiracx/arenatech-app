-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('NFE', 'NFCE', 'NFSE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'AUTHORIZED', 'CANCELLED', 'REJECTED', 'CORRECTION_LETTER');

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "recipient_phone" TEXT,
    "recipient_email" TEXT,
    "recipient_name" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "template_name" TEXT,
    "template_params" JSONB,
    "reference_id" UUID,
    "reference_type" TEXT,
    "provider_message_id" TEXT,
    "provider_response" JSONB,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "number" INTEGER,
    "series" INTEGER DEFAULT 1,
    "access_key" TEXT,
    "reference_id" UUID,
    "reference_type" TEXT,
    "recipient_name" TEXT,
    "recipient_cpf_cnpj" TEXT,
    "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "provider_ref" TEXT,
    "provider_status" TEXT,
    "xml_url" TEXT,
    "pdf_url" TEXT,
    "correction_reason" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "created_by_id" UUID NOT NULL,
    "authorized_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "ncm" TEXT,
    "cfop" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_tenant_id_channel_status_idx" ON "messages"("tenant_id", "channel", "status");

-- CreateIndex
CREATE INDEX "messages_tenant_id_reference_id_idx" ON "messages"("tenant_id", "reference_id");

-- CreateIndex
CREATE INDEX "messages_tenant_id_recipient_phone_idx" ON "messages"("tenant_id", "recipient_phone");

-- CreateIndex
CREATE INDEX "messages_tenant_id_created_at_idx" ON "messages"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "message_templates_tenant_id_channel_active_idx" ON "message_templates"("tenant_id", "channel", "active");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_tenant_id_slug_key" ON "message_templates"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_type_status_idx" ON "invoices"("tenant_id", "type", "status");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_reference_id_idx" ON "invoices"("tenant_id", "reference_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_number_idx" ON "invoices"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_access_key_idx" ON "invoices"("tenant_id", "access_key");

-- CreateIndex
CREATE INDEX "invoice_items_tenant_id_invoice_id_idx" ON "invoice_items"("tenant_id", "invoice_id");

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
