-- Limite diario por CPF (paridade Laravel depix_limites_diarios)
CREATE TABLE "depix_daily_limits" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "tax_number" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "total_transactions" INTEGER NOT NULL DEFAULT 0,
  "total_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "is_first_day" BOOLEAN NOT NULL DEFAULT true,
  "first_transaction_at" TIMESTAMP(3),
  "last_transaction_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "depix_daily_limits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "depix_daily_limits_tenant_tax_date_key"
  ON "depix_daily_limits"("tenant_id", "tax_number", "date");
CREATE INDEX "depix_daily_limits_tenant_tax_idx"
  ON "depix_daily_limits"("tenant_id", "tax_number");

ALTER TABLE "depix_daily_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depix_daily_limits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "depix_daily_limits"
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Audit log de webhooks DePix
CREATE TABLE "depix_webhook_events" (
  "id" UUID NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "final_status" TEXT,
  "source_ip" TEXT,
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "depix_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "depix_webhook_events_tx_type_key"
  ON "depix_webhook_events"("transaction_id", "event_type");
CREATE INDEX "depix_webhook_events_tx_idx"
  ON "depix_webhook_events"("transaction_id");
CREATE INDEX "depix_webhook_events_type_idx"
  ON "depix_webhook_events"("event_type");
-- depix_webhook_events nao tem tenant_id (eh um audit log do sistema)
-- entao nao tem RLS.
