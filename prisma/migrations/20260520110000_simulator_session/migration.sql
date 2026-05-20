-- CreateTable: SimulatorSession (historico de simulacoes)
CREATE TABLE "simulator_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "product_value_cents" INTEGER NOT NULL,
    "down_payment_cents" INTEGER NOT NULL DEFAULT 0,
    "result_payload" JSONB NOT NULL,
    "converted_to_sale_id" UUID,
    "converted_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "sent_via" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "simulator_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "simulator_sessions_tenant_id_created_at_idx" ON "simulator_sessions"("tenant_id", "created_at");
CREATE INDEX "simulator_sessions_tenant_id_customer_id_idx" ON "simulator_sessions"("tenant_id", "customer_id");

-- RLS
ALTER TABLE "simulator_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "simulator_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "simulator_sessions"
  USING ("tenant_id" = current_setting('app.current_tenant_id')::uuid);
