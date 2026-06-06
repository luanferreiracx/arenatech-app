CREATE TYPE "DepixTransactionSourceType" AS ENUM ('WALLET', 'QUICK_SALE', 'SALE', 'SERVICE_ORDER');

ALTER TABLE "tenant_depix_transactions" ADD COLUMN "source_type" "DepixTransactionSourceType" NOT NULL DEFAULT 'WALLET';
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "source_id" UUID;
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "source_description" TEXT;

CREATE INDEX "tenant_depix_transactions_tenant_id_source_type_source_id_idx" ON "tenant_depix_transactions"("tenant_id", "source_type", "source_id");

ALTER TABLE "quick_sales" ADD COLUMN "wallet_transaction_id" UUID;
CREATE INDEX "quick_sales_wallet_transaction_id_idx" ON "quick_sales"("wallet_transaction_id");
