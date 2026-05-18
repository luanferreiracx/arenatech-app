-- AlterTable: Add OS link, signature, and receipt fields to sales
ALTER TABLE "sales" ADD COLUMN "service_order_id" UUID;
ALTER TABLE "sales" ADD COLUMN "is_os_payment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN "signature_document_id" TEXT;
ALTER TABLE "sales" ADD COLUMN "signature_url" TEXT;
ALTER TABLE "sales" ADD COLUMN "signature_sent_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "signature_signed_at" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "physical_signature" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN "receipt_sent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales" ADD COLUMN "receipt_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sales_tenant_id_service_order_id_idx" ON "sales"("tenant_id", "service_order_id");
