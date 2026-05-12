-- AlterTable
ALTER TABLE "service_orders" ADD COLUMN     "budget_pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delivery_term_autentique_id" TEXT,
ADD COLUMN     "delivery_term_link" TEXT,
ADD COLUMN     "delivery_term_physical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delivery_term_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delivery_term_sent_at" TIMESTAMP(3),
ADD COLUMN     "delivery_term_signed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "delivery_term_signed_at" TIMESTAMP(3),
ADD COLUMN     "depix_status" TEXT,
ADD COLUMN     "depix_transaction_id" TEXT,
ADD COLUMN     "pending_quote_id" UUID,
ADD COLUMN     "physical_signature" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receipt_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receipt_sent_at" TIMESTAMP(3),
ADD COLUMN     "return_term_autentique_id" TEXT,
ADD COLUMN     "return_term_link" TEXT,
ADD COLUMN     "return_term_physical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "return_term_sent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "return_term_sent_at" TIMESTAMP(3),
ADD COLUMN     "return_term_signed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "return_term_signed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "service_order_quotes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "previous_service_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "previous_parts_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "previous_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "previous_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "new_service_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "new_parts_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "new_discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "new_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "additional_services" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approval_link" TEXT NOT NULL,
    "sent_to_customer" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "customer_notes" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_order_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_order_quotes_approval_link_key" ON "service_order_quotes"("approval_link");

-- CreateIndex
CREATE INDEX "service_order_quotes_tenant_id_order_id_idx" ON "service_order_quotes"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "service_order_quotes_approval_link_idx" ON "service_order_quotes"("approval_link");

-- AddForeignKey
ALTER TABLE "service_order_quotes" ADD CONSTRAINT "service_order_quotes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
