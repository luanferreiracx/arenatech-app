ALTER TABLE "service_orders" ADD COLUMN "wallet_transaction_id" UUID;

CREATE INDEX "service_orders_tenant_id_wallet_transaction_id_idx" ON "service_orders"("tenant_id", "wallet_transaction_id");
