-- SaleUpgrade: aparelhos de entrada (trade-in) em venda. Paridade Laravel
-- `pdv_venda_upgrades`. Ao finalizar venda, cada upgrade vira DevicePurchase.
CREATE TABLE "sale_upgrades" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "brand" TEXT,
  "model" TEXT NOT NULL,
  "imei" TEXT,
  "serial_number" TEXT,
  "condition" TEXT NOT NULL DEFAULT 'USED',
  "battery_health" INTEGER,
  "appraised_value" DECIMAL(10, 2) NOT NULL,
  "abated_value" DECIMAL(10, 2) NOT NULL,
  "notes" TEXT,
  "device_purchase_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_upgrades_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_upgrades_sale_id_fkey" FOREIGN KEY ("sale_id")
    REFERENCES "sales"("id") ON DELETE CASCADE
);

CREATE INDEX "sale_upgrades_tenant_id_sale_id_idx"
  ON "sale_upgrades"("tenant_id", "sale_id");

-- SaleAudit: audit log de acoes sensiveis em vendas (cancel, refund, data,
-- vincular cliente). Paridade `pdv_venda_auditorias`.
CREATE TABLE "sale_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "field" TEXT,
  "previous_value" TEXT,
  "new_value" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sale_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_audits_tenant_id_sale_id_idx"
  ON "sale_audits"("tenant_id", "sale_id");
