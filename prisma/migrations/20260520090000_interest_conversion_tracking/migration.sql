-- AlterTable: Interest ganha tracking de conversao + customer ref
ALTER TABLE "interests"
ADD COLUMN "customer_id" UUID,
ADD COLUMN "converted_at" TIMESTAMP(3),
ADD COLUMN "converted_to_sale_id" UUID,
ADD COLUMN "converted_to_os_id" UUID,
ADD COLUMN "last_notified_at" TIMESTAMP(3);

CREATE INDEX "interests_tenant_id_customer_id_idx" ON "interests"("tenant_id", "customer_id");
CREATE INDEX "interests_tenant_id_status_created_at_idx" ON "interests"("tenant_id", "status", "created_at");
